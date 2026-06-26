import type { SupabaseClient } from "@supabase/supabase-js"
import { loadTodayWorkSnapshot, localDayBounds, type TodayWorkEvent } from "./todayWorkReport"
import { loadCoiTodoItems, type CoiTodoItem } from "./insuranceAssistant"
import {
  activeDashboardTodos,
  customTodoUrgencyScore,
  loadDashboardTodosDoc,
  type DashboardTodoItem,
} from "./dashboardTodos"

export type PressingWorkKind =
  | "critical_customer"
  | "needs_attention"
  | "coi"
  | "calendar_today"
  | "calendar_upcoming"
  | "neglected"
  | "custom_todo"

export type PressingWorkItem = {
  id: string
  kind: PressingWorkKind
  title: string
  subtitle?: string
  urgencyScore: number
  dueAt?: string | null
  customerId?: string
  eventId?: string
  assigneeUserId?: string
  customTodoId?: string
}

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return (t - Date.now()) / 3600000
}

function calendarEventScore(ev: TodayWorkEvent, todayEndIso: string): { score: number; kind: PressingWorkKind } {
  const start = ev.start_at
  const endBound = Date.parse(todayEndIso)
  const startMs = Date.parse(start ?? "")
  const hrs = hoursUntil(start)
  if (Number.isFinite(startMs) && startMs < endBound) {
    if (hrs != null && hrs <= 2) return { score: 92, kind: "calendar_today" }
    return { score: 65, kind: "calendar_today" }
  }
  if (hrs != null && hrs <= 24) return { score: 58, kind: "calendar_upcoming" }
  if (hrs != null && hrs <= 72) return { score: 45, kind: "calendar_upcoming" }
  return { score: 35, kind: "calendar_upcoming" }
}

function coiScore(item: CoiTodoItem): number {
  if (item.status === "expired") return 96
  if (item.daysUntil != null && item.daysUntil <= 7) return 82
  return 72
}

function customToPressing(t: DashboardTodoItem, assigneeLabel?: string): PressingWorkItem {
  return {
    id: `todo-${t.id}`,
    kind: "custom_todo",
    title: t.title,
    subtitle: assigneeLabel ? `Assigned · ${assigneeLabel}` : t.priority === "urgent" ? "Urgent task" : "Custom task",
    urgencyScore: customTodoUrgencyScore(t),
    dueAt: t.dueAt ?? null,
    assigneeUserId: t.assigneeUserId,
    customTodoId: t.id,
  }
}

export async function loadPressingWorkQueue(
  client: SupabaseClient,
  accountOwnerId: string,
  viewerUserId: string,
  opts?: { includeTeamTodos?: boolean; assigneeLabels?: Map<string, string> },
): Promise<PressingWorkItem[]> {
  const now = new Date()
  const { endIso } = localDayBounds(now)
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString()

  const [snap, coiItems, todosDoc, upcomingRes] = await Promise.all([
    loadTodayWorkSnapshot(client, accountOwnerId),
    loadCoiTodoItems(client, accountOwnerId),
    loadDashboardTodosDoc(client, accountOwnerId),
    client
      .from("calendar_events")
      .select("id, title, start_at, end_at")
      .eq("user_id", accountOwnerId)
      .is("removed_at", null)
      .gte("start_at", now.toISOString())
      .lt("start_at", weekEnd)
      .order("start_at", { ascending: true })
      .limit(40),
  ])

  if (upcomingRes.error) throw upcomingRes.error
  const upcomingEvents = (upcomingRes.data ?? []) as TodayWorkEvent[]

  const items: PressingWorkItem[] = []
  const seenCalendar = new Set<string>()

  for (const c of snap.priorityCustomers) {
    if (c.communication_urgency === "Critical") {
      items.push({
        id: `cust-critical-${c.id}`,
        kind: "critical_customer",
        title: c.display_name?.trim() || "Customer",
        subtitle: "Critical — respond now",
        urgencyScore: 100,
        customerId: c.id,
      })
    } else {
      items.push({
        id: `cust-attn-${c.id}`,
        kind: "needs_attention",
        title: c.display_name?.trim() || "Customer",
        subtitle: "Needs attention",
        urgencyScore: 72,
        customerId: c.id,
      })
    }
  }

  for (const c of snap.neglectedCustomers.slice(0, 8)) {
    if (items.some((i) => i.customerId === c.id)) continue
    items.push({
      id: `cust-neglect-${c.id}`,
      kind: "neglected",
      title: c.display_name?.trim() || "Customer",
      subtitle: "No recent activity",
      urgencyScore: 52,
      customerId: c.id,
    })
  }

  for (const coi of coiItems.slice(0, 6)) {
    items.push({
      id: `coi-${coi.id}`,
      kind: "coi",
      title: coi.label,
      subtitle: coi.status === "expired" ? "COI expired" : "COI renewal due",
      urgencyScore: coiScore(coi),
      dueAt: coi.expiresAt,
      customerId: coi.customerId ?? undefined,
      eventId: coi.calendarEventId ?? undefined,
    })
  }

  for (const ev of upcomingEvents) {
    if (seenCalendar.has(ev.id)) continue
    seenCalendar.add(ev.id)
    const { score, kind } = calendarEventScore(ev, endIso)
    items.push({
      id: `cal-${ev.id}`,
      kind,
      title: ev.title?.trim() || "Scheduled job",
      subtitle:
        kind === "calendar_today"
          ? ev.start_at
            ? `Today · ${new Date(ev.start_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
            : "Today"
          : ev.start_at
            ? new Date(ev.start_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
            : "Upcoming",
      urgencyScore: score,
      dueAt: ev.start_at,
      eventId: ev.id,
    })
  }

  const labels = opts?.assigneeLabels ?? new Map<string, string>()
  const activeTodos = activeDashboardTodos(todosDoc)
  for (const t of activeTodos) {
    const forViewer = t.assigneeUserId === viewerUserId
    const teamVisible = opts?.includeTeamTodos && t.assigneeUserId !== viewerUserId
    if (!forViewer && !teamVisible) continue
    const label = labels.get(t.assigneeUserId)
    items.push(customToPressing(t, teamVisible ? label : undefined))
  }

  items.sort((a, b) => b.urgencyScore - a.urgencyScore)
  return items
}
