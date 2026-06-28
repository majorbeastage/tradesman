import type { CSSProperties } from "react"
import { theme } from "../styles/theme"
import { LEGAL_LINKS } from "../lib/legalLinks"

type Props = {
  ackTerms: boolean
  onAckTermsChange: (value: boolean) => void
  ackPrivacy: boolean
  onAckPrivacyChange: (value: boolean) => void
  ackSms: boolean
  onAckSmsChange: (value: boolean) => void
}

function legalLink(href: string, label: string) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 600 }}>
      {label}
    </a>
  )
}

/** Required Privacy, Terms, and SMS policy acknowledgements for signup and free trial. */
export default function SignupPoliciesAcknowledgement({
  ackTerms,
  onAckTermsChange,
  ackPrivacy,
  onAckPrivacyChange,
  ackSms,
  onAckSmsChange,
}: Props) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        fontSize: 14,
        color: theme.text,
        lineHeight: 1.55,
      }}
    >
      <p style={{ margin: "0 0 10px", fontWeight: 700 }}>Policies</p>
      <p style={{ margin: 0 }}>
        {legalLink(LEGAL_LINKS.terms, "Terms & Conditions")} · {legalLink(LEGAL_LINKS.privacy, "Privacy Policy")} ·{" "}
        {legalLink(LEGAL_LINKS.smsConsent, "SMS consent")}
      </p>
      <label style={{ ...checkboxLabelStyle, marginTop: 12 }}>
        <input type="checkbox" checked={ackTerms} onChange={(e) => onAckTermsChange(e.target.checked)} style={{ marginTop: 3 }} required />
        <span>
          I agree to the Terms &amp; Conditions.
          <span style={{ color: "#b91c1c", fontWeight: 700 }} aria-hidden>
            {" "}
            *
          </span>
        </span>
      </label>
      <label style={{ ...checkboxLabelStyle, marginTop: 10 }}>
        <input type="checkbox" checked={ackPrivacy} onChange={(e) => onAckPrivacyChange(e.target.checked)} style={{ marginTop: 3 }} required />
        <span>
          I acknowledge the Privacy Policy.
          <span style={{ color: "#b91c1c", fontWeight: 700 }} aria-hidden>
            {" "}
            *
          </span>
        </span>
      </label>
      <div style={{ marginTop: 14 }}>
        <p style={{ margin: "0 0 10px", fontSize: 14, color: theme.text, lineHeight: 1.55 }}>
          If you provide a mobile number, SMS may be used for scheduling, job updates, estimates, and account notifications.
          Message and data rates may apply. Reply STOP to opt out where supported; reply HELP for help when offered. Your phone
          number will not be shared with third parties for marketing purposes. See our{" "}
          {legalLink(LEGAL_LINKS.privacy, "Privacy Policy")}, {legalLink(LEGAL_LINKS.terms, "Terms & Conditions")}, and{" "}
          {legalLink(LEGAL_LINKS.smsConsent, "SMS consent & messaging")}.
        </p>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={ackSms}
            onChange={(e) => onAckSmsChange(e.target.checked)}
            style={{ marginTop: 3 }}
            required
          />
          <span>
            I have reviewed the SMS consent &amp; messaging policy and agree to adhere to it for outbound text messages sent using
            Tradesman Systems (including A2P registration and messaging requirements).
            <span style={{ color: "#b91c1c", fontWeight: 700 }} aria-hidden>
              {" "}
              *
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}

const checkboxLabelStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1.5,
}
