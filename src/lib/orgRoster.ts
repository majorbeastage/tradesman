/** Org-scoped user roster from office_manager_clients (Admin OM column ↔ Team members). */

import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgRosterOwnerId } from "./accountStructureOwner"
import { resolveInternalMemberLabel } from "./profileContactMeta"
import { roleFromProfileRow } from "./portalViewRules"

export type OrgRosterEntry = {
  userId: string
  label: string
  isSelf?: boolean
  role?: string
}

/** Owner + linked team members for one organization (no cross-org, no platform ops fallback). */
export async function loadOrgRosterForUser(
  supabase: SupabaseClient,
  contextUserId: string,
  authUserId?: string | null,
): Promise<OrgRosterEntry[]> {
  if (!contextUserId.trim()) return []
  const ownerId = await resolveOrgRosterOwnerId(supabase, contextUserId)
  const { data: links, error: e1 } = await supabase
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", ownerId)
  if (e1) throw new Error(e1.message)
  const managedIds = (links ?? []).map((l: { user_id: string }) => l.user_id)
  const profileIds = Array.from(new Set([ownerId, ...managedIds]))
  const { data: profs, error: e2 } = await supabase
    .from("profiles")
    .select("id, display_name, email, role, metadata")
    .in("id", profileIds)
  if (e2) throw new Error(e2.message)
  const byId = new Map((profs ?? []).map((p) => [p.id as string, p]))
  const ownerFirst = [
    ownerId,
    ...managedIds.filter((id) => id !== ownerId),
  ]
  return ownerFirst.map((id) => {
    const p = byId.get(id)
    return {
      userId: id,
      label: p ? resolveInternalMemberLabel(p as { display_name?: string | null; email?: string | null; metadata?: unknown }) : id.slice(0, 8) + "…",
      isSelf: authUserId ? id === authUserId : id === contextUserId,
      role: p ? roleFromProfileRow(p.role as string) : undefined,
    }
  })
}
