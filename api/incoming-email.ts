/**
 * Vercel serverless inbound email (Resend). If your host serves /api/* as the SPA, use
 * Supabase Edge Function `resend-inbound` instead (see supabase/functions/resend-inbound).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { Resend } from "resend"
import { Webhook } from "svix"
import {
  createServiceSupabase,
  customerHasOpenConversation,
  ensureOpenLeadForInbound,
  firstEnv,
  getOrCreateCustomerByEmail,
  getOrCreateConversation,
  insertCommunicationAttachmentRow,
  insertCommunicationEventReturningId,
  pickFirstString,
  resolveInboundEmailChannel,
} from "./_communications.js"
import { uploadBytesToCommAttachments } from "./_commStorage.js"
import {
  forwardHeadersForTradesmanCopy,
  normalizeResendHeaderMap,
  shouldSkipForwardCopy,
  shouldSuppressInboundEmail,
} from "./_inbound-email-loop-guard.js"

/** Required for Svix signature verification (raw body). */
export const config = {
  api: {
    bodyParser: false,
  },
}

type ResendReceivedPayload = {
  id?: string
  to?: string[]
  from?: string
  subject?: string | null
  text?: string | null
  html?: string | null
  message_id?: string | null
  headers?: Record<string, unknown>
}

function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function getSvixHeaders(req: VercelRequest): { id: string; timestamp: string; signature: string } | null {
  const id = pickFirstString(req.headers["svix-id"] as string | string[] | undefined)
  const timestamp = pickFirstString(req.headers["svix-timestamp"] as string | string[] | undefined)
  const signature = pickFirstString(req.headers["svix-signature"] as string | string[] | undefined)
  if (!id || !timestamp || !signature) return null
  return { id, timestamp, signature }
}

function parseVerifiedPayload(rawBody: string, req: VercelRequest): Record<string, unknown> {
  const secret = firstEnv("RESEND_WEBHOOK_SECRET")
  if (secret) {
    const headers = getSvixHeaders(req)
    if (!headers) throw new Error("Missing Svix webhook headers (svix-id, svix-timestamp, svix-signature).")
    const wh = new Webhook(secret)
    return wh.verify(rawBody, {
      "svix-id": headers.id,
      "svix-timestamp": headers.timestamp,
      "svix-signature": headers.signature,
    }) as Record<string, unknown>
  }
  try {
    return JSON.parse(rawBody || "{}") as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseEmailAddressFromHeader(from: string): string {
  const trimmed = from.trim()
  const angle = trimmed.match(/<([^>]+)>/)
  const addr = (angle ? angle[1] : trimmed).trim().toLowerCase()
  return addr
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractToList(data: Record<string, unknown>): string[] {
  const raw = data.to
  if (Array.isArray(raw)) {
    return raw.map((x) => normalizeToAddress(String(x))).filter(Boolean)
  }
  if (typeof raw === "string" && raw.trim()) return [normalizeToAddress(raw)].filter(Boolean)
  return []
}

/** Resend may return To as plain email or RFC display form "Name <addr@domain>". */
function normalizeToAddress(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const angle = trimmed.match(/<([^>]+)>/)
  const addr = (angle ? angle[1] : trimmed).trim().toLowerCase()
  return addr
}

/** RESEND_ZOHO_FORWARD_JSON e.g. {"joe@tradesman-us.com":"joe@zoho.com","sales@tradesman-us.com":"sales@zoho.com"} */
function parseZohoForwardMap(): Record<string, string> | null {
  const raw = firstEnv("RESEND_ZOHO_FORWARD_JSON")
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o)) {
      const key = normalizeToAddress(String(k))
      const val = typeof v === "string" ? v.trim() : ""
      if (key && val) out[key] = val
    }
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}

async function fetchResendReceivedEmail(apiKey: string, emailId: string): Promise<ResendReceivedPayload | null> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) return null
  return (await res.json()) as ResendReceivedPayload
}

