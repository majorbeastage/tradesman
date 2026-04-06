import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  createServiceSupabase,
  getPrimaryEmailChannelForUser,
  getPrimarySmsChannelForUser,
  logCommunicationEvent,
  normalizePhone,
} from "./_communications.js"

/**
 * Single Hobby-plan function for outbound email (Resend) + SMS (Twilio / webhook).
 * Legacy URLs /api/send-email and /api/send-sms rewrite here (see vercel.json).
 */
type OutboundPayload = {
  channel?: string
  to?: string
  subject?: string
  body?: string
  userId?: string
  conversationId?: string
  customerId?: string
}

/** Vercel sometimes delivers `body` as a string; rewrites should still forward JSON. */
function parseJsonBody(req: VercelRequest): OutboundPayload {
  const raw = req.body
  if (raw == null || raw === "") return {}
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw) as unknown
      return v && typeof v === "object" && !Array.isArray(v) ? (v as OutboundPayload) : {}
    } catch {
      return {}
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as OutboundPayload
  return {}
}

const RESEND_FETCH_MS = 25_000

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value != null && String(value).trim() !== "") return String(value).trim()
  }
  return ""
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim()
  }
  return ""
}

function resolveChannel(req: VercelRequest, payload: OutboundPayload): "email" | "sms" {
  const q = pickFirstString(req.query?.__channel, req.query?.channel).toLowerCase()
  if (q === "email" || q === "sms") return q
  const c = typeof payload.channel === "string" ? payload.channel.toLowerCase() : ""
  if (c === "email" || c === "sms") return c
  if (typeof payload.subject === "string" && payload.subject.trim()) return "email"
  return "sms"
}

async function handleEmail(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const payload = parseJsonBody(req)
  const to = normalizeEmail(payload.to)
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : ""
  const body = typeof payload.body === "string" ? payload.body.trim() : ""
  const userId = typeof payload.userId === "string" ? payload.userId.trim() : ""
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : ""
  const customerId = typeof payload.customerId === "string" ? payload.customerId.trim() : ""

  if (!to || !subject || !body || !userId) {
    return res.status(400).json({ error: "to, subject, body, and userId are required" })
  }

  let supabase: ReturnType<typeof createServiceSupabase>
  try {
    supabase = createServiceSupabase()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({
      error: "Server email misconfiguration",
      message: msg,
      hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel for this project.",
    })
  }
  const dbChannel = await getPrimaryEmailChannelForUser(supabase, userId)
  const fromEmail = normalizeEmail(dbChannel?.public_address || firstEnv("RESEND_FROM_EMAIL", "EMAIL_DEFAULT_FROM"))
  const resendApiKey = firstEnv("RESEND_API_KEY")
  const copyInbox = normalizeEmail(dbChannel?.forward_to_email)

  if (!resendApiKey || !fromEmail) {
    return res.status(500).json({
      error: "No outbound email provider configured.",
      hint: "Set RESEND_API_KEY and configure an email channel/public address or RESEND_FROM_EMAIL.",
    })
  }

  const bcc = copyInbox && copyInbox !== to ? [copyInbox] : undefined

  const resendPayload: Record<string, unknown> = {
    from: fromEmail,
    to: [to],
    subject,
    text: body,
    reply_to: copyInbox ? [copyInbox] : undefined,
  }
  if (bcc) resendPayload.bcc = bcc

  let resendResponse: Response
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), RESEND_FETCH_MS)
    try {
      resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resendPayload),
        signal: ac.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError"
    return res.status(504).json({
      error: aborted ? "Resend API timed out" : "Resend request failed",
      message: e instanceof Error ? e.message : String(e),
      hint: aborted
        ? `No response from Resend within ${RESEND_FETCH_MS / 1000}s. Check Vercel logs and Resend status.`
        : "Check network and RESEND_API_KEY.",
    })
  }

  const detail = await resendResponse.text()
  if (!resendResponse.ok) {
    return res.status(resendResponse.status).json({
      error: "Resend rejected the send request",
      message: detail.slice(0, 2000),
      hint: "Verify the from domain is verified in Resend and the API key is valid.",
    })
  }

  try {
    await logCommunicationEvent(supabase, {
      user_id: userId,
      customer_id: customerId || null,
      conversation_id: conversationId || null,
      channel_id: dbChannel?.id ?? null,
      event_type: "email",
      direction: "outbound",
      subject,
      body,
      unread: false,
      metadata: {
        to,
        from: fromEmail,
        provider: dbChannel?.provider ?? "resend",
        reply_to: copyInbox || undefined,
        bcc: bcc?.[0] || undefined,
      },
    })
  } catch (logErr) {
    const logMsg = logErr instanceof Error ? logErr.message : String(logErr)
    console.error("[outbound-messages/email] Resend OK but communication_events insert failed:", logMsg)
    return res.status(200).json({
      ok: true,
      provider: "resend",
      to,
      from: fromEmail,
      bcc: bcc?.[0] ?? null,
      detail,
      logWarning: "Email was sent but the conversation log could not be saved. Check communication_events table and Vercel logs.",
    })
  }

  return res.status(200).json({
    ok: true,
    provider: "resend",
    to,
    from: fromEmail,
    bcc: bcc?.[0] ?? null,
    detail,
  })
}

