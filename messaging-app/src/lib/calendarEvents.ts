import type { SupabaseClient } from "@supabase/supabase-js"

export type MobileCalendarEvent = {
  id: string
  title: string
  start_at: string
  end_at: string
  customer_name: string | null
}

/** Upcoming events for the signed-in user (next ~14 days), for the mobile weekly list. */
export async function loadUpcomingCalendarEvents(
  supabase: SupabaseClient,
  userId: string,
): Promise<MobileCalendarEvent[]> {
  const now = new Date()
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, title, start_at, end_at, removed_at, customers ( display_name )")
    .eq("user_id", userId)
    .is("removed_at", null)
    .gte("start_at", now.toISOString())
    .lte("start_at", end.toISOString())
    .order("start_at", { ascending: true })
    .limit(80)

  if (error || !data) return []

  return (data as Record<string, unknown>[]).map((row) => {
    const cust = row.customers as { display_name?: string } | null
    return {
      id: row.id as string,
      title: ((row.title as string) || "Event").trim() || "Event",
      start_at: row.start_at as string,
      end_at: row.end_at as string,
      customer_name: cust?.display_name?.trim() || null,
    }
  })
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay() // 0 Sun
  x.setDate(x.getDate() - day)
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
