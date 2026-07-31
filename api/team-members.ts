import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"
import { resolveInternalMemberLabel } from "./_organizationPeers.js"

type Json = Record<string, unknown>
type TeamMemberRole = "user" | "office_manager" | "corporate_internal" | "corporate_external"

function parseTeamMemberRole(value: unknown): TeamMemberRole {
  if (
    value === "office_manager" ||
    value === "corporate_internal" ||
    value === "corporate_external"
  ) {
    return value
  }
  return "user"
}

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

async function resolveSupabase(req: VercelRequest, body: Json): Promise<{ sb: SupabaseClient; userId: string }> {
  try {
    const sb = createServiceSupabase()
    const userId = String(body.userId ?? "").trim()
    if (!userId) throw new Error("userId required")
    return { sb, userId }
  } catch (serviceErr) {
    const authHeader = typeof req.headers?.authorization === "string" ? req.headers.authorization.trim() : ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
    const supabaseUrl = pickSupabaseUrlForServer() || String(body.supabaseUrl ?? "").trim()
    const anonKey = pickSupabaseAnonKeyForServer() || String(body.supabaseAnonKey ?? "").trim()
    const userId = String(body.userId ?? "").trim()
    if (!token || !supabaseUrl || !anonKey || !userId) {
      const msg = serviceErr instanceof Error ? serviceErr.message : String(serviceErr)
      if (/Missing server env/i.test(msg)) throw new Error(msg)
      throw new Error("Unauthorized")
    }
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data.user?.id || data.user.id !== userId) throw new Error("Unauthorized")
    return { sb, userId }
  }
}

async function assertAccountOwner(sb: SupabaseClient, ownerId: string) {
  const { data, error } = await sb.from("profiles").select("role").eq("id", ownerId).maybeSingle()
  if (error) throw error
  const role = (data as { role?: string } | null)?.role ?? ""
  if (role === "admin") return
  if (!["user", "office_manager", "corporate_management"].includes(role)) {
    throw new Error("Only account owners can manage team members.")
  }
}

