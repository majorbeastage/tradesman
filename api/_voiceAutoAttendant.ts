/** Server mirror of src/lib/voiceAutoAttendant.ts — keep parse logic aligned. */

import type { SupabaseClient } from "@supabase/supabase-js"

export type VoiceAutoAttendantMode = "off" | "ai_menu" | "recorded_menu" | "record_own_menu"
export type VoiceMenuLayout = "standard" | "custom"
export type VoiceStepVoiceSource = "ai" | "hannah" | "own"

export type VoiceScreeningStepKind =
  | "service_intent"
  | "schedule_timing"
  | "caller_name"
  | "callback_number"
  | "sms_opt_in"
  | "custom"

export type VoiceScreeningStep = {
  id: string
  kind: VoiceScreeningStepKind
  prompt: string
  recordingUrl?: string
  voiceSource?: VoiceStepVoiceSource
  responseTimeoutSeconds?: number
  enabled: boolean
}

export type VoiceSavedPrompt = {
  id: string
  prompt: string
  voiceSource: VoiceStepVoiceSource
  recordingUrl?: string
  kind: VoiceScreeningStepKind
}

export type VoiceAutoAttendantSettings = {
  enabled: boolean
  mode: VoiceAutoAttendantMode
  menuLayout?: VoiceMenuLayout
  spamScreenEnabled: boolean
  forwardGoodLeads: boolean
  spamToVoicemail: boolean
  menuSteps: VoiceScreeningStep[]
  savedPrompts?: VoiceSavedPrompt[]
  unknownCallerShowTradesmanId: boolean
  collectContactInfo: boolean
  /** AI opening line before the first question. Empty string skips it. */
  introPrompt: string
  /** Optional recorded opening greeting — independent of how questions are voiced. */
  introRecordingUrl?: string
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
    id: "sms",
    kind: "sms_opt_in",
    prompt:
      "Do you agree to receive text messages regarding your service request? We do not send text messages for marketing purposes.",
    enabled: true,
  },
]

export const DEFAULT_INTRO_PROMPT =
  "Thanks for calling. To help us route your call, please answer a few quick questions."

const INTRO_PROMPT_MAX_LENGTH = 500

function parseIntroPrompt(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_INTRO_PROMPT
  return raw.slice(0, INTRO_PROMPT_MAX_LENGTH)
}

function parseIntroRecordingUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const url = raw.trim().slice(0, 800)
  return url || undefined
}

export const DEFAULT_VOICE_AUTO_ATTENDANT: VoiceAutoAttendantSettings = {
  enabled: false,
  mode: "off",
  menuLayout: "standard",
  spamScreenEnabled: true,
  forwardGoodLeads: true,
  spamToVoicemail: true,
  menuSteps: [...RECOMMENDED],
  savedPrompts: [],
  unknownCallerShowTradesmanId: false,
  collectContactInfo: true,
  introPrompt: DEFAULT_INTRO_PROMPT,
}

function parseStep(raw: unknown): VoiceScreeningStep | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const kind =
    o.kind === "service_intent" ||
    o.kind === "schedule_timing" ||
    o.kind === "caller_name" ||
    o.kind === "callback_number" ||
    o.kind === "sms_opt_in" ||
    o.kind === "custom"
      ? o.kind
      : "custom"
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : ""
  const recordingUrl = typeof o.recordingUrl === "string" ? o.recordingUrl.trim() : ""
  const responseTimeout = Number(o.responseTimeoutSeconds)
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `step_${Math.random().toString(36).slice(2, 9)}`
  if (!prompt && !recordingUrl) return null
  const voiceSource =
    o.voiceSource === "ai" || o.voiceSource === "hannah" || o.voiceSource === "own" ? o.voiceSource : undefined
  return {
    id,
    kind,
    prompt: prompt || "Please leave a brief message.",
    recordingUrl: recordingUrl || undefined,
    voiceSource,
    responseTimeoutSeconds: Number.isFinite(responseTimeout)
      ? Math.min(20, Math.max(5, Math.round(responseTimeout)))
      : recommendedResponseTimeoutSeconds(kind, prompt),
    enabled: o.enabled !== false,
  }
}

