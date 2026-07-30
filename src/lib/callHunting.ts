/** Client-side call hunting / ring group settings (profiles.metadata.call_hunting_v1). */

export type CallHuntMode = "primary_only" | "simultaneous" | "sequential"

export type CallHuntTarget = {
  id: string
  label: string
  phone: string
  enabled: boolean
}

export type CallHuntingSettings = {
  enabled: boolean
  mode: CallHuntMode
  /** Seconds to ring each target in sequential mode, or the shared Dial timeout for simultaneous. */
  ringSeconds: number
  targets: CallHuntTarget[]
}

export const DEFAULT_CALL_HUNTING: CallHuntingSettings = {
  enabled: false,
  mode: "primary_only",
  ringSeconds: 22,
  targets: [],
}

export function newHuntTargetId(): string {
  return `hunt_${Math.random().toString(36).slice(2, 10)}`
}

export function parseCallHunting(raw: unknown): CallHuntingSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_CALL_HUNTING }
  const o = raw as Record<string, unknown>
  const mode =
    o.mode === "simultaneous" || o.mode === "sequential" || o.mode === "primary_only"
      ? o.mode
      : DEFAULT_CALL_HUNTING.mode
  const ringSeconds = Number(o.ringSeconds)
  const targetsRaw = Array.isArray(o.targets) ? o.targets : []
  const targets: CallHuntTarget[] = targetsRaw
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null
      const t = row as Record<string, unknown>
      const phone = typeof t.phone === "string" ? t.phone.trim() : ""
      if (!phone) return null
      return {
        id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : newHuntTargetId(),
        label: typeof t.label === "string" ? t.label.trim().slice(0, 48) : "",
        phone,
        enabled: t.enabled !== false,
      }
    })
    .filter((t): t is CallHuntTarget => t !== null)
    .slice(0, 5)
  return {
    enabled: o.enabled === true,
    mode,
    ringSeconds: Number.isFinite(ringSeconds) ? Math.min(45, Math.max(8, Math.round(ringSeconds))) : 22,
    targets,
  }
}

export function mergeCallHuntingMetadata(
  prev: Record<string, unknown>,
  next: CallHuntingSettings,
): Record<string, unknown> {
  return { ...prev, call_hunting_v1: next }
}

export function activeHuntPhones(settings: CallHuntingSettings, primaryForward: string | null): string[] {
  const primary = (primaryForward || "").trim()
  if (!settings.enabled || settings.mode === "primary_only") {
    return primary ? [primary] : []
  }
  const extras = settings.targets.filter((t) => t.enabled && t.phone.trim()).map((t) => t.phone.trim())
  const ordered = primary ? [primary, ...extras.filter((p) => p !== primary)] : extras
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
