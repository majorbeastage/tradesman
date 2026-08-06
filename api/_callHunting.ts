/** Server mirror of src/lib/callHunting.ts — keep parse logic aligned. */

import type { SupabaseClient } from "@supabase/supabase-js"

export type CallHuntMode = "primary_only" | "simultaneous" | "sequential"
export type CallHuntSchedule = "always" | "business_hours" | "after_hours"

export type CallHuntTarget = {
  id: string
  label: string
  phone: string
  enabled: boolean
  userId?: string | null
  schedule: CallHuntSchedule
}

export type CallHuntException = {
  id: string
  label: string
  startsOn: string
  endsOn: string
  unavailableUserId?: string | null
  coverUserId?: string | null
  coverPhone: string
  coverLabel: string
  skipPrimary?: boolean
}

export type CallHuntingSettings = {
  enabled: boolean
  mode: CallHuntMode
  ringSeconds: number
  primarySchedule: CallHuntSchedule
  targets: CallHuntTarget[]
  exceptions: CallHuntException[]
}

export const DEFAULT_CALL_HUNTING: CallHuntingSettings = {
  enabled: false,
  mode: "primary_only",
  ringSeconds: 22,
  primarySchedule: "always",
  targets: [],
  exceptions: [],
}

function parseSchedule(raw: unknown): CallHuntSchedule {
  return raw === "business_hours" || raw === "after_hours" || raw === "always" ? raw : "always"
}

function parseTarget(row: unknown): CallHuntTarget | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null
  const t = row as Record<string, unknown>
  const userId = typeof t.userId === "string" && t.userId.trim() ? t.userId.trim() : null
  if (!userId) return null
  const phone = typeof t.phone === "string" ? t.phone.trim() : ""
  return {
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `hunt_${Math.random().toString(36).slice(2, 9)}`,
    label: typeof t.label === "string" ? t.label.trim().slice(0, 48) : "",
    phone,
    enabled: t.enabled !== false,
    userId,
    schedule: parseSchedule(t.schedule),
  }
}

function parseException(row: unknown): CallHuntException | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null
  const t = row as Record<string, unknown>
  const startsOn = typeof t.startsOn === "string" ? t.startsOn.trim().slice(0, 10) : ""
  const endsOn = typeof t.endsOn === "string" ? t.endsOn.trim().slice(0, 10) : ""
  const coverPhone = typeof t.coverPhone === "string" ? t.coverPhone.trim() : ""
  if (!startsOn || !endsOn) return null
  return {
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `exc_${Math.random().toString(36).slice(2, 9)}`,
    label: typeof t.label === "string" ? t.label.trim().slice(0, 80) : "Coverage",
    startsOn,
    endsOn,
    unavailableUserId: typeof t.unavailableUserId === "string" && t.unavailableUserId.trim() ? t.unavailableUserId.trim() : null,
    coverUserId: typeof t.coverUserId === "string" && t.coverUserId.trim() ? t.coverUserId.trim() : null,
    coverPhone,
    coverLabel: typeof t.coverLabel === "string" ? t.coverLabel.trim().slice(0, 48) : "",
    skipPrimary: t.skipPrimary === true,
  }
}

export function parseCallHunting(raw: unknown): CallHuntingSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_CALL_HUNTING, targets: [], exceptions: [] }
  }
  const o = raw as Record<string, unknown>
  const mode =
    o.mode === "simultaneous" || o.mode === "sequential" || o.mode === "primary_only"
      ? o.mode
      : DEFAULT_CALL_HUNTING.mode
  const ringSeconds = Number(o.ringSeconds)
  return {
    enabled: o.enabled === true,
    mode,
    ringSeconds: Number.isFinite(ringSeconds) ? Math.min(45, Math.max(8, Math.round(ringSeconds))) : 22,
    primarySchedule: parseSchedule(o.primarySchedule),
    targets: (Array.isArray(o.targets) ? o.targets : []).map(parseTarget).filter((t): t is CallHuntTarget => t !== null).slice(0, 5),
    exceptions: (Array.isArray(o.exceptions) ? o.exceptions : [])
      .map(parseException)
      .filter((t): t is CallHuntException => t !== null)
      .slice(0, 20),
  }
}

