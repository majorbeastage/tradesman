/**
 * When AI drafts an outbound message to a customer, optional user approval (portal + app UI).
 * Stored on entity `metadata` (e.g. leads.metadata, conversations.metadata) until sent or cleared.
 */
export const PENDING_AI_CONSUMER_REPLY_KEY = "pending_ai_consumer_reply" as const

export type PendingAiConsumerReplySource =
  | "lead_auto_response"
  | "conversation_auto"
  | "quote_auto"
  | "calendar_auto"

export type PendingAiConsumerReplyV1 = {
  v: 1
  body: string
  channel: "sms" | "email"
  to: string
  subject?: string
  created_at: string
  source: PendingAiConsumerReplySource
}

/** Portal item ids: require approval before sending (depend on parent AI-send checkbox). */
export const PORTAL_ITEM_IDS_AI_OUTBOUND_REQUIRE_APPROVAL = [
  "auto_response_use_ai_require_approval",
  "conv_auto_reply_ai_require_approval",
  "conv_auto_phone_tts_require_approval",
  "ar_use_ai_customer_message_require_approval",
  "ar_customer_reminder_use_ai_require_approval",
  "quote_auto_reply_ai_require_approval",
  "quote_auto_phone_tts_require_approval",
] as const

export function parsePendingAiConsumerReply(raw: unknown): PendingAiConsumerReplyV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return null
  const body = typeof o.body === "string" ? o.body : ""
  const channel = o.channel === "sms" || o.channel === "email" ? o.channel : null
  const to = typeof o.to === "string" ? o.to : ""
  if (!channel || !to.trim()) return null
  const subject = typeof o.subject === "string" ? o.subject : undefined
  const created_at = typeof o.created_at === "string" ? o.created_at : new Date().toISOString()
  const source = typeof o.source === "string" ? (o.source as PendingAiConsumerReplySource) : "lead_auto_response"
  return { v: 1, body, channel, to, subject, created_at, source }
}
