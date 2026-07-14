// Public team-invite onboarding endpoint.
// Deploy: supabase functions deploy accept-team-invite

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server misconfigured" }, 500)
  const admin = createClient(supabaseUrl, serviceRoleKey)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: "Invalid JSON" }, 400)
  }

  const token = cleanText(body.token, 200)
  if (!token) return json({ error: "Invite token required" }, 400)

  const { data: invite, error: inviteErr } = await admin
    .from("team_member_invites")
    .select("id, account_owner_id, invite_email, invite_role, status, expires_at, accepted_at")
    .eq("token_hash", token)
    .maybeSingle()
  if (inviteErr) return json({ error: inviteErr.message }, 500)
  if (!invite) return json({ error: "This invitation link is invalid." }, 404)
  if (invite.status !== "pending" || invite.accepted_at) {
    return json({ error: "This invitation has already been used or cancelled." }, 409)
  }
  if (!invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) {
    return json({ error: "This invitation has expired. Ask the account owner to send a new one." }, 410)
  }

  const { data: owner } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", invite.account_owner_id)
    .maybeSingle()
  const ownerName = owner?.display_name?.trim() || owner?.email?.trim() || "Your team admin"

  if (body.action === "preview") {
    return json({
      invite_email: invite.invite_email,
      invite_role: invite.invite_role,
      owner_name: ownerName,
      expires_at: invite.expires_at,
    })
  }

  if (body.action !== "complete") return json({ error: "Unknown action" }, 400)
  if (body.ack_terms !== true || body.ack_privacy !== true || body.ack_sms !== true) {
    return json({ error: "Terms, Privacy, and SMS policy acknowledgements are required." }, 400)
  }

  const userId = cleanText(body.user_id, 80)
  const displayName = cleanText(body.display_name, 160)
  const primaryPhone = cleanText(body.primary_phone, 40)
  if (!userId || !displayName) return json({ error: "User and display name are required." }, 400)

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId)
  if (authErr || !authUser.user) return json({ error: "Could not verify the new user." }, 401)
  const authEmail = authUser.user.email?.trim().toLowerCase() ?? ""
  const inviteEmail = invite.invite_email?.trim().toLowerCase() ?? ""
  if (!authEmail || authEmail !== inviteEmail) {
    return json({ error: "The signed-up email does not match this invitation." }, 403)
  }

  const role =
    invite.invite_role === "office_manager" ||
    invite.invite_role === "corporate_internal" ||
    invite.invite_role === "corporate_external"
      ? invite.invite_role
      : "user"
  const { data: existingProfile } = await admin.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const metadata =
    existingProfile?.metadata && typeof existingProfile.metadata === "object" && !Array.isArray(existingProfile.metadata)
      ? { ...(existingProfile.metadata as Record<string, unknown>) }
      : {}
  const now = new Date().toISOString()
  metadata.team_invite_policy_ack = {
    terms: true,
    privacy: true,
    sms: true,
    at: now,
    invite_id: invite.id,
    account_owner_id: invite.account_owner_id,
  }
  metadata.team_account_owner_id = invite.account_owner_id
  metadata.team_access_revoked = false

  const { error: profileErr } = await admin
    .from("profiles")
    .upsert({
      id: userId,
      email: authEmail,
      display_name: displayName,
      role,
      primary_phone: primaryPhone || null,
      best_contact_phone: primaryPhone || null,
      metadata,
      updated_at: now,
    })
  if (profileErr) return json({ error: profileErr.message }, 500)

  const { error: linkErr } = await admin.from("office_manager_clients").upsert({
    office_manager_id: invite.account_owner_id,
    user_id: userId,
  })
  if (linkErr) return json({ error: linkErr.message }, 500)

  const { error: finishErr } = await admin
    .from("team_member_invites")
    .update({
      status: "accepted",
      accepted_at: now,
      shell_profile_id: userId,
    })
    .eq("id", invite.id)
    .eq("status", "pending")
  if (finishErr) return json({ error: finishErr.message }, 500)

  return json({
    ok: true,
    email_confirmation_required: !authUser.user.email_confirmed_at,
  })
})
