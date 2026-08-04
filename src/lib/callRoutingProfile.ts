/** Shared load/save for Call Schedule + MyT call routing (single source of truth on profiles). */

import type { SupabaseClient } from "@supabase/supabase-js"
import { mergeCallHuntingMetadata, parseCallHunting, type CallHuntingSettings } from "./callHunting"
import { mergeVoiceAutoAttendantMetadata, parseVoiceAutoAttendant, type VoiceAutoAttendantSettings } from "./voiceAutoAttendant"
import { resolveOrgRosterOwnerId } from "./accountStructureOwner"

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export type BusinessHour = {
  enabled: boolean
  open: string
  close: string
}

export type BusinessHours = Record<DayKey, BusinessHour>

export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
}

export type CommunicationLine = {
  publicNumber: string | null
  publicNumberRaw: string | null
  forwardToPhone: string | null
  forwardToPhoneRaw: string | null
  voiceEnabled: boolean
  friendlyName: string | null
  /** True when line is inherited from the account owner (managed team member). */
  isSharedLine?: boolean
  lineOwnerUserId?: string | null
}

function formatUsPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw.trim()
}

export function defaultBusinessHours(): BusinessHours {
  const off = { enabled: false, open: "09:00", close: "17:00" }
  const on = { enabled: true, open: "09:00", close: "17:00" }
  return {
    mon: { ...on },
    tue: { ...on },
    wed: { ...on },
    thu: { ...on },
    fri: { ...on },
    sat: { ...off },
    sun: { ...off },
  }
}

export function parseBusinessHours(value: unknown): BusinessHours {
  const base = defaultBusinessHours()
  if (!value || typeof value !== "object" || Array.isArray(value)) return base
  const o = value as Record<string, unknown>
  for (const key of DAY_KEYS) {
    const row = o[key]
    if (!row || typeof row !== "object" || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    base[key] = {
      enabled: r.enabled !== false,
      open: typeof r.open === "string" && r.open.trim() ? r.open.trim().slice(0, 5) : base[key].open,
      close: typeof r.close === "string" && r.close.trim() ? r.close.trim().slice(0, 5) : base[key].close,
    }
  }
  return base
}

export type CallRoutingProfile = {
  profileUserId: string
  displayName: string
  timezone: string
  businessHours: BusinessHours
  callForwardingEnabled: boolean
  callForwardingOutsideBusinessHours: boolean
  callHunting: CallHuntingSettings
  autoAttendant: VoiceAutoAttendantSettings
  communicationLine: CommunicationLine | null
}

export type CallRoutingProfilePatch = {
  businessHours?: BusinessHours
  timezone?: string
  callForwardingEnabled?: boolean
  callForwardingOutsideBusinessHours?: boolean
  callHunting?: CallHuntingSettings
  autoAttendant?: Partial<VoiceAutoAttendantSettings>
}

/** User's own channel row, then account owner's shared line for managed team members. */
async function loadCommunicationLineForProfile(
  supabase: SupabaseClient,
  profileUserId: string,
): Promise<CommunicationLine | null> {
  const own = await loadCommunicationLine(supabase, profileUserId)
  if (own?.publicNumberRaw || own?.forwardToPhoneRaw) {
    return { ...own, isSharedLine: false, lineOwnerUserId: profileUserId }
  }
  const ownerId = await resolveOrgRosterOwnerId(supabase, profileUserId)
  if (ownerId === profileUserId) return own
  const shared = await loadCommunicationLine(supabase, ownerId)
  if (shared) {
    return { ...shared, isSharedLine: true, lineOwnerUserId: ownerId }
  }
  return own
}

async function loadCommunicationLine(
  supabase: SupabaseClient,
  channelUserId: string,
): Promise<CommunicationLine | null> {
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("public_address, forward_to_phone, voice_enabled, friendly_name, channel_kind, active, updated_at")
    .eq("user_id", channelUserId)
    .eq("active", true)
    .eq("channel_kind", "voice_sms")
    .order("updated_at", { ascending: false })
    .limit(8)
  if (error) return null
  const rows = (data ?? []) as Array<{
    public_address?: string | null
    forward_to_phone?: string | null
    voice_enabled?: boolean
    friendly_name?: string | null
  }>
  const pick = rows.find((r) => r.public_address?.trim()) ?? rows[0]
  if (!pick) return null
  const publicRaw = (pick.public_address || "").trim()
  const forwardRaw = (pick.forward_to_phone || "").trim()
  return {
    publicNumber: publicRaw ? formatUsPhoneDisplay(publicRaw) : null,
    publicNumberRaw: publicRaw || null,
    forwardToPhone: forwardRaw ? formatUsPhoneDisplay(forwardRaw) : null,
    forwardToPhoneRaw: forwardRaw || null,
    voiceEnabled: pick.voice_enabled !== false,
    friendlyName: pick.friendly_name?.trim() || null,
  }
}

export async function loadCallRoutingProfile(
  supabase: SupabaseClient,
  profileUserId: string,
): Promise<CallRoutingProfile | null> {
  if (!profileUserId) return null
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "display_name, timezone, business_hours, call_forwarding_enabled, call_forwarding_outside_business_hours, metadata",
    )
    .eq("id", profileUserId)
    .maybeSingle()
  if (error || !data) return null
  const meta =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const line = await loadCommunicationLineForProfile(supabase, profileUserId)
  return {
    profileUserId,
    displayName: (data.display_name || "Account").trim() || "Account",
    timezone: (data.timezone || "America/New_York").trim() || "America/New_York",
    businessHours: parseBusinessHours(data.business_hours),
    callForwardingEnabled: data.call_forwarding_enabled !== false,
    callForwardingOutsideBusinessHours: data.call_forwarding_outside_business_hours === true,
    callHunting: parseCallHunting(meta.call_hunting_v1),
    autoAttendant: parseVoiceAutoAttendant(meta.voice_auto_attendant_v1),
    communicationLine: line,
  }
}

