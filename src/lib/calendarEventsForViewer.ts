import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveAccountStructureOwnerId } from "./accountStructureOwner"
import type { TodayWorkEvent } from "./todayWorkReport"

export type CalendarEventRange = {
  startIso: string
  endIso: string
}

/** Calendar rows for a viewer: all owner events, or assignee-filtered jobs when viewer ≠ owner. */
export async function loadCalendarEventsForViewer(
  client: SupabaseClient,
  viewerUserId: string,
  range: CalendarEventRange,
  opts?: { limit?: number; orderAsc?: boolean },
): Promise<TodayWorkEvent[]> {
  const viewer = viewerUserId.trim()
  if (!viewer) return []
  const ownerId = await resolveAccountStructureOwnerId(client, viewer)
  let q = client
    .from("calendar_events")
    .select("id, title, start_at, end_at")
    .eq("user_id", ownerId)
    .is("removed_at", null)
    .gte("start_at", range.startIso)
    .lt("start_at", range.endIso)
  if (viewer !== ownerId) {
    q = q.eq("metadata->>assigned_user_id", viewer)
  }
  q = q.order("start_at", { ascending: opts?.orderAsc !== false })
  if (opts?.limit != null && opts.limit > 0) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as TodayWorkEvent[]
}

export async function countCalendarEventsForViewer(
  client: SupabaseClient,
  viewerUserId: string,
  range: CalendarEventRange,
): Promise<number> {
  const viewer = viewerUserId.trim()
  if (!viewer) return 0
  const ownerId = await resolveAccountStructureOwnerId(client, viewer)
  let q = client
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerId)
    .is("removed_at", null)
    .gte("start_at", range.startIso)
    .lt("start_at", range.endIso)
  if (viewer !== ownerId) {
    q = q.eq("metadata->>assigned_user_id", viewer)
  }
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}
