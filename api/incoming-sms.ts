import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  asObject,
  createServiceSupabase,
  firstEnv,
  getOrCreateConversation,
  getOrCreateCustomerByPhone,
  logCommunicationEvent,
  lookupChannelByPublicAddress,
  normalizePhone,
  pickFirstString,
} from "./_communications"

type JsonRecord = Record<string, unknown>

function parseBody(req: VercelRequest): JsonRecord {
  if (req.body && typeof req.body === "object") return asObject(req.body)
  if (typeof req.body === "string") {
    try {
      return asObject(JSON.parse(req.body))
    } catch {
      return {}
    }
  }
  return {}
}

function getSmsNumbers(payload: JsonRecord): { from: string; to: string } {
  const from = normalizePhone(
    pickFirstString(
      payload.from,
      payload.from_number,
      payload.fromNumber,
      payload.msisdn,
      payload.phone,
      payload.phone_number,
      payload.From,
      payload.sender
    )
  )
  const to = normalizePhone(
    pickFirstString(
      payload.to,
      payload.to_number,
      payload.toNumber,
      payload.recipient,
      payload.To,
      payload.receiver
    )
  )
  return { from, to }
}

function parseRoutingMap(raw: string): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [normalizePhone(key), typeof value === "string" ? value.trim() : ""])
        .filter(([key, value]) => key && value)
    )
  } catch {
    return {}
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")

  if (req.method === "OPTIONS") return res.status(204).end()

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "incoming-sms", hint: "Send a POST webhook to this URL." })
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const defaultUserId = firstEnv("INCOMING_SMS_DEFAULT_USER_ID", "INCOMING_CALL_DEFAULT_USER_ID")
  const routingMap = parseRoutingMap(firstEnv("INCOMING_SMS_ROUTING_JSON", "INCOMING_CALL_ROUTING_JSON"))

  const payload = parseBody(req)
  const { from, to } = getSmsNumbers(payload)
  const body = pickFirstString(payload.body, payload.message, payload.text, payload.Body)
  const messageId = pickFirstString(payload.message_sid, payload.messageSid, payload.MessageSid, payload.id)
  const supabase = createServiceSupabase()
  const channel = to ? await lookupChannelByPublicAddress(supabase, to) : null
  const targetUserId = channel?.user_id || (to && routingMap[to]) || defaultUserId

  if (!targetUserId) {
    return res.status(400).json({
      error: "No target user configured for this inbound number.",
      normalizedTo: to || null,
      hint: "Set INCOMING_SMS_DEFAULT_USER_ID or INCOMING_SMS_ROUTING_JSON on Vercel.",
    })
  }
  if (!from) return res.status(400).json({ error: "Could not determine sender phone number from payload." })
  if (!body) return res.status(400).json({ error: "Missing SMS message body." })

  let customerId = ""
  let conversationId = ""
  let previousCustomer = false
  try {
    const customer = await getOrCreateCustomerByPhone(supabase, targetUserId, from)
    customerId = customer.customerId
    previousCustomer = customer.previousCustomer
    conversationId = await getOrCreateConversation(supabase, targetUserId, customerId, "sms")
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err), step: "resolve_customer_or_conversation" })
  }

  const content = messageId ? `${body}\n\n[Inbound message ID: ${messageId}]` : body
  const { error: messageErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "customer",
    content,
  })
  if (messageErr) return res.status(500).json({ error: messageErr.message, step: "create_message" })

  await logCommunicationEvent(supabase, {
    user_id: targetUserId,
    customer_id: customerId,
    conversation_id: conversationId,
    channel_id: channel?.id ?? null,
    event_type: "sms",
    direction: "inbound",
    external_id: messageId || null,
    body,
    unread: true,
    previous_customer: previousCustomer,
    metadata: { from, to, provider: channel?.provider ?? "twilio-webhook" },
  })

  return res.status(200).json({
    ok: true,
    targetUserId,
    customerId,
    conversationId,
    channelId: channel?.id ?? null,
    normalizedFrom: from,
    normalizedTo: to || null,
  })
}
