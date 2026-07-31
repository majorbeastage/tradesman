/** Deno edge copy — keep in sync with api/_teamOfficeManagerSync.ts */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export type TeamMemberRole = "user" | "office_manager" | "corporate_internal" | "corporate_external"

export function parseTeamMemberRole(value: unknown): TeamMemberRole {
  if (
    value === "office_manager" ||
    value === "corporate_internal" ||
    value === "corporate_external"
  ) {
    return value
  }
  return "user"
}

export async function upsertAcceptedTeamInvite(
  sb: SupabaseClient,
  accountOwnerId: string,
  managedUserId: string,
  inviteRole: TeamMemberRole,
  inviteEmail: string | null,
): Promise<void> {
  const nowIso = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

  const { data: existingInvite } = await sb
    .from("team_member_invites")
    .select("id")
    .eq("account_owner_id", accountOwnerId)
    .eq("shell_profile_id", managedUserId)
    .maybeSingle()

  if (existingInvite?.id) {
    await sb
      .from("team_member_invites")
      .update({
        invite_email: inviteEmail,
        invite_role: inviteRole,
        status: "accepted",
        accepted_at: nowIso,
        expires_at: expiresAt,
      })
      .eq("id", existingInvite.id)
    return
  }

  await sb.from("team_member_invites").insert({
    account_owner_id: accountOwnerId,
    invite_email: inviteEmail,
    invite_role: inviteRole,
    shell_profile_id: managedUserId,
    token_hash: crypto.randomUUID(),
    status: "accepted",
    accepted_at: nowIso,
    expires_at: expiresAt,
  })
}

export async function assignOfficeManagerClient(
  sb: SupabaseClient,
  managedUserId: string,
  officeManagerId: string | null,
): Promise<void> {
  if (!managedUserId.trim()) throw new Error("managedUserId required")

  await sb.from("office_manager_clients").delete().eq("user_id", managedUserId)

  if (!officeManagerId?.trim()) {
    const { data: staleInvites } = await sb
      .from("team_member_invites")
      .select("id")
      .eq("shell_profile_id", managedUserId)
      .in("status", ["accepted", "pending", "shell"])
    for (const row of staleInvites ?? []) {
      await sb
        .from("team_member_invites")
        .update({ status: "revoked", shell_profile_id: null })
        .eq("id", (row as { id: string }).id)
    }
    return
  }

  const ownerId = officeManagerId.trim()
  const { data: managedProf, error: profErr } = await sb
    .from("profiles")
    .select("email, role")
    .eq("id", managedUserId)
    .maybeSingle()
  if (profErr) throw profErr
  if (!managedProf) throw new Error("Managed user profile not found")

  const { error: linkErr } = await sb.from("office_manager_clients").insert({
    office_manager_id: ownerId,
    user_id: managedUserId,
  })
  if (linkErr) throw linkErr

  const inviteRole = parseTeamMemberRole(managedProf.role)
  await upsertAcceptedTeamInvite(
    sb,
    ownerId,
    managedUserId,
    inviteRole,
    (managedProf as { email?: string | null }).email ?? null,
  )

  const { data: otherInvites } = await sb
    .from("team_member_invites")
    .select("id")
    .eq("shell_profile_id", managedUserId)
    .neq("account_owner_id", ownerId)
    .in("status", ["accepted", "pending", "shell"])
  for (const row of otherInvites ?? []) {
    await sb
      .from("team_member_invites")
      .update({ status: "revoked", shell_profile_id: null })
      .eq("id", (row as { id: string }).id)
  }
}

export async function reconcileTeamMembershipForOwner(sb: SupabaseClient, accountOwnerId: string): Promise<void> {
  const { data: links, error: linkErr } = await sb
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", accountOwnerId)
  if (linkErr) throw linkErr

  const linkedIds = new Set(
    (links ?? [])
      .map((row) => (row as { user_id?: string }).user_id)
      .filter((id): id is string => typeof id === "string" && id.trim() !== "" && id !== accountOwnerId),
  )

  const { data: invites, error: invErr } = await sb
    .from("team_member_invites")
    .select("id, shell_profile_id, status")
    .eq("account_owner_id", accountOwnerId)
  if (invErr) throw invErr

  for (const inv of invites ?? []) {
    const shellId = (inv as { shell_profile_id?: string | null }).shell_profile_id
    const status = (inv as { status?: string }).status
    if (!shellId || status !== "accepted") continue
    if (!linkedIds.has(shellId)) {
      await sb
        .from("team_member_invites")
        .update({ status: "revoked", shell_profile_id: null })
        .eq("id", (inv as { id: string }).id)
    }
  }

  if (!linkedIds.size) return

  const { data: profiles, error: profErr } = await sb
    .from("profiles")
    .select("id, email, role")
    .in("id", [...linkedIds])
  if (profErr) throw profErr

  for (const row of profiles ?? []) {
    const r = row as { id: string; email?: string | null; role?: string | null }
    await upsertAcceptedTeamInvite(
      sb,
      accountOwnerId,
      r.id,
      parseTeamMemberRole(r.role),
      r.email ?? null,
    )
  }
}