function dateKeyLocal(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function exceptionActiveOn(exception: CallHuntException, day = dateKeyLocal()): boolean {
  return exception.startsOn <= day && day <= exception.endsOn
}

function scheduleAllows(schedule: CallHuntSchedule, withinBusinessHours: boolean): boolean {
  if (schedule === "always") return true
  if (schedule === "business_hours") return withinBusinessHours
  return !withinBusinessHours
}

export function resolveHuntPhones(opts: {
  settings: CallHuntingSettings
  primaryForward: string | null
  withinBusinessHours: boolean
  phoneByUserId?: Record<string, string>
  now?: Date
}): string[] {
  const { settings, primaryForward, withinBusinessHours, phoneByUserId = {}, now = new Date() } = opts
  const primary = (primaryForward || "").trim()
  if (!settings.enabled || settings.mode === "primary_only") {
    return primary ? [primary] : []
  }

  const day = dateKeyLocal(now)
  const activeExceptions = settings.exceptions.filter((e) => exceptionActiveOn(e, day))
  const unavailable = new Set(
    activeExceptions.map((e) => e.unavailableUserId).filter((id): id is string => Boolean(id)),
  )

  const skipPrimary = activeExceptions.some((e) => e.skipPrimary)
  const ordered: string[] = []
  if (
    primary &&
    !skipPrimary &&
    scheduleAllows(settings.primarySchedule || "always", withinBusinessHours)
  ) {
    ordered.push(primary)
  }

  for (const target of settings.targets) {
    if (!target.enabled) continue
    if (!target.userId) continue
    if (!scheduleAllows(target.schedule, withinBusinessHours)) continue
    if (unavailable.has(target.userId)) continue
    const live = phoneByUserId[target.userId]?.trim() : ""
    if (!live) continue
    ordered.push(live)
  }

  for (const exception of activeExceptions) {
    const live = exception.coverUserId ? phoneByUserId[exception.coverUserId]?.trim() : ""
    const phone = (live || exception.coverPhone || "").trim()
    if (phone) ordered.push(phone)
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const phone of ordered) {
    const key = phone.replace(/\D/g, "").slice(-10) || phone
    if (seen.has(key)) continue
    seen.add(key)
    out.push(phone)
    if (out.length >= 5) break
  }
  return out
}

export function activeHuntPhones(settings: CallHuntingSettings, primaryForward: string | null): string[] {
  return resolveHuntPhones({ settings, primaryForward, withinBusinessHours: true })
}

export async function loadCallHuntingForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<CallHuntingSettings> {
  if (!userId) return { ...DEFAULT_CALL_HUNTING, targets: [], exceptions: [] }
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  return parseCallHunting(meta.call_hunting_v1)
}

/** Resolve forward phones from Tradesman voice lines (Admin → Communications), not My T personal numbers. */
export async function loadHuntPhoneByUserId(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return {}
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("user_id, forward_to_phone, public_address, voice_enabled, active, updated_at")
    .in("user_id", ids)
    .eq("active", true)
    .eq("channel_kind", "voice_sms")
    .order("updated_at", { ascending: false })
  if (error) {
    console.warn("[loadHuntPhoneByUserId]", error.message)
    return {}
  }
  const out: Record<string, string> = {}
  for (const row of data ?? []) {
    const r = row as {
      user_id: string
      forward_to_phone?: string | null
      public_address?: string | null
      voice_enabled?: boolean
    }
    if (out[r.user_id] || r.voice_enabled === false) continue
    const forward = (r.forward_to_phone || "").trim()
    const purchased = (r.public_address || "").trim()
    const phone = forward || purchased
    if (phone) out[r.user_id] = phone
  }
  return out
}
