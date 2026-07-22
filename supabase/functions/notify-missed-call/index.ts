// Push when a teammate misses an internal audio/video call.
// Deploy: supabase functions deploy notify-missed-call
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FCM_SERVICE_ACCOUNT_JSON

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendFcmNotification } from "../_shared/fcm-v1.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MESSAGING_APP_ID = "com.tradesmanus.messaging"
const MESSAGING_CHANNEL = "tradesman_messaging"

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

  let missedCallId = ""
  try {
    const j = (await req.json()) as { missedCallId?: string }
    missedCallId = typeof j.missedCallId === "string" ? j.missedCallId : ""
  } catch {
    /* empty */
  }
  if (!missedCallId) {
    return new Response(JSON.stringify({ error: "missedCallId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: row } = await admin
    .from("internal_missed_calls")
    .select("id, callee_id, caller_id, caller_name, video, status")
    .eq("id", missedCallId)
    .maybeSingle()
  if (!row || row.status !== "missed") {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (row.caller_id !== user.id && row.callee_id !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (!fcmJson) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no FCM" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const who = String(row.caller_name || "Teammate")
  const title = row.video ? "Missed video call" : "Missed call"
  const body = `From ${who}`
  const collapseKey = `missed_${row.caller_id}`
  const dataPayload = {
    type: "internal_missed_call",
    missedCallId: String(row.id),
    callerId: String(row.caller_id),
    video: row.video ? "1" : "0",
  }

  const { data: devices } = await admin
    .from("user_push_devices")
    .select("token, platform, app_id")
    .eq("user_id", row.callee_id)

  const targets = (devices ?? []).filter(
    (d) => d.platform !== "web" && d.token && (d.app_id || "") === MESSAGING_APP_ID,
  )

  let sent = 0
  for (const d of targets) {
    try {
      const r = await sendFcmNotification({
        serviceAccountJson: fcmJson,
        fcmToken: d.token,
        title,
        body,
        data: dataPayload,
        androidChannelId: MESSAGING_CHANNEL,
        androidTag: collapseKey,
        collapseKey,
        apnsThreadId: collapseKey,
      })
      if (r.ok) sent += 1
    } catch {
      /* continue */
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
