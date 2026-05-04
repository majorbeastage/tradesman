/**
 * Merged serverless routes (Hobby-friendly): public lead capture, AI thread summary, Helcim.js return, etc.
 * POST /api/platform-tools?__route=public-lead
 * POST /api/platform-tools?__route=ai-summarize  (Authorization: Bearer <supabase jwt>)
 * POST /api/platform-tools?__route=notify-admin-verified-signup  (Bearer jwt; merged route — saves a Vercel function slot)
 * POST /api/platform-tools?__route=billing-portal-config  — Helcim pay URL from Vercel env (rewrite: /api/billing-portal-config)
 * POST /api/platform-tools?__route=ai-summarize-customer-event — AI summary for communication up to an event (Bearer JWT)
 * POST /api/platform-tools?__route=helcim-js-return  — Helcim.js iframe POST (also routed as /api/helcim-js-return via vercel.json rewrite)
 * GET  /api/platform-tools?__route=sms-consent  — static SMS consent HTML (bundled public/sms-consent.html; legacy)
 * GET  /api/platform-tools?__route=legal-html&page=privacy|terms|sms  — HTML from platform_settings (crawlable; no JS)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  ensureOpenLeadForInbound,
  firstEnv,
  getOrCreateCustomerByEmail,
  getOrCreateCustomerByPhone,
  normalizePhone,
  pickFirstString,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"
import {
  buildLeadConsumerAutoReplyText,
  openAiText,
  parseLeadsSettingsFromMetadata,
  runLeadCaptureSideEffects,
} from "./_leadAutomation.js"
import { handleNotifyAdminVerifiedSignup } from "./_notifyAdminVerifiedSignup.js"
import { evaluateAndPersistCustomerFit, evaluateAndPersistLeadFit } from "./_leadFitClassification.js"
import { handleBillingPortalConfigVercel } from "./_billingPortalConfigVercel.js"
import { renderPublicLegalHtmlPage } from "./_renderPublicLegalHtml.js"

/** Helcim.js posts application/x-www-form-urlencoded to this handler (merged to save a Vercel function slot). */
function parseHelcimJsUrlEncodedBody(req: VercelRequest): Record<string, string> {
  const raw = req.body as unknown
  if (raw == null || raw === "") return {}
  if (Buffer.isBuffer(raw)) {
    return Object.fromEntries(new URLSearchParams(raw.toString("utf8")))
  }
  if (typeof raw === "string") {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v
      else if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0]
    }
    return out
  }
  return {}
}

function pickHelcimField(fields: Record<string, string>, key: string): string {
  const v = fields[key]
  return typeof v === "string" ? v : ""
}

function handleHelcimJsReturn(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST, OPTIONS").json({ error: "Method not allowed" })
    return
  }
  const fields = parseHelcimJsUrlEncodedBody(req)
  const responseRaw = pickHelcimField(fields, "response")
  const responseNum = responseRaw === "" ? null : Number(responseRaw)
  const payload = {
    source: "tradesman-helcim-js" as const,
    response: Number.isFinite(responseNum as number) ? (responseNum as number) : null,
    responseMessage: pickHelcimField(fields, "responseMessage"),
    noticeMessage: pickHelcimField(fields, "noticeMessage"),
    transactionId: pickHelcimField(fields, "transactionId"),
    type: pickHelcimField(fields, "type"),
    amount: pickHelcimField(fields, "amount"),
    currency: pickHelcimField(fields, "currency"),
    cardType: pickHelcimField(fields, "cardType"),
    cardExpiry: pickHelcimField(fields, "cardExpiry"),
    cardNumberMasked: pickHelcimField(fields, "cardNumber"),
    cardToken: pickHelcimField(fields, "cardToken"),
    approvalCode: pickHelcimField(fields, "approvalCode"),
    orderNumber: pickHelcimField(fields, "orderNumber"),
    customerCode: pickHelcimField(fields, "customerCode"),
    date: pickHelcimField(fields, "date"),
    time: pickHelcimField(fields, "time"),
  }
  const json = JSON.stringify(payload).replace(/</g, "\\u003c")
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex"/><title>Payment result</title></head>
<body><script>
(function(){
  try {
    var p = ${json};
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(p, "*");
    }
  } catch (e) {}
})();
<\/script></body></html>`
  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").setHeader("Cache-Control", "no-store").send(html)
}

function loadSmsConsentHtml(): string {
  const candidates = [
    join(process.cwd(), "public", "sms-consent.html"),
    join(process.cwd(), "dist", "sms-consent.html"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8")
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>SMS consent</title></head><body><p>SMS consent document is not deployed. Ensure public/sms-consent.html exists and vercel.json includes it in api/platform-tools.ts includeFiles.</p></body></html>`
}

