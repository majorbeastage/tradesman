/**
 * POST /api/platform-tools?__route=notify-admin-new-signup
 * Called from complete-signup Edge (service secret) when a user submits signup — before email verify.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv } from "./_communications.js"
import { notifyAdminOps } from "./_adminOpsNotify.js"
import { recordAdminOpsCustomerEvent } from "./_adminOpsCustomerEvent.js"

const PRODUCT_PACKAGE_LABEL: Record<string, string> = {
  base: "Base Package — $124.99/mo",
  office_manager_entry: "Office Manager Entry Level — $159.99/mo",
  office_manager_pro: "Office Manager Pro — $199.99/mo",
  office_manager_elite: "Office Manager Elite — $369.99/mo",
  estimate_tools_only: "Estimate Tools only — $49.99/mo",
}

function labelForPackage(id: string | null | undefined): string {
  if (!id?.trim()) return "(not specified)"
  return PRODUCT_PACKAGE_LABEL[id.trim()] ?? id.trim()
}

type Body = {
  user_id?: string
  email?: string
  display_name?: string
  primary_phone?: string | null
  product_package?: string | null
}

export async function handleNotifyAdminNewSignup(req: VercelRequest, res: VercelResponse): Promise<void> {
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
  const pkg = labelForPackage(body.product_package)

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

  const text = [
    "A new user submitted the Tradesman signup form (email verification may still be pending).",
    "",
    `Email: ${emailStr}`,
    `Display name: ${displayStr}`,
    `User id: ${userId}`,
    `Product package: ${pkg}`,
    `Primary phone: ${body.primary_phone?.trim() || "(none)"}`,
    "",
    "You will receive another alert when they verify email and sign in.",
  ].join("\n")

  const result = await notifyAdminOps({
    service,
    subject: `New signup submitted: ${displayStr} (${emailStr})`,
    text,
    pushTitle: "New signup submitted",
    pushBody: `${displayStr} · ${pkg}`,
  })

  const customerEvent = await recordAdminOpsCustomerEvent(service, {
    kind: "signup_submitted",
    externalId: `signup-submitted:${userId}`,
    email: emailStr,
    displayName: displayStr,
    subject: `New signup submitted: ${displayStr} (${emailStr})`,
    body: text,
    signupUserId: userId,
    phone: body.primary_phone?.trim() || null,
  })

  console.info("[notify-admin-new-signup]", { userId, email: emailStr, push: result.push, customerEvent })
  res.status(200).json({
    ok: true,
    email: result.email,
    push: result.push,
    customerEvent,
  })
}
