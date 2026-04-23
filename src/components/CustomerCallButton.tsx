import { theme } from "../styles/theme"
import { openPhoneDialer } from "../lib/telDial"
import { useAuth } from "../contexts/AuthContext"
import TwilioBridgeCallButton from "./TwilioBridgeCallButton"
import { isNativeApp } from "../lib/capacitorMobile"

type Props = {
  phone: string
  /** Shown under button on mobile — business line is carrier-side when using VoIP. */
  hint?: string
  compact?: boolean
  /**
   * Tradesman profile id for the business context (scoped user / quote owner). When set and you are signed in,
   * shows **Call from Business number** first so the customer sees your Twilio business caller ID; device dialer is secondary.
   */
  bridgeOwnerUserId?: string | null
}

export default function CustomerCallButton({ phone, hint, compact, bridgeOwnerUserId }: Props) {
  const { session } = useAuth()
  const trimmed = phone.trim()
  if (!trimmed) return null

  const showTwilioFirst = Boolean(bridgeOwnerUserId?.trim() && session?.access_token)
  const native = isNativeApp()
  /** In the Capacitor shell, lead with one clear “Call” that uses Twilio (customer sees TWILIO_FROM_NUMBER). */
  const twilioPrimaryNative = Boolean(showTwilioFirst && native)

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      {showTwilioFirst ? (
        <>
          <TwilioBridgeCallButton
            customerPhone={trimmed}
            quoteOwnerUserId={bridgeOwnerUserId!.trim()}
            compact={compact}
            label={twilioPrimaryNative ? "Call" : undefined}
            variant={twilioPrimaryNative ? "primary" : "default"}
          />
          <span style={{ fontSize: 11, color: "#047857", maxWidth: 320, lineHeight: 1.35, fontWeight: 600 }}>
            {twilioPrimaryNative
              ? "Rings your Account Best contact / Primary phone first (must be your personal cell, not your Twilio business number). Customer sees your business caller ID."
              : "Rings your Account Best contact / Primary phone first — use a personal cell, not the same number as your Twilio business line, or you may hit voicemail."}
          </span>
          <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 320, lineHeight: 1.35 }}>
            If this never rings your cell: Account → Call forwarding → turn off{" "}
            <strong>Announce caller before I connect</strong> and save (some carriers decline screened forwards). Check the message under the Call button for a Twilio Call SID.
          </span>
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
        {showTwilioFirst
          ? twilioPrimaryNative
            ? "Phone dialer (personal caller ID)"
            : "Call from my phone (dialer)"
          : "Call"}
      </button>
      {hint ? (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>{hint}</span>
      ) : (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>
          {showTwilioFirst
            ? twilioPrimaryNative
              ? "Only the top button uses your business line; the dialer uses your own number."
              : "The dialer button uses your personal cell as caller ID."
            : "Opens the device dialer — the customer usually sees your mobile number. Sign in to use the business-line call when available."}
        </span>
      )}
    </div>
  )
}
