import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv, lookupCustomerIdByPhone } from "./_communications.js"
import { buildCallerGeoHint, type CallerGeoHint } from "./_callerGeography.js"
import { parseCustomerHubKind } from "./_customerContactKind.js"
import { parseLeadFilterPreferences } from "./_leadFitClassification.js"
import type { ScreeningAnswer } from "./_voiceAutoAttendant.js"
import { formatBusinessAiVocabularyForLlm, loadBusinessAiVocabulary } from "./_businessAiVocabulary.js"

export type ScreeningVerdict = "good_lead" | "spam" | "cold_call" | "uncertain"

export type ScreeningCallerContext = {
  callerPhone: string
  knownCustomer: boolean
  priorInboundCalls: number
  geo: CallerGeoHint
}

export type ScreeningClassification = {
  verdict: ScreeningVerdict
  intentSummary: string
  confidence: number
  spamSignals: string[]
  callerName: string | null
  callbackPhone: string | null
}

/** Obvious scam / robocall pitches — not “wrong industry” inquiries. */
const COLD_CALL_PATTERNS = [
  /\bmortgage\b/i,
  /\brefinanc/i,
  /\bvehicle service contract\b/i,
  /\bgoogle (business|listing)\b/i,
  /\bseo\b/i,
  /\bpress\s*1\b/i,
  /\blower your (rate|bill)\b/i,
  /\bsocial security\b/i,
  /\birs\b/i,
  /\bstudent loan\b/i,
  /\bextended warranty\b/i,
  /\bmerchant services\b/i,
  /\bcredit card processing\b/i,
  /\bduct cleaning\b/i,
  /\bmedical alert\b/i,
]

const CALL_CENTER_PATTERNS = [
  /\bpress\s*1\b/i,
  /\bpress\s*2\b/i,
  /\bplease hold\b/i,
  /\byour call is important\b/i,
  /\brecorded for quality\b/i,
  /\bmonitor(ed)?\s+or\s+recorded\b/i,
  /\blet me transfer\b/i,
  /\btransfer(ring)? you\b/i,
  /\banother (agent|representative|operator)\b/i,
  /\bone moment (please|while)\b/i,
  /\bstay on the line\b/i,
  /\bconnecting you to\b/i,
]

function spokenAnswers(answers: ScreeningAnswer[]): ScreeningAnswer[] {
  return answers.filter((a) => a.answer.trim().length >= 2)
}

/** Real person on the line — connect them. Do not hang up for product-fit nitpicks. */
export function looksLikeLiveCaller(answers: ScreeningAnswer[]): boolean {
  const spoken = spokenAnswers(answers)
  if (spoken.length === 0) return false
  const wordy = spoken.some((a) => a.answer.trim().split(/\s+/).filter(Boolean).length >= 3)
  return wordy || spoken.length >= Math.max(1, answers.length - 1)
}

function hasStrongBotOrCallCenter(combined: string): boolean {
  return CALL_CENTER_PATTERNS.some((re) => re.test(combined)) || COLD_CALL_PATTERNS.some((re) => re.test(combined))
}

export async function loadCallScreeningBusinessContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const lines: string[] = []
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, address_state, metadata")
    .eq("id", userId)
    .maybeSingle()
  const displayName = (profile as { display_name?: string | null } | null)?.display_name?.trim()
  if (displayName) lines.push(`Business name: ${displayName}`)

  const prefs = parseLeadFilterPreferences((profile as { metadata?: unknown } | null)?.metadata)
  if (prefs.accepted_job_types.trim()) {
    lines.push(`Services / job types this business handles (context only — do not reject live callers for mismatch): ${prefs.accepted_job_types.trim().slice(0, 700)}`)
  }

  const { data: jobTypes } = await supabase.from("job_types").select("name, materials_list").eq("user_id", userId).limit(40)
  const names = (jobTypes ?? [])
    .map((r) => String((r as { name?: string }).name ?? "").trim())
    .filter(Boolean)
  if (names.length) lines.push(`Job type library (context only): ${names.join(", ").slice(0, 500)}`)

  try {
    const vocab = await loadBusinessAiVocabulary(supabase, userId)
    const block = formatBusinessAiVocabularyForLlm(vocab)
    if (block) lines.push(block)
  } catch {
    /* optional enrichment */
  }

  if (lines.length === 0) {
    return "Business context: not specified — callers may be from any industry or product line."
  }
  return lines.join("\n")
}