async function handleLoad(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Json
  const { sb, userId: actorId } = await resolveSupabase(req, body)
  const ownerId = String(body.accountOwnerId ?? body.userId ?? actorId).trim()
  if (!ownerId) {
    res.status(400).json({ error: "accountOwnerId required." })
    return
  }
  if (actorId !== ownerId) {
    const { data: actorProf } = await sb.from("profiles").select("role").eq("id", actorId).maybeSingle()
    if ((actorProf as { role?: string } | null)?.role !== "admin") {
      res.status(403).json({ error: "Only the account owner can load team members." })
      return
    }
  }
  await assertAccountOwner(sb, ownerId)

  const { data: ownerProf, error: ownerErr } = await sb
    .from("profiles")
    .select("metadata, display_name")
    .eq("id", ownerId)
    .maybeSingle()
  if (ownerErr) throw ownerErr

  const { data: inviteRows, error: invErr } = await sb
    .from("team_member_invites")
    .select("id, invite_email, invite_role, status, expires_at, accepted_at, shell_profile_id, created_at")
    .eq("account_owner_id", ownerId)
    .order("created_at", { ascending: false })
  if (invErr) throw invErr

  const invites = (inviteRows ?? []) as Array<{
    id: string
    invite_email: string | null
    invite_role: string
    status: string
    expires_at: string
    accepted_at: string | null
    shell_profile_id: string | null
    created_at?: string
  }>

  const profileIds = new Set<string>()
  for (const inv of invites) {
    if (inv.shell_profile_id) profileIds.add(inv.shell_profile_id)
  }
  const { data: links, error: linkErr } = await sb
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", ownerId)
  if (linkErr) throw linkErr
  for (const row of links ?? []) {
    const uid = (row as { user_id?: string }).user_id
    if (uid && uid !== ownerId) profileIds.add(uid)
  }

  const inviteByProfile = new Map<string, (typeof invites)[number]>()
  for (const inv of invites) {
    if (inv.shell_profile_id) inviteByProfile.set(inv.shell_profile_id, inv)
  }

  const activeMembers: Array<{
    profileId: string
    email: string | null
    displayName: string
    role: TeamMemberRole
    inviteId: string | null
    status: "active"
  }> = []

  if (profileIds.size) {
    const { data: profiles, error: profErr } = await sb
      .from("profiles")
      .select("id, email, display_name, role, metadata")
      .in("id", [...profileIds])
    if (profErr) throw profErr
    for (const row of profiles ?? []) {
      const r = row as { id: string; email?: string | null; display_name?: string | null; role?: string | null; metadata?: unknown }
      if (r.id === ownerId) continue
      const inv = inviteByProfile.get(r.id)
      const rawRole = inv?.invite_role ?? r.role
      const role = parseTeamMemberRole(rawRole)
      activeMembers.push({
        profileId: r.id,
        email: r.email ?? inv?.invite_email ?? null,
        displayName: resolveInternalMemberLabel(r),
        role,
        inviteId: inv?.id ?? null,
        status: "active",
      })
    }
    activeMembers.sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  const ownerMetadata =
    ownerProf?.metadata && typeof ownerProf.metadata === "object" && !Array.isArray(ownerProf.metadata)
      ? (ownerProf.metadata as Record<string, unknown>)
      : {}

  res.status(200).json({
    ok: true,
    invites,
    activeMembers,
    ownerMetadata,
    ownerDisplayName: (ownerProf as { display_name?: string | null } | null)?.display_name?.trim() || "Your team admin",
  })
}

async function handleRemove(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Json
  const { sb, userId: ownerId } = await resolveSupabase(req, body)
  await assertAccountOwner(sb, ownerId)
  const memberProfileId = String(body.memberProfileId ?? "").trim()
  if (!memberProfileId || memberProfileId === ownerId) {
    res.status(400).json({ error: "memberProfileId required." })
    return
  }
  await sb.from("office_manager_clients").delete().eq("office_manager_id", ownerId).eq("user_id", memberProfileId)
  const { data: invites } = await sb
    .from("team_member_invites")
    .select("id")
    .eq("account_owner_id", ownerId)
    .eq("shell_profile_id", memberProfileId)
  for (const inv of invites ?? []) {
    await sb
      .from("team_member_invites")
      .update({ status: "revoked", shell_profile_id: null })
      .eq("id", (inv as { id: string }).id)
  }
  const { data: prof } = await sb.from("profiles").select("metadata").eq("id", memberProfileId).maybeSingle()
  const prevMeta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? { ...(prof.metadata as Record<string, unknown>) }
      : {}
  await sb
    .from("profiles")
    .update({
      metadata: {
        ...prevMeta,
        team_access_revoked: true,
        revoked_by: ownerId,
        revoked_at: new Date().toISOString(),
      },
    })
    .eq("id", memberProfileId)
  res.status(200).json({ ok: true })
}

async function handleUpdateRole(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Json
  const { sb, userId: ownerId } = await resolveSupabase(req, body)
  await assertAccountOwner(sb, ownerId)
  const memberProfileId = String(body.memberProfileId ?? "").trim()
  const inviteRole = parseTeamMemberRole(body.inviteRole)
  if (!memberProfileId) {
    res.status(400).json({ error: "memberProfileId required." })
    return
  }
  await sb.from("profiles").update({ role: inviteRole }).eq("id", memberProfileId)
  const { data: invites } = await sb
    .from("team_member_invites")
    .select("id")
    .eq("account_owner_id", ownerId)
    .eq("shell_profile_id", memberProfileId)
  for (const inv of invites ?? []) {
    await sb.from("team_member_invites").update({ invite_role: inviteRole }).eq("id", (inv as { id: string }).id)
  }
  res.status(200).json({ ok: true })
}

async function handleCancelInvite(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Json
  const { sb, userId: ownerId } = await resolveSupabase(req, body)
  await assertAccountOwner(sb, ownerId)
  const inviteId = String(body.inviteId ?? "").trim()
  if (!inviteId) {
    res.status(400).json({ error: "inviteId required." })
    return
  }
  await sb
    .from("team_member_invites")
    .update({ status: "cancelled", invite_email: null })
    .eq("id", inviteId)
    .eq("account_owner_id", ownerId)
    .eq("status", "pending")
  res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const action = String(req.query.__action ?? req.query.action ?? "").trim()
  try {
    if (action === "load") {
      await handleLoad(req, res)
      return
    }
    if (action === "remove") {
      await handleRemove(req, res)
      return
    }
    if (action === "update-role") {
      await handleUpdateRole(req, res)
      return
    }
    if (action === "cancel-invite") {
      await handleCancelInvite(req, res)
      return
    }
    res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    res.status(/unauthorized/i.test(message) ? 401 : 500).json({ error: message })
  }
}
