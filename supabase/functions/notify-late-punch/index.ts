// Notifies managers when an employee clocks in late (push + email).
// Deploy: supabase functions deploy notify-late-punch
// Secrets: RESEND_API_KEY, RESEND_FROM_EMAIL, FCM_SERVICE_ACCOUNT_JSON (optional push)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendFcmNotification } from "../_shared/fcm-v1.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type ManagerNotifyResult = {
  userId: string
  email: { attempted: boolean; ok: boolean; detail: string }
  push: { attempted: boolean; ok: boolean; detail: string }
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
    accountUserId?: string
    employeeUserId?: string
    clockedInAt?: string
    expectedStartAt?: string | null
    managerUserIds?: string[]
  }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const employeeUserId = typeof payload.employeeUserId === "string" ? payload.employeeUserId.trim() : ""
  const accountUserId = typeof payload.accountUserId === "string" ? payload.accountUserId.trim() : ""
  const clockedInAt = typeof payload.clockedInAt === "string" ? payload.clockedInAt.trim() : ""
  const expectedStartAt =
    typeof payload.expectedStartAt === "string" && payload.expectedStartAt.trim()
      ? payload.expectedStartAt.trim()
      : null
  const managerUserIds = Array.isArray(payload.managerUserIds)
    ? [...new Set(payload.managerUserIds.map((x) => String(x).trim()).filter(Boolean))]
    : []

  if (!employeeUserId || !accountUserId || !clockedInAt || managerUserIds.length === 0) {
    return new Response(JSON.stringify({ error: "employeeUserId, accountUserId, clockedInAt, managerUserIds required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (user.id !== employeeUserId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: employeeProfile } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", employeeUserId)
    .maybeSingle()

  const employeeName =
    (employeeProfile?.display_name as string | null)?.trim() ||
    (employeeProfile?.email as string | null)?.trim() ||
    "Team member"

  const clockedLabel = new Date(clockedInAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const expectedLabel = expectedStartAt
    ? new Date(expectedStartAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null

  const subject = `Late punch: ${employeeName}`
  const textBody = expectedLabel
    ? `${employeeName} clocked in late at ${clockedLabel}. Scheduled start was ${expectedLabel}.`
    : `${employeeName} clocked in late at ${clockedLabel}.`

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? ""
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")?.trim() ?? ""
  const fcmJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim() ?? ""

  const results: ManagerNotifyResult[] = []

  for (const managerId of managerUserIds) {
    const row: ManagerNotifyResult = {
      userId: managerId,
      email: { attempted: false, ok: false, detail: "" },
      push: { attempted: false, ok: false, detail: "" },
    }

    const { data: mgr } = await admin
      .from("profiles")
      .select("email, metadata")
      .eq("id", managerId)
      .maybeSingle()

    const to = (mgr?.email as string | null)?.trim()
    if (apiKey && fromEmail && to) {
      row.email = { attempted: true, ok: false, detail: "" }
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromEmail, to: [to], subject, text: textBody }),
      })
      const t = await r.text()
      row.email.ok = r.ok
      row.email.detail = r.ok ? "sent" : `${r.status} ${t.slice(0, 400)}`
    } else if (!to) {
      row.email = { attempted: false, ok: false, detail: "no email on profile" }
    } else {
      row.email = { attempted: false, ok: false, detail: "RESEND not configured" }
    }

    const meta = (mgr?.metadata && typeof mgr.metadata === "object" ? mgr.metadata : {}) as Record<string, unknown>
    if (fcmJson && meta.mobile_push_opt_in === true) {
      row.push = { attempted: true, ok: false, detail: "" }
      const { data: devices } = await admin
        .from("user_push_devices")
        .select("token, platform")
        .eq("user_id", managerId)

      const devRows = devices ?? []
      if (devRows.length === 0) {
        row.push.detail = "No devices registered"
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
        row.push.ok = any
        row.push.detail = parts.join("; ") || "no FCM targets"
      }
    } else {
      row.push.detail = meta.mobile_push_opt_in === true ? "FCM not configured" : "push opt-in off"
    }

    results.push(row)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      accountUserId,
      employeeUserId,
      managersNotified: results.length,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
