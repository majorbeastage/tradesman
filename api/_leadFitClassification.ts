/**
 * Rules-first lead fit (hot / maybe / bad). Real inbound answers outrank job-type wording.
 * Bad is reserved for spam / silence — not catalog mismatch. Preferences: profiles.metadata.lead_filter_preferences.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { maybeCreateConversationAfterLeadFitHot } from "./_ensureConversationFromLeadPolicy.js"

/** Keep this in api/ — platform-tools cannot import ../src or the public site 500s. */
function urgencyPatchFromFitClassification(
  classification: string,
  currentRaw: string | null | undefined,
): string | null {
  const current = typeof currentRaw === "string" ? currentRaw.trim() : ""
  if (classification === "bad") {
    if (current === "Complete" || current === "Lost") return null
    return "Suspected Spam"
  }
  if (current === "Suspected Spam") return "Good Standing"
  return null
}

export type LeadFitBucket = "hot" | "maybe" | "bad"

export type EvaluateLeadFitResult = {
  classification: LeadFitBucket
  confidence: number
  reason: string
  source: "rules" | "ai" | "hybrid" | "manual"
}

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

function answerLooksSpoken(answer: string): boolean {
  const t = answer.trim()
  if (t.length < 2) return false
  if (/^\(no response\)$/i.test(t)) return false
  return true
}

function wordCount(answer: string): number {
  return answer.trim().split(/\s+/).filter(Boolean).length
}

type ScreeningAnswerLike = { question?: string; answer?: string }

function tallyScreeningAnswers(answers: ScreeningAnswerLike[]): {
  questions: number
  spoken: number
  wordy: boolean
} {
  let spoken = 0
  let wordy = false
  for (const a of answers) {
    const ans = String(a.answer ?? "")
    if (!answerLooksSpoken(ans)) continue
    spoken += 1
    if (wordCount(ans) >= 3) wordy = true
  }
  return { questions: answers.length, spoken, wordy }
}

export type EngagementSignals = {
  corpus: string
  screeningVerdict: string | null
  screeningSpoken: number
  screeningQuestions: number
  wordyAnswer: boolean
}

function signalsFromScreeningAnswers(verdict: string | null | undefined, answers: ScreeningAnswerLike[]): EngagementSignals {
  const tally = tallyScreeningAnswers(answers)
  const corpus = answers
    .map((a) => `${a.question ?? "Question"}\n→ ${a.answer || "(no response)"}`)
    .join("\n\n")
  return {
    corpus,
    screeningVerdict: verdict?.trim() ? verdict.trim().toLowerCase() : null,
    screeningSpoken: tally.spoken,
    screeningQuestions: tally.questions,
    wordyAnswer: tally.wordy,
  }
}

/** Real answers beat job-type catalog match. Bad is spam / silence only. */
export function scoreInboundFit(signals: EngagementSignals): EvaluateLeadFitResult {
  const verdict = (signals.screeningVerdict ?? "").toLowerCase()
  if (verdict === "spam" || verdict === "cold_call") {
    return {
      classification: "bad",
      confidence: 0.88,
      reason: "Screening flagged this as spam or a cold call — not a real customer conversation.",
      source: "rules",
    }
  }
  if (signals.screeningQuestions > 0 && signals.screeningSpoken === 0) {
    return {
      classification: "bad",
      confidence: 0.82,
      reason: "Caller did not answer the auto-attendant questions — treated as suspected spam.",
      source: "rules",
    }
  }
  const answeredMost =
    signals.screeningQuestions > 0 &&
    signals.screeningSpoken >= Math.max(1, signals.screeningQuestions - 1)
  const liveAttendant = signals.screeningSpoken >= 1 && (signals.wordyAnswer || answeredMost)
  if (liveAttendant) {
    return {
      classification: "hot",
      confidence: 0.78,
      reason: "Caller gave real auto-attendant answers. Job type wording is a weak hint only and was not used to downrank this lead.",
      source: "rules",
    }
  }
  if (signals.screeningSpoken >= 1) {
    return {
      classification: "maybe",
      confidence: 0.5,
      reason: "Caller said something on the auto-attendant, but answers were too short to treat as a solid lead — kept for review.",
      source: "rules",
    }
  }
  const inbound = signals.corpus.replace(/\s+/g, " ").trim()
  if (inbound.length >= 24) {
    return {
      classification: "hot",
      confidence: 0.68,
      reason: "Inbound message shows a real response. Job type wording was not used to score this lead.",
      source: "rules",
    }
  }
  return {
    classification: "maybe",
    confidence: 0.42,
    reason: "Not enough inbound conversation yet to confirm a real person — kept for review.",
    source: "rules",
  }
}

