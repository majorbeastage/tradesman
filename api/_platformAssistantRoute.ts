/**
 * Phase 2 platform assistant — LLM routes paraphrases to the same action union as rules.
 * Client sends buildAssistantRoutingCatalog() text; server validates output strictly.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { firstEnv, pickFirstString } from "./_communications.js"
import { openAiText } from "./_leadAutomation.js"

const WIZARD_IDS = new Set([
  "customers_auto_replies",
  "customers_lead_filters",
  "estimates_line_items",
  "estimates_job_types",
  "scheduling_alerts",
  "scheduling_receipt_template",
  "myt_call_forwarding",
  "myt_voicemail_greeting",
])

const ADMIN_PANELS = new Set(["signup", "communications", "users", "billing", "portal", "tickets", "about"])

const ALL_PAGES = new Set([
  "dashboard",
  "customers",
  "leads",
  "conversations",
  "quotes",
  "calendar",
  "payments",
  "settings",
  "account",
  "reports",
])

type LlmAction =
  | { type: "navigate"; page: string; message: string }
  | { type: "open_setup_guide"; message: string }
  | { type: "open_mini_wizard"; wizardId: string; message: string }
  | { type: "open_admin"; panel: string; message: string }
  | { type: "find_customer"; query: string; message: string }
  | { type: "open_last_missed_call"; message: string }
  | { type: "open_current_customer"; message: string }
  | { type: "create_estimate"; customerId?: string; customerQuery?: string; message: string }
  | { type: "focus_customer_sms"; customerId?: string; customerQuery?: string; message: string }
  | { type: "open_specialty_report"; quoteId?: string; message: string }
  | { type: "explain"; message: string }
  | {
      type: "handoff_specialist_assistant"
      specialist: string
      scopeText: string
      jobTypeName?: string
      mode: string
      message: string
    }
  | { type: "clarify"; message: string }

const SPECIALIST_IDS = new Set([
  "estimate_line_items_library",
  "estimate_job_types_library",
  "estimate_quote_scope",
])

export type PlatformAssistantLlmRouteResult = {
  confidence: number
  action: LlmAction
  alternatives?: Array<{ label: string; action: LlmAction; confidence: number }>
}

function clip(s: unknown, max: number): string {
  return String(s ?? "")
    .trim()
    .slice(0, max)
}

function jsonBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>
  return {}
}

function parseAllowedPages(body: Record<string, unknown>): Set<string> {
  const raw = body.availableTabIds
  if (!Array.isArray(raw)) return ALL_PAGES
  const out = new Set<string>()
  for (const id of raw) {
    if (typeof id === "string" && ALL_PAGES.has(id)) out.add(id)
  }
  return out.size > 0 ? out : ALL_PAGES
}

function validateAction(
  raw: unknown,
  opts: { allowedPages: Set<string>; isAdmin: boolean },
): LlmAction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const type = clip(o.type, 40)
  const message = clip(o.message, 320) || "OK."

  if (type === "navigate") {
    const page = clip(o.page, 40)
    if (!opts.allowedPages.has(page)) return null
    return { type: "navigate", page, message }
  }
  if (type === "open_setup_guide") {
    return { type: "open_setup_guide", message }
  }
  if (type === "open_mini_wizard") {
    const wizardId = clip(o.wizardId, 60)
    if (!WIZARD_IDS.has(wizardId)) return null
    return { type: "open_mini_wizard", wizardId, message }
  }
  if (type === "open_admin") {
    if (!opts.isAdmin) return null
    const panel = clip(o.panel, 40)
    if (!ADMIN_PANELS.has(panel)) return null
    return { type: "open_admin", panel, message }
  }
  if (type === "find_customer") {
    const query = clip(o.query, 80)
    if (query.length < 2) return null
    return { type: "find_customer", query, message }
  }
  if (type === "open_last_missed_call") {
    return { type: "open_last_missed_call", message }
  }
  if (type === "open_current_customer") {
    return { type: "open_current_customer", message }
  }
  if (type === "create_estimate") {
    const customerId = clip(o.customerId, 48)
    const customerQuery = clip(o.customerQuery, 80)
    if (!customerId && customerQuery.length < 2) return null
    return {
      type: "create_estimate",
      customerId: customerId || undefined,
      customerQuery: customerQuery || undefined,
      message,
    }
  }
  if (type === "focus_customer_sms") {
    const customerId = clip(o.customerId, 48)
    const customerQuery = clip(o.customerQuery, 80)
    if (!customerId && customerQuery.length < 2) return null
    return {
      type: "focus_customer_sms",
      customerId: customerId || undefined,
      customerQuery: customerQuery || undefined,
      message,
    }
  }
  if (type === "open_specialty_report") {
    const quoteId = clip(o.quoteId, 48)
    return { type: "open_specialty_report", quoteId: quoteId || undefined, message }
  }
  if (type === "explain") {
    return { type: "explain", message: message.slice(0, 600) }
  }
  if (type === "handoff_specialist_assistant") {
    const specialist = clip(o.specialist, 48)
    const scopeText = clip(o.scopeText, 2000)
    const modeRaw = clip(o.mode, 32)
    const mode = modeRaw === "job_type_with_lines" ? "job_type_with_lines" : "line_items_only"
    if (!SPECIALIST_IDS.has(specialist) || scopeText.length < 4) return null
    const jobTypeName = clip(o.jobTypeName, 80) || undefined
    return { type: "handoff_specialist_assistant", specialist, scopeText, jobTypeName, mode, message }
  }
  if (type === "clarify") {
    return { type: "clarify", message }
  }
  return null
}

function parseLlmRoutePayload(
  raw: string,
  opts: { allowedPages: Set<string>; isAdmin: boolean },
): PlatformAssistantLlmRouteResult | null {
  let j: Record<string, unknown>
  try {
    j = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
  const action = validateAction(j.action, opts)
  if (!action) return null
  let confidence = Number(j.confidence)
  if (!Number.isFinite(confidence)) confidence = 72
  confidence = Math.max(0, Math.min(100, Math.round(confidence)))

  const alternatives: PlatformAssistantLlmRouteResult["alternatives"] = []
  if (Array.isArray(j.alternatives)) {
    for (const row of j.alternatives.slice(0, 3)) {
      if (!row || typeof row !== "object") continue
      const r = row as Record<string, unknown>
      const altAction = validateAction(r.action, opts)
      if (!altAction) continue
      let ac = Number(r.confidence)
      if (!Number.isFinite(ac)) ac = confidence - 5
      alternatives.push({
        label: clip(r.label, 80) || "Alternative",
        action: altAction,
        confidence: Math.max(0, Math.min(100, Math.round(ac))),
      })
    }
  }

  return { confidence, action, alternatives: alternatives.length ? alternatives : undefined }
}

export async function handlePlatformAssistantRoute(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const body = jsonBody(req)
  const phrase = clip(body.phrase, 500)
  const catalog = clip(body.catalog, 24_000)
  const isAdmin = body.isAdmin === true
  const allowedPages = parseAllowedPages(body)

  if (!phrase) {
    res.status(400).json({ error: "phrase required" })
    return
  }
  if (!catalog) {
    res.status(400).json({ error: "catalog required" })
    return
  }

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    res.status(200).json({
      ok: false,
      fallback: true,
      note: "OPENAI_API_KEY is not configured on the server.",
    })
    return
  }

  const pageList = [...allowedPages].join(", ")
  const wizardList = [...WIZARD_IDS].join(", ")
  const adminList = [...ADMIN_PANELS].join(", ")

  const instructions = `You are the Tradesman in-app platform assistant router for a contractor CRM (customers, estimates/quotes, SMS, scheduling, payments).
Map the user's command to exactly ONE primary action from the catalog below.
Reply with JSON only (no markdown):
{"confidence":number,"action":{...},"alternatives":[{"label":string,"action":{...},"confidence":number}]}

Domain: "estimate" and "quote" mean the same job pricing flow (tab id quotes). "Customer" and "client" are the same record.

Allowed action shapes (use only these "type" values):
- navigate: {"type":"navigate","page":"<tab id>","message":"short confirmation"}
- open_setup_guide: {"type":"open_setup_guide","message":"..."}
- open_mini_wizard: {"type":"open_mini_wizard","wizardId":"<id>","message":"..."}
- open_admin: {"type":"open_admin","panel":"<panel>","message":"..."} (only if user is admin)
- find_customer: {"type":"find_customer","query":"<name fragment>","message":"..."}
- open_last_missed_call: {"type":"open_last_missed_call","message":"..."}
- open_current_customer: {"type":"open_current_customer","message":"..."} — only when catalog says a customer is already selected
- create_estimate: {"type":"create_estimate","customerQuery":"Name"} OR customerId if known — never invent UUIDs
- focus_customer_sms: {"type":"focus_customer_sms","customerQuery":"Name"} — opens SMS compose, does not send automatically
- open_specialty_report: {"type":"open_specialty_report","message":"..."} — opens Estimates specialty/variance report wizard (Start report); optional quoteId only if catalog shows estimate open
- explain: {"type":"explain","message":"short helpful paragraph"}
- handoff_specialist_assistant: {"type":"handoff_specialist_assistant","specialist":"estimate_line_items_library"|"estimate_job_types_library"|"estimate_quote_scope","scopeText":"user's full scope","jobTypeName":"optional","mode":"line_items_only"|"job_type_with_lines","message":"..."}
- clarify: {"type":"clarify","message":"helpful suggestion"} — only if nothing fits

Hard rules:
- NEVER return open_customer or invent customer UUIDs. Use find_customer with query, or open_current_customer when appropriate.
- When user describes building saved line items / job type scope (roofing, shingles, materials) → handoff_specialist_assistant with specialist estimate_line_items_library and scopeText = their request.
- When catalog shows a customer open in UI and user wants estimate/quote/proposal → create_estimate (NOT open_current_customer, NOT navigate).
- "create/start/open/make estimate" with a name → create_estimate with customerQuery = name only (not find_customer).
- For "missed call" / "who called" / "last call I missed" use open_last_missed_call.
- For lookup by person name without estimate/SMS intent use find_customer with query = the name.
- Deictic phrases ("this customer", "them", "for him") → create_estimate or focus_customer_sms or open_current_customer per catalog context; never find_customer query "this customer".
- "start report", "open variance report", "begin inspection report" on an estimate → open_specialty_report (NOT navigate to reporting). "go to reporting" → navigate reporting.
- navigate.page must be one of: ${pageList}
- open_mini_wizard.wizardId must be one of: ${wizardList}
- open_admin.panel must be one of: ${adminList} (only when isAdmin=true below)
- Prefer wizards on the user's current tab when they say "open" / "expand" without naming another area.
- confidence 85+ when sure; 70-84 when plausible; use clarify below 70.
- alternatives: optional, max 2, only when genuinely ambiguous.

User is admin: ${isAdmin ? "yes" : "no"}

Catalog:
${catalog}`

  const raw =
    (await openAiText(instructions, `User command:\n${phrase}`, { maxTokens: 900, timeoutMs: 28_000 }))?.trim() ?? "{}"

  const parsed = parseLlmRoutePayload(raw, { allowedPages, isAdmin })
  if (!parsed) {
    console.warn("[platform-assistant-route] invalid model JSON", raw.slice(0, 400))
    res.status(200).json({
      ok: false,
      fallback: true,
      note: "Could not parse a valid assistant action from the model.",
    })
    return
  }

  res.status(200).json({ ok: true, result: parsed })
}
