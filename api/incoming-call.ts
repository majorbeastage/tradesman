import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"

type JsonRecord = Record<string, unknown>

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value != null && String(value).trim() !== "") return String(value).trim()
  }
  return ""
}

function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  const keepPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return ""
  return `${keepPlus ? "+" : ""}${digits}`
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

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

function getInboundNumbers(payload: JsonRecord): { from: string; to: string } {
  const from = normalizePhone(
    pickFirstString(
      payload.from,
      payload.from_number,
      payload.fromNumber,
      payload.caller,
      payload.caller_id,
      payload.callerNumber,
      payload.From,
      payload.Caller,
      payload.customer_number
    )
  )
  const to = normalizePhone(
    pickFirstString(
      payload.to,
      payload.to_number,
      payload.toNumber,
      payload.called,
      payload.called_number,
      payload.calledNumber,
      payload.To,
      payload.Called,
      payload.business_number
    )
  )
  return { from, to }
}

function parseRoutingMap(raw: string): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const entries = Object.entries(parsed)
    return Object.fromEntries(
      entries
        .map(([key, value]) => [normalizePhone(key), typeof value === "string" ? value.trim() : ""])
        .filter(([key, value]) => key && value)
    )
  } catch {
    return {}
  }
}

function buildMessageContent(payload: JsonRecord, from: string, to: string): string {
  const pieces: string[] = []
  const callStatus = pickFirstString(payload.call_status, payload.CallStatus, payload.status, payload.event_type, payload.eventType)
  const duration = pickFirstString(payload.call_duration, payload.duration, payload.CallDuration)
  const transcript = pickFirstString(
    payload.transcript,
    payload.transcription,
    payload.transcription_text,
    payload.voicemail_transcription
  )
  const recordingUrl = pickFirstString(
    payload.recording_url,
    payload.recordingUrl,
    payload.RecordingUrl,
    payload.voicemail_url
  )
  const callSid = pickFirstString(payload.call_sid, payload.CallSid, payload.call_id, payload.callId, payload.id)

  pieces.push(`Incoming call from ${from || "unknown"} to ${to || "unknown"}.`)
  if (callStatus) pieces.push(`Status: ${callStatus}.`)
  if (duration) pieces.push(`Duration: ${duration}.`)
  if (callSid) pieces.push(`Call ID: ${callSid}.`)
  if (transcript) pieces.push(`Transcript: ${transcript}`)
  if (recordingUrl) pieces.push(`Recording: ${recordingUrl}`)

  return pieces.join("\n")
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")

  if (req.method === "OPTIONS") return res.status(204).end()

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "incoming-call",
      hint: "Send a POST webhook to this URL.",
    })
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const supabaseUrl = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "")
  const serviceRoleKey = firstEnv("SUPABASE_SERVICE_ROLE_KEY")
  const defaultUserId = firstEnv("INCOMING_CALL_DEFAULT_USER_ID")
  const routingMap = parseRoutingMap(firstEnv("INCOMING_CALL_ROUTING_JSON"))

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on Vercel.",
    })
  }

  const payload = parseBody(req)
  const { from, to } = getInboundNumbers(payload)
  const targetUserId = (to && routingMap[to]) || defaultUserId

  if (!targetUserId) {
    return res.status(400).json({
      error: "No target user configured for this inbound number.",
      normalizedTo: to || null,
      hint: "Set INCOMING_CALL_DEFAULT_USER_ID or INCOMING_CALL_ROUTING_JSON on Vercel.",
    })
  }

  if (!from) {
    return res.status(400).json({
      error: "Could not determine caller phone number from payload.",
    })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existingIdentifier, error: identifierErr } = await supabase
    .from("customer_identifiers")
    .select("customer_id")
    .eq("user_id", targetUserId)
    .eq("type", "phone")
    .eq("value", from)
    .limit(1)
    .maybeSingle()

  if (identifierErr) {
    return res.status(500).json({ error: identifierErr.message, step: "lookup_customer_identifier" })
  }

  let customerId = existingIdentifier?.customer_id as string | undefined

  if (!customerId) {
    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .insert({
        user_id: targetUserId,
        display_name: `Unknown (${from})`,
        notes: null,
      })
      .select("id")
      .single()

    if (customerErr) {
      return res.status(500).json({ error: customerErr.message, step: "create_customer" })
    }

    customerId = customer.id as string

    const { error: insertIdentifierErr } = await supabase
      .from("customer_identifiers")
      .insert({
        user_id: targetUserId,
        customer_id: customerId,
        type: "phone",
        value: from,
        is_primary: true,
        verified: false,
      })

    if (insertIdentifierErr) {
      return res.status(500).json({ error: insertIdentifierErr.message, step: "create_customer_identifier" })
    }
  }

  let conversationId: string | null = null
  const convoLookup = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (convoLookup.error && !String(convoLookup.error.message || "").includes("removed_at")) {
    return res.status(500).json({ error: convoLookup.error.message, step: "lookup_conversation" })
  }

  if (convoLookup.data?.id) {
    conversationId = convoLookup.data.id as string
  } else {
    const fallbackLookup = convoLookup.error
      ? await supabase
          .from("conversations")
          .select("id")
          .eq("user_id", targetUserId)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null

    if (fallbackLookup?.error) {
      return res.status(500).json({ error: fallbackLookup.error.message, step: "lookup_conversation_fallback" })
    }

    if (fallbackLookup?.data?.id) {
      conversationId = fallbackLookup.data.id as string
    }
  }

  if (!conversationId) {
    const { data: conversation, error: conversationErr } = await supabase
      .from("conversations")
      .insert({
        user_id: targetUserId,
        customer_id: customerId,
        channel: "phone",
        status: "open",
      })
      .select("id")
      .single()

    if (conversationErr) {
      return res.status(500).json({ error: conversationErr.message, step: "create_conversation" })
    }

    conversationId = conversation.id as string
  }

  const content = buildMessageContent(payload, from, to)
  const { error: messageErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "customer",
    content,
  })

  if (messageErr) {
    return res.status(500).json({ error: messageErr.message, step: "create_message" })
  }

  return res.status(200).json({
    ok: true,
    targetUserId,
    customerId,
    conversationId,
    normalizedFrom: from,
    normalizedTo: to || null,
  })
}
