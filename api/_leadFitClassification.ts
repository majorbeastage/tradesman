/**
 * Rules-first lead fit (hot / maybe / bad). AI only enriches signals when enabled; it never alone assigns "bad".
 * Preferences live in profiles.metadata.lead_filter_preferences (see supabase/lead-fit-classification.sql).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv } from "./_communications.js"
import { maybeCreateConversationAfterLeadFitHot } from "./_ensureConversationFromLeadPolicy.js"

async function openAiJsonAssist(system: string, user: string): Promise<string | null> {
  const key = firstEnv("OPENAI_API_KEY")
  if (!key) return null
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 400,
        temperature: 0.35,
        response_format: { type: "json_object" },
      }),
    })
    const raw = await res.text()
    if (!res.ok) return null
    const j = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
    return j.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    return null
  }
}

export type LeadFitBucket = "hot" | "maybe" | "bad"

export type LeadFilterPreferencesV1 = {
  v: 1
  accepted_job_types: string
  minimum_job_size: number | null
  service_radius_miles: number | null
  use_account_service_radius: boolean
  availability: "asap" | "flexible"
  enable_auto_filter: boolean
  use_ai_for_unclear: boolean
}

export function defaultLeadFilterPreferences(): LeadFilterPreferencesV1 {
  return {
    v: 1,
    accepted_job_types: "",
    minimum_job_size: null,
    service_radius_miles: null,
    use_account_service_radius: true,
    availability: "flexible",
    enable_auto_filter: false,
    use_ai_for_unclear: true,
  }
}

export function parseLeadFilterPreferences(metadata: unknown): LeadFilterPreferencesV1 {
  const base = defaultLeadFilterPreferences()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const m = metadata as Record<string, unknown>
  const raw = m.lead_filter_preferences
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const p = raw as Record<string, unknown>
  const minRaw = p.minimum_job_size
  const minNum = typeof minRaw === "number" ? minRaw : Number.parseFloat(String(minRaw ?? ""))
  const radRaw = p.service_radius_miles
  const radNum = typeof radRaw === "number" ? radRaw : Number.parseFloat(String(radRaw ?? ""))
  return {
    v: 1,
    accepted_job_types: typeof p.accepted_job_types === "string" ? p.accepted_job_types : "",
    minimum_job_size: Number.isFinite(minNum) && minNum >= 0 ? minNum : null,
    service_radius_miles: Number.isFinite(radNum) && radNum > 0 ? radNum : null,
    use_account_service_radius: p.use_account_service_radius !== false,
    availability: p.availability === "asap" ? "asap" : "flexible",
    enable_auto_filter: p.enable_auto_filter === true,
    use_ai_for_unclear: p.use_ai_for_unclear !== false,
  }
}

function tokenizeJobTypes(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2)
}

function extractMaxDollars(text: string): number | null {
  let max = 0
  const t = text.toLowerCase()
  for (const m of t.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)) {
    const n = Number.parseFloat(m[1]!.replace(/,/g, ""))
    if (Number.isFinite(n) && n > max) max = n
  }
  for (const m of t.matchAll(/([\d,]+(?:\.\d{1,2})?)\s*(?:usd|dollars?)\b/g)) {
    const n = Number.parseFloat(m[1]!.replace(/,/g, ""))
    if (Number.isFinite(n) && n > max) max = n
  }
  for (const m of t.matchAll(/\b(\d+)\s*k\b/g)) {
    const n = Number.parseInt(m[1]!, 10) * 1000
    if (Number.isFinite(n) && n > max) max = n
  }
  return max > 0 ? max : null
}

const URGENT_RE = /\b(asap|urgent|emergency|today|tonight|now|immediately|eod|right away)\b/i

type AiSignals = {
  jobTypeHints: string[]
  budgetSignal: "none" | "low" | "medium" | "high" | "unknown"
  urgency: "unknown" | "asap" | "flexible"
  notes: string
}

async function interpretWithAi(corpus: string, prefs: LeadFilterPreferencesV1): Promise<AiSignals | null> {
  if (!prefs.use_ai_for_unclear) return null
  const system =
    'Reply with one JSON object only, no markdown. Keys: jobTypeHints (string array, short trade keywords inferred from text), budgetSignal ("none"|"low"|"medium"|"high"|"unknown"), urgency ("unknown"|"asap"|"flexible"), notes (one short sentence). Do not classify good/bad leads. If unsure, use unknown/flexible and empty hints.'
  const user = `Contractor accepted job types (hints): ${prefs.accepted_job_types.slice(0, 800)}\n\nLead text:\n${corpus.slice(0, 6000)}`
  const raw = await openAiJsonAssist(system, user)
  if (!raw) return null
  try {
    const j = JSON.parse(raw.trim()) as Record<string, unknown>
    const hints = Array.isArray(j.jobTypeHints) ? j.jobTypeHints.map((x) => String(x).toLowerCase().slice(0, 80)).slice(0, 12) : []
    const budget = ["none", "low", "medium", "high", "unknown"].includes(String(j.budgetSignal))
      ? (String(j.budgetSignal) as AiSignals["budgetSignal"])
      : "unknown"
    const urg = ["unknown", "asap", "flexible"].includes(String(j.urgency)) ? (String(j.urgency) as AiSignals["urgency"]) : "unknown"
    return {
      jobTypeHints: hints,
      budgetSignal: budget,
      urgency: urg,
      notes: String(j.notes ?? "").slice(0, 400),
    }
  } catch {
    return null
  }
}

function corpusMatchesAnyJobType(corpus: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  return tokens.some((tok) => tok.length >= 2 && corpus.includes(tok))
}

function mergeHintsIntoCorpus(corpus: string, ai: AiSignals | null): string {
  if (!ai?.jobTypeHints.length) return corpus
  return `${corpus}\n${ai.jobTypeHints.join(" ")}`
}

export type EvaluateLeadFitResult = {
  classification: LeadFitBucket
  confidence: number
  reason: string
  source: "rules" | "ai" | "hybrid" | "manual"
}

/**
 * When `force` is false, skips if lead was manually overridden or already auto-evaluated (unless never evaluated with supplemental only).
 */
