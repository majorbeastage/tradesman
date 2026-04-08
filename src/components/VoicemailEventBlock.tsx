import { theme } from "../styles/theme"
import { resolveVoicemailUiMode, voicemailTranscriptForDisplay } from "../lib/voicemailDisplay"

export type VoicemailCommEventShape = {
  body?: string | null
  transcript_text?: string | null
  summary_text?: string | null
  metadata?: Record<string, unknown> | null
}

/** Supabase public URLs work in an audio element; raw Twilio URLs need server auth. */
export function isBrowserPlayableRecordingUrl(url: string | null | undefined): boolean {
  const t = (url ?? "").trim().toLowerCase()
  if (!t.startsWith("http")) return false
  if (t.includes("api.twilio.com")) return false
  return true
}

export function voicemailPreviewLine(
  ev: VoicemailCommEventShape,
  profileVoicemailDisplay: string,
  conversationPortalValues?: Record<string, string> | null,
): string {
  const { showTranscript, mode } = resolveVoicemailUiMode(
    profileVoicemailDisplay,
    ev.metadata?.voicemail_mode,
    conversationPortalValues,
  )
  if (!showTranscript) {
    const line = (ev.body || "Voicemail").replace(/\s+/g, " ").trim()
    return line.slice(0, 140) || "Voicemail"
  }
  const parts = voicemailTranscriptForDisplay(ev, mode)
  const line = (parts.primary || ev.body || "Voicemail").replace(/\s+/g, " ").trim()
  return line.slice(0, 140)
}

export function VoicemailTranscriptBlock({
  ev,
  profileVoicemailDisplay,
  conversationPortalValues,
}: {
  ev: VoicemailCommEventShape
  profileVoicemailDisplay: string
  conversationPortalValues?: Record<string, string> | null
}) {
  const { showTranscript, mode } = resolveVoicemailUiMode(
    profileVoicemailDisplay,
    ev.metadata?.voicemail_mode,
    conversationPortalValues,
  )
  if (!showTranscript) return null
  const parts = voicemailTranscriptForDisplay(ev, mode)
  if (!parts.primary && !parts.secondary) return null
  return (
    <>
      {parts.primary ? (
        <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap", fontSize: 14 }}>
          <strong style={{ color: theme.text }}>{parts.primaryLabel}</strong> {parts.primary}
        </p>
      ) : null}
      {parts.secondary ? (
        <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap", fontSize: 13, color: "#4b5563" }}>
          <strong style={{ color: theme.text }}>{parts.secondaryLabel}</strong> {parts.secondary}
        </p>
      ) : null}
    </>
  )
}

type VoicemailRecordingBlockProps = {
  recordingUrl: string | null | undefined
  /** Shorter note for inline / timeline */
  compactNote?: boolean
}

export function VoicemailRecordingBlock({ recordingUrl, compactNote }: VoicemailRecordingBlockProps) {
  if (!recordingUrl) return null
  if (isBrowserPlayableRecordingUrl(recordingUrl)) {
    return (
      <audio
        controls
        src={recordingUrl}
        style={{ width: "100%", maxWidth: 440, marginBottom: compactNote ? 8 : 10 }}
      />
    )
  }
  return (
    <p style={{ margin: "0 0 8px", fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>
      {compactNote
        ? "This entry has a Twilio-only recording link (not playable here). New voicemails are copied to storage and will play in the browser."
        : "Legacy Twilio recording URL only — not playable in the portal. New messages are saved to Supabase storage automatically."}
    </p>
  )
}
