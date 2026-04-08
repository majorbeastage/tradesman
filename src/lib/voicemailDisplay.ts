/**
 * Profile.voicemail_conversations_display + event metadata.voicemail_mode (from channel).
 */
export function effectiveVoicemailTranscriptMode(
  profilePref: string | null | undefined,
  channelModeFromEvent: unknown,
): "summary" | "full_transcript" {
  const p = (profilePref || "use_channel").toLowerCase()
  if (p === "summary") return "summary"
  if (p === "full_transcript") return "full_transcript"
  return channelModeFromEvent === "full_transcript" ? "full_transcript" : "summary"
}

/**
 * Portal item IDs for voicemail UI (Admin adds items; ids are slugified from labels — see AdminApp "Add" for control items).
 * Primary: "Voicemail Transcription on" → voicemail-transcription-on, "Type of Transcription" → type-of-transcription.
 * Legacy keys kept for conversations that already saved the old defaults in metadata.portalValues.
 */
const VOICEMAIL_TRANSCRIPTION_ON_IDS = ["voicemail-transcription-on", "voicemail_transcription_enabled"] as const
const VOICEMAIL_TRANSCRIPTION_TYPE_IDS = ["type-of-transcription", "voicemail_transcription_display"] as const

function firstPortalValue(values: Record<string, string> | null | undefined, keys: readonly string[]): string | undefined {
  if (!values) return undefined
  for (const k of keys) {
    const v = values[k]
    if (v !== undefined && v !== "") return v
  }
  return undefined
}

/**
 * Per-conversation portal values (metadata.portalValues) override profile/channel for display.
 * When the transcription checkbox is unchecked, transcript/summary text is hidden (recording still shows).
 */
export function resolveVoicemailUiMode(
  profilePref: string | null | undefined,
  channelModeFromEvent: unknown,
  conversationPortalValues?: Record<string, string> | null,
): { showTranscript: boolean; mode: "summary" | "full_transcript" } {
  const onVal = firstPortalValue(conversationPortalValues, VOICEMAIL_TRANSCRIPTION_ON_IDS)
  const showTranscript = onVal === "unchecked" ? false : true

  const portalDisplay = firstPortalValue(conversationPortalValues, VOICEMAIL_TRANSCRIPTION_TYPE_IDS)
  const typeNorm = (portalDisplay || "").trim().toLowerCase()
  let mode: "summary" | "full_transcript"
  if (typeNorm === "full transcript" || typeNorm.includes("full transcript")) {
    mode = "full_transcript"
  } else if (typeNorm === "summary") {
    mode = "summary"
  } else {
    mode = effectiveVoicemailTranscriptMode(profilePref, channelModeFromEvent)
  }
  return { showTranscript, mode }
}

export type VoicemailTranscriptParts = {
  primary: string
  primaryLabel: string
  secondary?: string
  secondaryLabel?: string
}

export function voicemailTranscriptForDisplay(
  ev: { transcript_text?: string | null; summary_text?: string | null },
  mode: "summary" | "full_transcript",
): VoicemailTranscriptParts {
  const full = (ev.transcript_text || "").trim()
  const sum = (ev.summary_text || "").trim()
  if (mode === "full_transcript") {
    return {
      primary: full || sum,
      primaryLabel: "Transcript",
    }
  }
  const short = sum || (full.length > 280 ? `${full.slice(0, 277)}…` : full)
  const parts: VoicemailTranscriptParts = {
    primary: short,
    primaryLabel: sum ? "Summary" : "Transcript",
  }
  if (full && full !== short) {
    parts.secondary = full
    parts.secondaryLabel = "Full transcript"
  }
  return parts
}
