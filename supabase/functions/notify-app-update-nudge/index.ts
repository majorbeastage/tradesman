// Admin-only: nudge a user's Tradesman main-app installs to update from Google Play.
// Deploy: npm run supabase:deploy:notify-app-update-nudge
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FCM_SERVICE_ACCOUNT_JSON

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendFcmNotification } from "../_shared/fcm-v1.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MAIN_APP_ID = "com.tradesmanus.com"
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${MAIN_APP_ID}`

const DEFAULT_TITLE = "Update Tradesman"
const DEFAULT_BODY =
  "A new version is on Google Play. Open the Play Store app and tap Update for the latest fixes."

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
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(jwt)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (callerProfile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let targetUserId = ""
  let title = DEFAULT_TITLE
  let body = DEFAULT_BODY
  try {
    const j = (await req.json()) as { targetUserId?: string; title?: string; body?: string }
    targetUserId = typeof j.targetUserId === "string" ? j.targetUserId.trim() : ""
    if (j.title && typeof j.title === "string") title = j.title.slice(0, 80)
    if (j.body && typeof j.body === "string") body = j.body.slice(0, 240)
  } catch {
    /* defaults */
  }

  if (!targetUserId) {
    return new Response(JSON.stringify({ error: "targetUserId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (!fcmJson) {
    return new Response(JSON.stringify({ error: "FCM_SERVICE_ACCOUNT_JSON is not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: devices, error: devErr } = await admin
    .from("user_push_devices")
    .select("token, platform, app_id")
    .eq("user_id", targetUserId)

  if (devErr) {
    return new Response(JSON.stringify({ error: devErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const rows = (devices ?? []).filter((d) => {
    if (d.platform === "web") return false
    const appId = typeof d.app_id === "string" ? d.app_id.trim() : ""
    return !appId || appId === MAIN_APP_ID
  })

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "No main-app push devices",
        hint: "User must sign in on the Tradesman mobile app with push enabled (MyT → Allow push notifications).",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const results: Array<{ platform: string; ok: boolean; detail: string }> = []
  for (const d of rows) {
    const token = String(d.token ?? "").trim()
    if (!token) continue
    try {
      const r = await sendFcmNotification({
        serviceAccountJson: fcmJson,
        fcmToken: token,
        title,
        body,
        androidChannelId: "tradesman_alerts",
        androidTag: "app_update_nudge",
        collapseKey: "app_update_nudge",
        data: {
          type: "app_update",
          storeUrl: PLAY_STORE_URL,
        },
      })
      results.push({
        platform: String(d.platform ?? "device"),
        ok: r.ok,
        detail: r.ok ? "sent" : `FCM ${r.status}: ${r.detail.slice(0, 120)}`,
      })
    } catch (e) {
      results.push({
        platform: String(d.platform ?? "device"),
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const sent = results.filter((r) => r.ok).length
  return new Response(
    JSON.stringify({
      ok: sent > 0,
      sent,
      failed: results.length - sent,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
