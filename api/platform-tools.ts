/**
 * Merged serverless routes (Hobby-friendly): public lead capture, AI thread summary.
 * POST /api/platform-tools?__route=public-lead
 * POST /api/platform-tools?__route=ai-summarize  (Authorization: Bearer <supabase jwt>)
 * POST /api/platform-tools?__route=notify-admin-verified-signup  (Bearer jwt; merged route — saves a Vercel function slot)
 * GET  /api/platform-tools?__route=sms-consent  — static SMS consent HTML (A2P; bundled public/sms-consent.html)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { createClient } from "@supabase/supabase-js"
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
import { evaluateAndPersistLeadFit } from "./_leadFitClassification.js"

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
    res.status(503).json({ error: "OpenAI is not configured on the server." })
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

/** Rules-first lead fit evaluation (optional force to re-run). */
async function handleLeadEvaluateFit(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const auth = await getUserIdFromBearer(req, res)
  if (!auth) return
  const { userId: actorUserId } = auth
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

  let service: ReturnType<typeof createServiceSupabase>
  try {
    service = createServiceSupabase()
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server misconfiguration" })
    return
  }

  const { data: profile } = await service
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

  const { data: convo, error: convoErr } = await service
    .from("conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .maybeSingle()
  if (convoErr || !convo || (convo as { user_id: string }).user_id !== userId) {
    res.status(404).json({ error: "Conversation not found" })
    return
  }

  const { data: msgs } = await service
    .from("messages")
    .select("sender, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(80)

  const { data: evs } = await service
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

  if (req.method === "GET" && route === "sms-consent") {
    const html = loadSmsConsentHtml()
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600")
    res.status(200).send(html)
    return
  }

  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      route: "platform-tools",
      getHtml: ["sms-consent"],
      post: [
        "public-lead",
        "ai-summarize",
        "ai-lead-assist",
        "ai-regenerate-lead-consumer-reply",
        "ai-regenerate-conversation-consumer-reply",
        "notify-admin-verified-signup",
        "estimate-legal-draft",
        "quote-estimate-review",
        "lead-evaluate-fit",
      ],
    })
    return
  }

  try {
    if (route === "public-lead") {
      await handlePublicLead(req, res)
      return
    }
    if (route === "ai-summarize") {
      await handleAiSummarize(req, res)
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
    if (route === "lead-evaluate-fit") {
      await handleLeadEvaluateFit(req, res)
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
