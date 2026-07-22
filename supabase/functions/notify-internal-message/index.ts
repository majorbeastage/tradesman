// Push teammates when a new internal_messages row is inserted.
// Deploy: supabase functions deploy notify-internal-message
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FCM_SERVICE_ACCOUNT_JSON
// Prefer Tradesman Messaging tokens; fall back to main-app tokens. Collapse per thread.

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

  let threadId = ""
  let messageId = ""
  try {
    const j = (await req.json()) as { threadId?: string; messageId?: string }
    threadId = typeof j.threadId === "string" ? j.threadId : ""
    messageId = typeof j.messageId === "string" ? j.messageId : ""
  } catch {
    /* empty */
  }
  if (!threadId || !messageId) {
    return new Response(JSON.stringify({ error: "threadId and messageId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: membership } = await admin
    .from("internal_thread_members")
    .select("user_id")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!membership) {
    return new Response(JSON.stringify({ error: "Not a thread member" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: msg } = await admin
    .from("internal_messages")
    .select("id, body, sender_id, deleted_at")
    .eq("id", messageId)
    .eq("thread_id", threadId)
    .maybeSingle()
  if (!msg || msg.deleted_at) {
    return new Response(JSON.stringify({ ok: true, skipped: "no message" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: thread } = await admin.from("internal_threads").select("title, is_group").eq("id", threadId).maybeSingle()

  const { data: members } = await admin
    .from("internal_thread_members")
    .select("user_id, notifications_muted, muted_until")
    .eq("thread_id", threadId)

  const now = Date.now()
  const recipients = (members ?? [])
    .filter((m) => m.user_id !== user.id)
    .filter((m) => {
      if (!m.notifications_muted) return true
      if (m.muted_until && new Date(m.muted_until as string).getTime() <= now) return true
      return false
    })
    .map((m) => m.user_id as string)

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // Global opt-out via profiles.metadata.messaging_notifications.enabled === false
  const { data: profiles } = await admin.from("profiles").select("id, metadata, display_name").in("id", recipients)
  const enabledRecipients: string[] = []
  for (const p of profiles ?? []) {
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    const prefs = (meta.messaging_notifications ?? {}) as Record<string, unknown>
    if (prefs.enabled === false) continue
    enabledRecipients.push(p.id as string)
  }

  if (!fcmJson || enabledRecipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: !fcmJson ? "no FCM" : "all opted out" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: senderProfile } = await admin.from("profiles").select("display_name").eq("id", msg.sender_id).maybeSingle()
  const senderName = senderProfile?.display_name?.trim() || "Teammate"

  const title = thread?.is_group && thread.title ? String(thread.title) : String(senderName)
  const previewPrefs = new Map<string, boolean>()
  for (const p of profiles ?? []) {
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    const prefs = (meta.messaging_notifications ?? {}) as Record<string, unknown>
    previewPrefs.set(p.id as string, prefs.showPreview !== false)
  }

  const collapseKey = `im_${threadId}`
  const dataPayload = {
    type: "internal_message",
    threadId,
    messageId,
    senderId: String(msg.sender_id ?? ""),
  }

  let sent = 0
  for (const uid of enabledRecipients) {
    let devices: { token: string; platform: string; app_id?: string | null }[] | null = null
    const withApp = await admin.from("user_push_devices").select("token, platform, app_id").eq("user_id", uid)
    if (withApp.error) {
      const legacy = await admin.from("user_push_devices").select("token, platform").eq("user_id", uid)
      devices = (legacy.data ?? []) as { token: string; platform: string; app_id?: string | null }[]
    } else {
      devices = withApp.data
    }
    const bodyText = previewPrefs.get(uid) === false ? "New message" : String(msg.body || "New message").slice(0, 160)

    const native = (devices ?? []).filter((d) => d.platform !== "web" && d.token)
    // Instant Messaging pushes MUST go only to the Messaging app token.
    // Falling back to the main Tradesman app makes taps open the wrong package.
    const targets = native.filter((d) => String(d.app_id || "").trim() === MESSAGING_APP_ID)

    for (const d of targets) {
      try {
        const r = await sendFcmNotification({
          serviceAccountJson: fcmJson,
          fcmToken: d.token,
          title,
          body: bodyText,
          data: dataPayload,
          androidChannelId: MESSAGING_CHANNEL,
          androidTag: collapseKey,
          collapseKey,
          apnsThreadId: collapseKey,
          // Data-only on Android → Messaging posts one stable notification per thread (no expandable stack).
          androidDataOnly: d.platform === "android",
        })
        if (r.ok) sent += 1
      } catch {
        /* continue */
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
