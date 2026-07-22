/**
 * POST /api/platform-tools?__route=notify-admin-verified-signup
 * (Also reachable at /api/notify-admin-verified-signup via vercel.json rewrite.)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { createServiceSupabase, firstEnv } from "./_communications.js"
import { notifyAdminOps } from "./_adminOpsNotify.js"
import { recordAdminOpsCustomerEvent } from "./_adminOpsCustomerEvent.js"

const META_KEY = "verified_signup_admin_notified_at"

type ProfileRow = {
  id: string
  email?: string | null
  display_name?: string | null
  primary_phone?: string | null
  address_line_1?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  metadata?: unknown
  role?: string | null
  signup_extras?: unknown
}

async function loadProfileWithRetry(
  service: ReturnType<typeof createServiceSupabase>,
  userId: string,
): Promise<{ row: ProfileRow | null; error: string | null }> {
  const select =
    "id, email, display_name, primary_phone, address_line_1, address_city, address_state, address_zip, metadata, role, signup_extras"
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await service.from("profiles").select(select).eq("id", userId).maybeSingle()
    if (error) return { row: null, error: error.message }
    if (data) return { row: data as ProfileRow, error: null }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 450))
  }
  return { row: null, error: null }
}

export async function handleNotifyAdminVerifiedSignup(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  if (!firstEnv("RESEND_API_KEY") || !firstEnv("RESEND_FROM_EMAIL")) {
    res.status(200).json({ ok: true, notifyDisabled: true, hint: "Set RESEND_API_KEY and RESEND_FROM_EMAIL on Vercel" })
    return
  }

  /** Profile still missing (trigger lag): still alert ops so signups are not silent. */
  if (!profile) {
    const emailStr = String(u.email ?? "")
    const subject = `Email verified — profile missing: ${emailStr || u.id}`
    const text = [
      "A user verified their email in Supabase, but no profiles row was found yet after retries.",
      "Check trigger / complete-signup and profiles table.",
      "",
      `Auth email: ${emailStr}`,
      `User id: ${u.id}`,
    ].join("\n")

    const ops = await notifyAdminOps({
      service,
      subject,
      text,
      pushTitle: "Verified signup (profile pending)",
      pushBody: `${emailStr || u.id} verified — profile not found yet`,
    })
    if (emailStr) {
      await recordAdminOpsCustomerEvent(service, {
        kind: "signup_verified",
        externalId: `signup-verified:${u.id}`,
        email: emailStr,
        subject,
        body: text,
        signupUserId: u.id,
      })
    }
    res.status(200).json({ ok: true, emailed: ops.email.ok, profilePending: true, push: ops.push })
    return
  }

  const row = profile

  const signupExtras =
    row.signup_extras && typeof row.signup_extras === "object" && !Array.isArray(row.signup_extras)
      ? (row.signup_extras as Record<string, unknown>)
      : {}
  const productPackageRaw = typeof signupExtras.product_package === "string" ? signupExtras.product_package.trim() : ""
  const productPackageLabel: Record<string, string> = {
    base: "Base Package — $89.99/mo",
    office_manager_entry: "Office Manager Entry Level — $149.99/mo",
    office_manager_pro: "Office Manager Pro — $199.99/mo",
    office_manager_elite: "Office Manager Elite — $369.99/mo",
    corporate: "Corporate — $599.99/mo",
  }
  const productPackageLine = productPackageRaw
    ? productPackageLabel[productPackageRaw] ?? productPackageRaw
    : "(not specified)"

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {}
  if (typeof meta[META_KEY] === "string" && String(meta[META_KEY]).trim()) {
    res.status(200).json({ ok: true, alreadyNotified: true })
    return
  }

  const emailStr = String(row.email ?? u.email ?? "")
  const displayStr = String(row.display_name ?? "").trim() || emailStr
  const subject = `Email verified — new user: ${displayStr} (${emailStr})`
  const text = [
    "A user verified their email and signed in to Tradesman.",
    "",
    `Email: ${emailStr}`,
    `Display name: ${displayStr}`,
    `User id: ${u.id}`,
    `Role: ${row.role ?? ""}`,
    `Product package (from signup): ${productPackageLine}`,
    `Primary phone: ${row.primary_phone ?? "(none)"}`,
    `Address: ${[row.address_line_1, row.address_city, row.address_state, row.address_zip].filter(Boolean).join(", ") || "(none)"}`,
  ].join("\n")

  const ops = await notifyAdminOps({
    service,
    subject,
    text,
    pushTitle: "New verified signup",
    pushBody: `${displayStr} verified email · ${productPackageLine}`,
  })

  if (!ops.email.ok && ops.email.disabled !== true) {
    res.status(502).json({ error: ops.email.error ?? "Resend rejected the send" })
    return
  }

  meta[META_KEY] = new Date().toISOString()
  const { error: upErr } = await service.from("profiles").update({ metadata: meta }).eq("id", u.id)
  if (upErr) {
    console.error("[notify-admin-verified-signup] metadata", upErr.message)
    res.status(500).json({ error: upErr.message })
    return
  }

  const customerEvent = await recordAdminOpsCustomerEvent(service, {
    kind: "signup_verified",
    externalId: `signup-verified:${u.id}`,
    email: emailStr,
    displayName: displayStr,
    subject,
    body: text,
    signupUserId: u.id,
    phone: row.primary_phone ?? null,
  })

  console.info("[notify-admin-verified-signup]", {
    userId: u.id,
    email: emailStr,
    push: ops.push,
    customerEvent,
  })

  res.status(200).json({
    ok: true,
    emailed: ops.email.ok,
    push: ops.push,
    customerEvent,
    emailDisabled: ops.email.disabled === true,
  })
}
