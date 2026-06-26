import type { SupabaseClient } from "@supabase/supabase-js"
import { parseOrganizationChart, type OrganizationChartDoc } from "./organizationChart"
import { collectOrgChartLinkedUserIds, collectOrgSubordinateUserIds } from "./orgChartSubordinates"
import { loadLinkableOrgUsers, type LinkableOrgUser } from "./orgChartMembers"
import { isOfficeManagerLikeRole } from "./profileRoles"
import type { UserRole } from "../contexts/AuthContext"

export const DASHBOARD_TODOS_META_KEY = "dashboard_todos_v1"

export type DashboardTodoPriority = "urgent" | "normal" | "low"

export type DashboardTodoItem = {
  id: string
  title: string
  assigneeUserId: string
  createdByUserId: string
  createdAt: string
  dueAt?: string | null
  priority: DashboardTodoPriority
  completedAt?: string | null
  notes?: string
}

export type DashboardTodosDoc = {
  v: 1
  items: DashboardTodoItem[]
  updated_at: string
}

export type TodoAssigneeOption = {
  id: string
  label: string
  isSelf: boolean
  jobTitle?: string
}

export function parseDashboardTodos(raw: unknown): DashboardTodosDoc {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { v: 1, items: [], updated_at: new Date().toISOString() }
  }
  const o = raw as Record<string, unknown>
  const items: DashboardTodoItem[] = []
  if (Array.isArray(o.items)) {
    for (const row of o.items) {
      if (!row || typeof row !== "object") continue
      const r = row as Record<string, unknown>
      if (typeof r.id !== "string" || typeof r.title !== "string" || typeof r.assigneeUserId !== "string") continue
      const priority =
        r.priority === "urgent" || r.priority === "low" || r.priority === "normal" ? r.priority : "normal"
      items.push({
        id: r.id,
        title: r.title.trim(),
        assigneeUserId: r.assigneeUserId,
        createdByUserId: typeof r.createdByUserId === "string" ? r.createdByUserId : r.assigneeUserId,
        createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
        dueAt: typeof r.dueAt === "string" ? r.dueAt : null,
        priority,
        completedAt: typeof r.completedAt === "string" ? r.completedAt : null,
        notes: typeof r.notes === "string" ? r.notes : undefined,
      })
    }
  }
  return {
    v: 1,
    items,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
  }
}

export function mergeDashboardTodosMetadata(
  metadata: Record<string, unknown>,
  doc: DashboardTodosDoc,
): Record<string, unknown> {
  return { ...metadata, [DASHBOARD_TODOS_META_KEY]: { ...doc, updated_at: new Date().toISOString() } }
}

export async function loadDashboardTodosDoc(
  client: SupabaseClient,
  accountOwnerId: string,
): Promise<DashboardTodosDoc> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", accountOwnerId).maybeSingle()
  if (error) throw error
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  return parseDashboardTodos(meta[DASHBOARD_TODOS_META_KEY])
}

export async function saveDashboardTodosDoc(
  client: SupabaseClient,
  accountOwnerId: string,
  doc: DashboardTodosDoc,
): Promise<void> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", accountOwnerId).maybeSingle()
  if (error) throw error
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  const next = mergeDashboardTodosMetadata(prevMeta, doc)
  const { error: upErr } = await client.from("profiles").update({ metadata: next }).eq("id", accountOwnerId)
  if (upErr) throw upErr
}

export function activeDashboardTodos(doc: DashboardTodosDoc): DashboardTodoItem[] {
  return doc.items.filter((t) => !t.completedAt).sort((a, b) => scoreCustomTodo(b) - scoreCustomTodo(a))
}

function scoreCustomTodo(t: DashboardTodoItem): number {
  let s = t.priority === "urgent" ? 85 : t.priority === "normal" ? 40 : 20
  if (t.dueAt) {
    const due = Date.parse(t.dueAt)
    if (Number.isFinite(due)) {
      const days = (due - Date.now()) / 86400000
      if (days < 0) s += 25
      else if (days <= 1) s += 15
      else if (days <= 3) s += 8
    }
  }
  return s
}

