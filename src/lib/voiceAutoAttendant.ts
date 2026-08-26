/** Optional inbound call screening / auto-attendant (off by default). Stored on profiles.metadata.voice_auto_attendant_v1 */

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
  /** Spoken prompt for AI, or a reference description for recorded questions. Use {service} for prior answer. */
  prompt: string
  /** Audio URL when this question uses Hannah or a user recording. */
  recordingUrl?: string
  /** How this question is spoken. Missing values are inferred from the legacy global menu mode. */
  voiceSource?: VoiceStepVoiceSource
  /** Smart initial-silence window. Twilio still listens through the caller's answer until they pause. */
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
  /** Standard 4-question template vs custom add/remove menu. */
  menuLayout?: VoiceMenuLayout
  /** Screen spam / cold-call patterns before forwarding. */
  spamScreenEnabled: boolean
  /** Forward qualified callers immediately to forward_to_phone. */
  forwardGoodLeads: boolean
  /** Send spam / non-responsive callers to voicemail without ringing the owner. */
  spamToVoicemail: boolean
  /** Ordered IVR questions — speech answers transcribed and logged. */
  menuSteps: VoiceScreeningStep[]
  /** Client-saved prompts available in the question description dropdown. */
  savedPrompts?: VoiceSavedPrompt[]
  /** When caller ID is unknown, show Tradesman business line on forwarded leg. */
  unknownCallerShowTradesmanId: boolean
  /** Include name + callback number steps in recommended template. */
  collectContactInfo: boolean
  /** AI opening line before the first question. Empty string skips it. */
  introPrompt: string
  /** Optional recorded opening greeting — independent of how questions are voiced. */
  introRecordingUrl?: string
}

let stepIdCounter = 0
export function newScreeningStepId(): string {
  stepIdCounter += 1
  return `step_${Date.now()}_${stepIdCounter}`
}

export const RECOMMENDED_SCREENING_STEPS: VoiceScreeningStep[] = [
  {
    id: "svc",
    kind: "service_intent",
    prompt: "Briefly describe what service you are calling about.",
    voiceSource: "ai",
    enabled: true,
  },
  {
    id: "sched",
    kind: "schedule_timing",
    prompt: "When are you interested in scheduling work for {service}?",
    voiceSource: "ai",
    enabled: true,
  },
  {
    id: "name",
    kind: "caller_name",
    prompt: "May I have your name please?",
    voiceSource: "ai",
    enabled: true,
  },
  {
    id: "sms",
    kind: "sms_opt_in",
    prompt:
      "Do you agree to receive text messages regarding your service request? We do not send text messages for marketing purposes.",
    voiceSource: "ai",
    enabled: true,
  },
]

export const DEFAULT_INTRO_PROMPT =
  "Thanks for calling. To help us route your call, please answer a few quick questions."

export const INTRO_PROMPT_MAX_LENGTH = 500
export const CUSTOM_AI_PROMPT_MAX_LENGTH = 120

export function standardQuestionSummary(kind: VoiceScreeningStepKind, prompt = ""): string {
  if (kind === "service_intent") return "What service is this call about?"
  if (kind === "schedule_timing") return "When do they want to schedule?"
  if (kind === "caller_name") return "Caller's name"
  if (kind === "callback_number") return "Callback number"
  if (kind === "sms_opt_in") return "SMS opt-in for service updates"
  const text = prompt.replace(/\s+/g, " ").trim()
  if (!text) return "Custom question"
  return text.length > 48 ? `${text.slice(0, 45)}…` : text
}

/** Keep the saved menu mode when toggling on; never force AI playback over recordings. */
export function attendantModeWhenEnabled(enabled: boolean, current: VoiceAutoAttendantMode): VoiceAutoAttendantMode {
  if (!enabled) return "off"
  return current === "off" ? "ai_menu" : current
}

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
  menuSteps: [...RECOMMENDED_SCREENING_STEPS],
  savedPrompts: [],
  unknownCallerShowTradesmanId: false,
  collectContactInfo: true,
  introPrompt: DEFAULT_INTRO_PROMPT,
}

function parseVoiceSource(raw: unknown): VoiceStepVoiceSource | undefined {
  return raw === "ai" || raw === "hannah" || raw === "own" ? raw : undefined
}

function parseMenuLayout(raw: unknown, mode: VoiceAutoAttendantMode): VoiceMenuLayout {
  if (raw === "standard" || raw === "custom") return raw
  if (mode === "recorded_menu" || mode === "record_own_menu") return "custom"
  return "standard"
}

export function inferKindFromPrompt(prompt: string): VoiceScreeningStepKind {
  const text = prompt.toLowerCase()
  if (/\b(sms|text message|opt.?in|agree to receive)\b/.test(text)) return "sms_opt_in"
  if (/\b(callback|phone number|best number)\b/.test(text)) return "callback_number"
  if (/\b(your name|caller.?name|may i have your name)\b/.test(text)) return "caller_name"
  if (/\b(when|schedule|availability|what day)\b/.test(text)) return "schedule_timing"
  if (/\b(service|calling about|project|describe)\b/.test(text)) return "service_intent"
  return "custom"
}

