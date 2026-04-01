import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type JsonRecord = Record<string, unknown>

export type CommunicationChannel = {
  id: string
  user_id: string
  provider: string
  channel_kind: "voice_sms" | "email"
  provider_sid?: string | null
  friendly_name?: string | null
  public_address: string
  forward_to_phone: string | null
  forward_to_email: string | null
  voice_enabled: boolean
  sms_enabled: boolean
  email_enabled?: boolean
  voicemail_enabled: boolean
  voicemail_mode: "summary" | "full_transcript"
  active: boolean
}

export function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value != null && String(value).trim() !== "") return String(value).trim()
  }
  return ""
}

export function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  const keepPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return ""
  return `${keepPlus ? "+" : ""}${digits}`
}

export function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {}
}

export function createServiceSupabase(): SupabaseClient {
  const supabaseUrl = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "")
  const serviceRoleKey = firstEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on Vercel.")
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function lookupChannelByPublicAddress(
  supabase: SupabaseClient,
  publicAddress: string
): Promise<CommunicationChannel | null> {
  if (!publicAddress) return null
  const normalized = normalizePhone(publicAddress) || publicAddress.trim()
  console.log("[lookupChannelByPublicAddress] incoming", { publicAddress, normalized })
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
    .eq("public_address", normalized)
    .eq("active", true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  console.log("[lookupChannelByPublicAddress] result", {
    found: !!data,
    id: (data as CommunicationChannel | null)?.id ?? null,
    public_address: (data as CommunicationChannel | null)?.public_address ?? null,
    forward_to_phone: (data as CommunicationChannel | null)?.forward_to_phone ?? null,
    voice_enabled: (data as CommunicationChannel | null)?.voice_enabled ?? null,
    active: (data as CommunicationChannel | null)?.active ?? null,
  })
  return (data as CommunicationChannel | null) ?? null
}

export async function lookupChannelById(
  supabase: SupabaseClient,
  channelId: string
): Promise<CommunicationChannel | null> {
  if (!channelId) return null
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
    .eq("id", channelId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as CommunicationChannel | null) ?? null
}

export async function getPrimarySmsChannelForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<CommunicationChannel | null> {
  if (!userId) return null
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("sms_enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as CommunicationChannel | null) ?? null
}

export async function logCommunicationEvent(
  supabase: SupabaseClient,
  payload: {
    user_id: string
    customer_id?: string | null
    conversation_id?: string | null
    lead_id?: string | null
    channel_id?: string | null
    event_type: "sms" | "call" | "voicemail" | "email"
    direction: "inbound" | "outbound"
    external_id?: string | null
    body?: string | null
    recording_url?: string | null
    transcript_text?: string | null
    summary_text?: string | null
    previous_customer?: boolean
    unread?: boolean
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

export async function getOrCreateCustomerByPhone(
  supabase: SupabaseClient,
  userId: string,
  phone: string
): Promise<{ customerId: string; previousCustomer: boolean }> {
  const normalizedPhone = normalizePhone(phone)
  const { data: existingIdentifier, error: identifierErr } = await supabase
    .from("customer_identifiers")
    .select("customer_id")
    .eq("user_id", userId)
    .eq("type", "phone")
    .eq("value", normalizedPhone)
    .limit(1)
    .maybeSingle()
  if (identifierErr) throw identifierErr
  if (existingIdentifier?.customer_id) {
    return { customerId: String(existingIdentifier.customer_id), previousCustomer: true }
  }

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .insert({ user_id: userId, display_name: `Unknown (${normalizedPhone})`, notes: null })
    .select("id")
    .single()
  if (customerErr) throw customerErr

  const customerId = String(customer.id)
  const { error: insertIdentifierErr } = await supabase.from("customer_identifiers").insert({
    user_id: userId,
    customer_id: customerId,
    type: "phone",
    value: normalizedPhone,
    is_primary: true,
    verified: false,
  })
  if (insertIdentifierErr) throw insertIdentifierErr

  return { customerId, previousCustomer: false }
}

export async function getOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  channel: "sms" | "phone"
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
