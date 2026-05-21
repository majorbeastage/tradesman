/**
 * POST /api/platform-tools?__route=notify-client-sms-disclosure
 * (Also reachable at /api/notify-client-sms-disclosure via vercel.json rewrite.)
 *
 * One-time email to the business after they verify their signup email — recommended SMS disclosure copy.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { createServiceSupabase, firstEnv } from "./_communications.js"

const META_KEY = "post_verify_sms_disclosure_emailed_at"
const SMS_CTA_URL = "https://www.tradesman-us.com/sms-cta"
const DEFAULT_FROM = "Tradesman Systems <admin@tradesman-us.com>"
const EMAIL_SUBJECT = "Action Recommended: Add SMS Consent Disclosure to Your Website"
const WHY_THIS_MATTERS =
  "Carriers now require businesses to demonstrate customer consent before delivering SMS messages. Adding this disclosure protects your ability to reach customers without interruption."

type ProfileRow = {
  id: string
  email?: string | null
  display_name?: string | null
  metadata?: unknown
  role?: string | null
}

function resolveFromAddress(): string {
  return firstEnv("POST_VERIFY_SMS_DISCLOSURE_FROM", "RESEND_POST_VERIFY_FROM").trim() || DEFAULT_FROM
}

function businessNameFromProfile(row: ProfileRow | null, authEmail: string): string {
  const dn = String(row?.display_name ?? "").trim()
  if (dn) return dn
  const local = authEmail.split("@")[0]?.trim()
  return local || "your business"
}

function buildDisclosureQuote(businessName: string): string {
  return `“By submitting a service request or contacting ${businessName}, you agree to receive SMS messages related to your inquiry, scheduling, estimates, job updates, and customer support from ${businessName}. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help.”`
}

function buildEmail(businessName: string): { subject: string; text: string; html: string } {
  const disclosure = buildDisclosureQuote(businessName)
  const subject = EMAIL_SUBJECT

  const text = [
    `Hi ${businessName},`,
    "",
    WHY_THIS_MATTERS,
    "",
    "To help keep customer SMS communication compliant, we recommend adding the following disclosure near any contact form, service request form, estimate request form, or customer intake point where customers may provide their phone number:",
    "",
    disclosure,
    "",
    "This disclosure helps customers understand how SMS follow-up may be used after they contact your business.",
    "",
    "You can also review our SMS consent guidance and download a printable in-person opt-in PDF here:",
    SMS_CTA_URL,
    "",
    "Tradesman Systems does not support bulk messaging or unsolicited outreach. SMS should only be used for one-to-one communication with customers who contacted your business or agreed to receive messages.",
    "",
    "— Tradesman Systems",
  ].join("\n")

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#111827;background:#f3f4f6;padding:24px 16px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 24px;">
    <p style="margin:0 0 16px;">Hi ${esc(businessName)},</p>
    <p style="margin:0 0 16px;">${esc(WHY_THIS_MATTERS)}</p>
    <p style="margin:0 0 16px;">To help keep customer SMS communication compliant, we recommend adding the following disclosure near any contact form, service request form, estimate request form, or customer intake point where customers may provide their phone number:</p>
    <p style="margin:0 0 16px;padding:14px 16px;background:#f9fafb;border-left:4px solid #2563eb;font-size:15px;">${esc(disclosure)}</p>
    <p style="margin:0 0 16px;">This disclosure helps customers understand how SMS follow-up may be used after they contact your business.</p>
    <p style="margin:0 0 16px;">You can also review our SMS consent guidance here:<br><a href="${SMS_CTA_URL}" style="color:#2563eb;">${esc(SMS_CTA_URL)}</a></p>
    <p style="margin:0;">Tradesman Systems does not support bulk messaging or unsolicited outreach. SMS should only be used for one-to-one communication with customers who contacted your business or agreed to receive messages.</p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:14px;">— Tradesman Systems</p>
  </div>
</body>
</html>`

  return { subject, text, html }
}

async function loadProfileWithRetry(
  service: ReturnType<typeof createServiceSupabase>,
  userId: string,
): Promise<{ row: ProfileRow | null; error: string | null }> {
  const select = "id, email, display_name, metadata, role"
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await service.from("profiles").select(select).eq("id", userId).maybeSingle()
    if (error) return { row: null, error: error.message }
    if (data) return { row: data as ProfileRow, error: null }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 450))
  }
  return { row: null, error: null }
}

export async function handleNotifyClientSmsDisclosure(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization" })
    return
  }

  const supabaseUrl = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "")
  const anonKey = firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({ error: "Missing Supabase URL/anon key" })
    return
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const token = authHeader.slice("Bearer ".length).trim()
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    res.status(401).json({ error: "Invalid session" })
    return
  }
  const u = userData.user
  if (!u.email_confirmed_at) {
    res.status(400).json({ error: "Email not verified yet", skipped: true })
    return
  }

  const recipient = String(u.email ?? "").trim().toLowerCase()
  if (!recipient.includes("@")) {
    res.status(400).json({ error: "No email on account", skipped: true })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const { row: profile, error: profErr } = await loadProfileWithRetry(service, u.id)
  if (profErr) {
    res.status(500).json({ error: profErr })
    return
  }

  const apiKey = firstEnv("RESEND_API_KEY")
  const from = resolveFromAddress()

  if (!apiKey) {
    res.status(200).json({ ok: true, notifyDisabled: true, hint: "Set RESEND_API_KEY on Vercel" })
    return
  }

  if (profile?.role === "admin") {
    res.status(200).json({ ok: true, skipped: true, reason: "admin_role" })
    return
  }

  const meta =
    profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
      ? { ...(profile.metadata as Record<string, unknown>) }
      : {}

  if (typeof meta[META_KEY] === "string" && String(meta[META_KEY]).trim()) {
    res.status(200).json({ ok: true, alreadySent: true })
    return
  }

  const businessName = businessNameFromProfile(profile, recipient)
  const { subject, text, html } = buildEmail(businessName)

  let sendRes: Response
  try {
    sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text,
        html,
      }),
    })
  } catch (e) {
    console.error("[notify-client-sms-disclosure]", e instanceof Error ? e.message : e)
    res.status(502).json({ error: "Resend request failed" })
    return
  }

  if (!sendRes.ok) {
    const t = await sendRes.text()
    console.error("[notify-client-sms-disclosure] Resend", sendRes.status, t)
    res.status(502).json({ error: "Resend rejected the send" })
    return
  }

  if (profile) {
    meta[META_KEY] = new Date().toISOString()
    const { error: upErr } = await service.from("profiles").update({ metadata: meta }).eq("id", u.id)
    if (upErr) {
      console.error("[notify-client-sms-disclosure] metadata", upErr.message)
      res.status(500).json({ error: upErr.message })
      return
    }
  }

  console.info("[notify-client-sms-disclosure] emailed", { to: recipient, userId: u.id })
  res.status(200).json({ ok: true, emailed: true, profilePending: !profile })
}
