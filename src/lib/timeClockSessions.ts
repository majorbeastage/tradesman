export type TimeClockSessionKind = "shift" | "job"

export type TimeClockSessionRow = {
  id?: string
  user_id: string
  session_kind?: TimeClockSessionKind | string | null
  calendar_event_id?: string | null
  clocked_in_at: string
  clocked_out_at: string | null
  notes?: string | null
  calendar_events?: { title?: string | null } | { title?: string | null }[] | null
}

export type TimeClockReportRange = "7d" | "30d" | "90d"

export function normalizeSessionKind(raw: unknown): TimeClockSessionKind {
  return raw === "job" ? "job" : "shift"
}

export function sessionKindLabel(kind: TimeClockSessionKind): string {
  return kind === "job" ? "Job" : "Shift"
}

export function sessionDurationMs(
  row: Pick<TimeClockSessionRow, "clocked_in_at" | "clocked_out_at">,
  nowMs = Date.now(),
): number {
  const inMs = Date.parse(row.clocked_in_at)
  const outMs = row.clocked_out_at ? Date.parse(row.clocked_out_at) : nowMs
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs < inMs) return 0
  return outMs - inMs
}

export function formatDurationShort(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatDurationDecimalHours(ms: number): string {
  return (ms / 3600000).toFixed(2)
}

export function sumDurationByKind(
  rows: TimeClockSessionRow[],
  nowMs = Date.now(),
): { shiftMs: number; jobMs: number; totalMs: number } {
  let shiftMs = 0
  let jobMs = 0
  for (const row of rows) {
    const ms = sessionDurationMs(row, nowMs)
    if (normalizeSessionKind(row.session_kind) === "job") jobMs += ms
    else shiftMs += ms
  }
  return { shiftMs, jobMs, totalMs: shiftMs + jobMs }
}

export function reportRangeStartIso(range: TimeClockReportRange): string {
  const d = new Date()
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function datetimeLocalInputToIso(val: string): string | null {
  const t = val.trim()
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function eventTitleFromSession(row: TimeClockSessionRow): string | null {
  const rel = row.calendar_events
  if (!rel) return null
  if (Array.isArray(rel)) return rel[0]?.title?.trim() || null
  return rel.title?.trim() || null
}

export function downloadTimeSessionsCsv(filename: string, rows: TimeClockSessionRow[], rosterLabel: (userId: string) => string) {
  const esc = (c: string) => `"${String(c).replace(/"/g, '""')}"`
  const header = ["user", "kind", "job", "clock_in", "clock_out", "hours", "notes"]
  const body = rows.map((row) => {
    const ms = sessionDurationMs(row)
    return [
      rosterLabel(row.user_id),
      sessionKindLabel(normalizeSessionKind(row.session_kind)),
      eventTitleFromSession(row) ?? "",
      row.clocked_in_at,
      row.clocked_out_at ?? "",
      formatDurationDecimalHours(ms),
      row.notes?.trim() ?? "",
    ]
  })
  const csv = [header, ...body].map((r) => r.map(esc).join(",")).join("\r\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function startOfWeekLocal(d: Date): Date {
  const at = new Date(d)
  at.setHours(0, 0, 0, 0)
  at.setDate(at.getDate() - at.getDay())
  return at
}

export function todayBoundsLocal(): { startIso: string; endIso: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export const TIME_CLOCK_SESSION_SELECT =
  "id, user_id, session_kind, calendar_event_id, clocked_in_at, clocked_out_at, notes, calendar_events ( title )"

export const TIME_CLOCK_SESSION_SELECT_LEGACY = "id, user_id, clocked_in_at, clocked_out_at"