/** Crawler-friendly legal HTML shipped under `public/` (same content family as SPA defaults). */
function loadPublicLegalHtml(fileBaseName: string): string {
  const candidates = [
    join(process.cwd(), "public", `${fileBaseName}.html`),
    join(process.cwd(), "dist", `${fileBaseName}.html`),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8")
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${fileBaseName}</title></head><body><p>Legal document ${fileBaseName}.html is not deployed.</p></body></html>`
}

/** Parse JSON POST body (Vercel may deliver `Buffer` or a pre-parsed object). */
function bodyAsRecord(req: VercelRequest): Record<string, unknown> {
  const raw = req.body as unknown
  if (raw == null || raw === "") return {}
  if (Buffer.isBuffer(raw)) {
    try {
      const v = JSON.parse(raw.toString("utf8")) as unknown
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw || "{}") as unknown
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

function resolveSupabasePublicForUserJwt(req: VercelRequest): { supabaseUrl: string; anonKey: string } {
  const rec = bodyAsRecord(req)
  const fromBodyUrl = typeof rec.supabaseUrl === "string" ? rec.supabaseUrl.trim() : ""
  const fromBodyAnon = typeof rec.supabaseAnonKey === "string" ? rec.supabaseAnonKey.trim() : ""
  const supabaseUrl = (pickSupabaseUrlForServer() || fromBodyUrl || "").replace(/\/+$/, "")
  const anonKey = pickSupabaseAnonKeyForServer() || fromBodyAnon || ""
  return { supabaseUrl, anonKey }
}

/**
 * RLS-bound client using the caller's JWT. Used when the server has no service role key
 * (e.g. Vercel missing SUPABASE_SERVICE_ROLE_KEY) but URL + anon are available.
 */
function createUserJwtSupabaseClient(req: VercelRequest): SupabaseClient | null {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) return null
  const { supabaseUrl, anonKey } = resolveSupabasePublicForUserJwt(req)
  if (!supabaseUrl || !anonKey) return null
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Verify Supabase JWT; returns userId or null + optional error response writer. */
async function getUserIdFromBearer(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ userId: string } | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization" })
    return null
  }
  const token = authHeader.slice("Bearer ".length).trim()
  const { supabaseUrl, anonKey } = resolveSupabasePublicForUserJwt(req)
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({
      error:
        "Missing Supabase URL/anon key on server. Set SUPABASE_URL + SUPABASE_ANON_KEY (or VITE_*) on Vercel, or the app will send supabaseUrl + supabaseAnonKey in the JSON body.",
    })
    return null
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    res.status(401).json({ error: "Invalid session" })
    return null
  }
  return { userId: userData.user.id }
}

/**
 * Draft estimate legal + cancellation language. Does not honor ai_assistant_visible (estimate workflow).
 * POST body: { businessName?: string }
 */
async function handleEstimateLegalDraft(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await getUserIdFromBearer(req, res)
  if (!auth) return
  const body = jsonBody(req)
  const businessName = pickFirstString(body.businessName).slice(0, 200)

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    const label = businessName || "Home services contractor"
    const legalText =
      `ESTIMATE / PROPOSAL ACKNOWLEDGMENT\n\n` +
      `This estimate is prepared for ${label}. It summarizes the proposed scope of work and pricing and is not a final contract unless both parties execute a separate written agreement.\n\n` +
      `Customer acknowledges review of line items, quantities, and pricing shown in this estimate. Any additional work or changes should be approved in writing before execution.\n\n` +
      `This language is a starting point only and should be reviewed by your attorney for your state and trade.`
    const cancellationText =
      `Cancellation: If the customer cancels after accepting this estimate, a cancellation fee of up to 25% of the quoted total may apply for scheduling, ordered materials, or work performed, as permitted by law. Customize with your attorney.`
    res.status(200).json({ ok: true, legalText, cancellationText, fallback: true })
    return
  }

  const raw =
    (await openAiText(
      "You help home-service contractors in the US. Reply with a single JSON object only, keys: legal (string, plain text, 2-4 short paragraphs for an estimate acknowledgment / lite pre-contract terms, not legal advice), cancellation (string, one short paragraph on typical cancellation fee language, must say customize with attorney). No markdown. Escape quotes properly in JSON.",
      `Business: ${businessName || "Home services contractor"}. Draft estimate acknowledgment text plus optional cancellation fee paragraph.`,
    ))?.trim() ?? ""

  let legalText = ""
  let cancellationText = ""
  try {
    const j = JSON.parse(raw) as { legal?: string; cancellation?: string }
    legalText = typeof j.legal === "string" ? j.legal : ""
    cancellationText = typeof j.cancellation === "string" ? j.cancellation : ""
  } catch {
    legalText = raw
  }
  res.status(200).json({ ok: true, legalText, cancellationText })
}

/**
 * Background estimate review (math + consistency). Does not honor ai_assistant_visible.
 * POST body: { quoteId: string, lines: { description?: string; quantity?: number; unit_price?: number }[] }
 */
async function handleQuoteEstimateReview(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await getUserIdFromBearer(req, res)
  if (!auth) return
  const { userId } = auth

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const body = jsonBody(req)
  const quoteId = pickFirstString(body.quoteId).trim()
  const linesRaw = body.lines
  if (!quoteId) {
    res.status(400).json({ error: "quoteId required" })
    return
  }

  const { data: quote, error: qErr } = await service.from("quotes").select("id, user_id").eq("id", quoteId).maybeSingle()
  const qr = quote as { id: string; user_id: string } | null
  if (qErr || !qr || qr.user_id !== userId) {
    res.status(404).json({ error: "Quote not found" })
    return
  }

  const lines = Array.isArray(linesRaw) ? linesRaw : []
  const normalized = lines
    .map((row) => {
      const o = row as Record<string, unknown>
      const q = typeof o.quantity === "number" ? o.quantity : Number.parseFloat(String(o.quantity ?? 0)) || 0
      const p = typeof o.unit_price === "number" ? o.unit_price : Number.parseFloat(String(o.unit_price ?? 0)) || 0
      const d = String(o.description ?? o.item_description ?? "").slice(0, 500)
      const ltRaw = o.lineTotal ?? o.line_total
      const lt =
        typeof ltRaw === "number"
          ? ltRaw
          : typeof ltRaw === "string"
            ? Number.parseFloat(ltRaw)
            : Number.NaN
      const lineTotal = Number.isFinite(lt) ? lt : q * p
      return { description: d, quantity: q, unit_price: p, lineTotal }
    })
    .filter((x) => x.description.trim() || x.lineTotal !== 0 || x.quantity !== 0)

  const computedSubtotal = normalized.reduce((s, x) => s + x.lineTotal, 0)

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    res.status(200).json({
      ok: true,
      computedSubtotal,
      issues: [],
      note: "OpenAI not configured; subtotal computed locally only.",
    })
    return
  }

  const pack = JSON.stringify({
    lines: normalized,
    computedSubtotal: Math.round(computedSubtotal * 100) / 100,
  }).slice(0, 12000)

  const raw =
    (await openAiText(
      "You review residential/commercial service estimates. Reply with JSON only: {\"issues\": string[] (max 6 short plain-English tips: missing labor, travel, materials, unclear qty, etc. Empty if nothing to flag), \"agreesWithSubtotal\": boolean}. No markdown.",
      pack,
    ))?.trim() ?? "{}"

  let issues: string[] = []
  let agreesWithSubtotal = true
  try {
    const j = JSON.parse(raw) as { issues?: unknown; agreesWithSubtotal?: boolean }
    if (Array.isArray(j.issues)) {
      issues = j.issues.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 6)
    }
    agreesWithSubtotal = j.agreesWithSubtotal !== false
  } catch {
    issues = []
  }

  res.status(200).json({ ok: true, computedSubtotal, issues, agreesWithSubtotal })
}

type ScopeLineSuggestion = {
  description: string
  quantity: number
  unit_price: number
  rationale?: string
}

/**
 * Turn free-form scope text into suggested quote lines (JSON). OPENAI_API_KEY required for non-fallback.
 * POST body: { scopeText: string, tradeHint?: string, existingLines?: { description: string; quantity: number; unit_price: number }[] }
 */
async function handleEstimateScopeLines(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await getUserIdFromBearer(req, res)
  if (!auth) return

  const body = jsonBody(req)
  const scopeText = pickFirstString(body.scopeText).slice(0, 8000)
  const tradeHint = pickFirstString(body.tradeHint).slice(0, 200)
  const linesRaw = body.existingLines
  const existingLines = Array.isArray(linesRaw)
    ? linesRaw
        .map((row) => {
          const o = row as Record<string, unknown>
          const q = typeof o.quantity === "number" ? o.quantity : Number.parseFloat(String(o.quantity ?? 0)) || 0
          const p = typeof o.unit_price === "number" ? o.unit_price : Number.parseFloat(String(o.unit_price ?? 0)) || 0
          const d = String(o.description ?? "").slice(0, 400)
          return { description: d, quantity: q, unit_price: p }
        })
        .filter((x) => x.description.trim())
        .slice(0, 40)
    : []

  if (!scopeText.trim()) {
    res.status(400).json({ error: "scopeText required" })
    return
  }

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    res.status(200).json({
      ok: true,
      suggestions: [] as ScopeLineSuggestion[],
      clarifications: ["Connect OpenAI on the server (OPENAI_API_KEY) to generate line suggestions from your scope."],
      fallback: true,
    })
    return
  }

  const pack = JSON.stringify({
    scope: scopeText,
    trade: tradeHint || "residential / commercial contractor",
    existingLines,
  }).slice(0, 12000)

  const raw =
    (await openAiText(
      `You help contractors build estimate line items from a spoken or written job scope.
Reply with JSON only, no markdown:
{"suggestions":[{"description":"string","quantity":number,"unit_price":number,"rationale":"optional short note"}],"clarifications":["optional questions — max 4 short strings when critical info is missing"]}
Rules: Max 12 suggestions. quantity >= 0, unit_price >= 0 (USD typical installed/labor guess for US trades; use 0 if unknown and explain in rationale). Descriptions are concise trade language.`,
      pack,
    ))?.trim() ?? "{}"

  let suggestions: ScopeLineSuggestion[] = []
  let clarifications: string[] = []
  try {
    const j = JSON.parse(raw) as {
      suggestions?: unknown
      clarifications?: unknown
    }
    if (Array.isArray(j.suggestions)) {
      for (const row of j.suggestions.slice(0, 14)) {
        if (!row || typeof row !== "object") continue
        const o = row as Record<string, unknown>
        const description = String(o.description ?? "").trim().slice(0, 500)
        if (!description) continue
        const quantity =
          typeof o.quantity === "number" ? o.quantity : Number.parseFloat(String(o.quantity ?? 0)) || 0
        const unit_price =
          typeof o.unit_price === "number" ? o.unit_price : Number.parseFloat(String(o.unit_price ?? 0)) || 0
        const rationale = typeof o.rationale === "string" ? o.rationale.slice(0, 400) : ""
        suggestions.push({
          description,
          quantity: Math.max(0, quantity),
          unit_price: Math.max(0, unit_price),
          ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
        })
      }
    }
    if (Array.isArray(j.clarifications)) {
      clarifications = j.clarifications
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.slice(0, 400))
        .slice(0, 4)
    }
  } catch {
    suggestions = []
    clarifications = []
  }

  res.status(200).json({ ok: true, suggestions, clarifications })
}

function jsonBody(req: VercelRequest): Record<string, unknown> {
  return bodyAsRecord(req)
}

async function authCanAccessLeadOwner(
  service: ReturnType<typeof createServiceSupabase>,
  authUserId: string,
  leadOwnerUserId: string,
): Promise<boolean> {
  if (authUserId === leadOwnerUserId) return true
  const { data: prof } = await service.from("profiles").select("role").eq("id", authUserId).maybeSingle()
  if ((prof as { role?: string } | null)?.role === "admin") return true
  const { data: om } = await service
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", authUserId)
    .eq("user_id", leadOwnerUserId)
    .maybeSingle()
  return !!om
}

async function authCanAccessCustomerOwner(
  service: SupabaseClient,
  authUserId: string,
  customerOwnerUserId: string,
): Promise<boolean> {
  if (authUserId === customerOwnerUserId) return true
  const { data: prof } = await service.from("profiles").select("role").eq("id", authUserId).maybeSingle()
  if ((prof as { role?: string } | null)?.role === "admin") return true
  const { data: om } = await service
    .from("office_manager_clients")
    .select("user_id")
    .eq("office_manager_id", authUserId)
    .eq("user_id", customerOwnerUserId)
    .maybeSingle()
  return !!om
}

/** Rules-first lead fit evaluation (optional force to re-run). */
async function handleLeadEvaluateFit(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await getUserIdFromBearer(req, res)
  if (!auth) return
  const { userId: actorUserId } = auth
  let service: SupabaseClient
  try {
    service = createServiceSupabase()
  } catch (e) {
    const fallback = createUserJwtSupabaseClient(req)
    if (!fallback) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
      return
    }
    service = fallback
  }
  const body = jsonBody(req)
  const leadId = pickFirstString(body.leadId).trim()
  if (!leadId) {
    res.status(400).json({ error: "leadId required" })
    return
  }
  const force = body.force === true
  const { data: row, error } = await service.from("leads").select("id,user_id").eq("id", leadId).maybeSingle()
  const l = row as { id: string; user_id: string } | null
  if (error || !l) {
    res.status(404).json({ error: "Lead not found" })
    return
  }
  if (!(await authCanAccessLeadOwner(service, actorUserId, l.user_id))) {
    res.status(404).json({ error: "Lead not found" })
    return
  }
  const result = await evaluateAndPersistLeadFit(service, leadId, { force })
  if (result == null) {
    res.status(200).json({
      ok: true,
      skipped: true,
      message: "Auto filter is off, this lead was already scored, or it is locked after a manual override.",
    })
    return
  }
  res.status(200).json({ ok: true, ...result })
}

/** Customer hub: same fit engine as leads (optional force to re-run). */
async function handleCustomerEvaluateFit(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await getUserIdFromBearer(req, res)
  if (!auth) return
  const { userId: actorUserId } = auth
  let service: SupabaseClient
  try {
    service = createServiceSupabase()
  } catch (e) {
    const fallback = createUserJwtSupabaseClient(req)
    if (!fallback) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
      return
    }
    service = fallback
  }
  const body = jsonBody(req)
  const customerId = pickFirstString(body.customerId).trim()
  if (!customerId) {
    res.status(400).json({ error: "customerId required" })
    return
  }
  const force = body.force === true
  const { data: row, error } = await service.from("customers").select("id,user_id").eq("id", customerId).maybeSingle()
  const c = row as { id: string; user_id: string } | null
  if (error || !c) {
    res.status(404).json({ error: "Customer not found" })
    return
  }
  if (!(await authCanAccessCustomerOwner(service, actorUserId, c.user_id))) {
    res.status(404).json({ error: "Customer not found" })
    return
  }
  const result = await evaluateAndPersistCustomerFit(service, customerId, { force })
  if (result == null) {
    res.status(200).json({
      ok: true,
      skipped: true,
      message: "Auto filter is off, this customer was already scored, or fit is locked after a manual override.",
    })
    return
  }
  res.status(200).json({ ok: true, ...result })
}

async function handlePublicLead(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const body = jsonBody(req)
  const honeypot = pickFirstString(body.website, body.url, body.hp)
  if (honeypot) {
    res.status(200).json({ ok: true })
    return
  }
  const slug = pickFirstString(body.slug, body.embedSlug).toLowerCase().replace(/[^a-z0-9-]/g, "")
  const name = pickFirstString(body.name, body.customerName).slice(0, 200)
  const phone = normalizePhone(pickFirstString(body.phone, body.phoneNumber))
  const email = pickFirstString(body.email).toLowerCase().slice(0, 320)
  const message = pickFirstString(body.message, body.notes).slice(0, 4000)

  if (!slug || slug.length < 3) {
    res.status(400).json({ error: "Invalid slug" })
    return
  }
  if (!phone && !email) {
    res.status(400).json({ error: "Phone or email required" })
    return
  }

  let supabase: ReturnType<typeof createServiceSupabase>
  try {
    supabase = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, embed_lead_enabled, embed_lead_slug, metadata")
    .eq("embed_lead_slug", slug)
    .maybeSingle()

  if (profErr || !profile?.id) {
    res.status(404).json({ error: "Form not found" })
    return
  }
  const row = profile as { id: string; embed_lead_enabled?: boolean; embed_lead_slug?: string; metadata?: unknown }
  if (!row.embed_lead_enabled) {
    res.status(404).json({ error: "Form not available" })
    return
  }

  const embedSettings = parseLeadsSettingsFromMetadata(row.metadata)
  if (
    embedSettings.pause_lead_capture_campaigns === "checked" ||
    embedSettings.pause_lead_captures === "checked"
  ) {
    res.status(403).json({
      error: "Lead capture campaigns are paused.",
      message:
        "This web embed is not accepting new submissions. Direct calls, SMS, and voicemail to your business numbers still create leads as usual.",
    })
    return
  }

  const userId = row.id
  let customerId: string
  try {
    if (phone) {
      const c = await getOrCreateCustomerByPhone(supabase, userId, phone)
      customerId = c.customerId
    } else {
      const c = await getOrCreateCustomerByEmail(supabase, userId, email)
      customerId = c.customerId
    }
    if (name) {
      await supabase.from("customers").update({ display_name: name }).eq("id", customerId).eq("user_id", userId)
    }
    if (email && phone) {
      const { error: ieErr } = await supabase.from("customer_identifiers").insert({
        user_id: userId,
        customer_id: customerId,
        type: "email",
        value: email,
        is_primary: false,
        verified: false,
      })
      if (ieErr && !String(ieErr.message || "").includes("duplicate")) {
        console.warn("[public-lead] email identifier", ieErr.message)
      }
    }
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Could not save customer" })
    return
  }

  const title = name ? `Web lead: ${name.slice(0, 60)}` : phone ? `Web lead: ${phone}` : `Web lead: ${email.slice(0, 40)}`
  const description = [message, email && !phone ? `Email: ${email}` : null, phone ? `Phone: ${phone}` : null]
    .filter(Boolean)
    .join("\n\n")

  let leadId: string
  try {
    leadId = await ensureOpenLeadForInbound(supabase, userId, customerId, title, description || "Submitted from embed form.")
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Could not create lead" })
    return
  }

  void runLeadCaptureSideEffects(supabase, userId, leadId, customerId, {
    title,
    description: description || "",
    phone,
    email,
    name,
  }).catch((err) => console.error("[public-lead] side effects", err instanceof Error ? err.message : err))

  res.status(200).json({ ok: true, leadId })
}

async function handleAiSummarize(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization" })
    return
  }
  const token = authHeader.slice("Bearer ".length).trim()
  const { supabaseUrl, anonKey } = resolveSupabasePublicForUserJwt(req)
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({
      error:
        "Missing Supabase URL/anon key on server. Set SUPABASE_URL + SUPABASE_ANON_KEY (or VITE_*) on Vercel, or send supabaseUrl + supabaseAnonKey in the JSON body.",
    })
    return
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    res.status(401).json({ error: "Invalid session" })
    return
  }
  const userId = userData.user.id

  /** Same access model as the SPA: JWT + anon (no service role on Vercel required for read-only summarize). */
  const userDb: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: profile } = await userDb
    .from("profiles")
    .select("ai_thread_summary_enabled, ai_assistant_visible")
    .eq("id", userId)
    .maybeSingle()
  const row = profile as { ai_thread_summary_enabled?: boolean; ai_assistant_visible?: boolean } | null
  if (row?.ai_assistant_visible === false) {
    res.status(403).json({ error: "AI automations are disabled for your account (My T)." })
    return
  }
  const aiOk = row?.ai_thread_summary_enabled === true
  if (!aiOk) {
    res.status(403).json({ error: "AI thread summary is not enabled. Turn it on under Conversations → Settings." })
    return
  }

  const body = jsonBody(req)
  const conversationId = pickFirstString(body.conversationId).trim()
  if (!conversationId) {
    res.status(400).json({ error: "conversationId required" })
    return
  }

  const { data: convo, error: convoErr } = await userDb
    .from("conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .maybeSingle()
  if (convoErr || !convo) {
    res.status(404).json({ error: "Conversation not found" })
    return
  }
  const convoRow = convo as { user_id: string }
  if (convoRow.user_id !== userId) {
    res.status(404).json({ error: "Conversation not found" })
    return
  }

  const { data: msgs } = await userDb
    .from("messages")
    .select("sender, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(80)

  const { data: evs } = await userDb
    .from("communication_events")
    .select("event_type, direction, body, subject, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(80)

  const parts: string[] = []
  for (const m of msgs || []) {
    const r = m as { sender?: string; content?: string; created_at?: string }
    parts.push(`[${r.created_at || ""}] ${r.sender || "?"}: ${(r.content || "").slice(0, 2000)}`)
  }
  for (const e of evs || []) {
    const r = e as { event_type?: string; direction?: string; body?: string; subject?: string; created_at?: string }
    const head = `${r.event_type || "event"} ${r.direction || ""} ${r.created_at || ""}`
    const text = (r.subject ? `Subject: ${r.subject}\n` : "") + (r.body || "")
    parts.push(`[${head}] ${text.slice(0, 2000)}`)
  }
  const transcript = parts.join("\n\n").slice(0, 14000)
  if (!transcript.trim()) {
    res.status(400).json({ error: "No messages or events to summarize." })
    return
  }

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    res.status(503).json({
      error: "OpenAI is not configured on the server.",
      hint: "Set OPENAI_API_KEY on Vercel for this deployment.",
    })
    return
  }

  const oa = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You summarize customer conversation threads for a home-services contractor. Output clear bullet points: what the customer wants, status, open questions, and suggested next actions. Stay under 250 words.",
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 600,
      temperature: 0.4,
    }),
  })

  const raw = await oa.text()
  if (!oa.ok) {
    res.status(502).json({ error: "OpenAI request failed", detail: raw.slice(0, 800) })
    return
  }
  let summary = ""
  try {
    const j = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    summary = j.choices?.[0]?.message?.content?.trim() || ""
  } catch {
    summary = ""
  }
  if (!summary) {
    res.status(502).json({ error: "Could not parse OpenAI response", detail: raw.slice(0, 400) })
    return
  }

  res.status(200).json({ ok: true, summary })
}

/**
 * Summarize customer communication up to a specific message or communication_event (Customers hub).
 * Body: { profileUserId?: string (scoped profile for AI prefs), communicationEventId?: string, messageId?: string, customerId?: string } — event id or (messageId + customerId).
 */
async function handleAiSummarizeCustomerCommunication(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization" })
    return
  }
  const token = authHeader.slice("Bearer ".length).trim()
  const { supabaseUrl, anonKey } = resolveSupabasePublicForUserJwt(req)
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({
      error:
        "Missing Supabase URL/anon key on server. Set SUPABASE_URL + SUPABASE_ANON_KEY (or VITE_*) on Vercel, or send supabaseUrl + supabaseAnonKey in the JSON body.",
    })
    return
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    res.status(401).json({ error: "Invalid session" })
    return
  }
  const userId = userData.user.id
  const body = jsonBody(req)
  const profileUserIdForAi = pickFirstString(body.profileUserId).trim() || userId

  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: profile } = await userDb
    .from("profiles")
    .select("ai_thread_summary_enabled, ai_assistant_visible")
    .eq("id", profileUserIdForAi)
    .maybeSingle()
  const row = profile as { ai_thread_summary_enabled?: boolean; ai_assistant_visible?: boolean } | null
  if (row?.ai_assistant_visible === false) {
    res.status(403).json({ error: "AI automations are disabled for your account (My T)." })
    return
  }
  if (row?.ai_thread_summary_enabled !== true) {
    res.status(403).json({ error: "AI thread summary is not enabled. Turn it on under Conversations → Settings." })
    return
  }

  const communicationEventId = pickFirstString(body.communicationEventId).trim()
  const messageId = pickFirstString(body.messageId).trim()
  const customerIdRaw = pickFirstString(body.customerId).trim()

  let customerId = ""
  let untilIso = ""

  if (communicationEventId) {
    const { data: ev, error: evErr } = await userDb
      .from("communication_events")
      .select("id, customer_id, conversation_id, created_at, event_type, direction, body, subject")
      .eq("id", communicationEventId)
      .maybeSingle()
    if (evErr || !ev) {
      res.status(404).json({
        error: "Communication event not found or not visible with your login.",
        hint: "If this timeline entry was synced without a customer link, open it from a conversation tied to this customer and try again.",
      })
      return
    }
    const er = ev as {
      customer_id?: string | null
      conversation_id?: string | null
      created_at?: string | null
    }
    customerId = String(er.customer_id ?? "").trim()
    untilIso = String(er.created_at ?? "").trim()
    if (!customerId && er.conversation_id) {
      const { data: convoRow } = await userDb
        .from("conversations")
        .select("customer_id")
        .eq("id", String(er.conversation_id))
        .maybeSingle()
      customerId = String((convoRow as { customer_id?: string | null } | null)?.customer_id ?? "").trim()
    }
    if (!customerId || !untilIso) {
      res.status(400).json({ error: "Event is missing customer or timestamp." })
      return
    }
  } else if (messageId && customerIdRaw) {
    customerId = customerIdRaw
    const { data: msg, error: mErr } = await userDb
      .from("messages")
      .select("id, conversation_id, sender, content, created_at")
      .eq("id", messageId)
      .maybeSingle()
    if (mErr || !msg) {
      res.status(404).json({
        error: "Message not found or not visible with your login.",
        hint: "Refresh Customers and try again; the message may have been removed.",
      })
      return
    }
    const mr = msg as { conversation_id?: string | null; created_at?: string | null }
    const convoId = String(mr.conversation_id ?? "").trim()
    untilIso = String(mr.created_at ?? "").trim()
    if (!convoId || !untilIso) {
      res.status(400).json({ error: "Message is missing conversation or timestamp." })
      return
    }
    const { data: convo } = await userDb.from("conversations").select("id, customer_id").eq("id", convoId).maybeSingle()
    const cr = convo as { customer_id?: string | null } | null
    if (!cr || String(cr.customer_id ?? "").trim() !== customerId) {
      res.status(404).json({ error: "Message does not belong to this customer." })
      return
    }
  } else {
    res.status(400).json({ error: "Provide communicationEventId or messageId and customerId." })
    return
  }

  const untilMs = Date.parse(untilIso)
  if (!Number.isFinite(untilMs)) {
    res.status(400).json({ error: "Invalid anchor time." })
    return
  }

  const { data: convos } = await userDb.from("conversations").select("id").eq("customer_id", customerId)
  const convoIds = (convos ?? []).map((c: { id: string }) => c.id).filter(Boolean)
  const parts: string[] = []

  if (convoIds.length > 0) {
    const { data: msgs } = await userDb
      .from("messages")
      .select("sender, content, created_at, conversation_id")
      .in("conversation_id", convoIds)
      .lte("created_at", untilIso)
      .order("created_at", { ascending: true })
      .limit(120)
    for (const m of msgs || []) {
      const r = m as { sender?: string; content?: string; created_at?: string }
      parts.push(`[${r.created_at || ""}] ${r.sender || "?"}: ${(r.content || "").slice(0, 2000)}`)
    }
  }

  const { data: evs } = await userDb
    .from("communication_events")
    .select("event_type, direction, body, subject, created_at")
    .eq("customer_id", customerId)
    .lte("created_at", untilIso)
    .order("created_at", { ascending: true })
    .limit(120)
  for (const e of evs || []) {
    const r = e as { event_type?: string; direction?: string; body?: string; subject?: string; created_at?: string }
    const head = `${r.event_type || "event"} ${r.direction || ""} ${r.created_at || ""}`
    const text = (r.subject ? `Subject: ${r.subject}\n` : "") + (r.body || "")
    parts.push(`[${head}] ${text.slice(0, 2000)}`)
  }

  const transcript = parts.join("\n\n").slice(0, 14000)
  if (!transcript.trim()) {
    res.status(400).json({ error: "No messages or events to summarize for this customer before this point." })
    return
  }

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    res.status(503).json({
      error: "OpenAI is not configured on the server.",
      hint: "Set OPENAI_API_KEY on Vercel for this deployment.",
    })
    return
  }

  const oa = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You summarize customer communication for a home-services contractor. Focus on what was discussed up to the anchor time: requests, commitments, blockers, and suggested next steps. Stay under 220 words. Plain sentences or short bullets.",
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 550,
      temperature: 0.35,
    }),
  })

  const raw = await oa.text()
  if (!oa.ok) {
    res.status(502).json({ error: "OpenAI request failed", detail: raw.slice(0, 800) })
    return
  }
  let summary = ""
  try {
    const j = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    summary = j.choices?.[0]?.message?.content?.trim() || ""
  } catch {
    summary = ""
  }
  if (!summary) {
    res.status(502).json({ error: "Could not parse OpenAI response", detail: raw.slice(0, 400) })
    return
  }

  res.status(200).json({ ok: true, summary })
}

async function handleAiLeadAssist(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await getUserIdFromBearer(req, res)
  if (!auth) return
  const { userId } = auth

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const body = jsonBody(req)
  const leadId = pickFirstString(body.leadId).trim()
  if (!leadId) {
    res.status(400).json({ error: "leadId required" })
    return
  }

  const { data: lead, error: leadErr } = await service
    .from("leads")
    .select("id, title, description, status, customer_id, user_id")
    .eq("id", leadId)
    .maybeSingle()
  const row = lead as { id: string; user_id: string; customer_id: string; title?: string; description?: string; status?: string } | null
  if (leadErr || !row) {
    res.status(404).json({ error: "Lead not found" })
    return
  }
  if (!(await authCanAccessLeadOwner(service, userId, row.user_id))) {
    res.status(404).json({ error: "Lead not found" })
    return
  }

  const { data: profile } = await service.from("profiles").select("ai_assistant_visible").eq("id", row.user_id).maybeSingle()
  const prof = profile as { ai_assistant_visible?: boolean } | null
  if (prof?.ai_assistant_visible === false) {
    res.status(403).json({ error: "AI automations are disabled for this account (My T)." })
    return
  }

  const { data: cust } = await service
    .from("customers")
    .select("display_name, customer_identifiers(type, value)")
    .eq("id", row.customer_id)
    .maybeSingle()

  const { data: evs } = await service
    .from("communication_events")
    .select("event_type, direction, body, subject, created_at")
    .eq("user_id", row.user_id)
    .or(`lead_id.eq.${leadId},and(customer_id.eq.${row.customer_id},conversation_id.is.null)`)
    .order("created_at", { ascending: false })
    .limit(50)

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    res.status(503).json({
      error: "OpenAI is not configured on the server.",
      hint: "Set OPENAI_API_KEY on Vercel.",
    })
    return
  }

  const pack = {
    currentTitle: row.title ?? "",
    currentDescription: row.description ?? "",
    currentStatus: row.status ?? "New",
    customer: cust,
    recentEvents: (evs || []).slice(0, 20),
  }
  const userPrompt = JSON.stringify(pack).slice(0, 12000)

  const oa = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'You help a contractor organize leads. Return a single JSON object only, no markdown, keys: suggestedTitle (string, short job headline), suggestedDescription (string, multi-sentence job details from context), suggestedStatus (exactly one of: New, Contacted, Qualified, Lost), suggestedCustomerName (string, contact name if inferable else empty), suggestedPhone (string, E.164 or raw digits if inferable else empty), suggestedEmail (string, valid email if inferable else empty), softWarnings (array of short strings, e.g. compliance reminders, empty array if none). Base suggestions on the consumer need (e.g. repair vs replace). Do not invent phone/email; only fill if clearly present in the data.',
        },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 700,
      temperature: 0.35,
      response_format: { type: "json_object" },
    }),
  })

  const raw = await oa.text()
  if (!oa.ok) {
    res.status(502).json({ error: "OpenAI request failed", detail: raw.slice(0, 800) })
    return
  }
  try {
    const j = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
    const content = j.choices?.[0]?.message?.content?.trim() || "{}"
    const parsed = JSON.parse(content) as {
      suggestedTitle?: string
      suggestedDescription?: string
      suggestedStatus?: string
      suggestedCustomerName?: string
      suggestedPhone?: string
      suggestedEmail?: string
      softWarnings?: string[]
    }
    const allowed = new Set(["New", "Contacted", "Qualified", "Lost"])
    const st = typeof parsed.suggestedStatus === "string" && allowed.has(parsed.suggestedStatus) ? parsed.suggestedStatus : row.status ?? "New"
    const emailRaw = String(parsed.suggestedEmail ?? "").trim().toLowerCase().slice(0, 320)
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : ""
    res.status(200).json({
      ok: true,
      suggestedTitle: String(parsed.suggestedTitle ?? row.title ?? "").slice(0, 500),
      suggestedDescription: String(parsed.suggestedDescription ?? row.description ?? "").slice(0, 8000),
      suggestedStatus: st,
      suggestedCustomerName: String(parsed.suggestedCustomerName ?? "").slice(0, 200),
      suggestedPhone: String(parsed.suggestedPhone ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
      suggestedEmail: emailOk,
      softWarnings: Array.isArray(parsed.softWarnings) ? parsed.softWarnings.map((s) => String(s).slice(0, 300)).slice(0, 8) : [],
    })
  } catch {
    res.status(502).json({ error: "Could not parse OpenAI JSON", detail: raw.slice(0, 400) })
  }
}

/** Regenerate AI/template consumer auto-reply text for a lead (approval flow). */
async function handleAiRegenerateLeadConsumerReply(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await getUserIdFromBearer(req, res)
  if (!auth) return
  const { userId } = auth

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const body = jsonBody(req)
  const leadId = pickFirstString(body.leadId).trim()
  if (!leadId) {
    res.status(400).json({ error: "leadId required" })
    return
  }

  const { data: lead, error: leadErr } = await service
    .from("leads")
    .select("id, description, user_id, customer_id, customers(display_name)")
    .eq("id", leadId)
    .maybeSingle()
  const row = lead as {
    id: string
    user_id: string
    description?: string | null
    customers?: { display_name?: string | null } | null
  } | null
  if (leadErr || !row) {
    res.status(404).json({ error: "Lead not found" })
    return
  }
  if (!(await authCanAccessLeadOwner(service, userId, row.user_id))) {
    res.status(404).json({ error: "Lead not found" })
    return
  }

  const { data: profile } = await service
    .from("profiles")
    .select("metadata, ai_assistant_visible")
    .eq("id", row.user_id)
    .maybeSingle()
  const prof = profile as { metadata?: unknown; ai_assistant_visible?: boolean } | null
  if (prof?.ai_assistant_visible === false) {
    res.status(403).json({ error: "AI automations are disabled for this account (My T)." })
    return
  }

  const settings = parseLeadsSettingsFromMetadata(prof?.metadata)
  const aiOn = prof?.ai_assistant_visible !== false
  const text = await buildLeadConsumerAutoReplyText(settings, aiOn, {
    description: String(row.description ?? ""),
    name: String(row.customers?.display_name ?? "").trim(),
  })

  res.status(200).json({ ok: true, body: text })
}

function parseStringMapFromUnknown(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v
  }
  return out
}

/** Regenerate AI draft for conversation outbound (approval flow; uses Automatic replies settings + thread). */
async function handleAiRegenerateConversationConsumerReply(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization" })
    return
  }
  const token = authHeader.slice("Bearer ".length).trim()
  const { supabaseUrl, anonKey } = resolveSupabasePublicForUserJwt(req)
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({
      error:
        "Missing Supabase URL/anon key on server. Set SUPABASE_URL + SUPABASE_ANON_KEY (or VITE_*) on Vercel, or send supabaseUrl + supabaseAnonKey in the JSON body.",
    })
    return
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    res.status(401).json({ error: "Invalid session" })
    return
  }
  const userId = userData.user.id

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const { data: profile } = await service
    .from("profiles")
    .select("metadata, ai_assistant_visible")
    .eq("id", userId)
    .maybeSingle()
  const prof = profile as { metadata?: unknown; ai_assistant_visible?: boolean } | null
  if (prof?.ai_assistant_visible === false) {
    res.status(403).json({ error: "AI automations are disabled for your account (My T)." })
    return
  }

  const body = jsonBody(req)
  const conversationId = pickFirstString(body.conversationId).trim()
  if (!conversationId) {
    res.status(400).json({ error: "conversationId required" })
    return
  }

  const { data: convo, error: convoErr } = await service
    .from("conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .maybeSingle()
  const crow = convo as { id: string; user_id: string } | null
  if (convoErr || !crow || crow.user_id !== userId) {
    res.status(404).json({ error: "Conversation not found" })
    return
  }

  const meta = prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata) ? prof.metadata : {}
  const auto = parseStringMapFromUnknown((meta as Record<string, unknown>).conversationsAutomaticRepliesValues)
  const template = (auto.conv_auto_reply_message ?? "").trim()
  const brief = (auto.conv_auto_reply_ai_brief ?? "").trim()

  const { data: msgs } = await service
    .from("messages")
    .select("content, sender, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(60)

  const lines = (msgs || [])
    .map((m: { sender?: string | null; content?: string | null }) => {
      const s = (m.sender ?? "thread").trim()
      const c = (m.content ?? "").trim()
      return `${s}: ${c}`
    })
    .filter((t: string) => t.length > 2)
  const thread = lines.join("\n").slice(0, 8000)

  const userPrompt = `Business owner brief (what to communicate):\n${brief || "(none)"}\n\nTemplate or tone to respect:\n${template || "(none)"}\n\nConversation thread:\n${thread || "(no messages yet)"}`

  const generated =
    (await openAiText(
      "You write short, professional SMS or email replies for a home-services contractor. Match the thread context. Under 400 words. No markdown unless email needs simple paragraphs.",
      userPrompt,
    ))?.trim() ?? ""

  const text = generated || template || "Thanks for reaching out — we'll get back to you shortly."
  res.status(200).json({ ok: true, body: text })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }

  const route = pickFirstString(req.query?.__route, req.query?.route).toLowerCase()

  if (req.method === "GET" && route === "legal-html") {
    const page = pickFirstString(req.query?.page, req.query?.p).toLowerCase()
    if (page !== "privacy" && page !== "terms" && page !== "sms") {
      res.status(400).json({ error: "Invalid or missing page", hint: "Use ?page=privacy, ?page=terms, or ?page=sms" })
      return
    }
    try {
      const html = await renderPublicLegalHtmlPage(page)
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300")
      res.status(200).send(html)
    } catch (e) {
      console.error("[platform-tools] legal-html", e)
      res.status(500).setHeader("Content-Type", "text/html; charset=utf-8").send("<!DOCTYPE html><html><body><p>Legal page temporarily unavailable.</p></body></html>")
    }
    return
  }

  if (req.method === "GET" && route === "sms-consent") {
    const html = loadSmsConsentHtml()
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600")
    res.status(200).send(html)
    return
  }

  if (req.method === "GET" && route === "privacy-policy") {
    const html = loadPublicLegalHtml("privacy-policy")
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600")
    res.status(200).send(html)
    return
  }

  if (req.method === "GET" && route === "terms-conditions") {
    const html = loadPublicLegalHtml("terms-conditions")
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600")
    res.status(200).send(html)
    return
  }

  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      route: "platform-tools",
      getHtml: ["legal-html", "sms-consent", "privacy-policy", "terms-conditions"],
      post: [
        "public-lead",
        "ai-summarize",
        "ai-lead-assist",
        "ai-regenerate-lead-consumer-reply",
        "ai-regenerate-conversation-consumer-reply",
        "notify-admin-verified-signup",
        "estimate-legal-draft",
        "quote-estimate-review",
        "estimate-scope-lines",
        "lead-evaluate-fit",
        "customer-evaluate-fit",
        "helcim-js-return",
        "billing-portal-config",
        "ai-summarize-customer-event",
      ],
    })
    return
  }

  try {
    if (route === "helcim-js-return") {
      handleHelcimJsReturn(req, res)
      return
    }
    if (route === "public-lead") {
      await handlePublicLead(req, res)
      return
    }
    if (route === "ai-summarize") {
      await handleAiSummarize(req, res)
      return
    }
    if (route === "ai-summarize-customer-event") {
      await handleAiSummarizeCustomerCommunication(req, res)
      return
    }
    if (route === "ai-lead-assist") {
      await handleAiLeadAssist(req, res)
      return
    }
    if (route === "ai-regenerate-lead-consumer-reply") {
      await handleAiRegenerateLeadConsumerReply(req, res)
      return
    }
    if (route === "ai-regenerate-conversation-consumer-reply") {
      await handleAiRegenerateConversationConsumerReply(req, res)
      return
    }
    if (route === "notify-admin-verified-signup") {
      await handleNotifyAdminVerifiedSignup(req, res)
      return
    }
    if (route === "estimate-legal-draft") {
      await handleEstimateLegalDraft(req, res)
      return
    }
    if (route === "quote-estimate-review") {
      await handleQuoteEstimateReview(req, res)
      return
    }
    if (route === "estimate-scope-lines") {
      await handleEstimateScopeLines(req, res)
      return
    }
    if (route === "lead-evaluate-fit") {
      await handleLeadEvaluateFit(req, res)
      return
    }
    if (route === "customer-evaluate-fit") {
      await handleCustomerEvaluateFit(req, res)
      return
    }
    if (route === "billing-portal-config") {
      await handleBillingPortalConfigVercel(req, res)
      return
    }
    res.status(400).json({
      error: "Unknown __route",
      hint: "See GET /api/platform-tools for supported __route values",
    })
  } catch (e) {
    console.error("[platform-tools]", e instanceof Error ? e.message : e)
    res.status(500).json({ error: e instanceof Error ? e.message : "platform-tools failed" })
  }
}
