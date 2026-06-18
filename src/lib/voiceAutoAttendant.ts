/** Optional inbound call screening / auto-attendant (off by default). Stored on profiles.metadata.voice_auto_attendant_v1 */

export type VoiceAutoAttendantMode = "off" | "ai_menu" | "recorded_menu"

export type VoiceAutoAttendantSettings = {
  enabled: boolean
  mode: VoiceAutoAttendantMode
  /** Screen spam / cold-call patterns before forwarding. */
  spamScreenEnabled: boolean
  /** Forward qualified callers immediately to forward_to_phone. */
  forwardGoodLeads: boolean
  /** Send spam / non-responsive callers to voicemail without ringing the owner. */
  spamToVoicemail: boolean
  /** Short IVR prompts (AI-generated or recorded URLs). */
  menuPrompts: string[]
  /** When caller ID is unknown, show Tradesman business line on forwarded leg. */
  unknownCallerShowTradesmanId: boolean
}

export const DEFAULT_VOICE_AUTO_ATTENDANT: VoiceAutoAttendantSettings = {
  enabled: false,
  mode: "off",
  spamScreenEnabled: false,
  forwardGoodLeads: true,
  spamToVoicemail: true,
  menuPrompts: [],
  unknownCallerShowTradesmanId: false,
}

export function parseVoiceAutoAttendant(raw: unknown): VoiceAutoAttendantSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_VOICE_AUTO_ATTENDANT }
  const o = raw as Record<string, unknown>
  const mode =
    o.mode === "ai_menu" || o.mode === "recorded_menu" || o.mode === "off" ? o.mode : DEFAULT_VOICE_AUTO_ATTENDANT.mode
  const menuPrompts = Array.isArray(o.menuPrompts)
    ? o.menuPrompts.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim())
    : []
  return {
    enabled: o.enabled === true,
    mode,
    spamScreenEnabled: o.spamScreenEnabled === true,
    forwardGoodLeads: o.forwardGoodLeads !== false,
    spamToVoicemail: o.spamToVoicemail !== false,
    menuPrompts,
    unknownCallerShowTradesmanId: o.unknownCallerShowTradesmanId === true,
  }
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
