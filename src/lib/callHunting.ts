/** Client-side call hunting / ring group settings (profiles.metadata.call_hunting_v1). */

export type CallHuntMode = "primary_only" | "simultaneous" | "sequential"

/** When this target should be included in the ring order. */
export type CallHuntSchedule = "always" | "business_hours" | "after_hours"

export type CallHuntTarget = {
  id: string
  label: string
  phone: string
  enabled: boolean
  /** Linked team profile — phone can refresh from their My T primary phone. */
  userId?: string | null
  schedule: CallHuntSchedule
}

/** Temporary out-of-office / after-hours coverage override. */
export type CallHuntException = {
  id: string
  label: string
  /** YYYY-MM-DD */
  startsOn: string
  /** YYYY-MM-DD (inclusive) */
  endsOn: string
  /** Team member who should not be rung while this exception is active. */
  unavailableUserId?: string | null
  coverUserId?: string | null
  coverPhone: string
  coverLabel: string
  /** When true, omit the Admin primary forward number while this exception is active. */
  skipPrimary?: boolean
}

export type CallHuntingSettings = {
  enabled: boolean
  mode: CallHuntMode
  /** Seconds to ring each target in sequential mode, or the shared Dial timeout for simultaneous. */
  ringSeconds: number
  /** When the Admin communications primary forward number should be included. */
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

export function newHuntTargetId(): string {
  return `hunt_${Math.random().toString(36).slice(2, 10)}`
}

export function newHuntExceptionId(): string {
  return `exc_${Math.random().toString(36).slice(2, 10)}`
}

function parseSchedule(raw: unknown): CallHuntSchedule {
  return raw === "business_hours" || raw === "after_hours" || raw === "always" ? raw : "always"
}

function parseTarget(row: unknown): CallHuntTarget | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null
  const t = row as Record<string, unknown>
  const phone = typeof t.phone === "string" ? t.phone.trim() : ""
  const userId = typeof t.userId === "string" && t.userId.trim() ? t.userId.trim() : null
  if (!phone && !userId) return null
  return {
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : newHuntTargetId(),
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
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : newHuntExceptionId(),
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
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_CALL_HUNTING, targets: [], exceptions: [] }
  const o = raw as Record<string, unknown>
  const mode =
    o.mode === "simultaneous" || o.mode === "sequential" || o.mode === "primary_only"
      ? o.mode
      : DEFAULT_CALL_HUNTING.mode
  const ringSeconds = Number(o.ringSeconds)
  const targets = (Array.isArray(o.targets) ? o.targets : []).map(parseTarget).filter((t): t is CallHuntTarget => t !== null).slice(0, 5)
  const exceptions = (Array.isArray(o.exceptions) ? o.exceptions : [])
    .map(parseException)
    .filter((t): t is CallHuntException => t !== null)
    .slice(0, 20)
  return {
    enabled: o.enabled === true,
    mode,
    ringSeconds: Number.isFinite(ringSeconds) ? Math.min(45, Math.max(8, Math.round(ringSeconds))) : 22,
    primarySchedule: parseSchedule(o.primarySchedule),
    targets,
    exceptions,
  }
}

export function mergeCallHuntingMetadata(
  prev: Record<string, unknown>,
  next: CallHuntingSettings,
): Record<string, unknown> {
  return { ...prev, call_hunting_v1: next }
}

function dateKeyLocal(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function exceptionActiveOn(exception: CallHuntException, day = dateKeyLocal()): boolean {
  return exception.startsOn <= day && day <= exception.endsOn
}

function scheduleAllows(schedule: CallHuntSchedule, withinBusinessHours: boolean): boolean {
  if (schedule === "always") return true
  if (schedule === "business_hours") return withinBusinessHours
  return !withinBusinessHours
}

export type ResolveHuntPhonesOpts = {
  settings: CallHuntingSettings
  primaryForward: string | null
  withinBusinessHours: boolean
  /** Live phones keyed by profile id (preferred over saved snapshot). */
  phoneByUserId?: Record<string, string>
  now?: Date
}

/**
 * Build ordered E.164-ready phone list for Dial, applying schedule windows and temporary coverage.
 */
export function resolveHuntPhones(opts: ResolveHuntPhonesOpts): string[] {
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
  const ordered: { phone: string; userId?: string | null }[] = []
  if (
    primary &&
    !skipPrimary &&
    scheduleAllows(settings.primarySchedule || "always", withinBusinessHours)
  ) {
    ordered.push({ phone: primary, userId: null })
  }

  for (const target of settings.targets) {
    if (!target.enabled) continue
    if (!scheduleAllows(target.schedule, withinBusinessHours)) continue
    if (target.userId && unavailable.has(target.userId)) continue
    const live = target.userId ? phoneByUserId[target.userId]?.trim() : ""
    const phone = (live || target.phone || "").trim()
    if (!phone) continue
    ordered.push({ phone, userId: target.userId })
  }

  for (const exception of activeExceptions) {
    const live = exception.coverUserId ? phoneByUserId[exception.coverUserId]?.trim() : ""
    const phone = (live || exception.coverPhone || "").trim()
    if (!phone) continue
    ordered.push({ phone, userId: exception.coverUserId })
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const row of ordered) {
    const key = row.phone.replace(/\D/g, "").slice(-10) || row.phone
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row.phone)
    if (out.length >= 5) break
  }
  return out
}

/** @deprecated Prefer resolveHuntPhones — kept for older call sites. */
export function activeHuntPhones(settings: CallHuntingSettings, primaryForward: string | null): string[] {
  return resolveHuntPhones({
    settings,
    primaryForward,
    withinBusinessHours: true,
  })
}
