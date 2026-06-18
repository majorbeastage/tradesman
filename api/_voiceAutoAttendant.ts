/** Server mirror of src/lib/voiceAutoAttendant.ts — keep parse logic aligned. */

import type { SupabaseClient } from "@supabase/supabase-js"

export type VoiceAutoAttendantMode = "off" | "ai_menu" | "recorded_menu"

export type VoiceScreeningStepKind =
  | "service_intent"
  | "schedule_timing"
  | "caller_name"
  | "callback_number"
  | "custom"

export type VoiceScreeningStep = {
  id: string
  kind: VoiceScreeningStepKind
  prompt: string
  recordingUrl?: string
  enabled: boolean
}

export type VoiceAutoAttendantSettings = {
  enabled: boolean
  mode: VoiceAutoAttendantMode
  spamScreenEnabled: boolean
  forwardGoodLeads: boolean
  spamToVoicemail: boolean
  menuSteps: VoiceScreeningStep[]
  unknownCallerShowTradesmanId: boolean
  collectContactInfo: boolean
}

const RECOMMENDED: VoiceScreeningStep[] = [
  { id: "svc", kind: "service_intent", prompt: "Briefly describe what service you are calling about.", enabled: true },
  {
    id: "sched",
    kind: "schedule_timing",
    prompt: "When are you interested in scheduling work for {service}?",
    enabled: true,
  },
  { id: "name", kind: "caller_name", prompt: "May I have your name please?", enabled: true },
  {
    id: "phone",
    kind: "callback_number",
    prompt:
      "If we need to reach you on a different number, please say it now. Otherwise say the word same to keep the number you are calling from.",
    enabled: true,
  },
]

export const DEFAULT_VOICE_AUTO_ATTENDANT: VoiceAutoAttendantSettings = {
  enabled: false,
  mode: "off",
  spamScreenEnabled: true,
  forwardGoodLeads: true,
  spamToVoicemail: true,
  menuSteps: [...RECOMMENDED],
  unknownCallerShowTradesmanId: false,
  collectContactInfo: true,
}

function parseStep(raw: unknown): VoiceScreeningStep | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const kind =
    o.kind === "service_intent" ||
    o.kind === "schedule_timing" ||
    o.kind === "caller_name" ||
    o.kind === "callback_number" ||
    o.kind === "custom"
      ? o.kind
      : "custom"
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : ""
  const recordingUrl = typeof o.recordingUrl === "string" ? o.recordingUrl.trim() : ""
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `step_${Math.random().toString(36).slice(2, 9)}`
  if (!prompt && !recordingUrl) return null
  return {
    id,
    kind,
    prompt: prompt || "Please leave a brief message.",
    recordingUrl: recordingUrl || undefined,
    enabled: o.enabled !== false,
  }
}

function parseLegacyMenuPrompts(raw: unknown): VoiceScreeningStep[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((text, i) => ({
      id: `legacy_${i}`,
      kind: "custom" as const,
      prompt: text.trim(),
      enabled: true,
    }))
}

export function parseVoiceAutoAttendant(raw: unknown): VoiceAutoAttendantSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_VOICE_AUTO_ATTENDANT }
  const o = raw as Record<string, unknown>
  const mode =
    o.mode === "ai_menu" || o.mode === "recorded_menu" || o.mode === "off" ? o.mode : DEFAULT_VOICE_AUTO_ATTENDANT.mode
  const menuStepsRaw = Array.isArray(o.menuSteps) ? o.menuSteps : null
  const menuSteps =
    menuStepsRaw && menuStepsRaw.length > 0
      ? menuStepsRaw.map(parseStep).filter((s): s is VoiceScreeningStep => s !== null)
      : parseLegacyMenuPrompts(o.menuPrompts)
  return {
    enabled: o.enabled === true,
    mode,
    spamScreenEnabled: o.spamScreenEnabled !== false,
    forwardGoodLeads: o.forwardGoodLeads !== false,
    spamToVoicemail: o.spamToVoicemail !== false,
    menuSteps: menuSteps.length > 0 ? menuSteps : [...RECOMMENDED],
    unknownCallerShowTradesmanId: o.unknownCallerShowTradesmanId === true,
    collectContactInfo: o.collectContactInfo !== false,
  }
}

export function resolveScreeningPrompt(step: VoiceScreeningStep, prior: Record<string, string>): string {
  const service = (prior.service_intent || "").trim()
  let text = step.prompt.trim()
  if (text.includes("{service}") && service) {
    text = text.replace(/\{service\}/g, service.slice(0, 100))
  } else if (step.kind === "schedule_timing" && service && !text.includes("{service}")) {
    text = `When are you interested in scheduling work for ${service.slice(0, 80)}?`
  }
  return text
}

export function activeScreeningSteps(settings: VoiceAutoAttendantSettings): VoiceScreeningStep[] {
  return settings.menuSteps.filter((s) => s.enabled && (s.prompt.trim() || s.recordingUrl?.trim()))
}

export async function loadVoiceAutoAttendantForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<VoiceAutoAttendantSettings> {
  if (!userId) return { ...DEFAULT_VOICE_AUTO_ATTENDANT }
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  return parseVoiceAutoAttendant(meta.voice_auto_attendant_v1)
}

export type ScreeningAnswer = {
  stepId: string
  kind: VoiceScreeningStepKind
  question: string
  answer: string
}

export function priorAnswersMap(answers: ScreeningAnswer[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const a of answers) {
    if (a.answer.trim()) map[a.kind] = a.answer.trim()
  }
  return map
}

export function encodeScreeningAnswers(answers: ScreeningAnswer[]): string {
  return Buffer.from(JSON.stringify(answers)).toString("base64url")
}

export function decodeScreeningAnswers(raw: string): ScreeningAnswer[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const o = x as Record<string, unknown>
        const kind = typeof o.kind === "string" ? o.kind : "custom"
        return {
          stepId: typeof o.stepId === "string" ? o.stepId : "",
          kind: kind as VoiceScreeningStepKind,
          question: typeof o.question === "string" ? o.question : "",
          answer: typeof o.answer === "string" ? o.answer : "",
        }
      })
  } catch {
    return []
  }
}
