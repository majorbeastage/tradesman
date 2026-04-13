import { theme } from "../styles/theme"
import { openPhoneDialer } from "../lib/telDial"

type Props = {
  phone: string
  /** Shown under button on mobile — Twilio / business line is carrier-side when using VoIP. */
  hint?: string
  compact?: boolean
}

export default function CustomerCallButton({ phone, hint, compact }: Props) {
  const trimmed = phone.trim()
  if (!trimmed) return null
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button
        type="button"
        onClick={() => {
          if (!openPhoneDialer(trimmed)) {
            alert("Add a valid phone number to place a call.")
          }
        }}
        style={{
          padding: compact ? "6px 12px" : "8px 14px",
          borderRadius: 8,
          border: `1px solid ${theme.primary}`,
          background: theme.primary,
          color: "#fff",
          fontWeight: 700,
          cursor: "pointer",
          fontSize: compact ? 12 : 14,
        }}
      >
        Call
      </button>
      {hint ? (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>{hint}</span>
      ) : (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>
          Opens your phone dialer. Outbound caller ID follows your Twilio / carrier setup for this profile.
        </span>
      )}
    </div>
  )
}
