/**
 * Inbound SMS keywords (CTIA-style): STOP blocks outbound for user_id + phone.
 * START removes the block. HELP can notify ops (optional).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv, normalizePhone } from "./_communications.js"

export type SmsKeywordKind = "stop" | "start" | "help"

/** Words that opt out (case-insensitive; whole body or leading token). */
const STOP_KEYWORDS = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "STOPALL"]
/** Customer may resubscribe (Twilio convention). */
const START_KEYWORDS = ["START", "UNSTOP", "YES"]

export function detectInboundSmsKeyword(body: string): SmsKeywordKind | null {
  const t = body.trim()
  if (!t) return null
  const upper = t.toUpperCase()
  const firstToken = upper.split(/\s+/)[0] ?? ""

  if (START_KEYWORDS.some((k) => firstToken === k || upper === k)) return "start"
  if (STOP_KEYWORDS.some((k) => firstToken === k || upper === k || upper.startsWith(`${k} `))) return "stop"
  if (firstToken === "HELP" || upper === "HELP") return "help"

  return null
}

export async function upsertSmsOptOut(
  supabase: SupabaseClient,
  params: {
    userId: string
    customerPhoneE164: string
    inboundBody: string
    messageSid: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizePhone(params.customerPhoneE164)
  if (!phone || !params.userId) return { ok: false, error: "missing user or phone" }

  const { error } = await supabase.from("customer_sms_opt_outs").upsert(
    {
      user_id: params.userId,
      phone_e164: phone,
      opted_out_at: new Date().toISOString(),
      last_inbound_body: params.inboundBody.slice(0, 2000),
      last_message_sid: params.messageSid,
    },
    { onConflict: "user_id,phone_e164" },
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteSmsOptOut(
  supabase: SupabaseClient,
  userId: string,
  customerPhoneE164: string,
): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizePhone(customerPhoneE164)
  if (!phone || !userId) return { ok: false, error: "missing user or phone" }

  const { error } = await supabase.from("customer_sms_opt_outs").delete().eq("user_id", userId).eq("phone_e164", phone)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function isPhoneSmsOptedOut(
  supabase: SupabaseClient,
  userId: string,
  destinationPhoneE164: string,
): Promise<boolean> {
  const phone = normalizePhone(destinationPhoneE164)
  if (!phone || !userId) return false

  const { data, error } = await supabase
    .from("customer_sms_opt_outs")
    .select("id")
    .eq("user_id", userId)
    .eq("phone_e164", phone)
    .maybeSingle()

  if (error || !data) return false
  return true
}

function parseAdminRecipients(): string[] {
  const raw = firstEnv("ADMIN_SIGNUP_NOTIFY_EMAIL", "ADMIN_SMS_OPS_EMAIL").trim()
  const defaults = ["admin@tradesman-us.com", "admin@mail.tradesman-us.com"]
  if (!raw) return [...defaults]
  const parts = raw
    .split(/[,;]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"))
  return parts.length > 0 ? [...new Set(parts)] : [...defaults]
}

/**
 * Email ops when a customer texts STOP / HELP. Uses same Resend env as signup notify.
 */
export async function notifyAdminSmsKeyword(params: {
  kind: "stop" | "help"
  businessUserId: string
  businessLabel: string
  customerPhone: string
  businessLine: string
  inboundBody: string
  messageSid: string | null
}): Promise<{ sent: boolean; skippedReason?: string }> {
  if (params.kind === "help" && !/^(1|true|yes|on)$/i.test(firstEnv("ADMIN_SMS_NOTIFY_HELP").trim())) {
    return { sent: false, skippedReason: "set ADMIN_SMS_NOTIFY_HELP=1 to email ops on HELP" }
  }

  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")
  if (!apiKey || !from) {
    return { sent: false, skippedReason: "RESEND_API_KEY or RESEND_FROM_EMAIL not set" }
  }

  const to = parseAdminRecipients()
  const subject =
    params.kind === "stop"
      ? `SMS opt-out (STOP): ${params.businessLabel} — ${params.customerPhone}`
      : `SMS HELP keyword: ${params.businessLabel} — ${params.customerPhone}`

  const text = [
    params.kind === "stop"
      ? "A customer sent an opt-out keyword (STOP / equivalent). Outbound SMS to this number is now blocked for that business until START or manual removal."
      : "A customer texted HELP on a business SMS line.",
    "",
    `Business (user_id): ${params.businessUserId}`,
    `Business label: ${params.businessLabel}`,
    `Customer phone: ${params.customerPhone}`,
    `Your Twilio line (To): ${params.businessLine}`,
    `Inbound message: ${params.inboundBody}`,
    params.messageSid ? `Message SID: ${params.messageSid}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    })
    if (!sendRes.ok) {
      const t = await sendRes.text()
      console.error("[sms-opt-out] Resend", sendRes.status, t)
      return { sent: false, skippedReason: `Resend HTTP ${sendRes.status}` }
    }
    return { sent: true }
  } catch (e) {
    console.error("[sms-opt-out] Resend", e instanceof Error ? e.message : e)
    return { sent: false, skippedReason: "fetch failed" }
  }
}

/**
 * Platform-only optional confirmation to the customer (set on Vercel, not per contractor).
 * SMS_OPT_OUT_SEND_CONFIRMATION=1 and SMS_OPT_OUT_CONFIRMATION_TEXT optional.
 */
export async function sendPlatformOptOutConfirmationSms(params: {
  toCustomerE164: string
  fromBusinessLineE164: string
}): Promise<{ ok: boolean; error?: string }> {
  const enabled = /^(1|true|yes|on)$/i.test(firstEnv("SMS_OPT_OUT_SEND_CONFIRMATION").trim())
  if (!enabled) return { ok: true }

  if (!normalizePhone(params.toCustomerE164) || !normalizePhone(params.fromBusinessLineE164)) {
    return { ok: false, error: "missing To/From for confirmation SMS" }
  }

  const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  if (!accountSid || !authToken) {
    return { ok: false, error: "Twilio env missing for confirmation SMS" }
  }

  const body =
    firstEnv("SMS_OPT_OUT_CONFIRMATION_TEXT").trim() ||
    "You have been unsubscribed and will no longer receive messages."

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`
  const form = new URLSearchParams({
    To: params.toCustomerE164,
    From: params.fromBusinessLineE164,
    Body: body,
  })

  const twilioRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  })

  if (!twilioRes.ok) {
    const t = await twilioRes.text()
    return { ok: false, error: t.slice(0, 500) }
  }
  return { ok: true }
}

export async function loadProfileDisplayLabel(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase.from("profiles").select("display_name, email").eq("id", userId).maybeSingle()
  const row = data as { display_name?: string | null; email?: string | null } | null
  const dn = row?.display_name?.trim()
  if (dn) return dn
  const em = row?.email?.trim()
  if (em) return em
  return userId.slice(0, 8)
}