export async function saveCallRoutingProfile(
  supabase: SupabaseClient,
  profileUserId: string,
  patch: CallRoutingProfilePatch,
): Promise<{ error: string | null }> {
  if (!profileUserId) return { error: "Missing user" }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.businessHours !== undefined) updates.business_hours = patch.businessHours
  if (patch.timezone !== undefined) updates.timezone = patch.timezone
  if (patch.callForwardingEnabled !== undefined) updates.call_forwarding_enabled = patch.callForwardingEnabled
  if (patch.callForwardingOutsideBusinessHours !== undefined) {
    updates.call_forwarding_outside_business_hours = patch.callForwardingOutsideBusinessHours
  }

  if (patch.callHunting !== undefined || patch.autoAttendant !== undefined) {
    const { data, error: readErr } = await supabase
      .from("profiles")
      .select("metadata")
      .eq("id", profileUserId)
      .maybeSingle()
    if (readErr) return { error: readErr.message }
    let meta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? { ...(data.metadata as Record<string, unknown>) }
        : {}
    if (patch.callHunting !== undefined) meta = mergeCallHuntingMetadata(meta, patch.callHunting)
    if (patch.autoAttendant !== undefined) meta = mergeVoiceAutoAttendantMetadata(meta, patch.autoAttendant)
    updates.metadata = meta
  }

  const { error } = await supabase.from("profiles").update(updates).eq("id", profileUserId)
  return { error: error?.message ?? null }
}

/** Minutes from midnight for HH:MM (24h). */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.min(24 * 60, Math.max(0, h * 60 + m))
}

export function formatMinutesLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const ampm = h24 >= 12 ? "PM" : "AM"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

export function huntModeLabel(mode: CallHuntingSettings["mode"]): string {
  if (mode === "simultaneous") return "Ring all at once"
  if (mode === "sequential") return "Ring in order"
  return "Primary number only"
}

export function cloneCallRoutingProfile(p: CallRoutingProfile): CallRoutingProfile {
  return {
    ...p,
    businessHours: JSON.parse(JSON.stringify(p.businessHours)) as BusinessHours,
    callHunting: JSON.parse(JSON.stringify(p.callHunting)) as CallHuntingSettings,
    autoAttendant: JSON.parse(JSON.stringify(p.autoAttendant)) as VoiceAutoAttendantSettings,
    communicationLine: p.communicationLine ? { ...p.communicationLine } : null,
  }
}
