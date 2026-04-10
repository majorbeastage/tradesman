/**
 * POST /api/platform-tools?__route=notify-admin-verified-signup
 * (Also reachable at /api/notify-admin-verified-signup via vercel.json rewrite.)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { createServiceSupabase, firstEnv } from "./_communications.js"

const META_KEY = "verified_signup_admin_notified_at"

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

  const { data: profile, error: profErr } = await service
    .from("profiles")
    .select("id, email, display_name, primary_phone, address_line_1, address_city, address_state, address_zip, metadata, role")
    .eq("id", u.id)
    .maybeSingle()

  if (profErr || !profile) {
    res.status(404).json({ error: "Profile not found" })
    return
  }

  const row = profile as {
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
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {}
  if (typeof meta[META_KEY] === "string" && String(meta[META_KEY]).trim()) {
    res.status(200).json({ ok: true, alreadyNotified: true })
    return
  }

  const apiKey = firstEnv("RESEND_API_KEY")
  const from = firstEnv("RESEND_FROM_EMAIL")
  const adminTo = (firstEnv("ADMIN_SIGNUP_NOTIFY_EMAIL") || "admin@mail.tradesman-us.com").trim().toLowerCase()

  if (!apiKey || !from) {
    res.status(200).json({ ok: true, notifyDisabled: true, hint: "Set RESEND_API_KEY and RESEND_FROM_EMAIL on Vercel" })
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
        to: [adminTo],
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

  res.status(200).json({ ok: true, emailed: true })
}
