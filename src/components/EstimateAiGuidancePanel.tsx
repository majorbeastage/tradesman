import { useCallback, useEffect, useState } from "react"
import { theme } from "../styles/theme"

type Props = { quoteId: string }

function storageKey(quoteId: string): string {
  return `tradesman_estimate_ai_guidance_${quoteId}`
}

export default function EstimateAiGuidancePanel({ quoteId }: Props) {
  const [text, setText] = useState("")
  const [listening, setListening] = useState(false)

  useEffect(() => {
    try {
      setText(localStorage.getItem(storageKey(quoteId)) ?? "")
    } catch {
      setText("")
    }
  }, [quoteId])

  const persist = useCallback(
    (v: string) => {
      setText(v)
      try {
        localStorage.setItem(storageKey(quoteId), v)
      } catch {
        /* ignore */
      }
    },
    [quoteId],
  )

  const startVoice = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string
        continuous: boolean
        interimResults: boolean
        start: () => void
        onresult: ((ev: Event) => void) | null
        onerror: (() => void) | null
        onend: (() => void) | null
      }
      webkitSpeechRecognition?: new () => {
        lang: string
        continuous: boolean
        interimResults: boolean
        start: () => void
        onresult: ((ev: Event) => void) | null
        onerror: (() => void) | null
        onend: (() => void) | null
      }
    }
    const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Rec) {
      alert("Voice input is not supported in this browser.")
      return
    }
    const rec = new Rec()
    rec.lang = navigator.language || "en-US"
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (ev: Event) => {
      const r = ev as unknown as { results?: Array<Array<{ transcript?: string }>> }
      const chunk = r.results?.[0]?.[0]?.transcript?.trim()
      if (chunk) {
        setText((prev) => {
          const next = prev.trim() ? `${prev.trim()} ${chunk}` : chunk
          try {
            localStorage.setItem(storageKey(quoteId), next)
          } catch {
            /* ignore */
          }
          return next
        })
      }
      setListening(false)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    setListening(true)
    rec.start()
  }

  return (
    <div
      style={{
        marginBottom: 20,
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>AI estimate guidance</div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            Describe scope, materials, labor, and constraints. This will drive smarter line items and presets as automations roll out. Draft notes stay with this estimate on this device until the shared estimate repository is connected.
          </p>
        </div>
        <button
          type="button"
          onClick={startVoice}
          disabled={listening}
          style={{
            flexShrink: 0,
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            fontWeight: 600,
            fontSize: 12,
            cursor: listening ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {listening ? "Listening…" : "Voice"}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => persist(e.target.value)}
        rows={4}
        placeholder="e.g. Full bath remodel, client tile on site, demo haul-off, rough-in inspection Tuesday…"
        style={{
          ...theme.formInput,
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
          fontSize: 14,
          lineHeight: 1.45,
        }}
      />
    </div>
  )
}
