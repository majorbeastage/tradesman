/** Org-scoped user roster from office_manager_clients + team_member_invites (Admin OM column ↔ Team members). */

import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgRosterOwnerId } from "./accountStructureOwner"
import { resolveInternalMemberLabel } from "./profileContactMeta"
import { roleFromProfileRow, type ManageableUserRow } from "./portalViewRules"
import { isProductionLinkableProfile } from "./productionOrgMembers"

export type OrgRosterEntry = {
  userId: string
  label: string
  isSelf?: boolean
  role?: string
}

type ProfilePick = {
  id: string
  display_name?: string | null
  email?: string | null
  role?: string | null
  client_id?: string | null
  metadata?: unknown
  portal_config?: unknown
  account_disabled?: boolean | null
}

/** Owner + linked team members + accepted invite shells for one organization. */
export async function loadOrgManageableUserRows(
  supabase: SupabaseClient,
  accountOwnerId: string,
  opts?: { markSelfUserId?: string | null },
): Promise<ManageableUserRow[]> {
  const ownerId = accountOwnerId.trim()
  if (!ownerId) return []

  const { data: links, error: e1 } = await supabase
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", ownerId)
  if (e1) throw new Error(e1.message)
  const managedIds = (links ?? []).map((l: { user_id: string }) => l.user_id)

  const { data: invites, error: invErr } = await supabase
    .from("team_member_invites")
    .select("shell_profile_id")
    .eq("account_owner_id", ownerId)
    .not("shell_profile_id", "is", null)
  if (invErr) throw new Error(invErr.message)
  const shellIds = [
    ...new Set(
      (invites ?? [])
        .map((r) => r.shell_profile_id)
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0),
    ),
  ]

  const profileIds = Array.from(new Set([ownerId, ...managedIds, ...shellIds]))
  const { data: profs, error: e2 } = await supabase
    .from("profiles")
    .select("id, display_name, email, role, client_id, metadata, portal_config, account_disabled")
    .in("id", profileIds)
  if (e2) throw new Error(e2.message)

  const profileById = new Map((profs ?? []).map((p) => [p.id as string, p as ProfilePick]))
  const markSelf = opts?.markSelfUserId?.trim() || null
  const orderedIds = [ownerId, ...managedIds.filter((id) => id !== ownerId), ...shellIds.filter((id) => id !== ownerId)]
  const seen = new Set<string>()
  const rows: ManageableUserRow[] = []

  for (const id of orderedIds) {
    if (!id || seen.has(id)) continue
    const p = profileById.get(id)
    if (!p) continue
    if (id !== ownerId && !managedIds.includes(id) && !isProductionLinkableProfile(p)) continue
    seen.add(id)
    rows.push({
      userId: id,
      label: resolveInternalMemberLabel(p),
      email: p.email ?? null,
      role: roleFromProfileRow(p.role),
      clientId: p.client_id ?? null,
      isSelf: markSelf ? id === markSelf : id === ownerId,
    })
  }

  return rows
}

/** Owner + linked team members for one organization (no cross-org, no platform ops fallback). */
export async function loadOrgRosterForUser(
  supabase: SupabaseClient,
  contextUserId: string,
  authUserId?: string | null,
): Promise<OrgRosterEntry[]> {
  if (!contextUserId.trim()) return []
  const ownerId = await resolveOrgRosterOwnerId(supabase, contextUserId)
  const rows = await loadOrgManageableUserRows(supabase, ownerId, { markSelfUserId: authUserId ?? contextUserId })
  return rows.map((r) => ({
    userId: r.userId,
    label: r.label,
    isSelf: r.isSelf,
    role: r.role,
  }))
}
