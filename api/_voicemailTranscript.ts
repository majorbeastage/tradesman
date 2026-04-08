/** Aligns with client_communication_channels.voicemail_mode CHECK. */
export type VoicemailStorageMode = "summary" | "full_transcript"

/**
 * How we store transcript_text / summary_text / body on communication_events after Twilio STT.
 */
export function voicemailStorageFields(
  transcriptionText: string | undefined,
  voicemailMode: VoicemailStorageMode,
): { transcript_text: string | null; summary_text: string | null; body: string } {
  const t = (transcriptionText || "").trim()
  if (!t) {
    return {
      transcript_text: null,
      summary_text: null,
      body: "Voicemail received",
    }
  }
  if (voicemailMode === "full_transcript") {
    const body = t.length > 600 ? `${t.slice(0, 597)}…` : t
    return { transcript_text: t, summary_text: null, body }
  }
  const summary = t.length > 280 ? `${t.slice(0, 277)}…` : t
  return { transcript_text: t, summary_text: summary, body: summary }
}

export function appendPhaseToVoicemailResultUrl(recordActionUrl: string, phase: string): string {
  const sep = recordActionUrl.includes("?") ? "&" : "?"
  return `${recordActionUrl}${sep}phase=${encodeURIComponent(phase)}`
}
