import { theme } from "../styles/theme"
import { openPhoneDialer } from "../lib/telDial"
import { useAuth } from "../contexts/AuthContext"
import TwilioBridgeCallButton from "./TwilioBridgeCallButton"

type Props = {
  phone: string
  /** Shown under button on mobile — Twilio / business line is carrier-side when using VoIP. */
  hint?: string
  compact?: boolean
  /**
   * Tradesman profile id for the business context (scoped user / quote owner). When set and you are signed in,
   * shows **Call via Twilio** first so the customer sees TWILIO_FROM_NUMBER; device dialer is secondary.
   */
  bridgeOwnerUserId?: string | null
}

export default function CustomerCallButton({ phone, hint, compact, bridgeOwnerUserId }: Props) {
  const { session } = useAuth()
  const trimmed = phone.trim()
  if (!trimmed) return null

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
          <span style={{ fontSize: 11, color: "#047857", maxWidth: 300, lineHeight: 1.35, fontWeight: 600 }}>
            Recommended: Twilio rings your phone first; customer sees your Twilio business caller ID.
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
        {showTwilioFirst ? "Call from my phone (dialer)" : "Call"}
      </button>
      {hint ? (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>{hint}</span>
      ) : (
        <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 280, lineHeight: 1.35 }}>
          {showTwilioFirst
            ? "The dialer button uses your personal cell as caller ID."
            : "Opens the device dialer — the customer usually sees your mobile number. Use Twilio when the app shows it above."}
        </span>
      )}
    </div>
  )
}