export async function loadScreeningCallerContext(
  supabase: SupabaseClient,
  userId: string,
  callerPhone: string,
  currentCallSid?: string | null,
): Promise<ScreeningCallerContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("address_state, metadata")
    .eq("id", userId)
    .maybeSingle()
  const geo = buildCallerGeoHint({
    callerPhone,
    addressState: (profile as { address_state?: string | null } | null)?.address_state,
    metadata: (profile as { metadata?: unknown } | null)?.metadata,
  })

  const customerId = callerPhone ? await lookupCustomerIdByPhone(supabase, userId, callerPhone) : null
  let knownCustomer = false
  let promotional = false
  if (customerId) {
    const { data: customer } = await supabase
      .from("customers")
      .select("created_at, metadata")
      .eq("id", customerId)
      .eq("user_id", userId)
      .maybeSingle()
    promotional = parseCustomerHubKind((customer as { metadata?: unknown } | null)?.metadata) === "promotional"
    const createdMs = Date.parse(String((customer as { created_at?: string } | null)?.created_at ?? ""))
    knownCustomer = !promotional && Number.isFinite(createdMs) && Date.now() - createdMs > 20_000
  }

  let priorInboundCalls = 0
  if (customerId && !promotional) {
    const { data: events } = await supabase
      .from("communication_events")
      .select("external_id, created_at")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .eq("event_type", "call")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(12)
    priorInboundCalls = (events ?? []).filter((row) => {
      const sid = String((row as { external_id?: string | null }).external_id ?? "")
      if (currentCallSid && sid && sid === currentCallSid) return false
      const createdMs = Date.parse(String((row as { created_at?: string }).created_at ?? ""))
      return Number.isFinite(createdMs) && Date.now() - createdMs > 15_000
    }).length
  }

  return { callerPhone, knownCustomer, priorInboundCalls, geo }
}

function heuristicClassify(
  answers: ScreeningAnswer[],
  spamScreenEnabled: boolean,
  caller?: ScreeningCallerContext,
): ScreeningClassification {
  const combined = answers.map((a) => a.answer).join(" ").trim()
  const emptyCount = answers.filter((a) => !a.answer.trim()).length
  const nameAnswer = answers.find((a) => a.kind === "caller_name")?.answer?.trim() || null
  const phoneAnswer = answers.find((a) => a.kind === "callback_number")?.answer?.trim() || null
  const serviceAnswer = answers.find((a) => a.kind === "service_intent")?.answer?.trim() || ""
  const live = looksLikeLiveCaller(answers)

  const spamSignals: string[] = []
  if (hasStrongBotOrCallCenter(combined)) {
    for (const re of [...COLD_CALL_PATTERNS, ...CALL_CENTER_PATTERNS]) {
      if (re.test(combined)) spamSignals.push(re.source)
    }
  }
  if (answers.length > 0 && emptyCount === answers.length) spamSignals.push("no_speech")
  if (caller?.geo.inServiceArea === false) spamSignals.push("outside_service_area")
  if (caller?.knownCustomer) spamSignals.push("known_customer")
  if ((caller?.priorInboundCalls ?? 0) > 0) spamSignals.push("returning_caller")

  let verdict: ScreeningVerdict = "uncertain"
  if (!spamScreenEnabled) {
    verdict = live ? "good_lead" : "uncertain"
  } else if (caller?.knownCustomer || (caller?.priorInboundCalls ?? 0) > 0) {
    verdict = "good_lead"
  } else if (emptyCount === answers.length && answers.length > 0) {
    verdict = "cold_call"
  } else if (live) {
    verdict = "good_lead"
  } else if (hasStrongBotOrCallCenter(combined) && emptyCount >= 2) {
    verdict = "spam"
  }

  // Live speech always connects; product wording is ignored.
  if (live && (verdict === "spam" || verdict === "cold_call")) {
    verdict = "good_lead"
  }
  if ((caller?.knownCustomer || (caller?.priorInboundCalls ?? 0) > 0) && (verdict === "spam" || verdict === "cold_call")) {
    verdict = "good_lead"
  }

  const intentSummary =
    serviceAnswer ||
    answers
      .map((a) => a.answer)
      .filter(Boolean)
      .join(" · ")
      .slice(0, 240) ||
    "Inbound call screening completed."

  return {
    verdict,
    intentSummary,
    confidence: live || caller?.knownCustomer ? 0.7 : spamSignals.includes("no_speech") ? 0.75 : 0.5,
    spamSignals: spamSignals.filter((s) => s !== "known_customer" && s !== "returning_caller"),
    callerName: nameAnswer,
    callbackPhone: phoneAnswer && !/^same$/i.test(phoneAnswer) ? phoneAnswer : null,
  }
}