/** Pull auto-attendant, call, SMS, and email inbound text for lead/customer scoring. */
async function fetchEngagementSignals(
  supabase: SupabaseClient,
  userId: string,
  customerId: string | null | undefined,
  leadId?: string | null,
): Promise<EngagementSignals> {
  const empty: EngagementSignals = {
    corpus: "",
    screeningVerdict: null,
    screeningSpoken: 0,
    screeningQuestions: 0,
    wordyAnswer: false,
  }
  if (!customerId && !leadId) return empty
  let q = supabase
    .from("communication_events")
    .select("body, transcript_text, summary_text, metadata, event_type")
    .eq("user_id", userId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(14)
  if (customerId) q = q.eq("customer_id", customerId)
  else if (leadId) q = q.eq("lead_id", leadId)
  const { data } = await q
  const parts: string[] = []
  let screeningVerdict: string | null = null
  let screeningSpoken = 0
  let screeningQuestions = 0
  let wordyAnswer = false
  let latestHandledScreening = false
  for (const row of data ?? []) {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {}
    const isScreening =
      meta.call_screening === true ||
      typeof meta.screening_verdict === "string" ||
      Array.isArray(meta.screening_answers)
    if (!latestHandledScreening) {
      latestHandledScreening = true
      if (isScreening) {
        if (typeof meta.screening_verdict === "string" && meta.screening_verdict.trim()) {
          screeningVerdict = meta.screening_verdict.trim().toLowerCase()
        }
        if (Array.isArray(meta.screening_answers)) {
          const tally = tallyScreeningAnswers(meta.screening_answers as ScreeningAnswerLike[])
          screeningQuestions = tally.questions
          screeningSpoken = tally.spoken
          wordyAnswer = tally.wordy
        }
      }
    }
    if (typeof row.transcript_text === "string" && row.transcript_text.trim()) {
      parts.push(row.transcript_text.trim())
      continue
    }
    if (Array.isArray(meta.screening_answers)) {
      const qa = (meta.screening_answers as ScreeningAnswerLike[])
        .map((a) => `${a.question ?? "Question"}\n→ ${a.answer ?? ""}`)
        .join("\n\n")
      if (qa.trim()) parts.push(qa.trim())
    }
    if (typeof row.body === "string" && row.body.trim()) parts.push(row.body.trim())
    else if (typeof row.summary_text === "string" && row.summary_text.trim()) parts.push(row.summary_text.trim())
  }
  return {
    corpus: [...new Set(parts)].join("\n\n").slice(0, 6000),
    screeningVerdict,
    screeningSpoken,
    screeningQuestions,
    wordyAnswer,
  }
}

type FitEvalOpts = { supplementalText?: string; force?: boolean; fromScreening?: boolean }

function mergeSupplemental(signals: EngagementSignals, supplementalText?: string): EngagementSignals {
  const extra = supplementalText?.trim() ?? ""
  if (!extra) return signals
  return {
    ...signals,
    corpus: [signals.corpus, extra].filter(Boolean).join("\n\n").slice(0, 6000),
  }
}

async function applyUrgencyFromFit(
  supabase: SupabaseClient,
  customerId: string,
  classification: LeadFitBucket,
): Promise<void> {
  const { data } = await supabase.from("customers").select("communication_urgency").eq("id", customerId).maybeSingle()
  const current = (data as { communication_urgency?: string | null } | null)?.communication_urgency
  const next = urgencyPatchFromFitClassification(classification, current)
  if (!next) return
  const { error } = await supabase.from("customers").update({ communication_urgency: next }).eq("id", customerId)
  if (error) console.warn("[leadFit] urgency update", error.message)
}

/**
 * When `force` is false, skips if lead was manually overridden or already auto-evaluated.
 * `fromScreening` re-scores auto evaluations when new attendant answers arrive.
 */
export async function evaluateAndPersistLeadFit(
  supabase: SupabaseClient,
  leadId: string,
  opts?: FitEvalOpts,
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
    fit_manually_overridden?: boolean | null
    fit_evaluated_at?: string | null
    fit_classification?: string | null
  }
  const prevFitForPersist = lead.fit_classification ?? null

  const force = opts?.force === true
  const fromScreening = opts?.fromScreening === true
  if (!force && lead.fit_manually_overridden) return null
  if (!force && !fromScreening && lead.fit_evaluated_at) return null

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("metadata")
    .eq("id", lead.user_id)
    .maybeSingle()
  if (profErr || !prof) {
    console.warn("[leadFit] profile", profErr?.message)
    return null
  }

  const prefs = parseLeadFilterPreferences((prof as { metadata?: unknown }).metadata)
  if (!prefs.enable_auto_filter && !force && !fromScreening) return null

  const engagement = mergeSupplemental(
    await fetchEngagementSignals(supabase, lead.user_id, lead.customer_id, leadId),
    opts?.supplementalText,
  )
  const result = scoreInboundFit(engagement)
  await persistFit(supabase, leadId, lead.user_id, result, {
    force,
    prevFit: prevFitForPersist,
    customerId: lead.customer_id ?? null,
  })
  return result
}

