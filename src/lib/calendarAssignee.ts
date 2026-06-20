import { isSandboxDemoUserId, resolveSandboxDataUserId } from "./sandboxDemoTeam"

/** Sandbox training: which demo persona owns this job (real user_id stays the signed-in account). */
export const CALENDAR_ASSIGNED_DEMO_USER_KEY = "assigned_demo_user_id"

export type CalendarAssigneeResolution = {
  dbUserId: string
  assignedDemoUserId: string | null
}

export function resolveCalendarAssigneeForSave(
  selectedUserId: string,
  authUserId: string,
): CalendarAssigneeResolution {
  const trimmed = selectedUserId.trim()
  const auth = authUserId.trim()
  if (!trimmed) return { dbUserId: auth, assignedDemoUserId: null }
  if (isSandboxDemoUserId(trimmed)) {
    return { dbUserId: auth, assignedDemoUserId: trimmed }
  }
  return {
    dbUserId: resolveSandboxDataUserId(trimmed, auth),
    assignedDemoUserId: null,
  }
}

export function readAssignedDemoUserId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const v = (metadata as Record<string, unknown>)[CALENDAR_ASSIGNED_DEMO_USER_KEY]
  return typeof v === "string" && v.trim() ? v.trim() : null
}

export function mergeCalendarAssigneeMetadata(
  metadata: unknown,
  assignedDemoUserId: string | null,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}
  if (extra) Object.assign(base, extra)
  if (assignedDemoUserId?.trim()) base[CALENDAR_ASSIGNED_DEMO_USER_KEY] = assignedDemoUserId.trim()
  else delete base[CALENDAR_ASSIGNED_DEMO_USER_KEY]
  return base
}

export function calendarEventAssigneeUserId(event: {
  user_id?: string | null
  metadata?: unknown
}): string {
  const demo = readAssignedDemoUserId(event.metadata)
  if (demo) return demo
  return typeof event.user_id === "string" ? event.user_id : ""
}

export function calendarAssigneeLabel(
  event: { user_id?: string | null; metadata?: unknown },
  roster: Array<{ userId: string; label: string }>,
): string {
  const assigneeId = calendarEventAssigneeUserId(event)
  if (!assigneeId) return "Unassigned"
  const row = roster.find((r) => r.userId === assigneeId)
  if (row?.label?.trim()) return row.label.trim()
  return assigneeId.slice(0, 8) + "…"
}

/** When previewing a sandbox demo persona, only show jobs assigned to that persona. */
export function calendarEventVisibleToScopedUser(
  event: { user_id?: string | null; metadata?: unknown },
  scopedUserId: string,
): boolean {
  if (!isSandboxDemoUserId(scopedUserId)) return true
  const demo = readAssignedDemoUserId(event.metadata)
  return demo === scopedUserId
}
