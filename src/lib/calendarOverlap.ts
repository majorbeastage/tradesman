import type { SupabaseClient } from "@supabase/supabase-js"
import { intervalsOverlap } from "./calendarRecurrence"

export function readCalendarNoDuplicateTimesSetting(): boolean {
  try {
    return localStorage.getItem("calendar_noDuplicateTimes") === "true"
  } catch {
    return false
  }
}

export function writeCalendarNoDuplicateTimesSetting(enabled: boolean): void {
  try {
    localStorage.setItem("calendar_noDuplicateTimes", enabled ? "true" : "false")
  } catch {
    /* ignore */
  }
}

export type CalendarOverlapConflict = {
  id: string
  title?: string | null
  start_at: string
  end_at: string
}

export async function findCalendarScheduleConflicts(
  supabase: SupabaseClient,
  params: {
    userId: string
    ranges: { s: Date; e: Date }[]
    excludeEventIds?: string[]
  },
): Promise<CalendarOverlapConflict[]> {
  if (params.ranges.length === 0) return []
  const windowStart = params.ranges[0].s
  const windowEnd = params.ranges[params.ranges.length - 1].e
  const exclude = new Set(params.excludeEventIds ?? [])

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, title, start_at, end_at")
    .eq("user_id", params.userId)
    .is("removed_at", null)
    .lt("start_at", windowEnd.toISOString())
    .gt("end_at", windowStart.toISOString())

  if (error) throw new Error(error.message)

  const conflicts: CalendarOverlapConflict[] = []
  for (const row of (data ?? []) as CalendarOverlapConflict[]) {
    if (exclude.has(row.id)) continue
    const ex0 = new Date(row.start_at)
    const ex1 = new Date(row.end_at)
    for (const nr of params.ranges) {
      if (intervalsOverlap(nr.s, nr.e, ex0, ex1)) {
        conflicts.push(row)
        break
      }
    }
  }
  return conflicts
}

export function formatCalendarOverlapSummary(conflicts: CalendarOverlapConflict[]): string {
  if (conflicts.length === 0) return "This time overlaps another scheduled event."
  const first = conflicts[0]
  const when = new Date(first.start_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
  const title = first.title?.trim() || "Untitled event"
  const extra = conflicts.length > 1 ? ` (+${conflicts.length - 1} more conflict${conflicts.length > 2 ? "s" : ""})` : ""
  return `"${title}" at ${when}${extra}`
}

/** Returns true when the user chose to save despite overlap. Returns false to abort save. */
export function confirmCalendarOverlapSave(conflicts: CalendarOverlapConflict[]): boolean {
  const summary = formatCalendarOverlapSummary(conflicts)
  return window.confirm(
    `This appointment overlaps ${summary}.\n\nYour calendar settings block duplicate times. Choose a different time, or click OK to save anyway for this appointment only.`,
  )
}
