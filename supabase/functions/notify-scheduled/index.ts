// Scheduled notifier: fires "calendar event upcoming" alerts.
// Deploy:  supabase functions deploy notify-scheduled
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTIFY_CRON_SECRET (required),
//          FCM_SERVICE_ACCOUNT_JSON (optional, for mobile push)
//
// Invoke from a schedule (Supabase cron / pg_cron / external) every ~5 minutes with
// header  x-cron-secret: <NOTIFY_CRON_SECRET>.  De-dupes via the unique index on
// user_notifications (user_id, kind, calendar_event_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendFcmNotification } from "../_shared/fcm-v1.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

const MAX_LOOKAHEAD_MIN = 1440 // longest supported lead time (1 day)

type Delivery = { mobile: boolean; desktop: boolean }
type Prefs = {
  calendarUpcoming: Delivery
  calendarUpcomingLeadMinutes: number
}

function parsePrefs(metadata: unknown): Prefs {
  const fallback: Prefs = { calendarUpcoming: { mobile: false, desktop: true }, calendarUpcomingLeadMinutes: 60 }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return fallback
  const raw = (metadata as Record<string, unknown>)["notification_prefs_v1"]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback
  const o = raw as Record<string, unknown>
  const triggers = o.triggers && typeof o.triggers === "object" ? (o.triggers as Record<string, unknown>) : {}
  const cu = triggers["calendar_upcoming"]
  const d: Delivery =
    cu && typeof cu === "object"
      ? { mobile: (cu as Record<string, unknown>).mobile === true, desktop: (cu as Record<string, unknown>).desktop === true }
      : { mobile: false, desktop: false }
  const lead = Number(o.calendarUpcomingLeadMinutes)
  return {
    calendarUpcoming: d,
    calendarUpcomingLeadMinutes: Number.isFinite(lead) && lead > 0 ? Math.round(lead) : 60,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const cronSecret = Deno.env.get("NOTIFY_CRON_SECRET")?.trim() ?? ""
  const provided = req.headers.get("x-cron-secret")?.trim() ?? ""
  if (cronSecret && provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const fcmJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim() ?? ""

  const now = Date.now()
  const horizonIso = new Date(now + MAX_LOOKAHEAD_MIN * 60_000).toISOString()
  const nowIso = new Date(now).toISOString()

  // Upcoming, not completed, not removed.
  const { data: events, error } = await admin
    .from("calendar_events")
    .select("id, user_id, customer_id, title, start_at")
    .is("completed_at", null)
    .is("removed_at", null)
    .gte("start_at", nowIso)
    .lte("start_at", horizonIso)
    .order("start_at", { ascending: true })
    .limit(2000)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const prefsCache = new Map<string, Prefs>()
  async function prefsFor(userId: string): Promise<Prefs> {
    const cached = prefsCache.get(userId)
    if (cached) return cached
    const { data } = await admin.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    const p = parsePrefs((data as { metadata?: unknown } | null)?.metadata)
    prefsCache.set(userId, p)
    return p
  }

  let created = 0
  let pushed = 0

  for (const ev of events ?? []) {
    const userId = (ev as { user_id?: string | null }).user_id
    if (!userId) continue
    const prefs = await prefsFor(userId)
    if (!prefs.calendarUpcoming.desktop && !prefs.calendarUpcoming.mobile) continue

    const startMs = new Date((ev as { start_at: string }).start_at).getTime()
    if (!Number.isFinite(startMs)) continue
    const minutesUntil = (startMs - now) / 60_000
    if (minutesUntil <= 0 || minutesUntil > prefs.calendarUpcomingLeadMinutes) continue

    const title = (ev as { title?: string | null }).title?.trim() || "Upcoming appointment"
    const body = `Starts at ${new Date(startMs).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`

    if (prefs.calendarUpcoming.desktop) {
      const { error: insErr } = await admin.from("user_notifications").insert({
        user_id: userId,
        kind: "calendar_upcoming",
        title: `Upcoming: ${title}`,
        body,
        customer_id: (ev as { customer_id?: string | null }).customer_id ?? null,
        calendar_event_id: (ev as { id: string }).id,
        metadata: { page: "calendar" },
      })
      // Unique-index conflict => already notified for this event; skip silently.
      if (!insErr) created += 1
      else if (!/duplicate key|unique/i.test(insErr.message)) {
        console.warn("[notify-scheduled] insert", insErr.message)
      }
    }

    if (prefs.calendarUpcoming.mobile && fcmJson) {
      const { data: mgr } = await admin.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      const meta = (mgr?.metadata && typeof mgr.metadata === "object" ? mgr.metadata : {}) as Record<string, unknown>
      if (meta.mobile_push_opt_in === true) {
        const { data: devices } = await admin.from("user_push_devices").select("token, platform").eq("user_id", userId)
        for (const d of devices ?? []) {
          if ((d as { platform?: string }).platform === "web") continue
          try {
            const r = await sendFcmNotification({
              serviceAccountJson: fcmJson,
              fcmToken: (d as { token: string }).token,
              title: `Upcoming: ${title}`.slice(0, 80),
              body: body.slice(0, 200),
            })
            if (r.ok) pushed += 1
          } catch (e) {
            console.warn("[notify-scheduled] push", e instanceof Error ? e.message : e)
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, scanned: events?.length ?? 0, created, pushed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
