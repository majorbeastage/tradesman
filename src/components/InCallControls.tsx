import { useState } from "react"
import { theme } from "../styles/theme"

const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const

export type InCallControlsProps = {
  label: string
  stateLabel: string
  muted: boolean
  speakerOn: boolean
  /** False on web where earpiece routing is unavailable. */
  speakerSupported?: boolean
  canInteract: boolean
  error?: string | null
  onToggleMute: () => void
  onToggleSpeaker: () => void
  onHangup: () => void
  onSendDigit: (digit: string) => void
}

export default function InCallControls({
  label,
  stateLabel,
  muted,
  speakerOn,
  speakerSupported = true,
  canInteract,
  error,
  onToggleMute,
  onToggleSpeaker,
  onHangup,
  onSendDigit,
}: InCallControlsProps) {
  const [showKeypad, setShowKeypad] = useState(false)
  const [digitsSent, setDigitsSent] = useState("")

  function pressDigit(d: string) {
    onSendDigit(d)
    setDigitsSent((s) => (s + d).slice(-24))
  }

  const btn: React.CSSProperties = {
    flex: 1,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    color: "#0f172a",
    borderRadius: 10,
    padding: "12px 8px",
    fontWeight: 700,
    fontSize: 13,
    cursor: canInteract ? "pointer" : "default",
    opacity: canInteract ? 1 : 0.55,
    minWidth: 0,
  }

  return (
    <div style={{ display: "grid", gap: 12, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16, background: "#f8fafc" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{label}</div>
        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: "#475569" }}>{stateLabel}</div>
        {showKeypad && digitsSent ? (
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, letterSpacing: 2, color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>
            {digitsSent}
          </div>
        ) : null}
      </div>

      {showKeypad ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {DIAL_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={!canInteract}
              onClick={() => pressDigit(k)}
              style={{
                border: `1px solid ${theme.border}`,
                background: "#fff",
                borderRadius: 12,
                padding: "14px 0",
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                cursor: canInteract ? "pointer" : "default",
                opacity: canInteract ? 1 : 0.55,
              }}
            >
              {k}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onToggleMute} disabled={!canInteract} style={{ ...btn, background: muted ? "#fee2e2" : "#fff" }}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={() => setShowKeypad((v) => !v)}
          disabled={!canInteract}
          style={{ ...btn, background: showKeypad ? "#e0f2fe" : "#fff" }}
        >
          {showKeypad ? "Hide pad" : "Keypad"}
        </button>
        {speakerSupported ? (
          <button
            type="button"
            onClick={onToggleSpeaker}
            disabled={!canInteract}
            style={{ ...btn, background: speakerOn ? "#dbeafe" : "#fff" }}
          >
            {speakerOn ? "Speaker" : "Phone"}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onHangup}
        style={{
          border: "none",
          background: "#dc2626",
          color: "#fff",
          borderRadius: 10,
          padding: "12px 14px",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Hang up
      </button>

      {error ? <p style={{ margin: 0, fontSize: 12, color: "#dc2626", textAlign: "center" }}>{error}</p> : null}
    </div>
  )
}

export function formatCallStateLabel(state: string, seconds: number): string {
  if (state === "calling" || state === "connecting") return "Connecting…"
  if (state === "ringing") return "Ringing…"
  if (state === "incoming") return "Incoming call…"
  if (state === "in_call") {
    const m = Math.floor(seconds / 60)
    const s = String(seconds % 60).padStart(2, "0")
    return `In call · ${m}:${s}`
  }
  if (state === "error") return "Call error"
  return state
}
