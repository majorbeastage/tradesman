import type { SupabaseClient } from "@supabase/supabase-js"
import { firstEnv } from "./_communications.js"
import { parseLeadFilterPreferences } from "./_leadFitClassification.js"
import type { ScreeningAnswer } from "./_voiceAutoAttendant.js"
import { formatBusinessAiVocabularyForLlm, loadBusinessAiVocabulary } from "./_businessAiVocabulary.js"

export type ScreeningVerdict = "good_lead" | "spam" | "cold_call" | "uncertain"

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
  /\bbraces?\b.*\bfree\b/i,
]

const CALL_CENTER_PATTERNS = [
  /\bpress\s*1\b/i,
  /\bpress\s*2\b/i,
  /\bplease hold\b/i,
  /\byour call is important\b/i,
  /\brecorded for quality\b/i,
  /\bmonitor(ed)?\s+or\s+recorded\b/i,
]

export async function loadCallScreeningBusinessContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const lines: string[] = []
  const { data: profile } = await supabase.from("profiles").select("display_name, metadata").eq("id", userId).maybeSingle()
  const displayName = (profile as { display_name?: string | null } | null)?.display_name?.trim()
  if (displayName) lines.push(`Business name: ${displayName}`)

  const prefs = parseLeadFilterPreferences((profile as { metadata?: unknown } | null)?.metadata)
  if (prefs.accepted_job_types.trim()) {
    lines.push(`Services / job types this business handles: ${prefs.accepted_job_types.trim().slice(0, 700)}`)
  }

  const { data: jobTypes } = await supabase.from("job_types").select("name, materials_list").eq("user_id", userId).limit(40)
  const names = (jobTypes ?? [])
    .map((r) => String((r as { name?: string }).name ?? "").trim())
    .filter(Boolean)
  if (names.length) lines.push(`Job type library: ${names.join(", ").slice(0, 500)}`)

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

function heuristicClassify(answers: ScreeningAnswer[], spamScreenEnabled: boolean): ScreeningClassification | null {
  const combined = answers.map((a) => a.answer).join(" ").trim()
  const emptyCount = answers.filter((a) => !a.answer.trim()).length
  const nameAnswer = answers.find((a) => a.kind === "caller_name")?.answer?.trim() || null
  const phoneAnswer = answers.find((a) => a.kind === "callback_number")?.answer?.trim() || null
  const serviceAnswer = answers.find((a) => a.kind === "service_intent")?.answer?.trim() || ""

  const spamSignals: string[] = []
  for (const re of [...COLD_CALL_PATTERNS, ...CALL_CENTER_PATTERNS]) {
    if (re.test(combined)) spamSignals.push(re.source)
  }
  if (emptyCount >= 2) spamSignals.push("no_response")
  if (combined.length > 0 && combined.length < 6 && emptyCount >= 1 && !serviceAnswer) spamSignals.push("too_short")

  let verdict: ScreeningVerdict = "uncertain"
  const hasSubstantiveAnswer = serviceAnswer.length >= 8 || combined.length >= 20
  if (spamScreenEnabled && spamSignals.length > 0 && !hasSubstantiveAnswer) {
    verdict = spamSignals.includes("no_response") ? "cold_call" : "spam"
  } else if (hasSubstantiveAnswer) {
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
    confidence: spamSignals.length > 0 && !hasSubstantiveAnswer ? 0.72 : hasSubstantiveAnswer ? 0.65 : 0.5,
    spamSignals,
    callerName: nameAnswer,
    callbackPhone: phoneAnswer && !/^same$/i.test(phoneAnswer) ? phoneAnswer : null,
  }
}

const SCREENING_SYSTEM_PROMPT = `You classify inbound business phone screening for small businesses in ANY industry (software, professional services, trades, retail, etc.).

Return JSON: verdict (good_lead|spam|cold_call|uncertain), intentSummary (1-2 sentences), confidence (0-1), spamSignals (string array), callerName (string|null), callbackPhone (string|null).

Mark spam or cold_call ONLY for strong signals such as:
- Obvious robocall / call-center patterns (redirect tones, long silence before the caller speaks, "press 1", mass-dial scripts)
- Clear scam or unsolicited sales pitches (mortgage, warranty, SEO, IRS, student loan forgiveness, etc.)
- Nonsense or no meaningful response after multiple prompts

Do NOT mark spam solely because the caller's product, package, or service does not match home repair or trades. Software, office, and product inquiries are often legitimate — use good_lead or uncertain.

When business context lists services or job types, use it to judge fit, but be lenient for product-related questions unless other spam signals are present.

Prefer uncertain over spam when unsure.`

export async function classifyCallScreeningAnswers(
  answers: ScreeningAnswer[],
  spamScreenEnabled: boolean,
  businessContext?: string,
): Promise<ScreeningClassification> {
  const fallback = heuristicClassify(answers, spamScreenEnabled)
  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    return fallback ?? {
      verdict: "uncertain",
      intentSummary: "Call screening completed.",
      confidence: 0.4,
      spamSignals: [],
      callerName: null,
      callbackPhone: null,
    }
  }

  const transcript = answers
    .map((a) => `Q (${a.kind}): ${a.question}\nA: ${a.answer || "(no response)"}`)
    .join("\n\n")

  const contextBlock = businessContext?.trim()
    ? `\n\nBusiness context:\n${businessContext.trim()}`
    : "\n\nBusiness context: not specified."

  try {
    const oa = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: SCREENING_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `Spam screening ${spamScreenEnabled ? "enabled" : "disabled"}.${contextBlock}\n\nCaller transcript:\n${transcript}`,
          },
        ],
      }),
    })
    if (!oa.ok) return fallback!
    const data = (await oa.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content
    if (!raw) return fallback!
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const verdictRaw = String(parsed.verdict ?? "")
    const verdict: ScreeningVerdict =
      verdictRaw === "good_lead" || verdictRaw === "spam" || verdictRaw === "cold_call" || verdictRaw === "uncertain"
        ? verdictRaw
        : fallback!.verdict
    return {
      verdict: spamScreenEnabled ? verdict : verdict === "spam" || verdict === "cold_call" ? "uncertain" : verdict,
      intentSummary: typeof parsed.intentSummary === "string" ? parsed.intentSummary.slice(0, 500) : fallback!.intentSummary,
      confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : fallback!.confidence,
      spamSignals: Array.isArray(parsed.spamSignals)
        ? parsed.spamSignals.filter((x): x is string => typeof x === "string").slice(0, 12)
        : fallback!.spamSignals,
      callerName: typeof parsed.callerName === "string" ? parsed.callerName.trim() || null : fallback!.callerName,
      callbackPhone:
        typeof parsed.callbackPhone === "string" ? parsed.callbackPhone.trim() || null : fallback!.callbackPhone,
    }
  } catch (e) {
    console.error("[call-screening] classify error", e instanceof Error ? e.message : e)
    return fallback!
  }
}
