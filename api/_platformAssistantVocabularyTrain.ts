/**
 * Admin-only AI coach for platform assistant vocabulary training.
 * POST body: { message, catalog, context?, history? }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { verifyAdminJwtAnonOrServiceSupabase } from "./_communications.js"
import { openAiText } from "./_leadAutomation.js"
import { firstEnv } from "./_communications.js"

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

const ADMIN_PANELS = new Set(["ops", "traffic", "signup", "communications", "users", "billing", "portal", "tickets", "about"])

const PAGES = new Set([
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

const SPECIALISTS = new Set([
  "estimate_line_items_library",
  "estimate_job_types_library",
  "estimate_quote_scope",
])

const MATCH_MODES = new Set(["contains", "exact", "starts_with"])

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

function validateAction(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const type = clip(o.type, 48)
  const message = clip(o.message, 320)

  if (type === "navigate") {
    const page = clip(o.page, 40)
    if (!PAGES.has(page)) return null
    return { type, page, ...(message ? { message } : {}) }
  }
  if (type === "open_setup_guide") return { type, ...(message ? { message } : {}) }
  if (type === "open_mini_wizard") {
    const wizardId = clip(o.wizardId, 60)
    if (!WIZARD_IDS.has(wizardId)) return null
    return { type, wizardId, ...(message ? { message } : {}) }
  }
  if (type === "open_admin") {
    const panel = clip(o.panel, 40)
    if (!ADMIN_PANELS.has(panel)) return null
    return { type, panel, ...(message ? { message } : {}) }
  }
  if (type === "find_customer") {
    const query = clip(o.query, 80)
    if (query.length < 2) return null
    return { type, query, ...(message ? { message } : {}) }
  }
  if (type === "open_last_missed_call" || type === "open_current_customer" || type === "explain") {
    return { type, ...(message ? { message } : {}) }
  }
  if (type === "create_estimate" || type === "focus_customer_sms") {
    const out: Record<string, unknown> = { type }
    if (o.useSelectedCustomer === true) out.useSelectedCustomer = true
    const customerQuery = clip(o.customerQuery, 80)
    if (customerQuery) out.customerQuery = customerQuery
    if (message) out.message = message
    return out
  }
  if (type === "open_specialty_report") {
    const out: Record<string, unknown> = { type }
    if (o.useSelectedQuote !== false) out.useSelectedQuote = true
    if (message) out.message = message
    return out
  }
  if (type === "handoff_specialist_assistant") {
    const specialist = clip(o.specialist, 48)
    const scopeText = clip(o.scopeText, 2000)
    const mode = clip(o.mode, 32) === "job_type_with_lines" ? "job_type_with_lines" : "line_items_only"
    if (!SPECIALISTS.has(specialist) || scopeText.length < 4) return null
    const jobTypeName = clip(o.jobTypeName, 80)
    return {
      type,
      specialist,
      scopeText,
      mode,
      ...(jobTypeName ? { jobTypeName } : {}),
      ...(message ? { message } : {}),
    }
  }
  return null
}

function extractCoachJson(raw: string): Record<string, unknown> | null {
  const t = raw.trim()
  if (!t) return null
  try {
    return JSON.parse(t) as Record<string, unknown>
  } catch {
    /* fall through */
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>
    } catch {
      /* fall through */
    }
  }
  const start = t.indexOf("{")
  const end = t.lastIndexOf("}")
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>
    } catch {
      /* fall through */
    }
  }
  return null
}

function parseProposal(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const phrase = clip(o.phrase, 240)
  if (phrase.length < 2) return null
  const match = clip(o.match, 20)
  const matchMode = MATCH_MODES.has(match) ? match : "contains"
  const action = validateAction(o.action)
  if (!action) return null
  const label = clip(o.label, 200) || phrase
  const note = clip(o.note, 400)
  return {
    phrase,
    match: matchMode,
    action,
    label,
    ...(note ? { note } : {}),
  }
}