export async function evaluateAndPersistLeadFit(
  supabase: SupabaseClient,
  leadId: string,
  opts?: { supplementalText?: string; force?: boolean },
): Promise<EvaluateLeadFitResult | null> {
  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .select(
      "id, user_id, customer_id, title, description, estimated_value, fit_manually_overridden, fit_evaluated_at, metadata, fit_classification",
    )
    .eq("id", leadId)
    .maybeSingle()
  if (leadErr || !leadRow) {
    console.warn("[leadFit] load lead", leadErr?.message)
    return null
  }
  const lead = leadRow as {
    id: string
    user_id: string
    customer_id?: string | null
    title?: string | null
    description?: string | null
    estimated_value?: number | null
    fit_manually_overridden?: boolean | null
    fit_evaluated_at?: string | null
    fit_classification?: string | null
  }
  const prevFitForPersist = lead.fit_classification ?? null

  const force = opts?.force === true
  if (!force && lead.fit_manually_overridden) return null
  // One automatic evaluation per lead unless forced (manual re-check from the app).
  if (!force && lead.fit_evaluated_at) return null

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("metadata, service_radius_enabled, service_radius_miles, ai_assistant_visible")
    .eq("id", lead.user_id)
    .maybeSingle()
  if (profErr || !prof) {
    console.warn("[leadFit] profile", profErr?.message)
    return null
  }

  const prefs = parseLeadFilterPreferences((prof as { metadata?: unknown }).metadata)
  if (!prefs.enable_auto_filter && !force) return null

  const aiVisible = (prof as { ai_assistant_visible?: boolean }).ai_assistant_visible !== false

  let corpus = `${lead.title ?? ""}\n${lead.description ?? ""}\n${opts?.supplementalText ?? ""}`.toLowerCase()
  const corpusRaw = `${lead.title ?? ""}\n${lead.description ?? ""}\n${opts?.supplementalText ?? ""}`

  const accepted = tokenizeJobTypes(prefs.accepted_job_types)
  const minSize = prefs.minimum_job_size
  const estVal =
    typeof lead.estimated_value === "number" && Number.isFinite(lead.estimated_value) ? lead.estimated_value : null
  const extracted = extractMaxDollars(corpusRaw)
  const effectiveValue = estVal ?? extracted

  let source: EvaluateLeadFitResult["source"] = "rules"
  let aiSignals: AiSignals | null = null

  const ambiguousJob = accepted.length > 0 && !corpusMatchesAnyJobType(corpus, accepted)
  const ambiguousBudget = minSize != null && effectiveValue == null

  if (prefs.use_ai_for_unclear && aiVisible && (ambiguousJob || ambiguousBudget || corpus.trim().length < 24)) {
    aiSignals = await interpretWithAi(corpusRaw, prefs)
    if (aiSignals) {
      source = "hybrid"
      corpus = mergeHintsIntoCorpus(corpus, aiSignals).toLowerCase()
    }
  }

  // Strong bad: accepted list set and still no match after optional AI hints
  if (accepted.length > 0 && !corpusMatchesAnyJobType(corpus, accepted)) {
    const result: EvaluateLeadFitResult = {
      classification: "bad",
      confidence: aiSignals ? 0.78 : 0.88,
      reason: "Job type does not match the types you said you accept.",
      source,
    }
    await persistFit(supabase, leadId, lead.user_id, result, { force, prevFit: prevFitForPersist })
    return result
  }

  // Strong bad: explicit budget below minimum
  if (minSize != null && effectiveValue != null && effectiveValue < minSize) {
    const result: EvaluateLeadFitResult = {
      classification: "bad",
      confidence: 0.85,
      reason: `Stated or estimated job size ($${Math.round(effectiveValue)}) is below your minimum ($${Math.round(minSize)}).`,
      source: "rules",
    }
    await persistFit(supabase, leadId, lead.user_id, result, { force, prevFit: prevFitForPersist })
    return result
  }

  // Soft bad signal from AI budget only if rules already weak — never AI-only bad
  if (
    aiSignals?.budgetSignal === "low" &&
    minSize != null &&
    effectiveValue == null &&
    accepted.length > 0 &&
    corpusMatchesAnyJobType(corpus, accepted)
  ) {
    const result: EvaluateLeadFitResult = {
      classification: "maybe",
      confidence: 0.55,
      reason: "Budget is unclear; AI suggests a smaller job — follow up before deprioritizing.",
      source: "hybrid",
    }
    await persistFit(supabase, leadId, lead.user_id, result, { force, prevFit: prevFitForPersist })
    return result
  }

  // Hot: matches types (or no filter), budget ok or unknown, urgency aligned
  const urgent = URGENT_RE.test(corpusRaw) || aiSignals?.urgency === "asap"
  const typeOk = accepted.length === 0 || corpusMatchesAnyJobType(corpus, accepted)
  const budgetOk = minSize == null || effectiveValue == null || effectiveValue >= minSize

  if (typeOk && budgetOk) {
    if (prefs.availability === "asap" && !urgent) {
      const result: EvaluateLeadFitResult = {
        classification: "maybe",
        confidence: 0.5,
        reason: "You prefer ASAP jobs; timing in this lead is unclear — worth a quick call.",
        source: aiSignals ? "hybrid" : "rules",
      }
      await persistFit(supabase, leadId, lead.user_id, result, { force, prevFit: prevFitForPersist })
      return result
    }
    const result: EvaluateLeadFitResult = {
      classification: "hot",
      confidence: urgent ? 0.74 : 0.62,
      reason: urgent
        ? "Strong fit: urgency matches a priority lead."
        : "Matches your filters; follow up to confirm scope and schedule.",
      source: aiSignals ? "hybrid" : "rules",
    }
    await persistFit(supabase, leadId, lead.user_id, result, { force, prevFit: prevFitForPersist })
    return result
  }

  const result: EvaluateLeadFitResult = {
    classification: "maybe",
    confidence: 0.45,
    reason: "Not enough detail to confirm fit — we kept this in your queue for manual review.",
    source: aiSignals ? "hybrid" : "rules",
  }
  await persistFit(supabase, leadId, lead.user_id, result, { force, prevFit: prevFitForPersist })
  return result
}

