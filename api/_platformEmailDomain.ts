/**
 * Custom domain verification (Option B) — DNS TXT check + Supabase RPCs.
 * POST /api/platform-tools?__route=platform-email-domain-register
 * POST /api/platform-tools?__route=platform-email-domain-verify
 * POST /api/platform-tools?__route=platform-email-domain-remove
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

async function resolveOrgOwnerId(
  service: ReturnType<typeof createServiceSupabase>,
  accountId: string,
): Promise<string> {
  const { data } = await service.from("profiles").select("role").eq("id", accountId).maybeSingle()
  const role = typeof data?.role === "string" ? data.role : ""
  if (role === "office_manager" || role === "corporate_management") return accountId

  const { data: link } = await service
    .from("office_manager_clients")
    .select("office_manager_id")
    .eq("user_id", accountId)
    .limit(1)
    .maybeSingle()
  if (typeof link?.office_manager_id === "string" && link.office_manager_id.trim()) {
    return link.office_manager_id.trim()
  }

  const { data: invite } = await service
    .from("team_member_invites")
    .select("account_owner_id")
    .eq("shell_profile_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (typeof invite?.account_owner_id === "string" && invite.account_owner_id.trim()) {
    return invite.account_owner_id.trim()
  }

  return accountId
}

async function actorCanManageOrgDns(
  service: ReturnType<typeof createServiceSupabase>,
  actorUserId: string,
  orgOwnerId: string,
): Promise<boolean> {
  if (actorUserId === orgOwnerId) return true
  const { data } = await service.from("profiles").select("role").eq("id", actorUserId).maybeSingle()
  return data?.role === "admin"
}

function suggestLocalPart(email: string | null | undefined, displayName: string | null | undefined): string {
  const at = String(email ?? "").indexOf("@")
  if (at > 1) {
    const slug = String(email)
      .slice(0, at)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
    if (slug.length >= 2) return slug
  }
  const name = String(displayName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return name.length >= 2 ? name : "hello"
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

function resendDomainApiKey(): string {
  return firstEnv("RESEND_DOMAINS_API_KEY", "RESEND_API_KEY").trim()
}

function resendRestrictedKeyMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null
  const rec = json as { name?: unknown; message?: unknown }
  const name = typeof rec.name === "string" ? rec.name : ""
  const message = typeof rec.message === "string" ? rec.message : ""
  if (name === "restricted_api_key" || /restricted to only send/i.test(message)) {
    return "The sending API key cannot create domains. In Resend → API Keys, create a Full access key and set it on Vercel as RESEND_DOMAINS_API_KEY. Leave RESEND_API_KEY as the send-only key."
  }
  return null
}

async function resendFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: unknown }> {
  const apiKey = resendDomainApiKey()
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

function purposeForResendRecord(rec: ResendDnsRecord, host: string): string {
  const kind = String(rec.record ?? "").trim()
  const type = String(rec.type ?? "").toUpperCase()
  const k = kind.toLowerCase()
  if (k.includes("receiv") || (type === "MX" && host === "@")) return "Receive mail in Tradesman"
  if (type === "MX") return "Send mail (bounce / SPF)"
  if (k === "spf") return "Send mail (SPF)"
  if (k === "dkim") return "Send mail (DKIM)"
  if (k === "tracking") return "Open/click tracking (optional)"
  return kind || type
}

function mapResendRecords(domain: string, records: ResendDnsRecord[] | undefined): PlatformEmailDnsRecord[] {
  const out: PlatformEmailDnsRecord[] = []
  for (const rec of records ?? []) {
    const type = String(rec.type ?? "").toUpperCase()
    const value = String(rec.value ?? "").replace(/^"|"$/g, "")
    if (!type || !value) continue
    const host = dnsHostForRegistrar(String(rec.name ?? "@"), domain)
    out.push({
      purpose: purposeForResendRecord(rec, host),
      host,
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
    purpose: "Prove you own the domain",
    host: `_tradesman-verify`,
    type: "TXT",
    value: token,
    priority: null,
    status: null,
  }
}

function mailRecordsReady(records: PlatformEmailDnsRecord[]): boolean {
  return records.some((r) => String(r.type || "").toUpperCase() === "MX")
}

async function dnsGuidance(domain: string, records: PlatformEmailDnsRecord[]) {
  return {
    dnsHostLabel: await detectDnsHostLabel(domain),
    mailRecordsReady: mailRecordsReady(records),
  }
}

async function detectDnsHostLabel(domain: string): Promise<string | null> {
  try {
    const ns = await dns.resolveNs(domain)
    const joined = ns.join(" ").toLowerCase()
    if (joined.includes("domaincontrol.com")) return "GoDaddy"
    if (joined.includes("cloudflare")) return "Cloudflare"
    if (joined.includes("awsdns")) return "Amazon Route 53"
    if (joined.includes("googledomains") || joined.includes("ns.google") || joined.includes("google.com")) {
      return "Google Domains"
    }
    if (joined.includes("registrar-servers.com") || joined.includes("namecheap")) return "Namecheap"
    if (joined.includes("squarespacedns") || joined.includes("squarespace")) return "Squarespace"
    if (joined.includes("hover.com.ns")) return "Hover"
    if (joined.includes("bluehost")) return "Bluehost"
    if (joined.includes("hostgator")) return "HostGator"
    if (joined.includes("ionos")) return "IONOS"
    if (joined.includes("porkbun") || joined.includes("curi.land")) return "Porkbun"
    if (joined.includes("digitalocean")) return "DigitalOcean"
    if (joined.includes("wixdns") || joined.includes("wix.com")) return "Wix"
    return null
  } catch {
    return null
  }
}

function resendErrorMessage(json: unknown, fallback: string): string {
  const restricted = resendRestrictedKeyMessage(json)
  if (restricted) return restricted
  if (json && typeof json === "object") {
    const message = (json as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message.trim()
  }
  return fallback
}

function resendAlreadyExists(status: number, json: unknown): boolean {
  const message = resendErrorMessage(json, "").toLowerCase()
  return status === 409 || message.includes("already") || message.includes("exists")
}

async function listAllResendDomains(): Promise<ResendDomainPayload[]> {
  const out: ResendDomainPayload[] = []
  let after: string | undefined
  for (let page = 0; page < 20; page++) {
    const path = after ? `/domains?limit=100&after=${encodeURIComponent(after)}` : "/domains?limit=100"
    const list = await resendFetch(path)
    const json = list.json as { data?: ResendDomainPayload[]; has_more?: boolean } | null
    const rows = Array.isArray(json?.data) ? json.data : []
    if (!list.ok && page === 0 && !after) {
      const fallback = await resendFetch("/domains")
      const raw = fallback.json as { data?: ResendDomainPayload[] } | null
      return Array.isArray(raw?.data) ? raw.data : []
    }
    out.push(...rows)
    if (!json?.has_more || rows.length === 0) break
    const lastId = rows[rows.length - 1]?.id
    if (!lastId) break
    after = lastId
  }
  return out
}

async function getResendDomainByName(domain: string): Promise<ResendDomainPayload | null> {
  const rows = await listAllResendDomains()
  return rows.find((d) => String(d.name ?? "").toLowerCase() === domain) ?? null
}

function asResendDomain(json: unknown): ResendDomainPayload | null {
  if (!json || typeof json !== "object") return null
  const rec = json as ResendDomainPayload & { data?: ResendDomainPayload }
  if (typeof rec.id === "string" && rec.id.trim()) return rec
  if (rec.data && typeof rec.data.id === "string" && rec.data.id.trim()) return rec.data
  return null
}

async function getResendDomainById(id: string): Promise<ResendDomainPayload | null> {
  const got = await resendFetch(`/domains/${id}`)
  if (!got.ok) return null
  return asResendDomain(got.json)
}

type EnsureResendResult = {
  id: string | null
  records: PlatformEmailDnsRecord[]
  error: string | null
}

async function createResendDomain(domain: string, withReceiving: boolean) {
  return resendFetch("/domains", {
    method: "POST",
    body: JSON.stringify(
      withReceiving
        ? { name: domain, capabilities: { sending: "enabled", receiving: "enabled" } }
        : { name: domain },
    ),
  })
}

async function ensureResendReceivingDomain(domain: string): Promise<EnsureResendResult> {
  if (!resendDomainApiKey()) {
    return {
      id: null,
      records: [],
      error:
        "Set RESEND_DOMAINS_API_KEY on Vercel to a Resend Full access key (the send-only RESEND_API_KEY cannot create domains).",
    }
  }

  let payload: ResendDomainPayload | null = null
  let lastError: string | null = null

  const createdReceiving = await createResendDomain(domain, true)
  if (createdReceiving.ok) {
    payload = asResendDomain(createdReceiving.json)
  }
  if (!payload?.id) {
    lastError = resendErrorMessage(createdReceiving.json, `Resend could not add this domain (${createdReceiving.status}).`)
    if (resendAlreadyExists(createdReceiving.status, createdReceiving.json) || createdReceiving.status >= 400) {
      const existing = await getResendDomainByName(domain)
      if (existing?.id) payload = existing
    }
  }

  if (!payload?.id) {
    const createdPlain = await createResendDomain(domain, false)
    if (createdPlain.ok) {
      payload = asResendDomain(createdPlain.json)
      if (payload?.id) lastError = null
    } else if (resendAlreadyExists(createdPlain.status, createdPlain.json)) {
      const existing = await getResendDomainByName(domain)
      if (existing?.id) {
        payload = existing
        lastError = null
      } else {
        lastError = resendErrorMessage(createdPlain.json, lastError || `Resend could not add this domain (${createdPlain.status}).`)
      }
    } else {
      lastError = resendErrorMessage(createdPlain.json, lastError || `Resend could not add this domain (${createdPlain.status}).`)
    }
  }

  if (!payload?.id) {
    console.error("[platform-email-domain] Resend domain create failed", lastError)
    return { id: null, records: [], error: lastError || "Could not add this domain in Resend." }
  }

  await resendFetch(`/domains/${payload.id}`, {
    method: "PATCH",
    body: JSON.stringify({ capabilities: { sending: "enabled", receiving: "enabled" } }),
  })

  const fresh = (await getResendDomainById(payload.id)) ?? payload
  const records = mapResendRecords(domain, fresh.records?.length ? fresh.records : payload.records)
  if (records.length === 0) {
    return {
      id: payload.id,
      records,
      error: "Resend accepted the domain but has not returned MX/SPF/DKIM rows yet. Refresh this page in a minute.",
    }
  }
  return { id: payload.id, records, error: null }
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

  const orgOwnerId = await resolveOrgOwnerId(service, managed.accountId)
  const canManageDns = await actorCanManageOrgDns(service, auth.userId, orgOwnerId)

  const { data: domains, error: domErr } = await service
    .from("platform_custom_email_domains")
    .select("id, domain, status, verified_at, verification_token, resend_domain_id, created_at")
    .eq("account_id", orgOwnerId)
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

  const { data: profile } = await service
    .from("profiles")
    .select("metadata, email, display_name")
    .eq("id", managed.accountId)
    .maybeSingle()
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
  let resendError: string | null = null
  if (latest?.domain && canManageDns) {
    mxPresent = await domainHasMx(latest.domain)
    if (latest.verification_token) {
      dnsRecords.push(tradesmanVerifyRecord(latest.domain, latest.verification_token))
    }
    const resendId = typeof latest.resend_domain_id === "string" ? latest.resend_domain_id.trim() : ""
    let resendRecords: PlatformEmailDnsRecord[] = []
    if (resendId) {
      const resendDomain = await getResendDomainById(resendId)
      resendRecords = mapResendRecords(latest.domain, resendDomain?.records)
    }
    if (!mailRecordsReady(resendRecords)) {
      const ensured = await ensureResendReceivingDomain(latest.domain)
      if (ensured.id) await persistResendDomainId(service, orgOwnerId, latest.domain, ensured.id)
      if (ensured.records.length) resendRecords = ensured.records
      resendError = ensured.error
    }
    dnsRecords = dnsRecords.concat(resendRecords)
  }

  const publicDomains = (domains ?? []).map((row) => {
    const rec = row as { id?: string; domain?: string; status?: string; verified_at?: string | null; verification_token?: string }
    if (canManageDns) return rec
    return {
      id: rec.id,
      domain: rec.domain,
      status: rec.status,
      verified_at: rec.verified_at ?? null,
    }
  })

  res.status(200).json({
    ok: true,
    domains: publicDomains,
    customRoutes: customRoutes ?? [],
    outboundRouteId,
    orgOwnerId,
    canManageDns,
    suggestedLocalPart: suggestLocalPart(
      typeof profile?.email === "string" ? profile.email : "",
      typeof profile?.display_name === "string" ? profile.display_name : "",
    ),
    dnsRecords,
    mxPresent,
    resendError,
    ...(latest?.domain && canManageDns
      ? await dnsGuidance(latest.domain, dnsRecords)
      : { dnsHostLabel: null, mailRecordsReady: mailRecordsReady(dnsRecords) }),
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

  const orgOwnerId = await resolveOrgOwnerId(service, managed.accountId)
  if (!(await actorCanManageOrgDns(service, auth.userId, orgOwnerId))) {
    res.status(403).json({
      error: "Ask your office manager to connect the company domain. You can pick your name before @ after it is verified.",
    })
    return
  }

  const { data: taken } = await service
    .from("platform_custom_email_domains")
    .select("account_id")
    .eq("domain", domain)
    .neq("account_id", orgOwnerId)
    .maybeSingle()
  if (taken?.account_id) {
    res.status(400).json({ error: "That domain is already registered to another Tradesman account." })
    return
  }

  const { data: existing } = await service
    .from("platform_custom_email_domains")
    .select("id, status, verification_token")
    .eq("account_id", orgOwnerId)
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
        account_id: orgOwnerId,
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
  if (resend.id) {
    await persistResendDomainId(service, orgOwnerId, domain, resend.id)
  }
  const mxPresent = await domainHasMx(domain)
  const dnsRecords: PlatformEmailDnsRecord[] = [tradesmanVerifyRecord(domain, token), ...resend.records]

  res.status(200).json({
    ok: true,
    id: rowId,
    domain,
    verification_token: token,
    txt_host: "_tradesman-verify",
    txt_value: token,
    status,
    resendDomainId: resend.id,
    resendError: resend.error,
    dnsRecords,
    mxPresent,
    ...(await dnsGuidance(domain, dnsRecords)),
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

  const orgOwnerId = await resolveOrgOwnerId(service, managed.accountId)
  if (!(await actorCanManageOrgDns(service, auth.userId, orgOwnerId))) {
    res.status(403).json({ error: "Ask your office manager to finish connecting the company domain." })
    return
  }

  const { data: row, error: rowErr } = await service
    .from("platform_custom_email_domains")
    .select("id, domain, status, verification_token")
    .eq("account_id", orgOwnerId)
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
  const token = String(row.verification_token ?? "").trim()
  if (!token) {
    res.status(500).json({ error: "Missing verification token" })
    return
  }

  const alreadyVerified = row.status === "verified"
  if (!alreadyVerified) {
    const verified = await domainTxtVerified(domain, token)
    if (!verified) {
      res.status(400).json({
        error: "Those DNS records are not visible yet. Add every row at your DNS provider, wait a few minutes, and check again.",
        hint: `The ownership TXT is at host _tradesman-verify with value: ${token}`,
        txt_host: `_tradesman-verify`,
        txt_value: token,
      })
      return
    }
  }

  const resend = await ensureResendReceivingDomain(domain)
  if (resend.id) {
    await persistResendDomainId(service, orgOwnerId, domain, resend.id)
    await resendFetch(`/domains/${resend.id}/verify`, { method: "POST" })
  }

  if (!alreadyVerified) {
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
  }

  const dnsRecords: PlatformEmailDnsRecord[] = [tradesmanVerifyRecord(domain, token), ...resend.records]

  res.status(200).json({
    ok: true,
    verified: true,
    alreadyVerified,
    domain,
    status: "verified",
    resendDomainId: resend.id,
    resendError: resend.error,
    dnsRecords,
    mxPresent: await domainHasMx(domain),
    ...(await dnsGuidance(domain, dnsRecords)),
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

  const orgOwnerId = await resolveOrgOwnerId(service, managed.accountId)
  const { data: domainRow } = await service
    .from("platform_custom_email_domains")
    .select("id, account_id, status, verified_at")
    .eq("domain", domain)
    .eq("status", "verified")
    .maybeSingle()
  if (!domainRow || domainRow.status !== "verified") {
    res.status(400).json({
      error: "Ask your office manager to add the DNS records and verify the company domain first.",
    })
    return
  }
  const domainOwnerId = typeof domainRow.account_id === "string" ? domainRow.account_id : ""
  if (domainOwnerId && domainOwnerId !== orgOwnerId && domainOwnerId !== managed.accountId) {
    res.status(403).json({ error: "This domain belongs to another organization." })
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

  const { data: existingCustomChannel } = await service
    .from("client_communication_channels")
    .select("id, public_address")
    .eq("user_id", managed.accountId)
    .eq("channel_kind", "email")
    .eq("provider", "resend")
    .ilike("public_address", publicAddress)
    .maybeSingle()

  let channelId = existingCustomChannel?.id as string | undefined
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

export async function handlePlatformEmailDomainRemove(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  const orgOwnerId = await resolveOrgOwnerId(service, managed.accountId)
  if (!(await actorCanManageOrgDns(service, auth.userId, orgOwnerId))) {
    res.status(403).json({ error: "Ask your office manager if this domain needs to be removed." })
    return
  }

  const { data: row } = await service
    .from("platform_custom_email_domains")
    .select("id, account_id")
    .eq("domain", domain)
    .maybeSingle()
  if (!row?.id) {
    res.status(200).json({ ok: true, removed: domain, alreadyGone: true })
    return
  }
  if (row.account_id !== orgOwnerId && row.account_id !== managed.accountId) {
    res.status(403).json({ error: "This domain belongs to another organization." })
    return
  }

  const { error: delErr } = await service.from("platform_custom_email_domains").delete().eq("id", row.id)
  if (delErr) {
    res.status(400).json({ error: delErr.message })
    return
  }

  res.status(200).json({ ok: true, removed: domain })
}
