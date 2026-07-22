import { useState } from "react"
import { theme } from "../styles/theme"
import { useAuth } from "../contexts/AuthContext"
import { isNativeApp } from "../lib/capacitorMobile"
import { useVoiceDevice } from "../lib/useVoiceDevice"
import InCallControls, { formatCallStateLabel } from "./InCallControls"
import TwilioBridgeCallButton from "./TwilioBridgeCallButton"
import { openPhoneDialer } from "../lib/telDial"

type Props = {
  phone: string
  hint?: string
  compact?: boolean
  bridgeOwnerUserId?: string | null
  /** Display name for the in-call header. */
  label?: string
}

function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`
  return null
}

/**
 * Customer call entry: on native, softphone (in-app mute/keypad/speaker) is primary;
 * cell-bridge and personal dialer remain secondary.
 */
export default function SoftphonePrimaryCallButton({ phone, hint, compact, bridgeOwnerUserId, label }: Props) {
  const { session } = useAuth()
  const voice = useVoiceDevice()
  const trimmed = phone.trim()
  const native = isNativeApp()
  const e164 = toE164(trimmed)
  const showBridge = Boolean(bridgeOwnerUserId?.trim() && session?.access_token)
  const [busy, setBusy] = useState(false)

  if (!trimmed) return null

  const callActive = voice.callState !== "idle"
  const displayLabel = label?.trim() || trimmed

  async function startSoftphone() {
    if (!e164) {
      alert("Add a valid phone number to place a call.")
      return
    }
    setBusy(true)
    try {
      await voice.placePhoneCall(e164, displayLabel)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8, alignItems: "flex-start", width: "100%", maxWidth: 360 }}>
      {callActive ? (
        <div style={{ width: "100%" }}>
          <InCallControls
            label={voice.peer?.label ?? displayLabel}
            stateLabel={formatCallStateLabel(voice.callState, voice.seconds)}
            muted={voice.muted}
            speakerOn={voice.speakerOn}
            speakerSupported={voice.speakerSupported}
            canInteract={voice.callState === "in_call"}
            error={voice.error}
            onToggleMute={voice.toggleMute}
            onToggleSpeaker={voice.toggleSpeaker}
            onHangup={voice.hangup}
            onSendDigit={voice.sendDigits}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startSoftphone()}
            style={{
              padding: compact ? "6px 12px" : "8px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.primary}`,
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              fontSize: compact ? 12 : 14,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Connecting…" : native ? "Call" : "Call from business line (in-app)"}
          </button>
          <span style={{ fontSize: 11, color: "#047857", maxWidth: 340, lineHeight: 1.35, fontWeight: 600 }}>
            In-app call with mute, keypad, and speaker. Customer sees your business caller ID.
          </span>
        </>
      )}

      {showBridge && !callActive ? (
        <>
          <TwilioBridgeCallButton
            customerPhone={trimmed}
            quoteOwnerUserId={bridgeOwnerUserId!.trim()}
            compact={compact}
            label="Call on my cell"
            variant="default"
          />
          <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 340, lineHeight: 1.35 }}>
            Rings your Best contact / Primary phone first, then bridges the customer (OS phone controls).
          </span>
        </>
      ) : null}

      {!callActive ? (
        <button
          type="button"
          onClick={() => {
            if (!openPhoneDialer(trimmed)) alert("Add a valid phone number to place a call.")
          }}
          style={{
            padding: compact ? "6px 12px" : "8px 14px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#f9fafb",
            color: theme.text,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: compact ? 12 : 14,
          }}
        >
          Phone dialer (personal caller ID)
        </button>
      ) : null}

      {hint && !callActive ? (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>{hint}</span>
      ) : null}
    </div>
  )
}
