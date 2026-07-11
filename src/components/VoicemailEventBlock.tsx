import { useEffect, useState } from "react"
import { theme } from "../styles/theme"
import { resolveVoicemailUiMode, voicemailTranscriptForDisplay } from "../lib/voicemailDisplay"
import {
  extractTwilioAccountSidFromUrl,
  extractTwilioRecordingSid,
} from "../lib/commEventRecording"
import { supabase } from "../lib/supabase"

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
  const resolved = (recordingUrl ?? "").trim()
  const [playSrc, setPlaySrc] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!resolved) {
      setPlaySrc(null)
      setLoadErr("")
      setLoading(false)
      return
    }

    if (isBrowserPlayableRecordingUrl(resolved)) {
      setPlaySrc(resolved)
      setLoadErr("")
      setLoading(false)
      return
    }

    const recordingSid = extractTwilioRecordingSid(resolved)
    if (!recordingSid) {
      setPlaySrc(null)
      setLoadErr("")
      setLoading(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setLoadErr("")
    setPlaySrc(null)

    void (async () => {
      try {
        if (!supabase) {
          if (!cancelled) setLoadErr("Sign in to play this recording.")
          return
        }
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          if (!cancelled) setLoadErr("Sign in to play this recording.")
          return
        }
        const params = new URLSearchParams({ recordingSid })
        const accountSid = extractTwilioAccountSidFromUrl(resolved)
        if (accountSid) params.set("accountSid", accountSid)
        const res = await fetch(`/api/twilio-recording?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          if (!cancelled) setLoadErr("Could not load voicemail recording.")
          return
        }
        const blob = await res.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setPlaySrc(objectUrl)
      } catch {
        if (!cancelled) setLoadErr("Could not load voicemail recording.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [resolved])

  if (!resolved) return null

  if (playSrc) {
    return (
      <audio
        controls
        src={playSrc}
        style={{ width: "100%", maxWidth: 440, marginBottom: compactNote ? 8 : 10 }}
      />
    )
  }

  if (loading) {
    return (
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
        Loading voicemail…
      </p>
    )
  }

  if (loadErr) {
    return (
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>
        {loadErr}
      </p>
    )
  }

  return (
    <p style={{ margin: "0 0 8px", fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>
      {compactNote
        ? "Recording is on file but could not be loaded for playback."
        : "Recording is on file but could not be loaded for playback. Try refreshing or open Full history."}
    </p>
  )
}