const SCREENING_SYSTEM_PROMPT = `You screen inbound phone calls for a small-business auto-attendant.

Return JSON: verdict (good_lead|spam|cold_call|uncertain), intentSummary (1-2 sentences), confidence (0-1), spamSignals (string array), callerName (string|null), callbackPhone (string|null).

Goal: CONNECT real people. Prefer good_lead whenever a human is answering in their own words.

Mark spam or cold_call ONLY when evidence is strong:
- Nobody speaks (empty / silence on every prompt) — likely a bot or abandoned dialer
- Call-center / robocall behavior: "press 1", hold music language, "please hold", "let me transfer you", a second person joining after a pause, mass-dial scripts
- Clear scam pitches (IRS, warranty, mortgage, SEO blast, student loan)

Do NOT mark spam because:
- The caller's job description does not match the contractor's product list or job types
- They answered briefly ("yes", a first name, "leak", "water heater")
- Their area code is outside the service area (that is a weak hint only)
- You are unsure — use good_lead if they spoke, otherwise uncertain

Known / returning customers must be good_lead.

Outside service-area area codes may be listed in spamSignals as "outside_service_area" but must not be the sole reason for spam/cold_call if the caller spoke.`

function applyConnectSafety(
  classification: ScreeningClassification,
  answers: ScreeningAnswer[],
  caller?: ScreeningCallerContext,
): ScreeningClassification {
  const live = looksLikeLiveCaller(answers)
  const returning = Boolean(caller?.knownCustomer || (caller?.priorInboundCalls ?? 0) > 0)
  const combined = answers.map((a) => a.answer).join(" ")
  const botty = hasStrongBotOrCallCenter(combined)
  let verdict = classification.verdict
  const spamSignals = [...classification.spamSignals]
  if (caller?.geo.inServiceArea === false && !spamSignals.includes("outside_service_area")) {
    spamSignals.push("outside_service_area")
  }

  if (returning) {
    if (verdict === "spam" || verdict === "cold_call") verdict = "good_lead"
  } else if (answers.length > 0 && spokenAnswers(answers).length === 0) {
    verdict = "cold_call"
  } else if (botty) {
    verdict = "spam"
  } else if (live && (verdict === "spam" || verdict === "cold_call")) {
    verdict = "good_lead"
  }

  return { ...classification, verdict, spamSignals }
}

export async function classifyCallScreeningAnswers(
  answers: ScreeningAnswer[],
  spamScreenEnabled: boolean,
  businessContext?: string,
  caller?: ScreeningCallerContext,
): Promise<ScreeningClassification> {
  const fallback = heuristicClassify(answers, spamScreenEnabled, caller)
  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    return applyConnectSafety(
      fallback ?? {
        verdict: "uncertain",
        intentSummary: "Call screening completed.",
        confidence: 0.4,
        spamSignals: [],
        callerName: null,
        callbackPhone: null,
      },
      answers,
      caller,
    )
  }

  const transcript = answers
    .map((a) => `Q (${a.kind}): ${a.question}\nA: ${a.answer || "(no response)"}`)
    .join("\n\n")

  const contextBlock = businessContext?.trim()
    ? `\n\nBusiness context:\n${businessContext.trim()}`
    : "\n\nBusiness context: not specified."

  const callerBlock = caller
    ? `\n\nCaller context:\nPhone: ${caller.callerPhone || "unknown"}\nKnown customer (already in Customers tab): ${caller.knownCustomer ? "yes — connect" : "no"}\nPrior inbound calls from this number: ${caller.priorInboundCalls}\n${caller.geo.note}`
    : ""

  try {
    const oa = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: SCREENING_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `Spam screening ${spamScreenEnabled ? "enabled" : "disabled"}.${contextBlock}${callerBlock}\n\nCaller transcript:\n${transcript}`,
          },
        ],
      }),
    })
    if (!oa.ok) return applyConnectSafety(fallback, answers, caller)
    const data = (await oa.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content
    if (!raw) return applyConnectSafety(fallback, answers, caller)
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const verdictRaw = String(parsed.verdict ?? "")
    const verdict: ScreeningVerdict =
      verdictRaw === "good_lead" || verdictRaw === "spam" || verdictRaw === "cold_call" || verdictRaw === "uncertain"
        ? verdictRaw
        : fallback.verdict
    const classified: ScreeningClassification = {
      verdict: spamScreenEnabled ? verdict : verdict === "spam" || verdict === "cold_call" ? "uncertain" : verdict,
      intentSummary: typeof parsed.intentSummary === "string" ? parsed.intentSummary.slice(0, 500) : fallback.intentSummary,
      confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : fallback.confidence,
      spamSignals: Array.isArray(parsed.spamSignals)
        ? parsed.spamSignals.filter((x): x is string => typeof x === "string").slice(0, 12)
        : fallback.spamSignals,
      callerName: typeof parsed.callerName === "string" ? parsed.callerName.trim() || null : fallback.callerName,
      callbackPhone:
        typeof parsed.callbackPhone === "string" ? parsed.callbackPhone.trim() || null : fallback.callbackPhone,
    }
    return applyConnectSafety(classified, answers, caller)
  } catch (e) {
    console.error("[call-screening] classify error", e instanceof Error ? e.message : e)
    return applyConnectSafety(fallback, answers, caller)
  }
}
