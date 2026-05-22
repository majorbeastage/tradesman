/** Cap single calendar appointments so odd job-type durations (e.g. 60h) do not span multiple days by default. */

export const DEFAULT_APPOINTMENT_MINUTES = 60
export const MAX_APPOINTMENT_MINUTES = 600

export function parseHourMinute(hhmm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number.parseInt(m[1], 10)
  const min = Number.parseInt(m[2], 10)
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null
  return { h, m: min }
}

export function clampAppointmentDurationMinutes(
  rawMinutes: number,
  opts?: { start?: Date; workingStart?: string; workingEnd?: string },
): number {
  let minutes = Math.max(15, Math.round(rawMinutes))
  if (minutes > MAX_APPOINTMENT_MINUTES) minutes = MAX_APPOINTMENT_MINUTES

  const start = opts?.start
  const ws = opts?.workingStart?.trim()
  const we = opts?.workingEnd?.trim()
  if (!start || Number.isNaN(start.getTime()) || !ws || !we) return minutes

  const endParts = parseHourMinute(we)
  if (!endParts) return minutes
  const endOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), endParts.h, endParts.m, 0, 0)
  const maxMs = endOfDay.getTime() - start.getTime()
  if (maxMs <= 0) return minutes
  const maxMin = Math.floor(maxMs / 60_000)
  if (maxMin >= 15) minutes = Math.min(minutes, maxMin)
  return minutes
}

export function durationMinutesFromJobType(
  durationMinutes: number,
  timeIncrement: 15 | 60,
  opts?: { start?: Date; workingStart?: string; workingEnd?: string },
): number {
  const raw = Number(durationMinutes)
  const base = Number.isFinite(raw) && raw >= 15 ? raw : DEFAULT_APPOINTMENT_MINUTES
  const snapped =
    timeIncrement === 60 ? Math.max(60, Math.round(base / 60) * 60) : Math.max(15, Math.round(base / 15) * 15)
  return clampAppointmentDurationMinutes(snapped, opts)
}

export function readCalendarWorkingHoursFromStorage(): { enabled: boolean; start: string; end: string } {
  try {
    const enabled = localStorage.getItem("calendar_workingHoursEnabled") === "true"
    const start = localStorage.getItem("calendar_workingStart")?.trim() || "08:00"
    const end = localStorage.getItem("calendar_workingEnd")?.trim() || "17:00"
    return { enabled, start, end }
  } catch {
    return { enabled: false, start: "08:00", end: "17:00" }
  }
}
