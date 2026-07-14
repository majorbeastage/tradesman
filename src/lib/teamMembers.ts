import type { SupabaseClient } from "@supabase/supabase-js"
import {
  resolveEffectiveEntitlements,
  type EffectiveEntitlements,
} from "./effectiveEntitlements"
import { resolveInternalMemberLabel } from "./profileContactMeta"
import { type ProductPackageId, PRODUCT_PACKAGE_IDS } from "./productPackages"

export type TeamMemberRole = "user" | "office_manager" | "corporate_internal" | "corporate_external"

export function isTeamMemberRole(value: unknown): value is TeamMemberRole {
  return (
    value === "user" ||
    value === "office_manager" ||
    value === "corporate_internal" ||
    value === "corporate_external"
  )
}

export function teamMemberRoleLabel(role: string): string {
  if (role === "office_manager") return "Office manager"
  if (role === "corporate_internal") return "Internal user"
  if (role === "corporate_external") return "External user"
  return "User"
}

export type TeamInviteRow = {
  id: string
  invite_email: string | null
  invite_role: string
  status: string
  expires_at: string
  accepted_at: string | null
  shell_profile_id: string | null
  created_at?: string
}

export type ActiveTeamMember = {
  profileId: string
  email: string | null
  displayName: string
  role: TeamMemberRole
  inviteId: string | null
  status: "active"
}

export type TeamSeatSummary = {
  packageId: ProductPackageId | null
  packageLabel: string
  entitlements: EffectiveEntitlements
  seatSummaryLabel: string
  totalSeats: number
  usedSeats: number
  availableSeats: number
  officeManagerLimit: number
  officeManagersUsed: number
  userLimit: number
  usersUsed: number
  canInviteOfficeManager: boolean
  canInviteUser: boolean
  teamInvitesAllowed: boolean
}

export function teamSeatSummaryFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  invites: TeamInviteRow[],
  activeMembers: ActiveTeamMember[],
): TeamSeatSummary {
  const ent = resolveEffectiveEntitlements(metadata)
  return teamSeatSummary(ent, invites, activeMembers)
}

export function teamSeatSummary(
  entitlements: EffectiveEntitlements,
  invites: TeamInviteRow[],
  activeMembers: ActiveTeamMember[],
): TeamSeatSummary {
  const pending = invites.filter((i) => i.status === "pending").length
  const pendingOm = invites.filter((i) => i.status === "pending" && i.invite_role === "office_manager").length
  const pendingUsers = invites.filter((i) => i.status === "pending" && i.invite_role !== "office_manager").length
  const shells = invites.filter((i) => i.status === "shell").length
  const acceptedInvites = invites.filter((i) => i.status === "accepted" || i.accepted_at).length
  const usedSeats = activeMembers.length + pending + Math.max(0, acceptedInvites - activeMembers.length)
  const totalSeats = entitlements.teamMemberSlots
  const officeManagersUsed = activeMembers.filter((m) => m.role === "office_manager").length + pendingOm
  const usersUsed = activeMembers.filter((m) => m.role === "user").length + pendingUsers
  const omLimit = entitlements.officeManagerInviteLimit
  const userLimit = entitlements.userInviteLimit

  return {
    packageId: entitlements.packageId,
    packageLabel: entitlements.packageLabel,
    entitlements,
    seatSummaryLabel: entitlements.seatSummaryLabel,
    totalSeats,
    usedSeats: Math.min(usedSeats, Math.max(totalSeats, 0)),
    availableSeats: Math.max(0, totalSeats - usedSeats) + shells,
    officeManagerLimit: omLimit,
    officeManagersUsed,
    userLimit,
    usersUsed,
    canInviteOfficeManager: omLimit <= 0 ? false : officeManagersUsed < omLimit,
    canInviteUser: userLimit <= 0 ? false : usersUsed < userLimit,
    teamInvitesAllowed: totalSeats > 0 && usedSeats < totalSeats + shells,
  }
}

export function resolveProductPackageId(metadata: Record<string, unknown> | null | undefined): ProductPackageId | null {
  const raw = metadata?.product_package
  if (typeof raw === "string" && PRODUCT_PACKAGE_IDS.includes(raw as ProductPackageId)) {
    return raw as ProductPackageId
  }
  return null
}

export async function loadTeamInvites(client: SupabaseClient, ownerUserId: string): Promise<TeamInviteRow[]> {
  const { data, error } = await client
    .from("team_member_invites")
    .select("id, invite_email, invite_role, status, expires_at, accepted_at, shell_profile_id, created_at")
    .eq("account_owner_id", ownerUserId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as TeamInviteRow[]
}

export async function loadActiveTeamMembers(client: SupabaseClient, ownerUserId: string): Promise<ActiveTeamMember[]> {
  const invites = await loadTeamInvites(client, ownerUserId)
  const profileIds = new Set<string>()

  for (const inv of invites) {
    if (inv.shell_profile_id) profileIds.add(inv.shell_profile_id)
  }

  const { data: links, error: linkErr } = await client
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", ownerUserId)
  if (linkErr) throw linkErr
  for (const row of links ?? []) {
    const uid = (row as { user_id?: string }).user_id
    if (uid && uid !== ownerUserId) profileIds.add(uid)
  }

  if (!profileIds.size) return []

  const { data: profiles, error: profErr } = await client
    .from("profiles")
    .select("id, email, display_name, role, metadata")
    .in("id", [...profileIds])
  if (profErr) throw profErr

  const inviteByProfile = new Map<string, TeamInviteRow>()
  for (const inv of invites) {
    if (inv.shell_profile_id) inviteByProfile.set(inv.shell_profile_id, inv)
  }

  const out: ActiveTeamMember[] = []
  for (const row of profiles ?? []) {
    const r = row as { id: string; email?: string | null; display_name?: string | null; role?: string | null; metadata?: unknown }
    if (r.id === ownerUserId) continue
    const inv = inviteByProfile.get(r.id)
    const rawRole = inv?.invite_role ?? r.role
    const role: TeamMemberRole = isTeamMemberRole(rawRole) ? rawRole : "user"
    out.push({
      profileId: r.id,
      email: r.email ?? inv?.invite_email ?? null,
      displayName: resolveInternalMemberLabel(r),
      role,
      inviteId: inv?.id ?? null,
      status: "active",
    })
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function teamMembersApiFetch(
  action: string,
  payload: Record<string, unknown>,
  accessToken: string | null,
): Promise<void> {
  const origins = [typeof window !== "undefined" ? window.location.origin : ""].filter(Boolean)
  let lastErr = "Could not reach team API."
  for (const origin of origins) {
    try {
      const res = await fetch(`${origin}/api/team-members?__action=${encodeURIComponent(action)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      return
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}