async function forwardCopyViaResend(params: {
  apiKey: string
  fromAddress: string
  to: string
  subject: string
  textBody: string
}): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromAddress,
      to: [params.to],
      subject: `[Tradesman] Fwd: ${params.subject}`,
      text: params.textBody,
      headers: forwardHeadersForTradesmanCopy(),
    }),
  })
  if (res.ok) return { ok: true }
  let detail = await res.text()
  try {
    const j = JSON.parse(detail) as { message?: string }
    if (typeof j?.message === "string") detail = j.message
  } catch {
    /* keep text */
  }
  return { ok: false, status: res.status, detail: detail.slice(0, 500) }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type, svix-id, svix-timestamp, svix-signature")
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")

  if (req.method === "OPTIONS") return res.status(204).end()

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "incoming-email",
      hint: "Configure Resend webhook (email.received) to POST here. Set RESEND_WEBHOOK_SECRET and RESEND_API_KEY on Vercel.",
      zohoForward:
        "Optional: RESEND_ZOHO_FORWARD_JSON map tradesman-us.com addresses → Zoho inboxes; RESEND_ZOHO_FORWARD_FROM (or RESEND_FROM_EMAIL) must be a verified sender. Run supabase/resend-inbound-email-dedupe.sql to avoid duplicate forwards on webhook retries.",
    })
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const apiKey = firstEnv("RESEND_API_KEY")
  if (!apiKey) {
    return res.status(500).json({ error: "RESEND_API_KEY is not configured." })
  }

  let rawBody: string
  try {
    rawBody = await readRawBody(req)
  } catch {
    rawBody = ""
  }
  if (!rawBody && req.body && typeof req.body === "object") {
    rawBody = JSON.stringify(req.body)
  }

  let payload: Record<string, unknown>
  try {
    payload = parseVerifiedPayload(rawBody, req)
  } catch (e) {
    return res.status(401).json({ error: e instanceof Error ? e.message : "Webhook verification failed" })
  }

  const type = typeof payload.type === "string" ? payload.type : ""
  if (type !== "email.received") {
    return res.status(200).json({ ok: true, ignored: true, type: type || null })
  }

  const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {}
  const emailId = typeof data.email_id === "string" ? data.email_id : typeof data.id === "string" ? data.id : ""
  if (!emailId) {
    return res.status(400).json({ error: "Missing email_id on webhook payload." })
  }

  const received = await fetchResendReceivedEmail(apiKey, emailId)
  if (!received?.id) {
    return res.status(502).json({ error: "Could not load received email from Resend.", emailId })
  }

  const toList = Array.isArray(received.to)
    ? received.to.map((t) => normalizeToAddress(String(t))).filter(Boolean)
    : extractToList(received as unknown as Record<string, unknown>)

  const zohoMap = parseZohoForwardMap()
  if (zohoMap) {
    const zohoTargets: string[] = []
    const matchedLocal: string[] = []
    for (const addr of toList) {
      const dest = zohoMap[addr]
      if (dest) {
        if (!zohoTargets.includes(dest)) zohoTargets.push(dest)
        if (!matchedLocal.includes(addr)) matchedLocal.push(addr)
      }
    }
    if (zohoTargets.length > 0) {
      const forwardFrom = pickFirstString(firstEnv("RESEND_ZOHO_FORWARD_FROM"), firstEnv("RESEND_FROM_EMAIL"))
      if (!forwardFrom) {
        return res.status(500).json({
          error: "Set RESEND_ZOHO_FORWARD_FROM or RESEND_FROM_EMAIL to a verified domain address for Zoho forwarding.",
        })
      }
      try {
        let dedupeClient: ReturnType<typeof createServiceSupabase> | null = null
        try {
          dedupeClient = createServiceSupabase()
        } catch {
          dedupeClient = null
        }
        if (dedupeClient) {
          const { error: dedupeErr } = await dedupeClient.from("resend_inbound_email_ids").insert({ email_id: received.id })
          if (dedupeErr?.code === "23505") {
            return res.status(200).json({ ok: true, duplicate: true, path: "zoho_forward" })
          }
          if (dedupeErr && !/resend_inbound_email_ids|does not exist/i.test(String(dedupeErr.message))) {
            console.warn("[incoming-email] zoho dedupe:", dedupeErr.message)
          }
        }
        const resend = new Resend(apiKey)
        const { data: fwdData, error: fwdErr } = await resend.emails.receiving.forward({
          emailId: received.id,
          to: zohoTargets.length === 1 ? zohoTargets[0] : zohoTargets,
          from: forwardFrom,
        })
        if (fwdErr) {
          return res.status(502).json({
            error: "Resend receiving.forward failed",
            message: fwdErr.message,
            emailId: received.id,
          })
        }
        return res.status(200).json({
          ok: true,
          zohoForward: true,
          matchedTo: matchedLocal,
          zohoTargets,
          forwardFrom,
          resend: fwdData,
        })
      } catch (e) {
        return res.status(500).json({
          error: "zoho_forward_failed",
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  const supabase = createServiceSupabase()

  const { data: existing } = await supabase
    .from("communication_events")
    .select("id")
    .eq("event_type", "email")
    .eq("direction", "inbound")
    .eq("external_id", received.id)
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    return res.status(200).json({
      ok: true,
      routed: true,
      duplicate: true,
      external_id: received.id,
      hint: "Already stored; Resend retried the webhook.",
    })
  }

  const resolved = await resolveInboundEmailChannel(supabase, toList)
  if (resolved.ok === false) {
    return res.status(200).json({
      ok: true,
      routed: false,
      hint: "Resend delivered the webhook, but Tradesman has no qualifying Email channel for the To address(es). See reasons.",
      reasons: resolved.reasons,
      to: toList,
    })
  }
  const channel = resolved.channel
  const matchedTo = resolved.matchedTo

  const fromHeader = typeof received.from === "string" ? received.from : ""
  const fromEmail = fromHeader ? parseEmailAddressFromHeader(fromHeader) : ""
  if (!fromEmail) {
    return res.status(400).json({ error: "Could not parse sender email." })
  }

  const subject = typeof received.subject === "string" ? received.subject : "(no subject)"
  const textRaw = typeof received.text === "string" && received.text.trim() ? received.text : ""
  const htmlRaw = typeof received.html === "string" && received.html.trim() ? received.html : ""
  const bodyForMessage = textRaw || (htmlRaw ? stripHtml(htmlRaw) : "(empty body)")

  const headerMap = normalizeResendHeaderMap(received.headers)
  const suppressInbound = shouldSuppressInboundEmail({
    subject,
    headers: headerMap,
    fromEmail,
    forwardToEmail: channel.forward_to_email,
  })
  if (suppressInbound.suppressed) {
    return res.status(200).json({
      ok: true,
      routed: false,
      suppressed: true,
      reason: suppressInbound.reason,
      hint:
        "Stopped a forward loop or Tradesman-generated echo. Do not forward personal mail back to the business address; Reply-to / forward-to must differ from Business email.",
    })
  }

  let customerId = ""
  let conversationId: string | null = null
  let leadId: string | null = null
  let previousCustomer = false
  try {
    const customer = await getOrCreateCustomerByEmail(supabase, channel.user_id, fromEmail)
    customerId = customer.customerId
    previousCustomer = customer.previousCustomer
    const inConversations = await customerHasOpenConversation(supabase, channel.user_id, customerId)
    if (inConversations) {
      conversationId = await getOrCreateConversation(supabase, channel.user_id, customerId, "email")
    } else {
      const title = subject && subject !== "(no subject)" ? `Email: ${subject.slice(0, 80)}` : `Inbound email from ${fromEmail}`
      leadId = await ensureOpenLeadForInbound(
        supabase,
        channel.user_id,
        customerId,
        title,
        "Auto-created from inbound email."
      )
    }
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
      step: "customer_conversation",
    })
  }

  const messageContent =
    typeof received.message_id === "string" && received.message_id
      ? `${bodyForMessage}\n\n[Message-ID: ${received.message_id}]`
      : bodyForMessage

  const eventId = await insertCommunicationEventReturningId(supabase, {
    user_id: channel.user_id,
    customer_id: customerId,
    conversation_id: conversationId,
    lead_id: leadId,
    channel_id: channel.id,
    event_type: "email",
    direction: "inbound",
    external_id: received.id,
    subject,
    body: bodyForMessage.slice(0, 8000),
    unread: true,
    previous_customer: previousCustomer,
    metadata: {
      from: fromEmail,
      to: matchedTo,
      resend_email_id: received.id,
      provider: "resend-inbound",
    },
  })

  if (eventId) {
    try {
      const attRes = await fetch(
        `https://api.resend.com/emails/receiving/${encodeURIComponent(received.id)}/attachments`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      )
      if (attRes.ok) {
        const attJson = (await attRes.json()) as { data?: Array<{ id?: string; filename?: string; content_type?: string; download_url?: string }> }
        const items = Array.isArray(attJson.data) ? attJson.data : []
        for (let i = 0; i < items.length; i++) {
          const a = items[i]
          const dl = typeof a.download_url === "string" ? a.download_url : ""
          if (!dl) continue
          const dlRes = await fetch(dl)
          if (!dlRes.ok) continue
          const arrayBuffer = await dlRes.arrayBuffer()
          const contentType = dlRes.headers.get("content-type") || a.content_type || "application/octet-stream"
          const safeName = (a.filename || `attachment-${i}`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
          const path = `inbound-email/${channel.user_id}/${eventId}/${i}-${safeName}`
          const publicUrl = await uploadBytesToCommAttachments({
            storagePath: path,
            body: arrayBuffer,
            contentType,
            logTag: "incoming-email-att",
          })
          if (publicUrl) {
            await insertCommunicationAttachmentRow(supabase, {
              user_id: channel.user_id,
              communication_event_id: eventId,
              storage_path: path,
              public_url: publicUrl,
              content_type: contentType,
              file_name: a.filename || safeName,
            })
          }
        }
      }
    } catch (e) {
      console.warn("[incoming-email] attachments", e instanceof Error ? e.message : e)
    }
  }

  if (conversationId) {
    const { error: messageErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "customer",
      content: messageContent,
    })
    if (messageErr) {
      return res.status(500).json({ error: messageErr.message, step: "messages_insert" })
    }
  }

  const forwardTo = channel.forward_to_email?.trim()
  let forwardPayload: Record<string, unknown> = {}
  if (forwardTo) {
    const skipFwd = shouldSkipForwardCopy({ forwardTo, matchedTo, fromEmail })
    if (skipFwd.suppressed) {
      forwardPayload = { skipped: `Loop guard: ${skipFwd.reason}` }
    } else {
      const fromSend = channel.public_address?.trim().toLowerCase() || firstEnv("RESEND_FROM_EMAIL")
      if (!fromSend) {
        forwardPayload = { skipped: "No from address: set channel Business email or RESEND_FROM_EMAIL." }
      } else {
        try {
          const fr = await forwardCopyViaResend({
            apiKey,
            fromAddress: fromSend,
            to: forwardTo,
            subject,
            textBody: [`From: ${fromHeader}`, `To: ${matchedTo}`, "", bodyForMessage].join("\n"),
          })
          if (fr.ok) {
            forwardPayload = { sent: true }
          } else {
            forwardPayload = { error: `Resend forward HTTP ${fr.status}: ${fr.detail}` }
          }
        } catch (e) {
          forwardPayload = { error: e instanceof Error ? e.message : String(e) }
        }
      }
    }
  }

  return res.status(200).json({
    ok: true,
    routed: true,
    userId: channel.user_id,
    conversationId,
    customerId,
    matchedTo,
    forwardToConfigured: Boolean(forwardTo),
    ...forwardPayload,
  })
}
