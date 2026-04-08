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
  metadata?: Record<string, unknown> | null
  active: boolean
}

export function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value != null && String(value).trim() !== "") return String(value).trim()
  }
  return ""
}

/**
 * Vercel/Linux env keys are case-sensitive. Some dashboards or copy-paste use `Supabase_URL` etc.
 * Match any process.env key that equals the canonical name ignoring case.
 */
export function firstEnvCaseInsensitive(canonicalName: string): string {
  const want = canonicalName.toUpperCase()
  for (const key of Object.keys(process.env)) {
    if (key.toUpperCase() === want) {
      const value = process.env[key]
      if (value != null && String(value).trim() !== "") return String(value).trim()
    }
  }
  return ""
}

function pickSupabaseUrlForServer(): string {
  const direct = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
  if (direct) return direct
  for (const name of ["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const v = firstEnvCaseInsensitive(name)
    if (v) return v
  }
  return ""
}

function pickServiceRoleKeyForServer(): string {
  const direct = firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY")
  if (direct) return direct
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]) {
    const v = firstEnvCaseInsensitive(name)
    if (v) return v
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

/** ILIKE pattern for exact match (escapes %, _, \\). */
function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
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

type RoutingDayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"

type RoutingWindow = {
  enabled: boolean
  open: string
  close: string
}

export type UserRoutingProfile = {
  call_forwarding_enabled: boolean
  call_forwarding_outside_business_hours: boolean
  timezone: string
  business_hours: Record<RoutingDayKey, RoutingWindow>
  voicemail_greeting_mode: "ai_text" | "recorded"
  voicemail_greeting_text: string
  voicemail_greeting_recording_url: string
  voicemail_greeting_pin: string
  forward_dial_caller_id_mode: "caller_number" | "twilio_number"
  forward_whisper_on_answer: boolean
  forward_whisper_announcement_template: string | null
  forward_whisper_only_outside_business_hours: boolean
  forward_whisper_require_keypress: boolean
}

export function createServiceSupabase(): SupabaseClient {
  const supabaseUrl = pickSupabaseUrlForServer().replace(/\/+$/, "")
  const serviceRoleKey = pickServiceRoleKeyForServer()
  const missing: string[] = []
  if (!supabaseUrl) {
    missing.push(
      "SUPABASE_URL (exact name, all caps — or VITE_SUPABASE_URL; case-insensitive match also tried)",
    )
  }
  if (!serviceRoleKey) {
    missing.push(
      "SUPABASE_SERVICE_ROLE_KEY (exact name, all caps — not the anon key; case-insensitive match also tried)",
    )
  }
  if (missing.length) {
    throw new Error(
      `Missing server env: ${missing.join(" · ")}. In Vercel: Project → Settings → Environment Variables — use names SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, All Environments, then Redeploy (env is not applied until a new deployment).`,
    )
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * True when {@link createServiceSupabase} would succeed (Twilio → `/api/*` routes need this to write to DB/storage).
 */
export function hasServerSupabaseServiceConfig(): boolean {
  const supabaseUrl = pickSupabaseUrlForServer().replace(/\/+$/, "")
  return Boolean(supabaseUrl && pickServiceRoleKeyForServer())
}

/** For API error responses: which Supabase server env keys are non-empty (no secret values). */
export function describeServerSupabaseEnvForDiagnostics(): {
  hasUrl: boolean
  hasServiceRoleKey: boolean
} {
  return {
    hasUrl: pickSupabaseUrlForServer().trim().length > 0,
    hasServiceRoleKey: pickServiceRoleKeyForServer().trim().length > 0,
  }
}

function pickSupabaseAnonKeyForServer(): string {
  const direct = firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
  if (direct) return direct
  for (const name of ["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const v = firstEnvCaseInsensitive(name)
    if (v) return v
  }
  return ""
}

/**
 * Verify a user JWT and ensure profiles.role === admin, using only the anon key (no service role).
 * Use for serverless routes where VITE_* / SUPABASE_SERVICE_ROLE_KEY may be missing but anon + URL are set.
 */
export async function verifyAdminJwtWithAnonSupabase(
  accessToken: string,
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, string> }> {
  const supabaseUrl = pickSupabaseUrlForServer().replace(/\/+$/, "")
  const anonKey = pickSupabaseAnonKeyForServer()
  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "Missing server env for auth verification",
        message:
          "Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) on the server. For admin-only APIs that also need DB bypass, add SUPABASE_SERVICE_ROLE_KEY.",
      },
    }
  }
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: authErr } = await anon.auth.getUser(accessToken)
  if (authErr || !userData?.user?.id) {
    return { ok: false, status: 401, body: { error: "Invalid or expired session" } }
  }
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: profile, error: profileErr } = await asUser
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle()
  if (profileErr) {
    console.error("[verifyAdminJwtWithAnonSupabase] profile", profileErr.message)
    return { ok: false, status: 500, body: { error: "Could not verify access" } }
  }
  if ((profile as { role?: string } | null)?.role !== "admin") {
    return { ok: false, status: 403, body: { error: "Admin only" } }
  }
  return { ok: true }
}

