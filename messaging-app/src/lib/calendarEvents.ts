import type { SupabaseClient } from "@supabase/supabase-js"

/** Same key as main Tradesman app (`src/lib/calendarVideoCall.ts`). */
export const CALENDAR_VIDEO_CALL_KEY = "video_call_v1"
const ASSIGNED_USER_KEY = "assigned_user_id"

export type MobileCalendarVideoCall = {
  roomId: string
  video: boolean
  inviteeUserIds: string[]
}

export type MobileCalendarEvent = {
  id: string
  title: string
  start_at: string
  end_at: string
  customer_name: string | null
  /** Owner account that created the event (DB user_id). */
  user_id: string
  videoCall: MobileCalendarVideoCall | null
}

function readVideoCall(metadata: unknown): MobileCalendarVideoCall | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const v = (metadata as Record<string, unknown>)[CALENDAR_VIDEO_CALL_KEY]
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const roomId = typeof o.roomId === "string" ? o.roomId.trim() : ""
  if (!roomId) return null
  const inviteeUserIds = Array.isArray(o.inviteeUserIds)
    ? o.inviteeUserIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : []
  return { roomId, video: o.video !== false, inviteeUserIds }
}

function mapRow(row: Record<string, unknown>): MobileCalendarEvent {
  const cust = row.customers as { display_name?: string } | null
  return {
    id: row.id as string,
    title: ((row.title as string) || "Event").trim() || "Event",
    start_at: row.start_at as string,
    end_at: row.end_at as string,
    customer_name: cust?.display_name?.trim() || null,
    user_id: String(row.user_id ?? ""),
    videoCall: readVideoCall(row.metadata),
  }
}

/**
 * Events for this user on Tradesman calendar: owned by them OR assigned to them
 * (same metadata key as the main app). Optionally scoped to a date range (week view).
 */
export async function loadUpcomingCalendarEvents(
  supabase: SupabaseClient,
  userId: string,
  range?: { from: Date; to: Date },
): Promise<MobileCalendarEvent[]> {
  const now = new Date()
  const from = range?.from ?? now
  const to = range?.to ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const selectCols =
    "id, title, start_at, end_at, removed_at, completed_at, user_id, metadata, customers ( display_name )"

  let data: Record<string, unknown>[] | null = null
  let error: { message: string } | null = null

  {
    const res = await supabase
      .from("calendar_events")
      .select(selectCols)
      .is("removed_at", null)
      .gte("start_at", from.toISOString())
      .lte("start_at", to.toISOString())
      .or(`user_id.eq.${userId},metadata->>${ASSIGNED_USER_KEY}.eq.${userId}`)
      .order("start_at", { ascending: true })
      .limit(120)
    if (res.error) {
      error = res.error
    } else {
      data = (res.data ?? []) as Record<string, unknown>[]
      error = null
    }
  }

  if (error) {
    // Older schemas without completed_at / JSON filter — owned events only.
    const fallback = await supabase
      .from("calendar_events")
      .select("id, title, start_at, end_at, removed_at, user_id, metadata, customers ( display_name )")
      .eq("user_id", userId)
      .is("removed_at", null)
      .gte("start_at", from.toISOString())
      .lte("start_at", to.toISOString())
      .order("start_at", { ascending: true })
      .limit(120)
    data = (fallback.data ?? null) as Record<string, unknown>[] | null
    error = fallback.error
  }

  if (error || !data) return []

  return data
    .filter((row) => {
      if (row.completed_at) return false
      const uid = String(row.user_id ?? "")
      if (uid === userId) return true
      const meta = row.metadata
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const assigned = (meta as Record<string, unknown>)[ASSIGNED_USER_KEY]
        if (typeof assigned === "string" && assigned.trim() === userId) return true
      }
      return false
    })
    .map(mapRow)
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay() // 0 Sun
  x.setDate(x.getDate() - day)
  return x
}

export function endOfWeek(d: Date): Date {
  const x = startOfWeek(d)
  x.setDate(x.getDate() + 7)
  return x
}

export function formatEventTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function formatDayHeader(d: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cmp = new Date(d)
  cmp.setHours(0, 0, 0, 0)
  const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  if (cmp.getTime() === today.getTime()) return `Today · ${label}`
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (cmp.getTime() === tomorrow.getTime()) return `Tomorrow · ${label}`
  return label
}
