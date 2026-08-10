// Notify teammates when a calendar event is assigned or a video/conference call is attached.
// Deploy: supabase functions deploy notify-calendar-invite
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FCM_SERVICE_ACCOUNT_JSON (optional push)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendFcmNotification } from "../_shared/fcm-v1.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MESSAGING_APP_ID = "com.tradesmanus.messaging"

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

  let eventId = ""
  let recipientUserIds: string[] = []
  let inviteKind: "assign" | "video" | "both" = "assign"
  try {
    const j = (await req.json()) as {
      eventId?: string
      recipientUserIds?: string[]
      inviteKind?: string
    }
    eventId = typeof j.eventId === "string" ? j.eventId.trim() : ""
    recipientUserIds = Array.isArray(j.recipientUserIds)
      ? j.recipientUserIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : []
    if (j.inviteKind === "video" || j.inviteKind === "both") inviteKind = j.inviteKind
  } catch {
    /* empty */
  }

  if (!eventId || recipientUserIds.length === 0) {
    return new Response(JSON.stringify({ error: "eventId and recipientUserIds required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const uniqueRecipients = [...new Set(recipientUserIds.filter((id) => id !== user.id))]
  if (uniqueRecipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, notified: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: event, error: evErr } = await admin
    .from("calendar_events")
    .select("id, title, start_at, user_id, metadata")
    .eq("id", eventId)
    .maybeSingle()
  if (evErr || !event) {
    return new Response(JSON.stringify({ error: evErr?.message ?? "Event not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const ownerId = String(event.user_id ?? "")
  if (ownerId !== user.id) {
    const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
    const isAdmin = callerProfile?.role === "admin"
    let allowed = isAdmin
    if (!allowed) {
      const { data: teamLink } = await admin
        .from("office_manager_clients")
        .select("user_id")
        .eq("office_manager_id", ownerId)
        .eq("user_id", user.id)
        .maybeSingle()
      allowed = Boolean(teamLink)
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Not allowed to notify for this event" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  const { data: senderProfile } = await admin.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle()
  const senderName = senderProfile?.display_name?.trim() || senderProfile?.email?.trim() || "A teammate"

  const title = String(event.title ?? "Calendar event").trim() || "Calendar event"
  const start = event.start_at ? new Date(String(event.start_at)) : null
  const when =
    start && !Number.isNaN(start.getTime())
      ? start.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : ""

  const meta = (event.metadata ?? {}) as Record<string, unknown>
  const vc = meta.video_call_v1 as { video?: boolean; roomId?: string } | undefined
  const hasVideo = Boolean(vc?.roomId?.trim())

  let body = ""
  if (inviteKind === "video" || (inviteKind === "both" && hasVideo)) {
    body = hasVideo && vc?.video === false
      ? `${senderName} invited you to a voice conference${when ? ` · ${when}` : ""}. Open Calendar to join.`
      : `${senderName} invited you to a video call${when ? ` · ${when}` : ""}. Open Calendar to join.`
  } else {
    body = `${senderName} assigned you${when ? ` · ${when}` : ""}: ${title}`
  }

  let notified = 0
  let pushed = 0

  for (const uid of uniqueRecipients) {
    try {
      const { error: insErr } = await admin.from("user_notifications").insert({
        user_id: uid,
        kind: "calendar_event_shared",
        title: inviteKind === "video" || (inviteKind === "both" && hasVideo) ? `Call invite: ${title}` : `Calendar: ${title}`,
        body,
        calendar_event_id: eventId,
        metadata: {
          page: "calendar",
          eventId,
          inviteKind,
          fromUserId: user.id,
          ...(hasVideo && vc?.roomId ? { roomId: vc.roomId, video: vc.video !== false } : {}),
        },
      })
      if (!insErr) notified += 1
    } catch {
      /* continue */
    }

    if (!fcmJson) continue
    const { data: devices } = await admin
      .from("user_push_devices")
      .select("token, platform, app_id")
      .eq("user_id", uid)
      .neq("platform", "web")
    const targets = (devices ?? []).filter((d) => {
      const appId = String(d.app_id ?? "").trim()
      return !appId || appId === "com.tradesmanus.com" || appId === MESSAGING_APP_ID
    })
    for (const d of targets) {
      const deviceAppId = String(d.app_id ?? "").trim()
      try {
        const r = await sendFcmNotification({
          serviceAccountJson: fcmJson,
          fcmToken: d.token,
          title: inviteKind === "video" ? `Call invite: ${title}` : `Calendar: ${title}`,
          body: body.slice(0, 160),
          data: {
            type: "calendar_event_shared",
            eventId,
            page: "calendar",
          },
          androidDataOnly: d.platform === "android" && deviceAppId === MESSAGING_APP_ID,
        })
        if (r.ok) pushed += 1
      } catch {
        /* continue */
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, notified, pushed }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
