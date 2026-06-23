/**
 * POST /api/platform-tools?__route=notify-admin-trial-signup
 * (Also reachable at /api/notify-admin-trial-signup via vercel.json rewrite.)
 *
 * Called from provision-sandbox Edge when a free trial workspace is created.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv } from "./_communications.js"
import { notifyAdminOps } from "./_adminOpsNotify.js"
import { recordAdminOpsCustomerEvent } from "./_adminOpsCustomerEvent.js"

type Body = {
  user_id?: string
  email?: string
  display_name?: string
  business_name?: string | null
  embed_slug?: string | null
  expires_at?: string | null
  customer_count?: number | null
  lead_count?: number | null
}

export async function handleNotifyAdminTrialSignup(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const secret = firstEnv("COMPLETE_SIGNUP_NOTIFY_SECRET", "ADMIN_SIGNUP_NOTIFY_SECRET").trim()
  const headerSecret = String(req.headers["x-tradesman-signup-notify-secret"] ?? "").trim()
  if (!secret || headerSecret !== secret) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  const body = (req.body ?? {}) as Body
  const userId = String(body.user_id ?? "").trim()
  const emailStr = String(body.email ?? "").trim()
  const displayStr = String(body.display_name ?? "").trim() || emailStr
  const business = body.business_name?.trim() || "(none)"
  const embedSlug = body.embed_slug?.trim() || null
  const expiresAt = body.expires_at?.trim() || null
  const customerCount = typeof body.customer_count === "number" ? body.customer_count : null
  const leadCount = typeof body.lead_count === "number" ? body.lead_count : null

  if (!userId || !emailStr) {
    res.status(400).json({ error: "user_id and email required" })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const site = firstEnv("VITE_SITE_URL", "SITE_URL", "VERCEL_URL").replace(/\/+$/, "")
  const ctaUrl = embedSlug && site ? `${site.startsWith("http") ? site : `https://${site}`}/cta/${embedSlug}` : null

  const text = [
    "A new Tradesman free trial workspace was created.",
    "",
    `Email: ${emailStr}`,
    `Display name: ${displayStr}`,
    `Business: ${business}`,
    `User id: ${userId}`,
    customerCount != null ? `Sample customers seeded: ${customerCount}` : "",
    leadCount != null ? `Sample leads seeded: ${leadCount}` : "",
    expiresAt ? `Trial expires: ${new Date(expiresAt).toLocaleString()}` : "",
    ctaUrl ? `Lead capture link: ${ctaUrl}` : "",
    "",
    "The prospect was emailed their temporary login. Check the admin Customers tab for this thread.",
  ]
    .filter(Boolean)
    .join("\n")

  const result = await notifyAdminOps({
    service,
    subject: `New free trial: ${displayStr} (${emailStr})`,
    text,
    pushTitle: "New free trial signup",
    pushBody: `${displayStr} · ${business}`,
  })

  const customerEvent = await recordAdminOpsCustomerEvent(service, {
    kind: "trial_provisioned",
    externalId: `trial-provisioned:${userId}`,
    email: emailStr,
    displayName: displayStr,
    subject: `New free trial: ${displayStr} (${emailStr})`,
    body: text,
    signupUserId: userId,
  })

  console.info("[notify-admin-trial-signup]", {
    userId,
    email: emailStr,
    adminEmail: result.email,
    push: result.push,
    customerEvent,
  })

  if (!result.email.ok && result.email.disabled !== true) {
    res.status(502).json({
      error: result.email.error ?? "Resend rejected the admin alert email",
      customerEvent,
    })
    return
  }

  res.status(200).json({
    ok: true,
    email: result.email,
    push: result.push,
    customerEvent,
    emailDisabled: result.email.disabled === true,
  })
}