export function recommendedResponseTimeoutSeconds(kind: VoiceScreeningStepKind, prompt: string): number {
  const text = prompt.toLowerCase()
  if (kind === "service_intent" || /\b(describe|explain|tell us|what happened|details?)\b/.test(text)) return 14
  if (kind === "callback_number" || /\b(phone|number|address|email)\b/.test(text)) return 12
  if (kind === "schedule_timing" || /\b(when|schedule|date|time|availability)\b/.test(text)) return 11
  if (kind === "caller_name" || kind === "sms_opt_in" || /\b(yes|no|agree|name)\b/.test(text)) return 8
  return Math.min(16, Math.max(9, 8 + Math.ceil(prompt.trim().split(/\s+/).length / 8)))
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
    o.mode === "ai_menu" || o.mode === "recorded_menu" || o.mode === "record_own_menu" || o.mode === "off"
      ? o.mode
      : DEFAULT_VOICE_AUTO_ATTENDANT.mode
  const hasMenuStepsArray = Array.isArray(o.menuSteps)
  const menuStepsRaw = hasMenuStepsArray ? o.menuSteps : null
  const menuSteps = menuStepsRaw
    ? menuStepsRaw.map(parseStep).filter((s): s is VoiceScreeningStep => s !== null)
    : parseLegacyMenuPrompts(o.menuPrompts)
  const menuLayout =
    o.menuLayout === "standard" || o.menuLayout === "custom"
      ? o.menuLayout
      : mode === "recorded_menu" || mode === "record_own_menu"
        ? "custom"
        : "standard"
  const savedPrompts = Array.isArray(o.savedPrompts)
    ? o.savedPrompts
        .map((raw) => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
          const p = raw as Record<string, unknown>
          const prompt = typeof p.prompt === "string" ? p.prompt.trim().slice(0, 500) : ""
          if (!prompt) return null
          const recordingUrl = typeof p.recordingUrl === "string" ? p.recordingUrl.trim().slice(0, 800) : ""
          const voiceSource =
            p.voiceSource === "ai" || p.voiceSource === "hannah" || p.voiceSource === "own"
              ? p.voiceSource
              : recordingUrl
                ? "own"
                : "ai"
          return {
            id: typeof p.id === "string" && p.id.trim() ? p.id.trim() : `saved_${Math.random().toString(36).slice(2, 9)}`,
            prompt,
            voiceSource,
            recordingUrl: recordingUrl || undefined,
            kind:
              p.kind === "service_intent" ||
              p.kind === "schedule_timing" ||
              p.kind === "caller_name" ||
              p.kind === "callback_number" ||
              p.kind === "sms_opt_in" ||
              p.kind === "custom"
                ? p.kind
                : "custom",
          } satisfies VoiceSavedPrompt
        })
        .filter((p): p is VoiceSavedPrompt => p !== null)
        .slice(0, 40)
    : []
  return {
    enabled: o.enabled === true,
    mode,
    menuLayout,
    spamScreenEnabled: o.spamScreenEnabled !== false,
    forwardGoodLeads: o.forwardGoodLeads !== false,
    spamToVoicemail: o.spamToVoicemail !== false,
    menuSteps: hasMenuStepsArray ? menuSteps : menuSteps.length > 0 ? menuSteps : [...RECOMMENDED],
    savedPrompts,
    unknownCallerShowTradesmanId: o.unknownCallerShowTradesmanId === true,
    collectContactInfo: o.collectContactInfo !== false,
    introPrompt: parseIntroPrompt(o.introPrompt),
    introRecordingUrl: parseIntroRecordingUrl(o.introRecordingUrl),
  }
}

export function resolveStepVoiceSource(
  settings: Pick<VoiceAutoAttendantSettings, "mode">,
  step: Pick<VoiceScreeningStep, "voiceSource" | "recordingUrl">,
): VoiceStepVoiceSource {
  if (step.voiceSource === "ai" || step.voiceSource === "hannah" || step.voiceSource === "own") return step.voiceSource
  if (step.recordingUrl) {
    if (settings.mode === "recorded_menu") return "hannah"
    return "own"
  }
  return "ai"
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