async function persistFit(
  supabase: SupabaseClient,
  leadId: string,
  userId: string,
  result: EvaluateLeadFitResult,
  ctx: { force: boolean; prevFit: string | null; customerId?: string | null },
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

  if (ctx.customerId) {
    const { data: cust } = await supabase
      .from("customers")
      .select("communication_urgency, fit_manually_overridden")
      .eq("id", ctx.customerId)
      .maybeSingle()
    const row = cust as { communication_urgency?: string | null; fit_manually_overridden?: boolean | null } | null
    if (!row?.fit_manually_overridden) {
      const next = urgencyPatchFromFitClassification(result.classification, row?.communication_urgency)
      const custUp: Record<string, unknown> = {
        fit_classification: result.classification,
        fit_confidence: result.confidence,
        fit_reason: result.reason.slice(0, 2000),
        fit_source: result.source,
        fit_manually_overridden: false,
        fit_evaluated_at: evaluatedAt,
      }
      if (next) custUp.communication_urgency = next
      const { error: cErr } = await supabase.from("customers").update(custUp).eq("id", ctx.customerId)
      if (cErr) console.warn("[leadFit] customer fit sync", cErr.message)
    }
  }

  void maybeCreateConversationAfterLeadFitHot(supabase, {
    userId,
    leadId,
    prevFit: ctx.prevFit,
    nextFit: result.classification,
  }).catch((e) => console.warn("[leadFit] qualified convo side effect", e instanceof Error ? e.message : e))
}

async function persistCustomerFit(
  supabase: SupabaseClient,
  customerId: string,
  result: EvaluateLeadFitResult,
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
  const { error: upErr } = await supabase.from("customers").update(up).eq("id", customerId)
  if (upErr) {
    console.error("[customerFit] update customer failed (run supabase/customers-lead-fit.sql?)", upErr.message)
    return
  }
  await applyUrgencyFromFit(supabase, customerId, result.classification)
}

/**
 * Same rules engine as leads, using inbound engagement (attendant answers first).
 */
export async function evaluateAndPersistCustomerFit(
  supabase: SupabaseClient,
  customerId: string,
  opts?: FitEvalOpts,
): Promise<EvaluateLeadFitResult | null> {
  const { data: row, error: rowErr } = await supabase
    .from("customers")
    .select("id, user_id, fit_manually_overridden, fit_evaluated_at, fit_classification")
    .eq("id", customerId)
    .maybeSingle()
  if (rowErr || !row) {
    console.warn("[customerFit] load customer", rowErr?.message)
    return null
  }
  const cust = row as {
    id: string
    user_id: string
    fit_manually_overridden?: boolean | null
    fit_evaluated_at?: string | null
    fit_classification?: string | null
  }
  const force = opts?.force === true
  const fromScreening = opts?.fromScreening === true
  if (!force && cust.fit_manually_overridden) return null
  if (!force && !fromScreening && cust.fit_evaluated_at) return null

  const { data: prof, error: profErr } = await supabase.from("profiles").select("metadata").eq("id", cust.user_id).maybeSingle()
  if (profErr || !prof) {
    console.warn("[customerFit] profile", profErr?.message)
    return null
  }
  const prefs = parseLeadFilterPreferences((prof as { metadata?: unknown }).metadata)
  if (!prefs.enable_auto_filter && !force && !fromScreening) return null

  const engagement = mergeSupplemental(
    await fetchEngagementSignals(supabase, cust.user_id, customerId),
    opts?.supplementalText,
  )
  const result = scoreInboundFit(engagement)
  await persistCustomerFit(supabase, customerId, result)
  return result
}

/**
 * Always apply attendant outcome to the customer (even when auto-filter is off).
 * Spam / silence → bad + Suspected Spam. Real answers → hot and clear that category.
 */
export async function applyCustomerFitFromScreening(
  supabase: SupabaseClient,
  params: {
    customerId: string
    leadId?: string | null
    userId: string
    verdict: string
    answers: ScreeningAnswerLike[]
  },
): Promise<EvaluateLeadFitResult | null> {
  const { data: cust } = await supabase
    .from("customers")
    .select("fit_manually_overridden")
    .eq("id", params.customerId)
    .maybeSingle()
  if ((cust as { fit_manually_overridden?: boolean | null } | null)?.fit_manually_overridden) return null

  const result = scoreInboundFit(signalsFromScreeningAnswers(params.verdict, params.answers))
  await persistCustomerFit(supabase, params.customerId, result)

  if (params.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("fit_manually_overridden, fit_classification")
      .eq("id", params.leadId)
      .maybeSingle()
    const leadRow = lead as { fit_manually_overridden?: boolean | null; fit_classification?: string | null } | null
    if (!leadRow?.fit_manually_overridden) {
      await persistFit(supabase, params.leadId, params.userId, result, {
        force: true,
        prevFit: leadRow?.fit_classification ?? null,
        customerId: params.customerId,
      })
    }
  }
  return result
}
