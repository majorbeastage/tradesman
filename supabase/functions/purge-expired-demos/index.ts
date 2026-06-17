// Delete unactivated demos after 8h and activated demos after 24h session.
// Deploy: supabase functions deploy purge-expired-demos
// Schedule hourly via pg_cron + pg_net (see supabase/demo-account-lifecycle.sql) or external cron.
// Secret: PURGE_DEMO_SECRET (header x-tradesman-purge-demos-secret)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tradesman-purge-demos-secret",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const expected = Deno.env.get("PURGE_DEMO_SECRET")?.trim()
  const provided = req.headers.get("x-tradesman-purge-demos-secret")?.trim()
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
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
  const now = new Date().toISOString()

  const { data: grants, error } = await admin
    .from("demo_access_grants")
    .select("id, auth_user_id, activate_by, activated_at, expires_at")
    .not("auth_user_id", "is", null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let purged = 0
  const errors: string[] = []

  for (const row of grants ?? []) {
    const uid = String(row.auth_user_id ?? "")
    if (!uid) continue

    const activatedAt = row.activated_at ? String(row.activated_at) : null
    const activateBy = row.activate_by ? String(row.activate_by) : null
    const expiresAt = row.expires_at ? String(row.expires_at) : null

    const unactivatedExpired = !activatedAt && activateBy && activateBy < now
    const sessionExpired = activatedAt && expiresAt && expiresAt < now
    if (!unactivatedExpired && !sessionExpired) continue

    try {
      await admin.rpc("purge_trial_user_data", { p_user_id: uid })
    } catch (e) {
      errors.push(`purge ${uid}: ${e instanceof Error ? e.message : String(e)}`)
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) {
      errors.push(`delete ${uid}: ${delErr.message}`)
      continue
    }

    await admin.from("demo_access_grants").delete().eq("id", row.id)
    purged += 1
  }

  return new Response(JSON.stringify({ ok: true, purged, errors: errors.length ? errors : undefined }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
