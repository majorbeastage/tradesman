import { useEffect, useRef, useState } from "react"

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
  interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    onresult: ((ev: SpeechRecognitionEvent) => void) | null
    onend: (() => void) | null
    start: () => void
    stop: () => void
  }
}
import { theme } from "../styles/theme"
import {
  combineSpeechSessionDisplay,
  createThrottledSpeechDisplay,
  parseSpeechResultsList,
  speechRecognitionOptionsForPlatform,
} from "../lib/speechRecognitionTranscript"

type Props = {
  value: string
  onChange: (value: string) => void
  onApply: (text: string) => void | Promise<void>
  placeholder?: string
  applyLabel?: string
  busy?: boolean
  note?: string | null
  compact?: boolean
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
}: Props) {
  const [speechSupported, setSpeechSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const voiceBaseRef = useRef("")
  const voiceKeepRef = useRef(false)
  const throttleRef = useRef<ReturnType<typeof createThrottledSpeechDisplay> | null>(null)

  useEffect(() => {
    const ctor =
      typeof window !== "undefined"
        ? (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ??
          window.webkitSpeechRecognition
        : undefined
    setSpeechSupported(Boolean(ctor))
  }, [])

  function stopListening() {
    voiceKeepRef.current = false
    throttleRef.current?.cancel()
    throttleRef.current = null
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  function startListening() {
    if (!speechSupported || typeof window === "undefined") return
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ??
      window.webkitSpeechRecognition
    if (!Ctor) return
    try {
      voiceKeepRef.current = true
      voiceBaseRef.current = value
      throttleRef.current = createThrottledSpeechDisplay((display) => onChange(display))
      const rec = new Ctor()
      recognitionRef.current = rec
      const opts = speechRecognitionOptionsForPlatform()
      rec.continuous = opts.continuous
      rec.interimResults = opts.interimResults
      rec.lang = "en-US"
      rec.onresult = (ev: SpeechRecognitionEvent) => {
        const parsed = parseSpeechResultsList(ev.results)
        onChange(combineSpeechSessionDisplay(voiceBaseRef.current, parsed))
      }
      rec.onend = () => {
        throttleRef.current?.flushNow()
        if (voiceKeepRef.current && recognitionRef.current) {
          window.setTimeout(() => {
            try {
              recognitionRef.current?.start()
            } catch {
              stopListening()
            }
          }, 280)
          return
        }
        setListening(false)
      }
      rec.start()
      setListening(true)
    } catch {
      stopListening()
    }
  }

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
        style={{ ...theme.formInput, resize: "vertical", width: "100%", marginBottom: 8 }}
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
            onClick={() => (listening ? stopListening() : startListening())}
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
      </div>
      {note ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{note}</p> : null}
    </div>
  )
}