async function handleSms(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const payload = parseJsonBody(req)
  const to = normalizePhone(payload.to)
  const body = typeof payload.body === "string" ? payload.body.trim() : ""
  const userId = typeof payload.userId === "string" ? payload.userId.trim() : ""
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : ""

  if (!to || !body) return res.status(400).json({ error: "to and body are required" })

  const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  let supabase: ReturnType<typeof createServiceSupabase>
  try {
    supabase = createServiceSupabase()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({
      error: "Server SMS misconfiguration",
      message: msg,
      hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel for this project.",
    })
  }
  const dbChannel = userId ? await getPrimarySmsChannelForUser(supabase, userId) : null
  const fromNumber = normalizePhone(dbChannel?.public_address || firstEnv("TWILIO_FROM_NUMBER", "SMS_DEFAULT_FROM_NUMBER"))
  const outboundWebhookUrl = firstEnv("SMS_OUTBOUND_WEBHOOK_URL")

  if (accountSid && authToken && fromNumber) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`
    const params = new URLSearchParams({ To: to, From: fromNumber, Body: body })
    const twilioRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })
    const text = await twilioRes.text()
    if (!twilioRes.ok) return res.status(twilioRes.status).send(text)
    if (userId) {
      try {
        await logCommunicationEvent(supabase, {
          user_id: userId,
          conversation_id: conversationId || null,
          channel_id: dbChannel?.id ?? null,
          event_type: "sms",
          direction: "outbound",
          body,
          unread: false,
          metadata: { to, from: fromNumber, provider: "twilio" },
        })
      } catch (logErr) {
        console.error(
          "[outbound-messages/sms] Twilio OK but communication_events insert failed:",
          logErr instanceof Error ? logErr.message : logErr,
        )
        return res.status(200).json({
          ok: true,
          provider: "twilio",
          to,
          from: fromNumber,
          detail: text,
          logWarning: "SMS was sent but the conversation log could not be saved.",
        })
      }
    }
    return res.status(200).json({ ok: true, provider: "twilio", to, from: fromNumber, detail: text })
  }

  if (outboundWebhookUrl) {
    const hookRes = await fetch(outboundWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, body, from: fromNumber || null }),
    })
    const text = await hookRes.text()
    if (!hookRes.ok) return res.status(hookRes.status).send(text)
    return res.status(200).json({ ok: true, provider: "custom-webhook", to, from: fromNumber || null, detail: text })
  }

  return res.status(500).json({
    error: "No outbound SMS provider configured.",
    hint: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER or SMS_OUTBOUND_WEBHOOK_URL.",
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")

  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const payload = parseJsonBody(req)
    const channel = resolveChannel(req, payload)
    if (channel === "email") return handleEmail(req, res)
    return handleSms(req, res)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[outbound-messages]", msg)
    return res.status(500).json({
      error: "outbound-messages failed",
      message: msg,
      hint: "Check Vercel env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, Resend/Twilio as appropriate.",
    })
  }
}
