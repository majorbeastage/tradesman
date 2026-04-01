import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, getPrimarySmsChannelForUser, logCommunicationEvent, normalizePhone } from "./_communications.js"

type SmsPayload = {
  to?: string
  body?: string
  userId?: string
  conversationId?: string
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value != null && String(value).trim() !== "") return String(value).trim()
  }
  return ""
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")

  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const payload = (req.body && typeof req.body === "object" ? req.body : {}) as SmsPayload
  const to = normalizePhone(payload.to)
  const body = typeof payload.body === "string" ? payload.body.trim() : ""
  const userId = typeof payload.userId === "string" ? payload.userId.trim() : ""
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : ""

  if (!to || !body) return res.status(400).json({ error: "to and body are required" })

  const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  const supabase = createServiceSupabase()
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
