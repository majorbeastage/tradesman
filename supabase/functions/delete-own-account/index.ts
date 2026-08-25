// Authenticated self-serve account deletion (App Store guideline 5.1.1(v)).
// Deploy: npm run supabase:deploy:delete-own-account
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json(405, { error: "POST only" })

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Server is not configured" })

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return json(401, { error: "Missing authorization" })

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(jwt)
  if (authError || !user) return json(401, { error: "Invalid session" })

  let confirm = ""
  try {
    const body = (await req.json()) as { confirm?: string }
    if (typeof body?.confirm === "string") confirm = body.confirm.trim()
  } catch {
    /* empty body */
  }
  if (confirm !== "DELETE") {
    return json(400, { error: "Confirmation required. Send { confirm: \"DELETE\" }." })
  }

  const deletedEmail = `deleted-${user.id.replace(/-/g, "").slice(0, 16)}@deleted.invalid`
  const now = new Date().toISOString()

  const { data: prof } = await admin.from("profiles").select("metadata").eq("id", user.id).maybeSingle()
  const prevMeta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? (prof.metadata as Record<string, unknown>)
      : {}

  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      email: deletedEmail,
      display_name: "Deleted user",
      website_url: "",
      primary_phone: "",
      best_contact_phone: "",
      account_disabled: true,
      metadata: {
        ...prevMeta,
        account_deleted_at: now,
        account_deleted_via: "in_app",
      },
      updated_at: now,
    })
    .eq("id", user.id)
  if (profileErr) return json(500, { error: profileErr.message })

  await admin.from("user_push_devices").delete().eq("user_id", user.id)

  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id)
  if (deleteErr) {
    const { error: banErr } = await admin.auth.admin.updateUserById(user.id, {
      email: deletedEmail,
      ban_duration: "876000h",
      password: `${crypto.randomUUID()}Aa1!`,
    })
    if (banErr) {
      return json(500, {
        error: "Could not finish deleting the login. Contact support.",
        detail: `${deleteErr.message}; ${banErr.message}`,
      })
    }
  }

  return json(200, { ok: true })
})
