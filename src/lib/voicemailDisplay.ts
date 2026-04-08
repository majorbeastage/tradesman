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
 * Per-conversation portal values (metadata.portalValues) override profile/channel for display.
 * Checkbox `voicemail_transcription_enabled` unchecked hides transcript text (recording still shows).
 */
export function resolveVoicemailUiMode(
  profilePref: string | null | undefined,
  channelModeFromEvent: unknown,
  conversationPortalValues?: Record<string, string> | null,
): { showTranscript: boolean; mode: "summary" | "full_transcript" } {
  const showTranscript = conversationPortalValues?.voicemail_transcription_enabled !== "unchecked"
  const portalDisplay = conversationPortalValues?.voicemail_transcription_display
  let mode: "summary" | "full_transcript"
  if (portalDisplay === "Full transcript") {
    mode = "full_transcript"
  } else if (portalDisplay === "Summary") {
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
