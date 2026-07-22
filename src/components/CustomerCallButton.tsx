import { theme } from "../styles/theme"
import { openPhoneDialer } from "../lib/telDial"
import { useAuth } from "../contexts/AuthContext"
import TwilioBridgeCallButton from "./TwilioBridgeCallButton"
import SoftphonePrimaryCallButton from "./SoftphonePrimaryCallButton"
import { isNativeApp } from "../lib/capacitorMobile"

type Props = {
  phone: string
  /** Shown under button on mobile — business line is carrier-side when using VoIP. */
  hint?: string
  compact?: boolean
  /**
   * Tradesman profile id for the business context (scoped user / quote owner). When set and you are signed in,
   * shows business-line call options so the customer sees your Twilio business caller ID; device dialer is secondary.
   */
  bridgeOwnerUserId?: string | null
  /** Optional display name for softphone in-call header. */
  label?: string
}

export default function CustomerCallButton({ phone, hint, compact, bridgeOwnerUserId, label }: Props) {
  const { session } = useAuth()
  const trimmed = phone.trim()
  if (!trimmed) return null

  /** Capacitor shell: softphone first (mute / keypad / speaker), bridge + dialer secondary. */
  if (isNativeApp()) {
    return (
      <SoftphonePrimaryCallButton
        phone={trimmed}
        hint={hint}
        compact={compact}
        bridgeOwnerUserId={bridgeOwnerUserId}
        label={label}
      />
    )
  }

  const showTwilioFirst = Boolean(bridgeOwnerUserId?.trim() && session?.access_token)

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      {showTwilioFirst ? (
        <>
          <TwilioBridgeCallButton
            customerPhone={trimmed}
            quoteOwnerUserId={bridgeOwnerUserId!.trim()}
            compact={compact}
          />
          <span style={{ fontSize: 11, color: "#047857", maxWidth: 320, lineHeight: 1.35, fontWeight: 600 }}>
            Rings your Account Best contact / Primary phone first — use a personal cell, not your Twilio business line.
          </span>
          <details style={{ fontSize: 11, color: "#6b7280", maxWidth: 340, lineHeight: 1.4 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "#475569" }}>Which number rings first?</summary>
            <p style={{ margin: "8px 0 0" }}>
              Account uses <strong>Best contact phone</strong> when set; otherwise <strong>Primary phone</strong>. Put
              your <strong>mobile</strong> in Best contact so bridge calls ring your cell.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Inbound calls: <strong>Admin → Communications → Forward to phone</strong>. If your cell never rings, turn
              off <strong>Announce caller before I connect</strong> under Call forwarding and save.
            </p>
          </details>
        </>
      ) : null}
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
          border: showTwilioFirst ? `1px solid ${theme.border}` : `1px solid ${theme.primary}`,
          background: showTwilioFirst ? "#f9fafb" : theme.primary,
          color: showTwilioFirst ? theme.text : "#fff",
          fontWeight: 700,
          cursor: "pointer",
          fontSize: compact ? 12 : 14,
        }}
      >
        {showTwilioFirst ? "Call from my phone (dialer)" : "Call"}
      </button>
      {hint ? (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>{hint}</span>
      ) : (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>
          {showTwilioFirst
            ? "The dialer button uses your personal cell as caller ID. Use Instant messaging dial for in-app mute/keypad/speaker."
            : "Opens the device dialer — the customer usually sees your mobile number. Sign in to use the business-line call when available."}
        </span>
      )}
    </div>
  )
}
