// After calendar job state changes (scheduled / completed / cancelled), sends push / email / SMS
// per profiles.metadata.tabNotifications.calendar (and mobile_push_opt_in for push).
// Deploy: supabase functions deploy notify-calendar-status
// Secrets: same as notify-quote-status (FCM_SERVICE_ACCOUNT_JSON, RESEND_*, TWILIO_*)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendFcmNotification } from "../_shared/fcm-v1.ts"
import {
  parseCalendarTabPrefs,
  shouldNotifyChannel,
} from "../_shared/tab-notification-prefs.ts"
import { userCanAccessCalendarOwner } from "../_shared/calendar-event-access.ts"
import { getTwilioCredentials, getTwilioFromNumber, twilioAccountBasicAuth } from "../_shared/twilio-env.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function toE164(input: string): string | null {
  const d = input.replace(/\D/g, "")
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith("1")) return `+${d}`
  if (d.length >= 11) return `+${d}`
  return null
}

type CalRow = {
  id: string
  user_id: string
  title: string
  start_at: string
  end_at: string
  notes: string | null
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

  let payload: {
    calendarEventId?: string
    calendarEventIds?: string[]
    previousStatus?: string | null
    newStatus?: string | null
  }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const single = typeof payload.calendarEventId === "string" ? payload.calendarEventId.trim() : ""
  const many = Array.isArray(payload.calendarEventIds)
    ? payload.calendarEventIds.map((x) => String(x).trim()).filter(Boolean)
    : []
  const ids = many.length > 0 ? [...new Set(many)] : single ? [single] : []
  const newStatus = typeof payload.newStatus === "string" ? payload.newStatus.trim() : ""
  const previousStatus = payload.previousStatus != null ? String(payload.previousStatus) : ""

  if (ids.length === 0 || !newStatus) {
    return new Response(JSON.stringify({ error: "calendarEventId(s) and newStatus required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: rows, error: rowsErr } = await admin
    .from("calendar_events")
    .select("id, user_id, title, start_at, end_at, notes")
    .in("id", ids)

  if (rowsErr || !rows?.length) {
    return new Response(JSON.stringify({ error: rowsErr?.message ?? "Calendar events not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const events = rows as CalRow[]
  const ownerId = events[0].user_id
  if (!events.every((e) => e.user_id === ownerId)) {
    return new Response(JSON.stringify({ error: "All events must belong to the same user" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const allowed = await userCanAccessCalendarOwner(admin, user.id, ownerId)
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("email, primary_phone, best_contact_phone, metadata")
    .eq("id", ownerId)
    .maybeSingle()

  if (pErr || !profile) {
    return new Response(JSON.stringify({ error: pErr?.message ?? "Profile not found" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const meta = (profile.metadata && typeof profile.metadata === "object"
    ? profile.metadata
    : {}) as Record<string, unknown>
  const cPrefs = parseCalendarTabPrefs(meta)

  const actions: Record<string, unknown> = {
    email: { attempted: false, ok: false, detail: "" },
    sms: { attempted: false, ok: false, detail: "" },
    push: { attempted: false, ok: false, detail: "" },
  }

  const n = events.length
  const first = events[0]
  const when = `${new Date(first.start_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
  const subject =
    n > 1 ? `Calendar: ${newStatus} (${n} jobs)` : `Calendar: ${newStatus} — ${first.title}`
  const textBody =
    n > 1
      ? `${n} calendar job(s) are now "${newStatus}". First: "${first.title}" (${when}).` +
        (previousStatus ? ` Previously: ${previousStatus}.` : "")
      : `Job "${first.title}" (${when}) is now "${newStatus}".` +
        (previousStatus ? ` Previously: ${previousStatus}.` : "")

  if (cPrefs && shouldNotifyChannel(cPrefs.email, newStatus)) {
    actions.email = { attempted: true, ok: false, detail: "" }
    const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? ""
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")?.trim() ?? ""
    const to = (profile.email as string | null)?.trim()
    if (!apiKey || !fromEmail) {
      ;(actions.email as { detail: string }).detail = "RESEND_API_KEY or RESEND_FROM_EMAIL missing"
    } else if (!to) {
      ;(actions.email as { detail: string }).detail = "Profile has no email"
    } else {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromEmail, to: [to], subject, text: textBody }),
      })
      const t = await r.text()
      ;(actions.email as { ok: boolean; detail: string }).ok = r.ok
      ;(actions.email as { detail: string }).detail = r.ok ? "sent" : `${r.status} ${t.slice(0, 400)}`
    }
  }

  if (cPrefs && shouldNotifyChannel(cPrefs.sms, newStatus)) {
    actions.sms = { attempted: true, ok: false, detail: "" }
    let creds: { accountSid: string; authToken: string }
    try {
      creds = getTwilioCredentials()
    } catch (e) {
      ;(actions.sms as { detail: string }).detail = e instanceof Error ? e.message : String(e)
      creds = { accountSid: "", authToken: "" }
    }
    const fromNum = getTwilioFromNumber()
    const dest = toE164(
      (profile.best_contact_phone as string | null)?.trim() ||
        (profile.primary_phone as string | null)?.trim() ||
        "",
    )
    if (!creds.accountSid) {
      /* detail set */
    } else if (!fromNum) {
      ;(actions.sms as { detail: string }).detail = "TWILIO_FROM_NUMBER missing"
    } else if (!dest) {
      ;(actions.sms as { detail: string }).detail = "No best_contact_phone / primary_phone on profile"
    } else {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}/Messages.json`
      const form = new URLSearchParams({
        To: dest,
        From: fromNum,
        Body: `Tradesman: ${textBody}`,
      })
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: twilioAccountBasicAuth(creds.accountSid, creds.authToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      })
      const t = await r.text()
      ;(actions.sms as { ok: boolean; detail: string }).ok = r.ok
      ;(actions.sms as { detail: string }).detail = r.ok ? "sent" : `${r.status} ${t.slice(0, 400)}`
    }
  }

  if (cPrefs && shouldNotifyChannel(cPrefs.push, newStatus) && meta.mobile_push_opt_in === true) {
    actions.push = { attempted: true, ok: false, detail: "" }
    const fcmJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim() ?? ""
    if (!fcmJson) {
      ;(actions.push as { detail: string }).detail = "FCM_SERVICE_ACCOUNT_JSON missing"
    } else {
      const { data: devices } = await admin
        .from("user_push_devices")
        .select("token, platform")
        .eq("user_id", ownerId)

      const devRows = devices ?? []
      if (devRows.length === 0) {
        ;(actions.push as { detail: string }).detail = "No devices registered for this user"
      } else {
        const parts: string[] = []
        let any = false
        for (const d of devRows) {
          if (d.platform === "web") continue
          try {
            const r = await sendFcmNotification({
              serviceAccountJson: fcmJson,
              fcmToken: d.token,
              title: subject.slice(0, 80),
              body: textBody.slice(0, 200),
            })
            any ||= r.ok
            parts.push(`${d.platform}:${r.ok ? "ok" : r.detail.slice(0, 120)}`)
          } catch (e) {
            parts.push(`${d.platform}:err:${e instanceof Error ? e.message : String(e)}`)
          }
        }
        ;(actions.push as { ok: boolean; detail: string }).ok = any
        ;(actions.push as { detail: string }).detail = parts.join("; ") || "no FCM targets"
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      calendarEventIds: ids,
      ownerId,
      newStatus,
      actions,
      note: "Channels omitted if Alerts (Calendar) prefs do not include this status or push opt-in is off.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
