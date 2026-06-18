/**
 * Custom domain verification (Option B) — DNS TXT check + Supabase RPCs.
 * POST /api/platform-tools?__route=platform-email-domain-register
 * POST /api/platform-tools?__route=platform-email-domain-verify
 * GET  /api/platform-tools?__route=platform-email-domain-status
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { promises as dns } from "node:dns"
import { createServiceSupabase, firstEnv } from "./_communications.js"

async function resolveAuthedUserId(req: VercelRequest): Promise<{ userId: string } | { error: string; status: number }> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing authorization", status: 401 }
  }
  const supabaseUrl = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "")
  const anonKey = firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
  if (!supabaseUrl || !anonKey) {
    return { error: "Missing Supabase URL/anon key", status: 500 }
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const token = authHeader.slice("Bearer ".length).trim()
  const { data, error } = await userClient.auth.getUser(token)
  if (error || !data.user) {
    return { error: "Invalid session", status: 401 }
  }
  return { userId: data.user.id }
}

async function txtRecordsContainToken(host: string, token: string): Promise<boolean> {
  try {
    const rows = await dns.resolveTxt(host)
    const joined = rows.map((r) => r.join("")).join("")
    if (joined.includes(token)) return true
    return rows.flat().some((s) => s.includes(token))
  } catch {
    return false
  }
}

async function domainTxtVerified(domain: string, token: string): Promise<boolean> {
  const hosts = [`_tradesman-verify.${domain}`, domain]
  for (const host of hosts) {
    if (await txtRecordsContainToken(host, token)) return true
  }
  return false
}

async function tryRegisterResendDomain(domain: string): Promise<string | null> {
  const apiKey = firstEnv("RESEND_API_KEY").trim()
  if (!apiKey) return null
  try {
    const res = await fetch("https://api.resend.com/domains", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { id?: string }
    return typeof json.id === "string" ? json.id : null
  } catch {
    return null
  }
}

export async function handlePlatformEmailDomainStatus(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await resolveAuthedUserId(req)
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const { data: domains, error: domErr } = await service
    .from("platform_custom_email_domains")
    .select("id, domain, status, verified_at, verification_token, resend_domain_id, created_at")
    .eq("account_id", auth.userId)
    .order("created_at", { ascending: false })

  if (domErr) {
    res.status(500).json({ error: domErr.message })
    return
  }

  const { data: customRoutes, error: routeErr } = await service
    .from("platform_email_routes")
    .select("id, local_part, domain, route_kind, verified_at")
    .eq("account_id", auth.userId)
    .eq("route_kind", "customer_custom")

  if (routeErr) {
    res.status(500).json({ error: routeErr.message })
    return
  }

  const { data: profile } = await service.from("profiles").select("metadata").eq("id", auth.userId).maybeSingle()
  const meta =
    profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
      ? (profile.metadata as Record<string, unknown>)
      : {}
  const outboundRouteId = typeof meta.email_outbound_route_id === "string" ? meta.email_outbound_route_id : null

  res.status(200).json({
    ok: true,
    domains: domains ?? [],
    customRoutes: customRoutes ?? [],
    outboundRouteId,
  })
}

export async function handlePlatformEmailDomainRegister(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await resolveAuthedUserId(req)
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const domain = typeof body.domain === "string" ? body.domain.trim() : ""
  if (!domain) {
    res.status(400).json({ error: "domain is required" })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const { data, error } = await service.rpc("register_custom_email_domain", {
    p_account_id: auth.userId,
    p_domain: domain,
  })

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true, ...(data as Record<string, unknown>) })
}

export async function handlePlatformEmailDomainVerify(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await resolveAuthedUserId(req)
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : ""
  if (!domain) {
    res.status(400).json({ error: "domain is required" })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const { data: row, error: rowErr } = await service
    .from("platform_custom_email_domains")
    .select("id, domain, status, verification_token")
    .eq("account_id", auth.userId)
    .eq("domain", domain)
    .maybeSingle()

  if (rowErr) {
    res.status(500).json({ error: rowErr.message })
    return
  }
  if (!row) {
    res.status(404).json({ error: "Domain not registered — add it first" })
    return
  }
  if (row.status === "verified") {
    res.status(200).json({ ok: true, alreadyVerified: true, domain })
    return
  }

  const token = String(row.verification_token ?? "").trim()
  if (!token) {
    res.status(500).json({ error: "Missing verification token" })
    return
  }

  const verified = await domainTxtVerified(domain, token)
  if (!verified) {
    res.status(400).json({
      error: "TXT record not found yet",
      hint: `Add a TXT record at _tradesman-verify.${domain} (or @) with value: ${token}`,
      txt_host: `_tradesman-verify`,
      txt_value: token,
    })
    return
  }

  const resendDomainId = await tryRegisterResendDomain(domain)
  if (resendDomainId) {
    await service
      .from("platform_custom_email_domains")
      .update({ resend_domain_id: resendDomainId })
      .eq("id", row.id)
  }

  const { data, error } = await service.rpc("mark_custom_email_domain_verified", {
    p_account_id: auth.userId,
    p_domain: domain,
  })

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(200).json({
    ok: true,
    verified: true,
    domain,
    resendDomainId,
    mxHint: "Point MX for this domain to Resend inbound (see Resend dashboard DNS records after domain is added).",
    ...(data as Record<string, unknown>),
  })
}

export async function handlePlatformEmailDomainClaim(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await resolveAuthedUserId(req)
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const domain = typeof body.domain === "string" ? body.domain.trim() : ""
  const localPart = typeof body.localPart === "string" ? body.localPart.trim() : ""
  const preferForOutbound = body.preferForOutbound !== false

  if (!domain || !localPart) {
    res.status(400).json({ error: "domain and localPart are required" })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const { data, error } = await service.rpc("claim_custom_email_route", {
    p_account_id: auth.userId,
    p_domain: domain,
    p_local_part: localPart,
    p_prefer_for_outbound: preferForOutbound,
  })

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true, ...(data as Record<string, unknown>) })
}
