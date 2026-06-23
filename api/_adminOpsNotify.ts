/**
 * Ops alerts: admin email inboxes + FCM push to admin-role Tradesman app installs only.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv } from "./_communications.js"
import { sendFcmNotification } from "./_fcmV1Node.js"

const DEFAULT_OPS_INBOXES = ["admin@tradesman-us.com", "admin@mail.tradesman-us.com"]

/**
 * Ops alert inboxes. Pass env var names in priority order; first non-empty wins.
 * Always includes DEFAULT_OPS_INBOXES so admin@tradesman-us.com is never dropped.
 */
export function parseAdminEmailRecipients(...envKeys: string[]): string[] {
  const keys = envKeys.length > 0 ? envKeys : ["ADMIN_SIGNUP_NOTIFY_EMAIL", "HELP_DESK_TICKET_NOTIFY_EMAIL"]
  const raw = keys.map((k) => firstEnv(k).trim()).find(Boolean) ?? ""
  const configured = raw
    .split(/[,;]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"))
  return [...new Set([...DEFAULT_OPS_INBOXES.map((e) => e.toLowerCase()), ...configured])]
}

export async function sendAdminOpsEmail(params: {
  subject: string
  text: string
}): Promise<{ ok: boolean; disabled?: boolean; error?: string }> {
  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")
  if (!apiKey || !from) {
    return { ok: false, disabled: true, error: "RESEND not configured" }
  }
  const to = parseAdminEmailRecipients()
  try {
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: params.subject,
        text: params.text,
      }),
    })
    if (!sendRes.ok) {
      const t = await sendRes.text()
      console.error("[admin-ops-notify] Resend", sendRes.status, t)
      return { ok: false, error: "Resend rejected the send" }
    }
    return { ok: true }
  } catch (e) {
    console.error("[admin-ops-notify]", e instanceof Error ? e.message : e)
    return { ok: false, error: "Resend request failed" }
  }
}

/** Push to every registered device for profiles.role = admin (and optional ADMIN_PUSH_USER_IDS). */
export async function sendAdminOpsPush(params: {
  service: SupabaseClient
  title: string
  body: string
}): Promise<{ attempted: boolean; sent: number; failed: number; detail: string }> {
  const fcmJson = firstEnv("FCM_SERVICE_ACCOUNT_JSON").trim()
  if (!fcmJson) {
    return { attempted: false, sent: 0, failed: 0, detail: "FCM_SERVICE_ACCOUNT_JSON not set on Vercel" }
  }

  const extraIds = firstEnv("ADMIN_PUSH_USER_IDS")
    .split(/[,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)

  const { data: admins, error: adminErr } = await params.service.from("profiles").select("id").eq("role", "admin")
  if (adminErr) {
    return { attempted: true, sent: 0, failed: 0, detail: adminErr.message }
  }

  const adminIds = new Set<string>([...(admins ?? []).map((r) => String(r.id)), ...extraIds])
  if (adminIds.size === 0) {
    return { attempted: true, sent: 0, failed: 0, detail: "No admin profiles found for push" }
  }

  const { data: devices, error: devErr } = await params.service
    .from("user_push_devices")
    .select("user_id, fcm_token, platform")
    .in("user_id", [...adminIds])
  if (devErr) {
    return { attempted: true, sent: 0, failed: 0, detail: devErr.message }
  }

  const tokens = (devices ?? []).filter((d) => typeof d.fcm_token === "string" && d.fcm_token.trim())
  if (tokens.length === 0) {
    return {
      attempted: true,
      sent: 0,
      failed: 0,
      detail: "No admin push devices registered (Account → Request push permission on admin phones)",
    }
  }

  let sent = 0
  let failed = 0
  const parts: string[] = []
  for (const d of tokens) {
    const token = String(d.fcm_token).trim()
    if (!token) continue
    try {
      const r = await sendFcmNotification({
        serviceAccountJson: fcmJson,
        fcmToken: token,
        title: params.title,
        body: params.body,
      })
      if (r.ok) {
        sent++
        parts.push(`${d.platform ?? "device"}:ok`)
      } else {
        failed++
        parts.push(`${d.platform ?? "device"}:fail:${r.detail.slice(0, 80)}`)
      }
    } catch (e) {
      failed++
      parts.push(`${d.platform ?? "device"}:err:${e instanceof Error ? e.message : String(e)}`.slice(0, 120))
    }
  }

  return {
    attempted: true,
    sent,
    failed,
    detail: parts.join("; ") || "no targets",
  }
}

export async function notifyAdminOps(params: {
  service: SupabaseClient
  subject: string
  text: string
  pushTitle: string
  pushBody: string
}): Promise<{ email: Awaited<ReturnType<typeof sendAdminOpsEmail>>; push: Awaited<ReturnType<typeof sendAdminOpsPush>> }> {
  const [email, push] = await Promise.all([
    sendAdminOpsEmail({ subject: params.subject, text: params.text }),
    sendAdminOpsPush({ service: params.service, title: params.pushTitle, body: params.pushBody }),
  ])
  return { email, push }
}
