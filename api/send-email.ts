import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  createServiceSupabase,
  getPrimaryEmailChannelForUser,
  logCommunicationEvent,
} from "./_communications.js"

type EmailPayload = {
  to?: string
  subject?: string
  body?: string
  userId?: string
  conversationId?: string
  customerId?: string
}

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")

  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const payload = (req.body && typeof req.body === "object" ? req.body : {}) as EmailPayload
  const to = normalizeEmail(payload.to)
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : ""
  const body = typeof payload.body === "string" ? payload.body.trim() : ""
  const userId = typeof payload.userId === "string" ? payload.userId.trim() : ""
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : ""
  const customerId = typeof payload.customerId === "string" ? payload.customerId.trim() : ""

  if (!to || !subject || !body || !userId) {
    return res.status(400).json({ error: "to, subject, body, and userId are required" })
  }

  const supabase = createServiceSupabase()
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

  /** BCC the contractor's real inbox so they get a copy of every email sent to the customer from Conversations. */
  const bcc =
    copyInbox && copyInbox !== to
      ? [copyInbox]
      : undefined

  const resendPayload: Record<string, unknown> = {
    from: fromEmail,
    to: [to],
    subject,
    text: body,
    reply_to: copyInbox ? [copyInbox] : undefined,
  }
  if (bcc) resendPayload.bcc = bcc

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resendPayload),
  })

  const detail = await resendResponse.text()
  if (!resendResponse.ok) return res.status(resendResponse.status).send(detail)

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

  return res.status(200).json({
    ok: true,
    provider: "resend",
    to,
    from: fromEmail,
    bcc: bcc?.[0] ?? null,
    detail,
  })
}
