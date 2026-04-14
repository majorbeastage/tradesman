/** Empty or invalid → null (does not treat 0 as empty). */
export function parseOptionalNumberInput(raw: string): number | null {
  const t = raw.trim()
  if (t === "") return null
  const n = Number.parseFloat(t.replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

export type DurationStep = 15 | 60

/** Display string for calendar/quote duration fields (minutes internally). */
export function formatDurationFieldFromMinutes(minutes: number, increment: DurationStep): string {
  if (increment === 60) {
    const h = minutes / 60
    return String(Math.round(h * 1000) / 1000)
  }
  return String(Math.round(minutes))
}

/**
 * Parse duration field shown as minutes or hours.
 * Returns null if empty/invalid or below 15 minutes (calendar minimum).
 */
export function parseDurationFieldToMinutes(raw: string, increment: DurationStep): number | null {
  const n = parseOptionalNumberInput(raw)
  if (n == null) return null
  if (increment === 60) {
    const mins = Math.round(n * 60)
    return Number.isFinite(mins) && mins >= 15 ? mins : null
  }
  const mins = Math.round(n)
  return mins >= 15 ? mins : null
}

export function snapMinutesToIncrement(minutes: number, increment: DurationStep): number {
  return Math.max(increment, Math.round(minutes / increment) * increment)
}

/** Job type duration (integer minutes, min 15). Null if empty/invalid/< 15. */
export function parseJobTypeDurationMinutes(raw: string): number | null {
  const n = parseOptionalNumberInput(raw)
  if (n == null) return null
  const m = Math.round(n)
  return m >= 15 ? m : null
}
