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

const ACCOUNT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeDomainInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "")
}

function requestedAccountId(req: VercelRequest): string | null {
  const q = req.query?.accountId
  if (typeof q === "string" && ACCOUNT_UUID_RE.test(q.trim())) return q.trim()
  const body = (req.body ?? {}) as Record<string, unknown>
  if (typeof body.accountId === "string" && ACCOUNT_UUID_RE.test(body.accountId.trim())) return body.accountId.trim()
  return null
}

async function resolveManagedAccountId(
  service: ReturnType<typeof createServiceSupabase>,
  authUserId: string,
  req: VercelRequest,
): Promise<{ accountId: string } | { error: string; status: number }> {
  const requested = requestedAccountId(req) ?? authUserId
  if (requested === authUserId) return { accountId: requested }
  const { data: profile } = await service.from("profiles").select("role").eq("id", authUserId).maybeSingle()
  const role = typeof profile?.role === "string" ? profile.role : ""
  if (role === "admin") return { accountId: requested }
  const { data: om } = await service
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", authUserId)
    .eq("user_id", requested)
    .maybeSingle()
  if (om?.user_id) return { accountId: requested }
  return {
    error:
      "Sign in as this workspace (or as a platform admin) to add a domain. You do not need a @tradesman-us.com address first.",
    status: 403,
  }
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

type ResendDnsRecord = {
  record?: string
  name?: string
  type?: string
  value?: string
  status?: string
  priority?: number
  ttl?: string
}

export type PlatformEmailDnsRecord = {
  purpose: string
  host: string
  type: string
  value: string
  priority?: number | null
  status?: string | null
}

type ResendDomainPayload = {
  id?: string
  name?: string
  records?: ResendDnsRecord[]
  capabilities?: { sending?: string; receiving?: string }
}

function resendApiKey(): string {
  return firstEnv("RESEND_API_KEY").trim()
}

async function resendFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: unknown }> {
  const apiKey = resendApiKey()
  if (!apiKey) return { ok: false, status: 0, json: null }
  try {
    const res = await fetch(`https://api.resend.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, json }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}

function dnsHostForRegistrar(name: string, domain: string): string {
  const n = name.trim().replace(/\.$/, "")
  const d = domain.trim().toLowerCase()
  if (!n || n === "@" || n.toLowerCase() === d) return "@"
  const suffix = `.${d}`
  if (n.toLowerCase().endsWith(suffix)) {
    const host = n.slice(0, -suffix.length)
    return host || "@"
  }
  return n
}

function mapResendRecords(domain: string, records: ResendDnsRecord[] | undefined): PlatformEmailDnsRecord[] {
  const out: PlatformEmailDnsRecord[] = []
  for (const rec of records ?? []) {
    const type = String(rec.type ?? "").toUpperCase()
    const value = String(rec.value ?? "").replace(/^"|"$/g, "")
    if (!type || !value) continue
    const purpose = String(rec.record ?? type).trim() || type
    out.push({
      purpose,
      host: dnsHostForRegistrar(String(rec.name ?? "@"), domain),
      type,
      value,
      priority: typeof rec.priority === "number" ? rec.priority : null,
      status: rec.status ?? null,
    })
  }
  return out
}

function tradesmanVerifyRecord(_domain: string, token: string): PlatformEmailDnsRecord {
  return {
    purpose: "Tradesman verify",
    host: `_tradesman-verify`,
    type: "TXT",
    value: token,
    priority: null,
    status: null,
  }
}

async function getResendDomainByName(domain: string): Promise<ResendDomainPayload | null> {
  const list = await resendFetch("/domains")
  const json = list.json as { data?: ResendDomainPayload[] } | null
  const rows = Array.isArray(json?.data) ? json.data : []
  return rows.find((d) => String(d.name ?? "").toLowerCase() === domain) ?? null
}

async function getResendDomainById(id: string): Promise<ResendDomainPayload | null> {
  const got = await resendFetch(`/domains/${id}`)
  if (!got.ok || !got.json || typeof got.json !== "object") return null
  return got.json as ResendDomainPayload
}

async function ensureResendReceivingDomain(domain: string): Promise<{
  id: string
  records: PlatformEmailDnsRecord[]
} | null> {
  const created = await resendFetch("/domains", {
    method: "POST",
    body: JSON.stringify({
      name: domain,
      capabilities: { sending: "enabled", receiving: "enabled" },
    }),
  })
  let payload = created.ok && created.json && typeof created.json === "object" ? (created.json as ResendDomainPayload) : null

  if (!payload?.id) {
    const existing = await getResendDomainByName(domain)
    if (!existing?.id) return null
    await resendFetch(`/domains/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ capabilities: { sending: "enabled", receiving: "enabled" } }),
    })
    payload = (await getResendDomainById(existing.id)) ?? existing
  }

  if (!payload.id) return null
  const fresh = (await getResendDomainById(payload.id)) ?? payload
  return { id: payload.id, records: mapResendRecords(domain, fresh.records) }
}

