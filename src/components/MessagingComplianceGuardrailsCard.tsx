import type { ReactNode } from "react"
import { LEGAL_LINKS } from "../lib/legalLinks"
import { theme } from "../styles/theme"

function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={{ color: theme.primary, fontWeight: 600 }} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

type Props = {
  /** Amber page-top notice on Conversations; gray panel inside settings / automatic-replies modals. */
  banner?: boolean
}

/**
 * In-product copy for SMS / A2P guardrails and links to public legal pages.
 * Mirrors server rules (first-SMS footers, no bulk send, no third-party bypass).
 */
export function MessagingComplianceGuardrailsCard({ banner = false }: Props) {
  const wrapStyle = banner
    ? {
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #fcd34d",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: 12,
        lineHeight: 1.55,
      }
    : {
        marginBottom: 14,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "#f8fafc",
        color: "#334155",
        fontSize: 12,
        lineHeight: 1.55,
      }

  return (
    <div role="note" style={wrapStyle}>
      <strong>{banner ? "SMS, voice automation, and A2P guardrails" : "Messaging and compliance guardrails"}</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        <li style={{ marginBottom: 6 }}>
          Tradesman is built for <strong>conversational</strong> messaging when a customer has already reached your business on your
          Tradesman-connected line, or when you have <strong>documented consent</strong> to text them. The platform does not support
          simultaneous bulk SMS to many numbers.
        </li>
        <li style={{ marginBottom: 6 }}>
          Your <strong>first outbound SMS</strong> to a customer may include an automatic compliance footer: a{" "}
          <strong>longer</strong> block when there is no inbound call/text/voicemail from them on your Twilio line yet, and a{" "}
          <strong>shorter</strong> line when they have already contacted you on that line. The composer shows your character budget for
          that send.
        </li>
        <li style={{ marginBottom: 6 }}>
          You may not use Tradesman together with <strong>unapproved third-party software, scripts, bots, scrapers, or manual workarounds</strong>{" "}
          to bypass limits, harvest numbers, send unsolicited outreach, or evade carrier (A2P / 10DLC) rules. Violations can result in{" "}
          <strong>suspension or termination</strong> (see <LegalLink href={LEGAL_LINKS.terms}>Terms</LegalLink>
          ).
        </li>
        <li style={{ marginBottom: 0 }}>
          Official policies:{" "}
          <LegalLink href={LEGAL_LINKS.terms}>Terms &amp; Conditions</LegalLink>
          {" · "}
          <LegalLink href={LEGAL_LINKS.privacy}>Privacy Policy</LegalLink>
          {" · "}
          <LegalLink href={LEGAL_LINKS.smsConsent}>SMS consent &amp; messaging</LegalLink>.
        </li>
      </ul>
    </div>
  )
}
