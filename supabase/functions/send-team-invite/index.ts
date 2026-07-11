// Send team member invitation email (password setup link).
// Deploy: supabase functions deploy send-team-invite

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

import { resolveEffectiveEntitlementsFromMetadata } from "../_shared/effective-entitlements.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const token = authHeader.slice("Bearer ".length).trim()
  const { data: authUser, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authUser.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const ownerId = authUser.user.id
  let body: { invite_email?: string; invite_role?: string; invite_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const inviteEmail = typeof body.invite_email === "string" ? body.invite_email.trim().toLowerCase() : ""
  if (!inviteEmail || !inviteEmail.includes("@")) {
    return new Response(JSON.stringify({ error: "Valid invite_email required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const inviteRole = body.invite_role === "office_manager" ? "office_manager" : "user"

  const { data: ownerProf, error: ownerProfErr } = await admin
    .from("profiles")
    .select("metadata, display_name")
    .eq("id", ownerId)
    .maybeSingle()
  if (ownerProfErr) {
    return new Response(JSON.stringify({ error: ownerProfErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  const ownerMeta =
    ownerProf?.metadata && typeof ownerProf.metadata === "object" && !Array.isArray(ownerProf.metadata)
      ? (ownerProf.metadata as Record<string, unknown>)
      : {}
  const ent = resolveEffectiveEntitlementsFromMetadata(ownerMeta)

  const { data: inviteRows, error: inviteListErr } = await admin
    .from("team_member_invites")
    .select("id, invite_role, status, accepted_at, shell_profile_id")
    .eq("account_owner_id", ownerId)
  if (inviteListErr) {
    return new Response(JSON.stringify({ error: inviteListErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: omLinks } = await admin.from("office_manager_clients").select("user_id").eq("office_manager_id", ownerId)
  const activeMemberIds = new Set<string>()
  for (const inv of inviteRows ?? []) {
    const shellId = (inv as { shell_profile_id?: string | null }).shell_profile_id
    if (shellId) activeMemberIds.add(shellId)
  }
  for (const row of omLinks ?? []) {
    const uid = (row as { user_id?: string }).user_id
    if (uid && uid !== ownerId) activeMemberIds.add(uid)
  }

  const pending = (inviteRows ?? []).filter((i) => (i as { status?: string }).status === "pending").length
  const shells = (inviteRows ?? []).filter((i) => (i as { status?: string }).status === "shell").length
  const usedSeats = activeMemberIds.size + pending
  if (usedSeats >= ent.teamMemberSlots + shells) {
    return new Response(JSON.stringify({ error: "Team seat limit reached for your subscription. Add seats in Billing or upgrade your package." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let officeManagersUsed = 0
  let usersUsed = 0
  if (activeMemberIds.size > 0) {
    const { data: profs } = await admin.from("profiles").select("id, role").in("id", [...activeMemberIds])
    for (const row of profs ?? []) {
      const role = (row as { role?: string }).role
      if (role === "office_manager") officeManagersUsed += 1
      else usersUsed += 1
    }
  }
  for (const inv of inviteRows ?? []) {
    if ((inv as { status?: string }).status !== "pending") continue
    if ((inv as { invite_role?: string }).invite_role === "office_manager") officeManagersUsed += 1
    else usersUsed += 1
  }
  if (inviteRole === "office_manager" && officeManagersUsed >= ent.officeManagerInviteLimit) {
    return new Response(JSON.stringify({ error: "Office manager seat limit reached for your subscription." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (inviteRole === "user" && usersUsed >= ent.userInviteLimit) {
    return new Response(JSON.stringify({ error: "User seat limit reached for your subscription." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const tokenHash = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString()
  const siteUrl = Deno.env.get("VITE_SITE_URL")?.trim() || "https://tradesman-us.vercel.app"
  const acceptUrl = `${siteUrl}/accept-invite?token=${encodeURIComponent(tokenHash)}`

  const { data: inviteRow, error: insErr } = await admin
    .from("team_member_invites")
    .insert({
      account_owner_id: ownerId,
      invite_email: inviteEmail,
      invite_role: inviteRole,
      token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single()

  if (insErr) {
    return new Response(JSON.stringify({ error: insErr.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim()
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL")?.trim()
  if (resendKey && resendFrom) {
    const ownerName = ownerProf?.display_name?.trim() || "Your team admin"
    const text = [
      `${ownerName} invited you to Tradesman Systems.`,
      "",
      "Create your password and join the workspace:",
      acceptUrl,
      "",
      "This link expires in 7 days.",
      "",
      "— Tradesman Systems",
    ].join("\n")
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: resendFrom,
        to: [inviteEmail],
        subject: `${ownerName} invited you to Tradesman`,
        text,
      }),
    })
  }

  return new Response(JSON.stringify({ ok: true, inviteId: inviteRow?.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
