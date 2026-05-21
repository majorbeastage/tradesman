import { useCallback } from "react"
import { theme } from "../styles/theme"
import { useSpeechRecognitionInput } from "../lib/useSpeechRecognitionInput"

const GREEN_SEND = "#059669"

type Props = {
  value: string
  onChange: (value: string) => void
  onApply: (text: string) => void | Promise<void>
  placeholder?: string
  applyLabel?: string
  busy?: boolean
  note?: string | null
  compact?: boolean
  /** After voice stops, run Go/Find setting automatically when there is text. */
  autoApplyOnVoiceEnd?: boolean
  /** Clear the field when starting a new voice session. */
  clearVoiceOnStart?: boolean
}

export default function PlatformAssistantField({
  value,
  onChange,
  onApply,
  placeholder = "What would you like to do today?",
  applyLabel = "Go",
  busy = false,
  note = null,
  compact = false,
  autoApplyOnVoiceEnd = false,
  clearVoiceOnStart = false,
}: Props) {
  const onVoiceSessionEnd = useCallback(
    (text: string) => {
      if (!autoApplyOnVoiceEnd) return
      const t = text.trim()
      if (!t) return
      void onApply(t)
      onChange("")
    },
    [autoApplyOnVoiceEnd, onApply, onChange],
  )

  const { speechSupported, listening, startListening, stopListening } = useSpeechRecognitionInput(
    onChange,
    { onSessionEnd: autoApplyOnVoiceEnd ? onVoiceSessionEnd : undefined },
  )

  const submitVoice = useCallback(() => {
    const t = value.trim()
    stopListening()
    if (t) void onApply(t)
    onChange("")
  }, [onApply, onChange, stopListening, value])

  const handleVoiceToggle = useCallback(() => {
    if (listening) {
      stopListening()
      return
    }
    if (clearVoiceOnStart) onChange("")
    startListening(clearVoiceOnStart ? "" : value)
  }, [clearVoiceOnStart, listening, onChange, startListening, stopListening, value])

  const showGreenSend = listening || Boolean(value.trim())

  return (
    <div
      style={{
        padding: compact ? "10px 12px" : "14px 14px 12px",
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        boxShadow: "0 6px 20px rgba(15,23,42,0.06)",
      }}
    >
      <textarea
        rows={compact ? 2 : 3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          ...theme.formInput,
          resize: "vertical",
          width: "100%",
          marginBottom: 8,
          outline: listening ? "2px solid #6366f1" : undefined,
          outlineOffset: 1,
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => void onApply(value.trim())}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: busy || !value.trim() ? "not-allowed" : "pointer",
            opacity: busy || !value.trim() ? 0.6 : 1,
          }}
        >
          {busy ? "Working…" : applyLabel}
        </button>
        {speechSupported ? (
          <button
            type="button"
            onClick={handleVoiceToggle}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${listening ? "#6366f1" : theme.border}`,
              background: listening ? "#eef2ff" : "#f8fafc",
              color: listening ? "#4338ca" : "#334155",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {listening ? "Stop listening" : "Voice"}
          </button>
        ) : null}
        {showGreenSend ? (
          <button
            type="button"
            disabled={busy || !value.trim()}
            title="Send voice command (same as Go)"
            aria-label="Send voice command"
            onClick={() => submitVoice()}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: GREEN_SEND,
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: busy || !value.trim() ? "not-allowed" : "pointer",
              opacity: busy || !value.trim() ? 0.55 : 1,
              boxShadow: listening ? "0 0 0 3px rgba(5,150,105,0.25)" : undefined,
            }}
          >
            Send
          </button>
        ) : null}
      </div>
      {note ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{note}</p> : null}
    </div>
  )
}