/**
 * Prefer anon-key verification (no service role). If that fails for env or DB policy reasons,
 * fall back to service role + {@link createServiceSupabase} so admin-only routes work when only
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set on the server (common on Vercel).
 */
export async function verifyAdminJwtAnonOrServiceSupabase(
  accessToken: string,
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, string> }> {
  const anonResult = await verifyAdminJwtWithAnonSupabase(accessToken)
  if (anonResult.ok) return anonResult
  if (anonResult.status === 401 || anonResult.status === 403) return anonResult

  try {
    const supabase = createServiceSupabase()
    const { data: userData, error: authErr } = await supabase.auth.getUser(accessToken)
    if (authErr || !userData?.user?.id) {
      return { ok: false, status: 401, body: { error: "Invalid or expired session" } }
    }
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle()
    if (profileErr) {
      console.error("[verifyAdminJwtAnonOrServiceSupabase] profile", profileErr.message)
      return { ok: false, status: 500, body: { error: "Could not verify access" } }
    }
    if ((profile as { role?: string } | null)?.role !== "admin") {
      return { ok: false, status: 403, body: { error: "Admin only" } }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      status: 500,
      body: {
        error: "Missing server env for admin recording playback",
        message: msg,
        hint:
          "Set SUPABASE_URL and either SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY for Vercel serverless (Production), then redeploy.",
      },
    }
  }
}

function defaultRoutingHours(): Record<RoutingDayKey, RoutingWindow> {
  return {
    sun: { enabled: false, open: "09:00", close: "17:00" },
    mon: { enabled: true, open: "09:00", close: "17:00" },
    tue: { enabled: true, open: "09:00", close: "17:00" },
    wed: { enabled: true, open: "09:00", close: "17:00" },
    thu: { enabled: true, open: "09:00", close: "17:00" },
    fri: { enabled: true, open: "09:00", close: "17:00" },
    sat: { enabled: false, open: "09:00", close: "17:00" },
  }
}

function parseRoutingHours(value: unknown): Record<RoutingDayKey, RoutingWindow> {
  const out = defaultRoutingHours()
  const raw = asObject(value)
  for (const key of Object.keys(out) as RoutingDayKey[]) {
    const day = asObject(raw[key])
    out[key] = {
      enabled: day.enabled !== false,
      open: typeof day.open === "string" && day.open ? day.open : out[key].open,
      close: typeof day.close === "string" && day.close ? day.close : out[key].close,
    }
  }
  return out
}

