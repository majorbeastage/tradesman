import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgRosterOwnerId } from "./accountStructureOwner"
import { readAssignedUserId } from "./calendarAssignee"
import type { OmCalendarPolicyV1 } from "./teamCalendarPolicy"

export const ORG_CUSTOMER_SHARING_META_KEY = "org_customer_sharing_v1"

export type OrgCustomerSharingV1 = {
  /** Default true — org members mirror the account owner's customer profiles. */
  share_customer_profiles?: boolean
  _v?: 1
}

export type CustomerSharingScope = "organization" | "assignee_only"

export type CustomerDataScope = {
  viewerUserId: string
  dataUserId: string
  sharingScope: CustomerSharingScope
}

export function parseOrgCustomerSharingPolicy(metadata: unknown): OrgCustomerSharingV1 {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { share_customer_profiles: true, _v: 1 }
  const raw = (metadata as Record<string, unknown>)[ORG_CUSTOMER_SHARING_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { share_customer_profiles: true, _v: 1 }
  const o = raw as Record<string, unknown>
  return {
    share_customer_profiles: o.share_customer_profiles !== false,
    _v: 1,
  }
}

export function mergeOrgCustomerSharingPolicy(
  metadata: unknown,
  patch: Partial<OrgCustomerSharingV1>,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  const prev = parseOrgCustomerSharingPolicy(metadata)
  base[ORG_CUSTOMER_SHARING_META_KEY] = { ...prev, ...patch, _v: 1 }
  return base
}

/** Whether this org member sees the full shared customer roster (default) vs assignee-only. */
export function resolveCustomerSharingScope(
  viewerUserId: string,
  dataUserId: string,
  orgSharing: OrgCustomerSharingV1,
  memberPolicy: Pick<OmCalendarPolicyV1, "assignee_customer_profiles_opt_out">,
): CustomerSharingScope {
  if (!viewerUserId.trim() || viewerUserId === dataUserId) return "organization"
  if (orgSharing.share_customer_profiles === false) return "assignee_only"
  if (memberPolicy.assignee_customer_profiles_opt_out === true) return "assignee_only"
  return "organization"
}

export async function resolveCustomerDataScope(
  supabase: SupabaseClient,
  viewerUserId: string,
  memberPolicy: Pick<OmCalendarPolicyV1, "assignee_customer_profiles_opt_out">,
): Promise<CustomerDataScope> {
  const viewer = viewerUserId.trim()
  if (!viewer) {
    return { viewerUserId: "", dataUserId: "", sharingScope: "organization" }
  }
  const dataUserId = await resolveOrgRosterOwnerId(supabase, viewer)
  let orgSharing = parseOrgCustomerSharingPolicy(null)
  if (dataUserId !== viewer) {
    const { data } = await supabase.from("profiles").select("metadata").eq("id", dataUserId).maybeSingle()
    orgSharing = parseOrgCustomerSharingPolicy(data?.metadata)
  }
  return {
    viewerUserId: viewer,
    dataUserId,
    sharingScope: resolveCustomerSharingScope(viewer, dataUserId, orgSharing, memberPolicy),
  }
}

/** Customer ids linked to calendar jobs assigned to this team member on the owner calendar. */
export async function loadAssigneeCalendarCustomerIds(
  supabase: SupabaseClient,
  ownerUserId: string,
  assigneeUserId: string,
  opts?: { incompleteOnly?: boolean },
): Promise<Set<string>> {
  const owner = ownerUserId.trim()
  const assignee = assigneeUserId.trim()
  if (!owner || !assignee) return new Set()

  if (opts?.incompleteOnly) {
    const withCompleted = await supabase
      .from("calendar_events")
      .select("customer_id, metadata, completed_at")
      .eq("user_id", owner)
      .is("removed_at", null)
      .is("completed_at", null)
      .not("customer_id", "is", null)
    if (!withCompleted.error) {
      return collectAssigneeCustomerIds(withCompleted.data ?? [], assignee)
    }
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("customer_id, metadata")
    .eq("user_id", owner)
    .is("removed_at", null)
    .not("customer_id", "is", null)
  if (error) return new Set()
  return collectAssigneeCustomerIds(data ?? [], assignee)
}

function collectAssigneeCustomerIds(
  rows: Array<{ customer_id?: string | null; metadata?: unknown; completed_at?: string | null }>,
  assigneeUserId: string,
): Set<string> {
  const ids = new Set<string>()
  for (const row of rows) {
    const cid = typeof row.customer_id === "string" ? row.customer_id.trim() : ""
    if (!cid) continue
    const assigned = readAssignedUserId(row.metadata)
    if (assigned === assigneeUserId) ids.add(cid)
  }
  return ids
}

export function filterCustomersToSharingScope<T extends { id: string }>(
  rows: T[],
  scope: CustomerSharingScope,
  allowedIds: ReadonlySet<string>,
): T[] {
  if (scope === "organization") return rows
  if (allowedIds.size === 0) return []
  return rows.filter((r) => allowedIds.has(r.id))
}
