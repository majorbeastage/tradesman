// Test FCM push to all devices registered for the signed-in user.
// Deploy: supabase functions deploy push-test
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FCM_SERVICE_ACCOUNT_JSON (Firebase service account JSON)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendFcmNotification } from "../_shared/fcm-v1.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const fcmJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim() ?? ""

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let title = "Tradesman"
  let body = "Test push — notifications are working."
  try {
    const j = await req.json() as { title?: string; body?: string }
    if (j?.title && typeof j.title === "string") title = j.title.slice(0, 80)
    if (j?.body && typeof j.body === "string") body = j.body.slice(0, 240)
  } catch {
    /* use defaults */
  }

  if (!fcmJson) {
    return new Response(
      JSON.stringify({
        error: "FCM_SERVICE_ACCOUNT_JSON is not set",
        hint: "Supabase Dashboard → Edge Functions → Secrets. Paste the full JSON from Firebase (Project settings → Service accounts → Generate new private key).",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const { data: devices, error: devErr } = await admin
    .from("user_push_devices")
    .select("token, platform")
    .eq("user_id", user.id)

  if (devErr) {
    return new Response(JSON.stringify({ error: devErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const rows = devices ?? []
  if (rows.length === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "No registered devices",
        hint: "On your phone: sign in → Account (MyT) → Request push permission. Ensure supabase/user-push-devices-and-locations.sql was applied.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const results: Array<{ platform: string; ok: boolean; detail: string }> = []
  for (const d of rows) {
    if (d.platform === "web") {
      results.push({ platform: d.platform, ok: false, detail: "Skipped (web push not wired here)" })
      continue
    }
    try {
      const r = await sendFcmNotification({
        serviceAccountJson: fcmJson,
        fcmToken: d.token,
        title,
        body,
      })
      results.push({
        platform: d.platform,
        ok: r.ok,
        detail: r.ok ? "sent" : `FCM ${r.status}: ${r.detail}`,
      })
    } catch (e) {
      results.push({
        platform: d.platform,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const anyOk = results.some((r) => r.ok)
  // Always 200 when the handler finished: per-device outcomes are in `results`.
  // (HTTP 502 here made Supabase logs show EDGE_FUNCTION_ERROR even though this was an app-level FCM failure.)
  return new Response(JSON.stringify({ ok: anyOk, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