export async function handlePlatformAssistantVocabularyTrain(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const authHeader = req.headers.authorization
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  if (!token) {
    res.status(401).json({ error: "Authorization required" })
    return
  }
  const admin = await verifyAdminJwtAnonOrServiceSupabase(token)
  if (!admin.ok) {
    res.status(admin.status).json(admin.body)
    return
  }

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    res.status(200).json({
      ok: false,
      fallback: true,
      reply: "OPENAI_API_KEY is not set on the server. Add it on Vercel to use the training coach.",
      proposals: [],
    })
    return
  }

  const body = jsonBody(req)
  const message = clip(body.message, 2000)
  const catalog = clip(body.catalog, 24_000)
  if (!message) {
    res.status(400).json({ error: "message required" })
    return
  }
  if (!catalog) {
    res.status(400).json({ error: "catalog required" })
    return
  }

  const ctx = body.context && typeof body.context === "object" ? (body.context as Record<string, unknown>) : {}
  const currentPage = clip(ctx.currentPage, 40)
  const selectedCustomer = clip(ctx.selectedCustomerName, 80)
  const platform = clip(ctx.platform, 40)

  let historyBlock = ""
  if (Array.isArray(body.history)) {
    const lines: string[] = []
    for (const row of body.history.slice(-24)) {
      if (!row || typeof row !== "object") continue
      const h = row as Record<string, unknown>
      const role = clip(h.role, 20)
      const content = clip(h.content, 1200)
      if ((role === "user" || role === "assistant") && content) lines.push(`${role}: ${content}`)
    }
    if (lines.length) historyBlock = `\n\nConversation so far:\n${lines.join("\n")}`
  }

  const instructions = `You are the Tradesman **training assistant** — a patient colleague helping **non-technical admins** who support customers in the field.
They train the live voice assistant by talking to you in plain English (voice or text). You are NOT talking to end customers.

## Product assistants (for your reasoning only — explain outcomes in plain English to the admin)
1. **Platform assistant** (mic on every tab) — go to tabs, find customers, start estimates, SMS, setup help.
2. **Estimate line items specialist** — AI builds saved material/labor lines from job scope (roofing, shingles, etc.).
3. **Job types specialist** — library of job types on Estimates.
4. **Quote scope specialist** — line suggestions inside an open quote.

## Deprecated sidebar tabs (V2 — do NOT train navigation to these)
**Leads**, **Conversations**, **Settings**, and **Web Support** are retired from the contractor menu. Work happens on **Customers**; support is **Tech Support**; phone/My T is **Account**. Never propose navigate to leads, conversations, settings, or web-support unless an admin explicitly asks to re-enable a legacy tab.

Saved training = when a **customer** later says certain words, the app does the matching action automatically (highest priority).

## How you must behave
- **Conversational first.** Ask as many follow-up questions as you need — there is no limit. Typical gaps: exact words the customer used, what happened vs what should happen, which screen/tab, "this customer on screen" vs a name, estimate vs SMS vs line-item library.
- **Plain English in reply.** Never ask the admin to pick dropdown values, match modes, or action type names. You decide technical details.
- **Do not rush to save.** Only set readyToSave true when you are confident you understand the scenario AND the admin has confirmed (explicitly or implicitly after your recap).
- When not ready: readyToSave false, proposals [], reply = your questions + short recap of what you think so far.
- When ready: readyToSave true, 1–3 proposals max. Each label = one plain sentence for the admin ("When they say X, we will Y"). Pick match mode yourself (usually contains).
- **handoff_specialist_assistant** when they need line-item AI / job library — not navigate-only.
- **useSelectedCustomer: true** when they mean whoever is open on Customers.
- clarifyingQuestions: 0–4 **short** tap-to-answer options (yes/no style or brief choices) that mirror what you asked — optional if everything is in reply.

## Action JSON (action field only — admin never sees this)
navigate, find_customer, create_estimate, focus_customer_sms, open_specialty_report (useSelectedQuote when estimate on screen), open_current_customer, open_last_missed_call, explain, open_setup_guide, open_mini_wizard, open_admin, handoff_specialist_assistant (specialist, scopeText, mode, jobTypeName?).

Reply JSON only (no markdown):
{
  "reply":"your message to the admin — questions, recap, or confirmation before save",
  "readyToSave":false,
  "proposals":[{"phrase":"customer words","match":"contains","label":"plain English one-liner","note":"optional internal","action":{...}}],
  "clarifyingQuestions":["short optional tap replies"]
}

Catalog:
${catalog}

Session: platform=${platform || "user"}, tab=${currentPage || "unknown"}${selectedCustomer ? `, customer on screen: ${selectedCustomer}` : ""}${historyBlock}`

  const raw = (await openAiText(instructions, `Admin:\n${message}`, { maxTokens: 2800, timeoutMs: 55_000, jsonMode: true }))?.trim() ?? ""

  let reply =
    "I did not get a clear response from the coach. Try one short sentence: what the customer said, and what should have happened."
  const proposals: Record<string, unknown>[] = []
  const clarifyingQuestions: string[] = []
  let readyToSave = false

  if (!raw) {
    res.status(200).json({
      ok: false,
      fallback: true,
      reply: "The training coach is temporarily unavailable. Wait a moment and try again.",
      readyToSave: false,
      proposals: [],
    })
    return
  }

  const j = extractCoachJson(raw)
  if (j) {
    if (typeof j.reply === "string" && j.reply.trim()) reply = j.reply.trim().slice(0, 2000)
    readyToSave = j.readyToSave === true
    if (readyToSave && Array.isArray(j.proposals)) {
      for (const row of j.proposals.slice(0, 4)) {
        const p = parseProposal(row)
        if (p) proposals.push(p)
      }
      if (!proposals.length) readyToSave = false
    }
    if (!readyToSave && Array.isArray(j.clarifyingQuestions)) {
      for (const q of j.clarifyingQuestions.slice(0, 4)) {
        if (typeof q === "string" && q.trim()) clarifyingQuestions.push(q.trim().slice(0, 200))
      }
    }
  } else if (raw.length > 12 && !raw.startsWith("{")) {
    reply = raw.slice(0, 2000)
  } else {
    console.warn("[platform-assistant-vocabulary-train] invalid JSON", raw.slice(0, 400))
    reply =
      "I had trouble reading that reply. Rephrase in one or two sentences: what did the customer say, and what should the app do?"
  }

  res.status(200).json({ ok: true, reply, readyToSave, proposals, clarifyingQuestions })
}
