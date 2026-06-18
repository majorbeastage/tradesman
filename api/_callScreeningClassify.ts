import { firstEnv } from "./_communications.js"
import type { ScreeningAnswer } from "./_voiceAutoAttendant.js"

export type ScreeningVerdict = "good_lead" | "spam" | "cold_call" | "uncertain"

export type ScreeningClassification = {
  verdict: ScreeningVerdict
  intentSummary: string
  confidence: number
  spamSignals: string[]
  callerName: string | null
  callbackPhone: string | null
}

const COLD_CALL_PATTERNS = [
  /\bmortgage\b/i,
  /\brefinanc/i,
  /\bwarranty\b/i,
  /\bvehicle service contract\b/i,
  /\bgoogle (business|listing)\b/i,
  /\bseo\b/i,
  /\bpress 1\b/i,
  /\blower your (rate|bill)\b/i,
  /\bsocial security\b/i,
  /\birs\b/i,
  /\bstudent loan\b/i,
  /\bextended warranty\b/i,
  /\bhome warranty\b/i,
  /\benergy savings\b/i,
  /\bsolar panel\b/i,
  /\bmerchant services\b/i,
  /\bcredit card processing\b/i,
]

function heuristicClassify(answers: ScreeningAnswer[], spamScreenEnabled: boolean): ScreeningClassification | null {
  const combined = answers.map((a) => a.answer).join(" ").trim()
  const emptyCount = answers.filter((a) => !a.answer.trim()).length
  const nameAnswer = answers.find((a) => a.kind === "caller_name")?.answer?.trim() || null
  const phoneAnswer = answers.find((a) => a.kind === "callback_number")?.answer?.trim() || null
  const serviceAnswer = answers.find((a) => a.kind === "service_intent")?.answer?.trim() || ""

  const spamSignals: string[] = []
  for (const re of COLD_CALL_PATTERNS) {
    if (re.test(combined)) spamSignals.push(re.source)
  }
  if (emptyCount >= 2) spamSignals.push("no_response")
  if (combined.length > 0 && combined.length < 8 && !serviceAnswer) spamSignals.push("too_short")

  let verdict: ScreeningVerdict = "uncertain"
  if (spamScreenEnabled && spamSignals.length > 0) {
    verdict = spamSignals.includes("no_response") ? "cold_call" : "spam"
  } else if (serviceAnswer.length >= 12) {
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
    confidence: spamSignals.length > 0 ? 0.72 : serviceAnswer ? 0.65 : 0.5,
    spamSignals,
    callerName: nameAnswer,
    callbackPhone: phoneAnswer && !/^same$/i.test(phoneAnswer) ? phoneAnswer : null,
  }
}

export async function classifyCallScreeningAnswers(
  answers: ScreeningAnswer[],
  spamScreenEnabled: boolean,
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
            content:
              "You classify inbound business phone screening for trades/home services. Return JSON: verdict (good_lead|spam|cold_call|uncertain), intentSummary (1-2 sentences), confidence (0-1), spamSignals (string array), callerName (string|null), callbackPhone (string|null). Mark spam/cold_call for robocalls, mortgage/warranty pitches, SEO scams, silent callers, or nonsense. Mark good_lead when caller describes real local service need.",
          },
          {
            role: "user",
            content: `Spam screening ${spamScreenEnabled ? "enabled" : "disabled"}.\n\n${transcript}`,
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
