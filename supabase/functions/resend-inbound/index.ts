// Resend inbound email webhook (email.received). Use this URL in Resend when Vercel /api/* is served as the SPA.
//
// Deploy:  supabase functions deploy resend-inbound
// Secrets (two different values — do not swap):
//   RESEND_API_KEY          → Resend dashboard → API Keys → re_...
//   RESEND_WEBHOOK_SECRET   → Resend → Webhooks → [your endpoint] → Signing secret (often whsec_...)
//       NOT the API key. Copy the secret shown for that webhook URL only.
// Optional: supabase secrets set RESEND_FROM_EMAIL=you@domain.com  (forward copy “from” fallback)
//
// URL:     https://<project-ref>.supabase.co/functions/v1/resend-inbound

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Webhook } from "https://esm.sh/svix@1.90.0"

type CommunicationChannel = {
  id: string
  user_id: string
  channel_kind: "voice_sms" | "email"
  public_address: string
  forward_to_email: string | null
  email_enabled?: boolean
  active: boolean
}

type ResendReceivedPayload = {
  id?: string
  to?: string[]
  from?: string
  subject?: string | null
  text?: string | null
  html?: string | null
  message_id?: string | null
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, svix-id, svix-timestamp, svix-signature, authorization, apikey",
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

function normalizePhone(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const keepPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return ""
  return `${keepPlus ? "+" : ""}${digits}`
}

async function lookupChannelByPublicAddress(
  supabase: SupabaseClient,
  publicAddress: string
): Promise<CommunicationChannel | null> {
  const trimmed = publicAddress.trim()
  const normalized = trimmed.includes("@") ? trimmed.toLowerCase() : normalizePhone(publicAddress) || trimmed
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("id, user_id, channel_kind, public_address, forward_to_email, email_enabled, active")
    .eq("public_address", normalized)
    .eq("active", true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as CommunicationChannel | null) ?? null
}

async function lookupEmailChannelByInboundAddress(
  supabase: SupabaseClient,
  publicAddress: string
): Promise<CommunicationChannel | null> {
  const ch = await lookupChannelByPublicAddress(supabase, publicAddress)
  if (!ch || ch.channel_kind !== "email" || ch.email_enabled !== true) return null
  return ch
}

async function getOrCreateCustomerByEmail(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<{ customerId: string; previousCustomer: boolean }> {
  const normalizedEmail = String(email || "").trim().toLowerCase()
  if (!normalizedEmail) throw new Error("Email is required")
  const { data: existingIdentifier, error: identifierErr } = await supabase
    .from("customer_identifiers")
    .select("customer_id")
    .eq("user_id", userId)
    .eq("type", "email")
    .eq("value", normalizedEmail)
    .limit(1)
    .maybeSingle()
  if (identifierErr) throw identifierErr
  if (existingIdentifier?.customer_id) {
    return { customerId: String(existingIdentifier.customer_id), previousCustomer: true }
  }

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .insert({ user_id: userId, display_name: normalizedEmail, notes: null })
    .select("id")
    .single()
  if (customerErr) throw customerErr

  const customerId = String(customer.id)
  const { error: insertIdentifierErr } = await supabase.from("customer_identifiers").insert({
    user_id: userId,
    customer_id: customerId,
    type: "email",
    value: normalizedEmail,
    is_primary: true,
    verified: false,
  })
  if (insertIdentifierErr) throw insertIdentifierErr

  return { customerId, previousCustomer: false }
}

async function getOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  channel: "sms" | "phone" | "email"
): Promise<string> {
  const { data: existingConversation, error: conversationLookupErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .eq("channel", channel)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (conversationLookupErr && !String(conversationLookupErr.message || "").includes("removed_at")) {
    throw conversationLookupErr
  }
  if (existingConversation?.id) return String(existingConversation.id)

  const { data: conversation, error: conversationErr } = await supabase
    .from("conversations")
    .insert({ user_id: userId, customer_id: customerId, channel, status: "open" })
    .select("id")
    .single()
  if (conversationErr) throw conversationErr
  return String(conversation.id)
}

async function logCommunicationEvent(
  supabase: SupabaseClient,
  payload: {
    user_id: string
    customer_id?: string | null
    conversation_id?: string | null
    channel_id?: string | null
    event_type: "email"
    direction: "inbound"
    external_id?: string | null
    subject?: string | null
    body?: string | null
    unread?: boolean
    previous_customer?: boolean
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from("communication_events").insert({
    ...payload,
    metadata: payload.metadata ?? {},
  })
  if (error && !String(error.message || "").includes("communication_events")) {
    throw error
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

function normalizeToAddress(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const angle = trimmed.match(/<([^>]+)>/)
  const addr = (angle ? angle[1] : trimmed).trim().toLowerCase()
  return addr
}

function extractToList(data: Record<string, unknown>): string[] {
  const raw = data.to
  if (Array.isArray(raw)) {
    return raw.map((x) => normalizeToAddress(String(x))).filter(Boolean)
  }
  if (typeof raw === "string" && raw.trim()) return [normalizeToAddress(raw)].filter(Boolean)
  return []
}

function getSvixHeaders(req: Request): { id: string; timestamp: string; signature: string } | null {
  const id = req.headers.get("svix-id")?.trim() ?? ""
  const timestamp = req.headers.get("svix-timestamp")?.trim() ?? ""
  const signature = req.headers.get("svix-signature")?.trim() ?? ""
  if (!id || !timestamp || !signature) return null
  return { id, timestamp, signature }
}

function parseVerifiedPayload(rawBody: string, req: Request): Record<string, unknown> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET")?.trim() ?? ""
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
}): Promise<void> {
  await fetch("https://api.resend.com/emails", {
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
    }),
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (req.method === "GET") {
    return json(200, {
      ok: true,
      route: "resend-inbound",
      runtime: "supabase-edge",
      hint: "POST Resend email.received webhooks here. Set secrets RESEND_API_KEY and RESEND_WEBHOOK_SECRET.",
    })
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" })
  }

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? ""
  if (!apiKey) {
    return json(500, { error: "RESEND_API_KEY is not configured (supabase secrets set RESEND_API_KEY)." })
  }

  const rawBody = await req.text()
  console.info("resend-inbound POST", {
    bytes: rawBody.length,
    svix: Boolean(req.headers.get("svix-id")),
    contentType: req.headers.get("content-type")?.slice(0, 48) ?? "",
  })

  let payload: Record<string, unknown>
  try {
    payload = parseVerifiedPayload(rawBody, req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook verification failed"
    console.error("resend-inbound: verify failed", msg)
    return json(401, {
      error: msg,
      hint: "RESEND_WEBHOOK_SECRET must be the Signing secret from this webhook in Resend (not your re_ API key).",
    })
  }

  const type = typeof payload.type === "string" ? payload.type : ""
  if (type !== "email.received") {
    return json(200, { ok: true, ignored: true, type: type || null })
  }

  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : {}
  const emailId =
    typeof data.email_id === "string" ? data.email_id : typeof data.id === "string" ? data.id : ""
  if (!emailId) {
    return json(400, { error: "Missing email_id on webhook payload." })
  }

  const received = await fetchResendReceivedEmail(apiKey, emailId)
  if (!received?.id) {
    return json(502, { error: "Could not load received email from Resend.", emailId })
  }

  const toList = Array.isArray(received.to)
    ? received.to.map((t) => normalizeToAddress(String(t))).filter(Boolean)
    : extractToList(received as unknown as Record<string, unknown>)

  const { data: existing } = await supabase
    .from("communication_events")
    .select("id")
    .eq("event_type", "email")
    .eq("direction", "inbound")
    .eq("external_id", received.id)
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    return json(200, { ok: true, duplicate: true, external_id: received.id })
  }

  let channel: CommunicationChannel | null = null
  let matchedTo = ""
  for (const addr of toList) {
    const ch = await lookupEmailChannelByInboundAddress(supabase, addr)
    if (ch) {
      channel = ch
      matchedTo = addr
      break
    }
  }

  if (!channel?.user_id) {
    return json(200, {
      ok: true,
      routed: false,
      hint: "No matching Email channel (public_address + email enabled) for To addresses.",
      to: toList,
    })
  }

  const fromHeader = typeof received.from === "string" ? received.from : ""
  const fromEmail = fromHeader ? parseEmailAddressFromHeader(fromHeader) : ""
  if (!fromEmail) {
    return json(400, { error: "Could not parse sender email." })
  }

  const subject = typeof received.subject === "string" ? received.subject : "(no subject)"
  const textRaw = typeof received.text === "string" && received.text.trim() ? received.text : ""
  const htmlRaw = typeof received.html === "string" && received.html.trim() ? received.html : ""
  const bodyForMessage = textRaw || (htmlRaw ? stripHtml(htmlRaw) : "(empty body)")

  let customerId = ""
  let conversationId = ""
  let previousCustomer = false
  try {
    const customer = await getOrCreateCustomerByEmail(supabase, channel.user_id, fromEmail)
    customerId = customer.customerId
    previousCustomer = customer.previousCustomer
    conversationId = await getOrCreateConversation(supabase, channel.user_id, customerId, "email")
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : String(err),
      step: "customer_conversation",
    })
  }

  const messageContent =
    typeof received.message_id === "string" && received.message_id
      ? `${bodyForMessage}\n\n[Message-ID: ${received.message_id}]`
      : bodyForMessage

  const { error: messageErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "customer",
    content: messageContent,
  })
  if (messageErr) {
    return json(500, { error: messageErr.message, step: "messages_insert" })
  }

  await logCommunicationEvent(supabase, {
    user_id: channel.user_id,
    customer_id: customerId,
    conversation_id: conversationId,
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
      provider: "resend-inbound-supabase",
    },
  })

  const forwardTo = channel.forward_to_email?.trim()
  if (forwardTo) {
    try {
      const fromSend =
        channel.public_address?.trim().toLowerCase() || Deno.env.get("RESEND_FROM_EMAIL")?.trim() || ""
      if (fromSend) {
        await forwardCopyViaResend({
          apiKey,
          fromAddress: fromSend,
          to: forwardTo,
          subject,
          textBody: [`From: ${fromHeader}`, `To: ${matchedTo}`, "", bodyForMessage].join("\n"),
        })
      }
    } catch {
      // non-fatal
    }
  }

  return json(200, {
    ok: true,
    userId: channel.user_id,
    conversationId,
    customerId,
    matchedTo,
    forwarded: Boolean(forwardTo),
  })
})
