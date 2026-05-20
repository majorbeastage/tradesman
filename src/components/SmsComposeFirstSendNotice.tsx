import { LEGAL_LINKS } from "../lib/legalLinks"
import { SMS_COMPLIANCE_TAIL_DEFAULT } from "../lib/smsComplianceLimits"
import type { SmsFirstComplianceVariant } from "../lib/smsFirstOutboundCompliance"
import { theme } from "../styles/theme"

function isFirstOutboundVariant(variant: SmsFirstComplianceVariant | null): variant is SmsFirstComplianceVariant {
  return variant === "manual_long" || variant === "twilio_short"
}

/**
 * Amber callout above SMS composers when this user→customer pair has no prior outbound SMS.
 */
export function SmsFirstOutboundCallout({ variant }: { variant: SmsFirstComplianceVariant | null }) {
  if (!isFirstOutboundVariant(variant)) return null

  return (
    <div
      role="note"
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #fcd34d",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ display: "block", marginBottom: 6, color: "#78350f" }}>First text to this contact</strong>
      <p style={{ margin: "0 0 8px" }}>
        Tradesman treats this as your <strong>first outbound SMS</strong> to them. A compliance footer is appended automatically when
        the message is sent (it is <strong>not</strong> typed in the box below).
      </p>
      <p
        style={{
          margin: "0 0 8px",
          padding: "8px 10px",
          borderRadius: 6,
          background: "#fff",
          border: "1px solid #fde68a",
          color: "#713f12",
          whiteSpace: "pre-wrap",
          fontSize: 11,
        }}
      >
        <span style={{ fontWeight: 700 }}>Footer added on send:</span>
        {SMS_COMPLIANCE_TAIL_DEFAULT}
      </p>
      {variant === "manual_long" ? (
        <p style={{ margin: 0 }}>
          No inbound call, text, or voicemail from this number on your Tradesman line yet. If you entered the contact manually, obtain{" "}
          <strong>express consent</strong> before texting.{" "}
          <a href={LEGAL_LINKS.smsConsent} style={{ color: theme.primary, fontWeight: 600 }} target="_blank" rel="noopener noreferrer">
            SMS consent &amp; messaging
          </a>
        </p>
      ) : (
        <p style={{ margin: 0 }}>
          They have already contacted you on your Tradesman line (call, text, or voicemail). The same footer still applies; your
          character budget accounts for it.
        </p>
      )}
    </div>
  )
}

export function SmsComposeCharBudget({
  variant,
  bodyLength,
  maxChars,
}: {
  variant: SmsFirstComplianceVariant | null
  bodyLength: number
  maxChars: number
}) {
  const isFirst = isFirstOutboundVariant(variant)
  return (
    <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45, display: "block" }}>
      {bodyLength}/{maxChars}
      {isFirst ? " — footer reserved (see notice above)." : " — No compliance footer on this text."}
    </span>
  )
}
