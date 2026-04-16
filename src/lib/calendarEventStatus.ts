/** Aligns with `CALENDAR_STATUSES` in `src/constants/tabNotificationStatuses.ts` (Alerts → Calendar). */

export type CalendarWorkflowStatus = "Scheduled" | "In progress" | "Completed" | "Cancelled"

export function calendarEventEffectiveStatus(ev: {
  removed_at?: string | null
  completed_at?: string | null
  start_at: string
  end_at: string
}): CalendarWorkflowStatus {
  if (ev.removed_at) return "Cancelled"
  if (ev.completed_at) return "Completed"
  const now = Date.now()
  const s = new Date(ev.start_at).getTime()
  const e = new Date(ev.end_at).getTime()
  if (now >= s && now < e) return "In progress"
  return "Scheduled"
}
