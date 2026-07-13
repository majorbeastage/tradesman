import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "../contexts/AuthContext"
import { loadOrganizationChartFromMetadata } from "./organizationChart"
import { resolveInternalMemberLabel } from "./profileContactMeta"
import { isOfficeManagerLikeRole } from "./profileRoles"

export type AlertTeamMember = {
  userId: string
  label: string
  email: string | null
  isSelf?: boolean
}

function directReportUserIds(orgChart: ReturnType<typeof loadOrganizationChartFromMetadata>, managerUserId: string): string[] {
  const managerNode = orgChart.nodes.find((n) => n.linkedUserId === managerUserId)
  if (!managerNode) return []
  const childIds = new Set(orgChart.edges.filter((e) => e.fromId === managerNode.id).map((e) => e.toId))
  return orgChart.nodes
    .filter((n) => childIds.has(n.id) && n.linkedUserId && n.linkedUserId !== managerUserId)
    .map((n) => n.linkedUserId as string)
}

async function loadManagedUserIds(client: SupabaseClient, managerUserId: string): Promise<string[]> {
  const { data, error } = await client
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", managerUserId)
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.user_id).filter((id): id is string => typeof id === "string" && id !== managerUserId))]
}

/** Profile that stores the account business workflow chart (OM for managed users). */
export async function resolveWorkflowMetadataUserId(client: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await client.from("profiles").select("role").eq("id", userId).maybeSingle()
  if (error) throw error
  if (isOfficeManagerLikeRole(typeof data?.role === "string" ? data.role : null)) return userId

  const { data: link, error: linkErr } = await client
    .from("office_manager_clients")
    .select("office_manager_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()
  if (linkErr) throw linkErr
  if (typeof link?.office_manager_id === "string" && link.office_manager_id.trim()) {
    return link.office_manager_id.trim()
  }
  return userId
}

/** Users whose alert prefs a manager may view and edit (self + direct reports). */
export async function loadAlertEditableTeamMembers(
  client: SupabaseClient,
  managerUserId: string,
  managerRole: UserRole | null,
): Promise<AlertTeamMember[]> {
  const { data: selfRow, error: selfErr } = await client
    .from("profiles")
    .select("id, display_name, email, metadata")
    .eq("id", managerUserId)
    .maybeSingle()
  if (selfErr) throw selfErr

  const selfLabel = selfRow ? resolveInternalMemberLabel(selfRow) : "My alerts"
  const out: AlertTeamMember[] = [
    {
      userId: managerUserId,
      label: selfLabel,
      email: selfRow?.email ?? null,
      isSelf: true,
    },
  ]

  if (!isOfficeManagerLikeRole(managerRole)) return out

  const reportIds = new Set<string>()

  for (const id of await loadManagedUserIds(client, managerUserId)) reportIds.add(id)

  const meta =
    selfRow?.metadata && typeof selfRow.metadata === "object" && !Array.isArray(selfRow.metadata)
      ? (selfRow.metadata as Record<string, unknown>)
      : {}
  const orgChart = loadOrganizationChartFromMetadata(meta)
  for (const id of directReportUserIds(orgChart, managerUserId)) reportIds.add(id)

  if (!reportIds.size) return out

  const { data: rows, error: rowsErr } = await client
    .from("profiles")
    .select("id, display_name, email, metadata")
    .in("id", [...reportIds])
  if (rowsErr) throw rowsErr

  for (const row of rows ?? []) {
    const id = String(row.id ?? "")
    if (!id || id === managerUserId) continue
    out.push({
      userId: id,
      label: resolveInternalMemberLabel(row as { display_name?: string | null; email?: string | null; metadata?: unknown }),
      email: (row.email as string | null) ?? null,
    })
  }

  return out.sort((a, b) => {
    if (a.isSelf) return -1
    if (b.isSelf) return 1
    return a.label.localeCompare(b.label)
  })
}
