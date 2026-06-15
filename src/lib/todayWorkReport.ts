import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeCommunicationUrgency, type CommunicationUrgency } from "./customerUrgency"

export type TodayWorkEvent = {
  id: string
  title: string | null
  start_at: string | null
  end_at: string | null
}

export type TodayWorkCustomer = {
  id: string
  display_name: string | null
  communication_urgency: CommunicationUrgency
  last_activity_at: string | null
  updated_at: string | null
}

export type TodayWorkSnapshot = {
  todayEvents: TodayWorkEvent[]
  weekEventCount: number
  priorityCustomers: TodayWorkCustomer[]
  neglectedCustomers: TodayWorkCustomer[]
  recentCustomers: TodayWorkCustomer[]
  urgencyCounts: Record<string, number>
}

export function localDayBounds(now = new Date()): { startIso: string; endIso: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export function weekBounds(now = new Date()): { startIso: string; endIso: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function parseMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

function isRecentlyAdded(c: { updated_at?: string | null; last_activity_at?: string | null }, sinceMs: number): boolean {
  const updated = parseMs(c.updated_at)
  const activity = parseMs(c.last_activity_at)
  const marker = Math.max(updated, activity)
  return marker >= sinceMs
}

function isNeglected(c: TodayWorkCustomer, nowMs: number): boolean {
  const u = c.communication_urgency
  if (u === "Needs Attention" || u === "Critical") return true
  if (u === "Complete" || u === "Lost") return false
  const last = parseMs(c.last_activity_at) || parseMs(c.updated_at)
  if (!last) return false
  const days14 = 14 * 86400000
  return nowMs - last >= days14
}

export async function loadTodayWorkSnapshot(
  supabase: SupabaseClient,
  userId: string,
  opts?: { recentDays?: number },
): Promise<TodayWorkSnapshot> {
  const recentDays = opts?.recentDays ?? 7
  const now = new Date()
  const nowMs = now.getTime()
  const { startIso, endIso } = localDayBounds(now)
  const week = weekBounds(now)
  const recentSinceMs = nowMs - recentDays * 86400000

  const [evTodayRes, evWeekRes, custRes] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, title, start_at, end_at")
      .eq("user_id", userId)
      .is("removed_at", null)
      .gte("start_at", startIso)
      .lt("start_at", endIso)
      .order("start_at", { ascending: true }),
    supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("removed_at", null)
      .gte("start_at", week.startIso)
      .lt("start_at", week.endIso),
    supabase
      .from("customers")
      .select("id, display_name, communication_urgency, last_activity_at, updated_at")
      .eq("user_id", userId)
      .limit(800),
  ])

  if (evTodayRes.error) throw evTodayRes.error
  if (evWeekRes.error) throw evWeekRes.error
  if (custRes.error) throw custRes.error

  const todayEvents = (evTodayRes.data ?? []) as TodayWorkEvent[]
  const weekEventCount = evWeekRes.count ?? 0

  const mapped: TodayWorkCustomer[] = (custRes.data ?? []).map((c) => {
    const row = c as {
      id: string
      display_name: string | null
      communication_urgency?: string | null
      last_activity_at?: string | null
      updated_at?: string | null
    }
    return {
      id: row.id,
      display_name: row.display_name,
      communication_urgency: normalizeCommunicationUrgency(row.communication_urgency),
      last_activity_at: row.last_activity_at ?? null,
      updated_at: row.updated_at ?? null,
    }
  })

  const urgencyCounts: Record<string, number> = {}
  for (const c of mapped) {
    urgencyCounts[c.communication_urgency] = (urgencyCounts[c.communication_urgency] ?? 0) + 1
  }

  const priorityCustomers = mapped
    .filter((c) => c.communication_urgency === "Needs Attention" || c.communication_urgency === "Critical")
    .sort((a, b) => {
      const rank = (u: CommunicationUrgency) => (u === "Critical" ? 0 : u === "Needs Attention" ? 1 : 2)
      return rank(a.communication_urgency) - rank(b.communication_urgency)
    })

  const neglectedCustomers = mapped
    .filter((c) => isNeglected(c, nowMs))
    .sort((a, b) => {
      const aLast = parseMs(a.last_activity_at) || parseMs(a.updated_at)
      const bLast = parseMs(b.last_activity_at) || parseMs(b.updated_at)
      return aLast - bLast
    })
    .slice(0, 12)

  const recentCustomers = mapped
    .filter((c) => isRecentlyAdded(c, recentSinceMs))
    .sort((a, b) => {
      const aMark = Math.max(parseMs(a.updated_at), parseMs(a.last_activity_at))
      const bMark = Math.max(parseMs(b.updated_at), parseMs(b.last_activity_at))
      return bMark - aMark
    })
    .slice(0, 8)

  return {
    todayEvents,
    weekEventCount,
    priorityCustomers,
    neglectedCustomers,
    recentCustomers,
    urgencyCounts,
  }
}
