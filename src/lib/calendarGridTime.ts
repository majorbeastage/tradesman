import { snapMinutesToIncrement } from "./numericFormInput"

/** Convert Y position inside a day column to snapped minutes from midnight. */
export function minutesFromColumnY(
  yPx: number,
  dayStartHour: number,
  hourHeight: number,
  timeIncrement: 15 | 60,
): number {
  const raw = dayStartHour * 60 + (yPx / hourHeight) * 60
  return snapMinutesToIncrement(Math.max(0, Math.round(raw)), timeIncrement)
}

export function dateWithMinutesFromMidnight(day: Date, minutesFromMidnight: number): Date {
  const d = new Date(day)
  d.setHours(0, 0, 0, 0)
  d.setMinutes(minutesFromMidnight)
  return d
}

export function formatTimeInputFromDate(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}
