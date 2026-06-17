import type { SupabaseClient } from "@supabase/supabase-js"
import { parseJobTitleNickname } from "./jobTitleNickname"

export type LinkableOrgUser = {
  id: string
  displayName: string
  email: string | null
  jobTitle: string
}

/** Profiles the account can link on the organization chart (self + provisioned team shells). */
export async function loadLinkableOrgUsers(
  client: SupabaseClient,
  accountOwnerId: string,
): Promise<LinkableOrgUser[]> {
  const out: LinkableOrgUser[] = []
  const seen = new Set<string>()

  const pushProfile = (row: { id: string; display_name?: string | null; email?: string | null; metadata?: unknown }) => {
    if (!row.id || seen.has(row.id)) return
    seen.add(row.id)
    out.push({
      id: row.id,
      displayName: String(row.display_name ?? "").trim() || "Team member",
      email: row.email ?? null,
      jobTitle: parseJobTitleNickname(row.metadata),
    })
  }

  const { data: owner, error: ownerErr } = await client
    .from("profiles")
    .select("id, display_name, email, metadata")
    .eq("id", accountOwnerId)
    .maybeSingle()
  if (ownerErr) throw ownerErr
  if (owner) pushProfile(owner)

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
    for (const row of shells ?? []) pushProfile(row)
  }

  return out.sort((a, b) => a.displayName.localeCompare(b.displayName))
}