async function persistFit(
  supabase: SupabaseClient,
  leadId: string,
  userId: string,
  result: EvaluateLeadFitResult,
  ctx: { force: boolean; prevFit: string | null },
): Promise<void> {
  const evaluatedAt = new Date().toISOString()
  const up: Record<string, unknown> = {
    fit_classification: result.classification,
    fit_confidence: result.confidence,
    fit_reason: result.reason.slice(0, 2000),
    fit_source: result.source,
    fit_manually_overridden: false,
    fit_evaluated_at: evaluatedAt,
  }

  const { error: upErr } = await supabase.from("leads").update(up).eq("id", leadId)
  if (upErr) {
    console.error("[leadFit] update lead failed (run supabase/lead-fit-classification.sql?)", upErr.message)
    return
  }

  const { error: logErr } = await supabase.from("lead_automation_logs").insert({
    lead_id: leadId,
    user_id: userId,
    action_type: "lead_fit_classification",
    action_summary: `${result.classification.toUpperCase()}: ${result.reason.slice(0, 180)}`,
    metadata: {
      confidence: result.confidence,
      source: result.source,
      force: ctx.force,
    },
  })
  if (logErr) {
    console.warn("[leadFit] log insert", logErr.message)
  }

  void maybeCreateConversationAfterLeadFitHot(supabase, {
    userId,
    leadId,
    prevFit: ctx.prevFit,
    nextFit: result.classification,
  }).catch((e) => console.warn("[leadFit] qualified convo side effect", e instanceof Error ? e.message : e))
}
