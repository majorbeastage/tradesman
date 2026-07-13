import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "../contexts/AuthContext"
import { resolveInternalMemberLabel } from "./profileContactMeta"
import { parseJobTitleNickname } from "./jobTitleNickname"
import { labelForProfileRole } from "./profileRoles"
import { loadOrganizationPeerIds } from "./organizationPeers"
import { parseSandboxDemoTeam, type SandboxDemoTeamMember } from "./sandboxDemoTeam"

export type LinkableOrgUser = {
  id: string
  displayName: string
  email: string | null
  jobTitle: string
  /** Fictional sandbox persona — stored on org chart only, not a profiles row. */
  isDemo?: boolean
}

function pushProfileRow(
  out: LinkableOrgUser[],
  seen: Set<string>,
  row: { id: string; display_name?: string | null; email?: string | null; metadata?: unknown },
  displayNameOverride?: string,
): void {
  if (!row.id || seen.has(row.id)) return
  seen.add(row.id)
  out.push({
    id: row.id,
    displayName: displayNameOverride ?? resolveInternalMemberLabel(row),
    email: row.email ?? null,
    jobTitle: parseJobTitleNickname(row.metadata),
  })
}

function pushDemoMember(out: LinkableOrgUser[], seen: Set<string>, member: SandboxDemoTeamMember): void {
  if (!member.id || seen.has(member.id)) return
  seen.add(member.id)
  out.push({
    id: member.id,
    displayName: `${member.label} (demo)`,
    email: member.email || null,
    jobTitle: member.title?.trim() || labelForProfileRole(member.role),
    isDemo: true,
  })
}

function isSandboxProfileRow(
  metadata: unknown,
  portalConfig: unknown,
): boolean {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {}
  const pc =
    portalConfig && typeof portalConfig === "object" && !Array.isArray(portalConfig)
      ? (portalConfig as Record<string, unknown>)
      : {}
  if (pc.sandbox_account === true || meta.sandbox_account === true) return true
  if (typeof meta.sandbox_expires_at === "string" && meta.sandbox_expires_at.trim()) return true
  if (parseSandboxDemoTeam(meta.sandbox_demo_team).length > 0 && meta.sandbox_demo_team != null) return true
  return false
}

async function loadManagedOrgProfileIds(client: SupabaseClient, accountOwnerId: string): Promise<string[]> {
  const { data: links, error } = await client
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", accountOwnerId)
  if (error) throw error
  return [...new Set((links ?? []).map((l) => l.user_id).filter((id): id is string => typeof id === "string" && id !== accountOwnerId))]
}

/** Profiles the account can link on the organization chart (team, demo personas, managed users). */
export async function loadLinkableOrgUsers(
  client: SupabaseClient,
  accountOwnerId: string,
): Promise<LinkableOrgUser[]> {
  const out: LinkableOrgUser[] = []
  const seen = new Set<string>()

  const { data: owner, error: ownerErr } = await client
    .from("profiles")
    .select("id, display_name, email, metadata, role, portal_config, client_id")
    .eq("id", accountOwnerId)
    .maybeSingle()
  if (ownerErr) throw ownerErr
  if (owner) pushProfileRow(out, seen, owner)

  const ownerRole = typeof owner?.role === "string" ? (owner.role as UserRole) : null
  const ownerMeta = owner?.metadata
  const ownerPortal = owner?.portal_config

  if (isSandboxProfileRow(ownerMeta, ownerPortal)) {
    const demoTeam = parseSandboxDemoTeam(
      ownerMeta && typeof ownerMeta === "object" && !Array.isArray(ownerMeta)
        ? (ownerMeta as Record<string, unknown>).sandbox_demo_team
        : null,
    )
    for (const member of demoTeam) pushDemoMember(out, seen, member)
  }

  const { data: invites, error: invErr } = await client
    .from("team_member_invites")
    .select("shell_profile_id")
    .eq("account_owner_id", accountOwnerId)
    .not("shell_profile_id", "is", null)
  if (invErr) throw invErr

  const shellIds = [...new Set((invites ?? []).map((r) => r.shell_profile_id).filter((x): x is string => typeof x === "string"))]
  if (shellIds.length) {
    const { data: shells, error: shellErr } = await client
      .from("profiles")
      .select("id, display_name, email, metadata")
      .in("id", shellIds)
    if (shellErr) throw shellErr
    for (const row of shells ?? []) pushProfileRow(out, seen, row)
  }

  if (ownerRole === "corporate_management" || ownerRole === "office_manager") {
    const managedIds = await loadManagedOrgProfileIds(client, accountOwnerId)
    if (managedIds.length) {
      const { data: managed, error: managedErr } = await client
        .from("profiles")
        .select("id, display_name, email, metadata")
        .in("id", managedIds)
      if (managedErr) throw managedErr
      for (const row of managed ?? []) pushProfileRow(out, seen, row)
    }
  }

  const orgPeerIds = await loadOrganizationPeerIds(client, accountOwnerId)
  const missingPeerIds = orgPeerIds.filter((id) => !seen.has(id))
  if (missingPeerIds.length) {
    const { data: peers, error: peerErr } = await client
      .from("profiles")
      .select("id, display_name, email, metadata")
      .in("id", missingPeerIds)
    if (peerErr) throw peerErr
    for (const row of peers ?? []) pushProfileRow(out, seen, row)
  }

  return out.sort((a, b) => a.displayName.localeCompare(b.displayName))
}
