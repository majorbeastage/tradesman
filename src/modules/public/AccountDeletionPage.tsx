import type { CSSProperties } from "react"
import { theme } from "../../styles/theme"
import { TRADESMAN_TECH_SUPPORT_EMAIL, techSupportMailtoDeleteAccount } from "../../constants/supportLinks"
import { PublicLegalLayout } from "./PublicLegalLayout"
import { LEGAL_LINKS } from "../../lib/legalLinks"

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 22,
}

/**
 * Public page for Google Play / data-safety “delete account” URL.
 * No login required; reviewers can open `https://<your-host>/account-deletion`.
 */
export default function AccountDeletionPage() {
  const mailto = techSupportMailtoDeleteAccount()

  return (
    <PublicLegalLayout
      title="Delete your Tradesman account"
      subtitle="How to request that we close your account and remove your personal data, subject to law and legitimate business records."
      heroKicker="Tradesman Systems"
      showSmsComplianceStrapline={false}
    >
      <div style={card}>
        <ol style={{ margin: "0 0 16px", paddingLeft: 22, color: "#374151", lineHeight: 1.65 }}>
          <li style={{ marginBottom: 10 }}>
            Send an email to{" "}
            <strong>
              <a href={`mailto:${TRADESMAN_TECH_SUPPORT_EMAIL}`} style={{ color: theme.primary }}>
                {TRADESMAN_TECH_SUPPORT_EMAIL}
              </a>
            </strong>{" "}
            from the <strong>same email address</strong> you use to sign in to Tradesman (so we can verify it is you).
          </li>
          <li style={{ marginBottom: 10 }}>
            Use the subject line <strong>“Tradesman — delete my account”</strong>, or open this pre-filled message:{" "}
            <a href={mailto} style={{ color: theme.primary, fontWeight: 600 }}>
              Request account deletion
            </a>
            .
          </li>
          <li style={{ marginBottom: 10 }}>
            In the body, confirm that you want your <strong>Tradesman user account</strong> closed and state whether you also need
            business records (quotes, invoices, etc.) handled in a specific way where applicable law allows.
          </li>
        </ol>
        <p style={{ margin: "0 0 12px", color: "#4b5563", lineHeight: 1.65 }}>
          We will confirm receipt and follow up within a reasonable time. Some information may be retained where required for legal,
          tax, fraud-prevention, or dispute reasons; we will explain that in our reply when it applies.
        </p>
        <p style={{ margin: "0 0 12px", color: "#4b5563", lineHeight: 1.65 }}>
          <strong>Accounts limited, suspended, or closed for cause.</strong> If an account was suspended or terminated because of a
          violation of our <a href={LEGAL_LINKS.terms}>Terms &amp; Conditions</a> (including messaging abuse, security incidents, or
          circumvention of product or carrier rules), deletion or export of data may be restricted while we preserve records for
          compliance, dispute resolution, or collections. Outstanding fees, administrative charges, or penalties described in the
          Terms may still apply after closure. Have counsel review your situation if you disagree with a billing or enforcement
          decision.
        </p>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14, lineHeight: 1.55 }}>
          If you are signed in to the app, you can also use <strong>Tech Support</strong> in the sidebar to open a ticket. This page
          exists so store listings can link to a simple URL without logging in.
        </p>
        <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.55 }}>
          <a href={LEGAL_LINKS.privacy} style={{ color: theme.primary, fontWeight: 600 }}>
            Privacy Policy
          </a>
          {" · "}
          <a href={LEGAL_LINKS.terms} style={{ color: theme.primary, fontWeight: 600 }}>
            Terms &amp; Conditions
          </a>
          {" · "}
          <a href={LEGAL_LINKS.smsConsent} style={{ color: theme.primary, fontWeight: 600 }}>
            SMS consent &amp; messaging
          </a>
        </p>
      </div>
    </PublicLegalLayout>
  )
}