function minutesFromHHMM(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

export async function getUserRoutingProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRoutingProfile | null> {
  if (!userId) return null
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "call_forwarding_enabled, call_forwarding_outside_business_hours, timezone, business_hours, voicemail_greeting_mode, voicemail_greeting_text, voicemail_greeting_recording_url, voicemail_greeting_pin, forward_dial_caller_id_mode, forward_whisper_on_answer, forward_whisper_announcement_template, forward_whisper_only_outside_business_hours, forward_whisper_require_keypress"
    )
    .eq("id", userId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    call_forwarding_enabled: (data as { call_forwarding_enabled?: boolean }).call_forwarding_enabled !== false,
    call_forwarding_outside_business_hours:
      (data as { call_forwarding_outside_business_hours?: boolean }).call_forwarding_outside_business_hours === true,
    timezone: (data as { timezone?: string }).timezone || "America/New_York",
    business_hours: parseRoutingHours((data as { business_hours?: unknown }).business_hours),
    voicemail_greeting_mode:
      (data as { voicemail_greeting_mode?: "ai_text" | "recorded" }).voicemail_greeting_mode === "recorded" ? "recorded" : "ai_text",
    voicemail_greeting_text:
      (data as { voicemail_greeting_text?: string }).voicemail_greeting_text?.trim() ||
      "Sorry we missed your call. Please leave a message after the tone.",
    voicemail_greeting_recording_url:
      (data as { voicemail_greeting_recording_url?: string }).voicemail_greeting_recording_url?.trim() || "",
    voicemail_greeting_pin: (data as { voicemail_greeting_pin?: string }).voicemail_greeting_pin?.trim() || "",
    forward_dial_caller_id_mode:
      (data as { forward_dial_caller_id_mode?: string }).forward_dial_caller_id_mode === "twilio_number" ? "twilio_number" : "caller_number",
    forward_whisper_on_answer: (data as { forward_whisper_on_answer?: boolean }).forward_whisper_on_answer === true,
    forward_whisper_announcement_template: (() => {
      const t = (data as { forward_whisper_announcement_template?: string | null }).forward_whisper_announcement_template
      const s = typeof t === "string" ? t.trim() : ""
      return s || null
    })(),
    forward_whisper_only_outside_business_hours:
      (data as { forward_whisper_only_outside_business_hours?: boolean }).forward_whisper_only_outside_business_hours === true,
    forward_whisper_require_keypress: (data as { forward_whisper_require_keypress?: boolean }).forward_whisper_require_keypress === true,
  }
}

