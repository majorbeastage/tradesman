/** Optional inbound call screening / auto-attendant (off by default). Stored on profiles.metadata.voice_auto_attendant_v1 */

export type VoiceAutoAttendantMode = "off" | "ai_menu" | "recorded_menu"

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
  /** Spoken prompt (AI TTS) or transcript reference for recorded mode. Use {service} for prior answer. */
  prompt: string
  /** Optional audio URL when mode is recorded_menu. */
  recordingUrl?: string
  enabled: boolean
}

export type VoiceAutoAttendantSettings = {
  enabled: boolean
  mode: VoiceAutoAttendantMode
  /** Screen spam / cold-call patterns before forwarding. */
  spamScreenEnabled: boolean
  /** Forward qualified callers immediately to forward_to_phone. */
  forwardGoodLeads: boolean
  /** Send spam / non-responsive callers to voicemail without ringing the owner. */
  spamToVoicemail: boolean
  /** Ordered IVR questions — speech answers transcribed and logged. */
  menuSteps: VoiceScreeningStep[]
  /** When caller ID is unknown, show Tradesman business line on forwarded leg. */
  unknownCallerShowTradesmanId: boolean
  /** Include name + callback number steps in recommended template. */
  collectContactInfo: boolean
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
    enabled: true,
  },
  {
    id: "sched",
    kind: "schedule_timing",
    prompt: "When are you interested in scheduling work for {service}?",
    enabled: true,
  },
  {
    id: "name",
    kind: "caller_name",
    prompt: "May I have your name please?",
    enabled: true,
  },
  {
    id: "sms",
    kind: "sms_opt_in",
    prompt:
      "Do you agree to receive text messages regarding your service request? We do not send text messages for marketing purposes.",
    enabled: true,
  },
]

export const DEFAULT_VOICE_AUTO_ATTENDANT: VoiceAutoAttendantSettings = {
  enabled: false,
  mode: "off",
  spamScreenEnabled: true,
  forwardGoodLeads: true,
  spamToVoicemail: true,
  menuSteps: [...RECOMMENDED_SCREENING_STEPS],
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
    o.kind === "sms_opt_in" ||
    o.kind === "custom"
      ? o.kind
      : "custom"
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : ""
  const recordingUrl = typeof o.recordingUrl === "string" ? o.recordingUrl.trim() : ""
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newScreeningStepId()
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
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_VOICE_AUTO_ATTENDANT, menuSteps: [...RECOMMENDED_SCREENING_STEPS] }
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
    menuSteps: menuSteps.length > 0 ? menuSteps : [...RECOMMENDED_SCREENING_STEPS],
    unknownCallerShowTradesmanId: o.unknownCallerShowTradesmanId === true,
    collectContactInfo: o.collectContactInfo !== false,
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
  const base = RECOMMENDED_SCREENING_STEPS.map((s) => ({ ...s, id: newScreeningStepId() }))
  if (collectContactInfo) return base
  return base.filter((s) => s.kind !== "caller_name")
}