export function resolveMenuLayout(settings: Pick<VoiceAutoAttendantSettings, "menuLayout" | "mode">): VoiceMenuLayout {
  return parseMenuLayout(settings.menuLayout, settings.mode)
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

/** Freeze inferred playback onto each step so a later save can use `ai_menu` without losing Hannah/own clips. */
export function stampStepVoiceSources(
  settings: Pick<VoiceAutoAttendantSettings, "mode">,
  steps: VoiceScreeningStep[],
): VoiceScreeningStep[] {
  return steps.map((step) => ({
    ...step,
    voiceSource: resolveStepVoiceSource(settings, step),
  }))
}

function parseSavedPrompt(raw: unknown): VoiceSavedPrompt | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const prompt = typeof o.prompt === "string" ? o.prompt.trim().slice(0, 500) : ""
  if (!prompt) return null
  const recordingUrl = typeof o.recordingUrl === "string" ? o.recordingUrl.trim().slice(0, 800) : ""
  const voiceSource = parseVoiceSource(o.voiceSource) ?? (recordingUrl ? "own" : "ai")
  const kind = inferKindFromPrompt(prompt)
  const parsedKind =
    o.kind === "service_intent" ||
    o.kind === "schedule_timing" ||
    o.kind === "caller_name" ||
    o.kind === "callback_number" ||
    o.kind === "sms_opt_in" ||
    o.kind === "custom"
      ? o.kind
      : kind
  return {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : newScreeningStepId(),
    prompt,
    voiceSource,
    recordingUrl: recordingUrl || undefined,
    kind: parsedKind,
  }
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
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newScreeningStepId()
  if (!prompt && !recordingUrl) return null
  const voiceSource = parseVoiceSource(o.voiceSource)
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
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_VOICE_AUTO_ATTENDANT, menuSteps: [...RECOMMENDED_SCREENING_STEPS] }
  const o = raw as Record<string, unknown>
  const mode =
    o.mode === "ai_menu" || o.mode === "recorded_menu" || o.mode === "record_own_menu" || o.mode === "off"
      ? o.mode
      : DEFAULT_VOICE_AUTO_ATTENDANT.mode
  const menuStepsRaw = Array.isArray(o.menuSteps) ? (o.menuSteps as unknown[]) : null
  const menuSteps =
    menuStepsRaw
      ? menuStepsRaw.map(parseStep).filter((s): s is VoiceScreeningStep => s !== null)
      : parseLegacyMenuPrompts(o.menuPrompts)
  const savedPrompts = Array.isArray(o.savedPrompts)
    ? o.savedPrompts.map(parseSavedPrompt).filter((p): p is VoiceSavedPrompt => p !== null).slice(0, 40)
    : []
  return {
    enabled: o.enabled === true,
    mode,
    menuLayout: parseMenuLayout(o.menuLayout, mode),
    spamScreenEnabled: o.spamScreenEnabled !== false,
    forwardGoodLeads: o.forwardGoodLeads !== false,
    spamToVoicemail: o.spamToVoicemail !== false,
    menuSteps: menuStepsRaw ? menuSteps : menuSteps.length > 0 ? menuSteps : [...RECOMMENDED_SCREENING_STEPS],
    savedPrompts,
    unknownCallerShowTradesmanId: o.unknownCallerShowTradesmanId === true,
    collectContactInfo: o.collectContactInfo !== false,
    introPrompt: parseIntroPrompt(o.introPrompt),
    introRecordingUrl: parseIntroRecordingUrl(o.introRecordingUrl),
  }
}

/** Resolve spoken prompt text using prior answers (e.g. schedule question references service). */
export function resolveScreeningPrompt(step: VoiceScreeningStep, prior: Record<string, string>): string {
  const service = (prior.service_intent || prior.custom || "").trim()
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

export function mergeVoiceAutoAttendantMetadata(
  prev: Record<string, unknown>,
  patch: Partial<VoiceAutoAttendantSettings>,
): Record<string, unknown> {
  const current = parseVoiceAutoAttendant(prev.voice_auto_attendant_v1)
  return {
    ...prev,
    voice_auto_attendant_v1: { ...current, ...patch },
  }
}

export function recommendedStepsWithContact(collectContactInfo: boolean): VoiceScreeningStep[] {
  const base = RECOMMENDED_SCREENING_STEPS.map((s) => ({ ...s, id: newScreeningStepId(), voiceSource: "ai" as const }))
  if (collectContactInfo) return base
  return base.filter((s) => s.kind !== "caller_name")
}

export function emptyCustomScreeningStep(): VoiceScreeningStep {
  return {
    id: newScreeningStepId(),
    kind: "custom",
    prompt: "",
    voiceSource: "ai",
    enabled: true,
  }
}