export function customTodoUrgencyScore(t: DashboardTodoItem): number {
  return scoreCustomTodo(t)
}

export async function loadTodoAssigneeOptions(
  client: SupabaseClient,
  accountOwnerId: string,
  viewerUserId: string,
): Promise<TodoAssigneeOption[]> {
  const [{ data: owner }, linkable] = await Promise.all([
    client.from("profiles").select("metadata, role").eq("id", accountOwnerId).maybeSingle(),
    loadLinkableOrgUsers(client, accountOwnerId),
  ])

  const meta =
    owner?.metadata && typeof owner.metadata === "object" && !Array.isArray(owner.metadata)
      ? (owner.metadata as Record<string, unknown>)
      : {}
  const orgChart = parseOrganizationChart(meta.organization_chart_v1)
  const ownerRole = typeof owner?.role === "string" ? (owner.role as UserRole) : null

  let allowedIds = new Set<string>([viewerUserId])
  const subordinates = collectOrgSubordinateUserIds(orgChart, viewerUserId)
  for (const id of subordinates) allowedIds.add(id)

  if (viewerUserId === accountOwnerId && orgChart) {
    for (const id of collectOrgChartLinkedUserIds(orgChart)) allowedIds.add(id)
  }

  if (isOfficeManagerLikeRole(ownerRole) && viewerUserId === accountOwnerId) {
    for (const u of linkable) {
      if (!u.isDemo) allowedIds.add(u.id)
    }
  }

  const byId = new Map<string, LinkableOrgUser>()
  for (const u of linkable) byId.set(u.id, u)

  const options: TodoAssigneeOption[] = []
  for (const id of allowedIds) {
    const u = byId.get(id)
    const label = u?.displayName ?? (id === viewerUserId ? "Me" : "Team member")
    options.push({
      id,
      label: id === viewerUserId ? `${label} (me)` : label,
      isSelf: id === viewerUserId,
      jobTitle: u?.jobTitle,
    })
  }

  options.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
    return a.label.localeCompare(b.label)
  })
  return options
}

export async function addDashboardTodo(
  client: SupabaseClient,
  accountOwnerId: string,
  input: {
    title: string
    assigneeUserId: string
    createdByUserId: string
    priority?: DashboardTodoPriority
    dueAt?: string | null
    notes?: string
  },
): Promise<DashboardTodoItem> {
  const doc = await loadDashboardTodosDoc(client, accountOwnerId)
  const item: DashboardTodoItem = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    assigneeUserId: input.assigneeUserId,
    createdByUserId: input.createdByUserId,
    createdAt: new Date().toISOString(),
    dueAt: input.dueAt ?? null,
    priority: input.priority ?? "normal",
    notes: input.notes?.trim() || undefined,
  }
  doc.items.unshift(item)
  await saveDashboardTodosDoc(client, accountOwnerId, doc)
  return item
}

export async function completeDashboardTodo(
  client: SupabaseClient,
  accountOwnerId: string,
  todoId: string,
): Promise<void> {
  const doc = await loadDashboardTodosDoc(client, accountOwnerId)
  const now = new Date().toISOString()
  doc.items = doc.items.map((t) => (t.id === todoId ? { ...t, completedAt: now } : t))
  await saveDashboardTodosDoc(client, accountOwnerId, doc)
}

export async function deleteDashboardTodo(
  client: SupabaseClient,
  accountOwnerId: string,
  todoId: string,
): Promise<void> {
  const doc = await loadDashboardTodosDoc(client, accountOwnerId)
  doc.items = doc.items.filter((t) => t.id !== todoId)
  await saveDashboardTodosDoc(client, accountOwnerId, doc)
}

export function parseOrgChartFromMetadata(metadata: unknown): OrganizationChartDoc | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  return parseOrganizationChart((metadata as Record<string, unknown>).organization_chart_v1)
}