async function domainHasMx(domain: string): Promise<boolean> {
  try {
    const rows = await dns.resolveMx(domain)
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

async function persistResendDomainId(
  service: ReturnType<typeof createServiceSupabase>,
  accountId: string,
  domain: string,
  resendDomainId: string,
): Promise<void> {
  await service
    .from("platform_custom_email_domains")
    .update({ resend_domain_id: resendDomainId })
    .eq("account_id", accountId)
    .eq("domain", domain)
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

  const managed = await resolveManagedAccountId(service, auth.userId, req)
  if ("error" in managed) {
    res.status(managed.status).json({ error: managed.error })
    return
  }

  const { data: domains, error: domErr } = await service
    .from("platform_custom_email_domains")
    .select("id, domain, status, verified_at, verification_token, resend_domain_id, created_at")
    .eq("account_id", managed.accountId)
    .order("created_at", { ascending: false })

  if (domErr) {
    res.status(500).json({ error: domErr.message })
    return
  }

  const { data: customRoutes, error: routeErr } = await service
    .from("platform_email_routes")
    .select("id, local_part, domain, route_kind, verified_at")
    .eq("account_id", managed.accountId)
    .eq("route_kind", "customer_custom")

  if (routeErr) {
    res.status(500).json({ error: routeErr.message })
    return
  }

  const { data: profile } = await service.from("profiles").select("metadata").eq("id", managed.accountId).maybeSingle()
  const meta =
    profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
      ? (profile.metadata as Record<string, unknown>)
      : {}
  const outboundRouteId = typeof meta.email_outbound_route_id === "string" ? meta.email_outbound_route_id : null

  const latest = (domains ?? [])[0] as
    | { domain?: string; verification_token?: string; resend_domain_id?: string | null }
    | undefined
  let dnsRecords: PlatformEmailDnsRecord[] = []
  let mxPresent = false
  if (latest?.domain) {
    mxPresent = await domainHasMx(latest.domain)
    if (latest.verification_token) {
      dnsRecords.push(tradesmanVerifyRecord(latest.domain, latest.verification_token))
    }
    const resendId = typeof latest.resend_domain_id === "string" ? latest.resend_domain_id.trim() : ""
    if (resendId) {
      const resendDomain = await getResendDomainById(resendId)
      dnsRecords = dnsRecords.concat(mapResendRecords(latest.domain, resendDomain?.records))
    }
  }

  res.status(200).json({
    ok: true,
    domains: domains ?? [],
    customRoutes: customRoutes ?? [],
    outboundRouteId,
    dnsRecords,
    mxPresent,
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
  const domain = normalizeDomainInput(typeof body.domain === "string" ? body.domain : "")
  if (!domain || !domain.includes(".")) {
    res.status(400).json({ error: "Enter a domain you own, e.g. sole.systems" })
    return
  }
  if (domain === "tradesman-us.com" || domain === "mail.tradesman-us.com") {
    res.status(400).json({ error: "Use Option A for @tradesman-us.com addresses." })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const managed = await resolveManagedAccountId(service, auth.userId, req)
  if ("error" in managed) {
    res.status(managed.status).json({ error: managed.error })
    return
  }

  const { data: taken } = await service
    .from("platform_custom_email_domains")
    .select("account_id")
    .eq("domain", domain)
    .neq("account_id", managed.accountId)
    .maybeSingle()
  if (taken?.account_id) {
    res.status(400).json({ error: "That domain is already registered to another Tradesman account." })
    return
  }

  const { data: existing } = await service
    .from("platform_custom_email_domains")
    .select("id, status, verification_token")
    .eq("account_id", managed.accountId)
    .eq("domain", domain)
    .maybeSingle()

  const token =
    existing?.status === "verified" && existing.verification_token
      ? String(existing.verification_token)
      : `tradesman-verify=${crypto.randomUUID().replace(/-/g, "")}`
  const status = existing?.status === "verified" ? "verified" : "pending"

  let rowId = existing?.id
  if (existing?.id) {
    const { error: upErr } = await service
      .from("platform_custom_email_domains")
      .update({
        verification_token: token,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
    if (upErr) {
      res.status(400).json({ error: upErr.message })
      return
    }
  } else {
    const { data: inserted, error: insErr } = await service
      .from("platform_custom_email_domains")
      .insert({
        account_id: managed.accountId,
        domain,
        verification_token: token,
        status: "pending",
      })
      .select("id")
      .maybeSingle()
    if (insErr) {
      res.status(400).json({ error: insErr.message })
      return
    }
    rowId = inserted?.id
  }

  const resend = await ensureResendReceivingDomain(domain)
  if (resend) {
    await persistResendDomainId(service, managed.accountId, domain, resend.id)
  }
  const mxPresent = await domainHasMx(domain)
  const dnsRecords: PlatformEmailDnsRecord[] = [tradesmanVerifyRecord(domain, token), ...(resend?.records ?? [])]

  res.status(200).json({
    ok: true,
    id: rowId,
    domain,
    verification_token: token,
    txt_host: "_tradesman-verify",
    txt_value: token,
    status,
    resendDomainId: resend?.id ?? null,
    dnsRecords,
    mxPresent,
  })
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
  const domain = normalizeDomainInput(typeof body.domain === "string" ? body.domain : "")
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

  const managed = await resolveManagedAccountId(service, auth.userId, req)
  if ("error" in managed) {
    res.status(managed.status).json({ error: managed.error })
    return
  }

  const { data: row, error: rowErr } = await service
    .from("platform_custom_email_domains")
    .select("id, domain, status, verification_token")
    .eq("account_id", managed.accountId)
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

  const resend = await ensureResendReceivingDomain(domain)
  if (resend) {
    await persistResendDomainId(service, managed.accountId, domain, resend.id)
    await resendFetch(`/domains/${resend.id}/verify`, { method: "POST" })
  }

  const { error: markErr } = await service
    .from("platform_custom_email_domains")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
  if (markErr) {
    res.status(400).json({ error: markErr.message })
    return
  }

  const dnsRecords: PlatformEmailDnsRecord[] = [tradesmanVerifyRecord(domain, token)]
  if (resend) dnsRecords.push(...resend.records)

  res.status(200).json({
    ok: true,
    verified: true,
    domain,
    status: "verified",
    resendDomainId: resend?.id ?? null,
    dnsRecords,
    mxPresent: await domainHasMx(domain),
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
  const domain = normalizeDomainInput(typeof body.domain === "string" ? body.domain : "")
  const localPart = String(body.localPart ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
  const preferForOutbound = body.preferForOutbound !== false

  if (!domain || localPart.length < 2) {
    res.status(400).json({ error: "Enter a domain and an email name (at least 2 characters)." })
    return
  }

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch {
    res.status(500).json({ error: "Service role not configured" })
    return
  }

  const managed = await resolveManagedAccountId(service, auth.userId, req)
  if ("error" in managed) {
    res.status(managed.status).json({ error: managed.error })
    return
  }

  const { data: domainRow } = await service
    .from("platform_custom_email_domains")
    .select("id, status, verified_at")
    .eq("account_id", managed.accountId)
    .eq("domain", domain)
    .maybeSingle()
  if (!domainRow || domainRow.status !== "verified") {
    res.status(400).json({
      error: "Add the DNS rows for this domain, then click Check DNS now, before using an address on it.",
    })
    return
  }

  const publicAddress = `${localPart}@${domain}`
  const { data: taken } = await service
    .from("platform_email_routes")
    .select("account_id")
    .eq("domain", domain)
    .ilike("local_part", localPart)
    .neq("account_id", managed.accountId)
    .maybeSingle()
  if (taken?.account_id) {
    res.status(400).json({ error: "That address is already taken." })
    return
  }

  const { data: existingChannels } = await service
    .from("client_communication_channels")
    .select("id, public_address")
    .eq("user_id", managed.accountId)
    .eq("channel_kind", "email")
    .eq("provider", "resend")
    .order("active", { ascending: false })
    .limit(1)

  let channelId = existingChannels?.[0]?.id as string | undefined
  if (!channelId) {
    const { data: inserted, error: chErr } = await service
      .from("client_communication_channels")
      .insert({
        user_id: managed.accountId,
        provider: "resend",
        channel_kind: "email",
        public_address: publicAddress,
        email_enabled: true,
        active: true,
        friendly_name: "Business email",
      })
      .select("id")
      .maybeSingle()
    if (chErr || !inserted?.id) {
      res.status(400).json({ error: chErr?.message || "Could not create the email inbox for this domain." })
      return
    }
    channelId = inserted.id
  }

  const { data: existingRoute } = await service
    .from("platform_email_routes")
    .select("id")
    .eq("account_id", managed.accountId)
    .eq("domain", domain)
    .eq("route_kind", "customer_custom")
    .maybeSingle()

  const verifiedAt = domainRow.verified_at ?? new Date().toISOString()
  let routeId = existingRoute?.id as string | undefined
  if (routeId) {
    const { error: routeErr } = await service
      .from("platform_email_routes")
      .update({
        local_part: localPart,
        channel_id: channelId,
        verified_at: verifiedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", routeId)
    if (routeErr) {
      res.status(400).json({ error: routeErr.message })
      return
    }
  } else {
    const { data: insertedRoute, error: routeErr } = await service
      .from("platform_email_routes")
      .insert({
        local_part: localPart,
        domain,
        route_kind: "customer_custom",
        account_id: managed.accountId,
        channel_id: channelId,
        verified_at: verifiedAt,
      })
      .select("id")
      .maybeSingle()
    if (routeErr || !insertedRoute?.id) {
      res.status(400).json({ error: routeErr?.message || "Could not save that address." })
      return
    }
    routeId = insertedRoute.id
  }

  if (preferForOutbound) {
    const { data: profile } = await service.from("profiles").select("metadata").eq("id", managed.accountId).maybeSingle()
    const prev =
      profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
        ? (profile.metadata as Record<string, unknown>)
        : {}
    await service
      .from("profiles")
      .update({ metadata: { ...prev, email_outbound_route_id: routeId } })
      .eq("id", managed.accountId)
  }

  res.status(200).json({
    ok: true,
    id: routeId,
    route_id: routeId,
    public_address: publicAddress,
    domain,
    local_part: localPart,
    prefer_for_outbound: preferForOutbound,
  })
}