/** Lookup saved customer display name for caller ID whisper; does not create rows. */
export async function lookupCustomerDisplayNameByPhone(
  supabase: SupabaseClient,
  userId: string,
  phone: string
): Promise<string | null> {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const { data: ident, error } = await supabase
    .from("customer_identifiers")
    .select("customer_id")
    .eq("user_id", userId)
    .eq("type", "phone")
    .eq("value", normalized)
    .limit(1)
    .maybeSingle()
  if (error || !ident?.customer_id) return null
  const { data: cust } = await supabase
    .from("customers")
    .select("display_name")
    .eq("id", ident.customer_id)
    .eq("user_id", userId)
    .maybeSingle()
  const name = typeof cust?.display_name === "string" ? cust.display_name.trim() : ""
  if (!name || /^Unknown\s*\(/i.test(name)) return null
  return name
}

export function isWithinBusinessHours(profile: UserRoutingProfile | null, now = new Date()): boolean {
  if (!profile) return true
  if (!profile.call_forwarding_enabled) return false
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: profile.timezone || "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now)
    const weekdayRaw = parts.find((p) => p.type === "weekday")?.value?.toLowerCase() ?? "mon"
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00"
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
    const keyMap: Record<string, RoutingDayKey> = {
      sun: "sun",
      mon: "mon",
      tue: "tue",
      wed: "wed",
      thu: "thu",
      fri: "fri",
      sat: "sat",
    }
    const dayKey = keyMap[weekdayRaw.slice(0, 3)] ?? "mon"
    const day = profile.business_hours[dayKey]
    if (!day?.enabled) return profile.call_forwarding_outside_business_hours
    const currentMinutes = Number(hour) * 60 + Number(minute)
    const open = minutesFromHHMM(day.open)
    const close = minutesFromHHMM(day.close)
    const withinHours = close <= open ? currentMinutes >= open || currentMinutes <= close : currentMinutes >= open && currentMinutes <= close
    return withinHours || profile.call_forwarding_outside_business_hours
  } catch {
    return profile.call_forwarding_enabled
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Twilio <Play> is reliable for MP3/WAV; WebM/Opus from in-browser record often sounds like static or fails. */
export function twilioPlayLikelySupportedRecordingUrl(url: string): boolean {
  const path = url.trim().split("?")[0].toLowerCase()
  if (/\.webm($|\?)/.test(path) || /\.opus($|\?)/.test(path)) return false
  if (/\.ogg($|\?)/.test(path)) return false
  return true
}

export function buildVoicemailTwiml(params: {
  recordAction: string
  /** Twilio POSTs here when STT completes (same query string as recordAction + phase=transcribe). */
  transcribeCallback?: string
  routingProfile: UserRoutingProfile | null
}): string {
  const greetingText =
    params.routingProfile?.voicemail_greeting_text?.trim() ||
    "Sorry we missed your call. Please leave a message after the tone."
  const recordedUrl = params.routingProfile?.voicemail_greeting_recording_url?.trim() || ""
  const wantsRecorded =
    params.routingProfile?.voicemail_greeting_mode === "recorded" && !!recordedUrl
  const useRecordedGreeting = wantsRecorded && twilioPlayLikelySupportedRecordingUrl(recordedUrl)
  const sayAttrs = `voice="Polly.Matthew" language="en-US"`
  const greetingNode = useRecordedGreeting
    ? `<Play>${xmlEscape(recordedUrl)}</Play>`
    : `<Say ${sayAttrs}>${xmlEscape(greetingText)}</Say>`

  const transcribeCb =
    params.transcribeCallback && params.transcribeCallback.trim()
      ? ` transcribeCallback="${xmlEscape(params.transcribeCallback.trim())}"`
      : ""
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    greetingNode +
    `<Record action="${xmlEscape(params.recordAction)}" method="POST" transcribe="true"${transcribeCb} maxLength="118" />` +
    `</Response>`
  )
}

export async function lookupChannelByPublicAddress(
  supabase: SupabaseClient,
  publicAddress: string
): Promise<CommunicationChannel | null> {
  if (!publicAddress) return null
  const trimmed = publicAddress.trim()
  const normalized =
    trimmed.includes("@") ? trimmed.toLowerCase() : normalizePhone(publicAddress) || trimmed
  const isEmail = trimmed.includes("@")
  let q = supabase
    .from("client_communication_channels")
    .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
    .eq("active", true)
  q = isEmail
    ? q.ilike("public_address", escapeIlikeExact(normalized))
    : q.eq("public_address", normalized)
  const { data, error } = await q.limit(1).maybeSingle()
  if (error) throw error
  return (data as CommunicationChannel | null) ?? null
}

/** Inbound email: must be an active email channel (not a Twilio voice row). */
export async function lookupEmailChannelByInboundAddress(
  supabase: SupabaseClient,
  publicAddress: string
): Promise<CommunicationChannel | null> {
  const ch = await lookupChannelByPublicAddress(supabase, publicAddress)
  if (!ch || ch.channel_kind !== "email" || ch.email_enabled !== true) return null
  return ch
}

/**
 * Explains why inbound Resend mail did not route (mirrors supabase/functions/_shared/inbound-email-channel.ts messages).
 */
export async function resolveInboundEmailChannel(
  supabase: SupabaseClient,
  toAddresses: string[]
): Promise<
  | { ok: true; channel: CommunicationChannel; matchedTo: string }
  | { ok: false; reasons: string[] }
> {
  const reasons: string[] = []
  for (const addr of toAddresses) {
    const trimmed = addr.trim()
    if (!trimmed) continue
    const ch = await lookupChannelByPublicAddress(supabase, trimmed)
    if (!ch) {
      reasons.push(
        `No active channel with Business email "${trimmed}". In Tradesman: Admin → Communications → add a row with Kind = Email, set Business email address to exactly this address, Active on, Email enabled on, then Save.`,
      )
      continue
    }
    if (ch.channel_kind !== "email") {
      reasons.push(
        `A channel exists for "${trimmed}" but Kind is "${ch.channel_kind}" (phone/SMS). Inbound mail needs a separate row with Kind = Email and the same Business email address.`,
      )
      continue
    }
    if (ch.email_enabled !== true) {
      reasons.push(
        `Email row for "${trimmed}" has "Email enabled" off. Turn it on in Admin → Communications for that row and Save.`,
      )
      continue
    }
    return { ok: true, channel: ch, matchedTo: trimmed }
  }
  if (reasons.length === 0) {
    reasons.push("No To addresses in the message to match.")
  }
  return { ok: false, reasons }
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
    .order("updated_at", { ascending: false })
    .limit(25)
  if (error) throw error
  const rows = (data as CommunicationChannel[] | null) ?? []
  if (rows.length === 0) return null
  /** Prefer a row with the Twilio public number set (matches inbound webhook number). */
  const withPublic = rows.find((r) => typeof r.public_address === "string" && r.public_address.trim() !== "")
  return (withPublic ?? rows[0]) ?? null
}

export async function getPrimaryEmailChannelForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<CommunicationChannel | null> {
  if (!userId) return null
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active, metadata")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("channel_kind", "email")
    .eq("email_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(25)
  if (error) throw error
  const rows = (data as CommunicationChannel[] | null) ?? []
  if (rows.length === 0) return null
  /** Prefer the most recently updated row that has a sender address (avoids stale helpdesk@ rows left after you switch to joe@). */
  const withPublic = rows.find((r) => typeof r.public_address === "string" && r.public_address.trim() !== "")
  return (withPublic ?? rows[0]) ?? null
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
    subject?: string | null
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

/** Same as logCommunicationEvent but returns the new row id for attachment linking. */
export async function insertCommunicationEventReturningId(
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
    subject?: string | null
    body?: string | null
    recording_url?: string | null
    transcript_text?: string | null
    summary_text?: string | null
    previous_customer?: boolean
    unread?: boolean
    metadata?: Record<string, unknown>
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("communication_events")
    .insert({
      ...payload,
      metadata: payload.metadata ?? {},
    })
    .select("id")
    .single()
  if (error) {
    if (!String(error.message || "").includes("communication_events")) throw error
    return null
  }
  return data?.id ? String(data.id) : null
}

export async function insertCommunicationAttachmentRow(
  supabase: SupabaseClient,
  row: {
    user_id: string
    communication_event_id: string
    storage_path: string
    public_url: string
    content_type?: string | null
    file_name?: string | null
  }
): Promise<void> {
  const { error } = await supabase.from("communication_attachments").insert({
    user_id: row.user_id,
    communication_event_id: row.communication_event_id,
    storage_path: row.storage_path,
    public_url: row.public_url,
    content_type: row.content_type ?? null,
    file_name: row.file_name ?? null,
  })
  if (error && !String(error.message || "").includes("communication_attachments")) {
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

export async function getOrCreateCustomerByEmail(
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

/** True if this customer already has an active conversation row (user promoted a lead or added one manually). */
export async function customerHasOpenConversation(
  supabase: SupabaseClient,
  userId: string,
  customerId: string
): Promise<boolean> {
  if (!userId || !customerId) return false
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error && !String(error.message || "").includes("removed_at")) throw error
  return Boolean(data?.id)
}

/**
 * One open row per customer (any channel). Reuses the latest open conversation so phone/SMS/email do not stack duplicate rows.
 * New rows use the requested `channel` when none exist yet.
 */
export async function getOrCreateConversation(
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

/** Open lead for inbound touchpoints when the customer is not yet in Conversations (no open conversation row). */
export async function ensureOpenLeadForInbound(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  title: string,
  description: string
): Promise<string> {
  const existingLeadId = await findOpenLeadForCustomer(supabase, userId, customerId)
  if (existingLeadId) return existingLeadId

  const { data, error } = await supabase
    .from("leads")
    .insert({
      user_id: userId,
      customer_id: customerId,
      title,
      description,
    })
    .select("id")
    .single()
  if (error) throw error
  return String(data.id)
}

export async function findOpenLeadForCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerId: string
): Promise<string | null> {
  if (!userId || !customerId) return null
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .is("converted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error && !String(error.message || "").includes("converted_at")) throw error
  return data?.id ? String(data.id) : null
}

export async function createLeadForInboundCall(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  phone: string
): Promise<string> {
  const normalizedPhone = normalizePhone(phone)
  const title = normalizedPhone ? `Inbound call from ${normalizedPhone}` : "Inbound call"
  return ensureOpenLeadForInbound(supabase, userId, customerId, title, "Auto-created from inbound phone call.")
}
