/**
 * POST /api/platform-tools?__route=notify-admin-verified-signup
 * (Also reachable at /api/notify-admin-verified-signup via vercel.json rewrite.)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { createServiceSupabase, firstEnv } from "./_communications.js"

const META_KEY = "verified_signup_admin_notified_at"

const DEFAULT_OPS_INBOXES = ["admin@tradesman-us.com", "admin@mail.tradesman-us.com"]

function parseAdminRecipients(): string[] {
  const raw = firstEnv("ADMIN_SIGNUP_NOTIFY_EMAIL").trim()
  if (!raw) return [...DEFAULT_OPS_INBOXES]
  const parts = raw
    .split(/[,;]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"))
  return parts.length > 0 ? [...new Set(parts)] : [...DEFAULT_OPS_INBOXES]
}

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

  const adminRecipients = parseAdminRecipients()
  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")

  if (!apiKey || !from) {
    res.status(200).json({ ok: true, notifyDisabled: true, hint: "Set RESEND_API_KEY and RESEND_FROM_EMAIL on Vercel" })
    return
  }

  /** Profile still missing (trigger lag): still email ops so signups are not silent. */
  if (!profile) {
    const emailStr = String(u.email ?? "")
    const text = [
      "A user verified their email in Supabase, but no profiles row was found yet after retries.",
      "Check trigger / complete-signup and profiles table.",
      "",
      `Auth email: ${emailStr}`,
      `User id: ${u.id}`,
    ].join("\n")
    try {
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: adminRecipients,
          subject: `Email verified — profile missing: ${emailStr || u.id}`,
          text,
        }),
      })
      if (!sendRes.ok) {
        const t = await sendRes.text()
        console.error("[notify-admin-verified-signup] Resend (no profile)", sendRes.status, t)
        res.status(502).json({ error: "Resend rejected the send" })
        return
      }
      console.info("[notify-admin-verified-signup] emailed (profile pending)", { to: adminRecipients, userId: u.id })
    } catch (e) {
      console.error("[notify-admin-verified-signup]", e instanceof Error ? e.message : e)
      res.status(502).json({ error: "Resend request failed" })
      return
    }
    res.status(200).json({ ok: true, emailed: true, profilePending: true })
    return
  }

  const row = profile

  const signupExtras =
    row.signup_extras && typeof row.signup_extras === "object" && !Array.isArray(row.signup_extras)
      ? (row.signup_extras as Record<string, unknown>)
      : {}
  const productPackageRaw = typeof signupExtras.product_package === "string" ? signupExtras.product_package.trim() : ""
  const productPackageLabel: Record<string, string> = {
    base: "Base Package — $124.99/mo",
    office_manager_entry: "Office Manager Entry Level — $159.99/mo",
    office_manager_pro: "Office Manager Pro — $199.99/mo",
    office_manager_elite: "Office Manager Elite — $369.99/mo",
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

  let sendRes: Response
  try {
    sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: adminRecipients,
        subject: `Email verified — new user: ${displayStr} (${emailStr})`,
        text,
      }),
    })
  } catch (e) {
    console.error("[notify-admin-verified-signup]", e instanceof Error ? e.message : e)
    res.status(502).json({ error: "Resend request failed" })
    return
  }

  if (!sendRes.ok) {
    const t = await sendRes.text()
    console.error("[notify-admin-verified-signup] Resend", sendRes.status, t)
    res.status(502).json({ error: "Resend rejected the send" })
    return
  }

  meta[META_KEY] = new Date().toISOString()
  const { error: upErr } = await service.from("profiles").update({ metadata: meta }).eq("id", u.id)
  if (upErr) {
    console.error("[notify-admin-verified-signup] metadata", upErr.message)
    res.status(500).json({ error: upErr.message })
    return
  }

  console.info("[notify-admin-verified-signup] emailed", { to: adminRecipients, userId: u.id })
  res.status(200).json({ ok: true, emailed: true })
}
