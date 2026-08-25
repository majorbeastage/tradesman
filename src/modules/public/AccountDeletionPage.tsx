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
 * Public page for App Store / Google Play “delete account” URL.
 * In-app deletion (My T → Delete account) is the primary path; this page is the signed-out fallback.
 */
export default function AccountDeletionPage() {
  const mailto = techSupportMailtoDeleteAccount()

  return (
    <PublicLegalLayout
      title="Delete your Tradesman account"
      subtitle="You can delete your account from inside the Tradesman app. This page is the fallback if you cannot sign in."
      heroKicker="Tradesman Systems"
      showSmsComplianceStrapline={false}
    >
      <div style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>In the app (recommended)</h2>
        <ol style={{ margin: "0 0 16px", paddingLeft: 22, color: "#374151", lineHeight: 1.65 }}>
          <li style={{ marginBottom: 10 }}>Sign in with the account you want to delete.</li>
          <li style={{ marginBottom: 10 }}>
            Open <strong>My T</strong> (Account).
          </li>
          <li style={{ marginBottom: 10 }}>
            Open <strong>Delete account</strong> under System and Mobile Settings.
          </li>
          <li style={{ marginBottom: 10 }}>
            Type <strong>DELETE</strong>, then tap <strong>Delete my account</strong> and confirm.
          </li>
        </ol>
        <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.65 }}>
          Deletion closes your login and removes personal profile data. Some business records may be retained where required for
          legal, tax, fraud-prevention, or carrier rules.
        </p>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>If you cannot sign in</h2>
        <ol style={{ margin: "0 0 16px", paddingLeft: 22, color: "#374151", lineHeight: 1.65 }}>
          <li style={{ marginBottom: 10 }}>
            Email{" "}
            <strong>
              <a href={`mailto:${TRADESMAN_TECH_SUPPORT_EMAIL}`} style={{ color: theme.primary }}>
                {TRADESMAN_TECH_SUPPORT_EMAIL}
              </a>
            </strong>{" "}
            from the <strong>same email address</strong> you use to sign in.
          </li>
          <li style={{ marginBottom: 10 }}>
            Use the subject line <strong>“Tradesman — delete my account”</strong>, or open this pre-filled message:{" "}
            <a href={mailto} style={{ color: theme.primary, fontWeight: 600 }}>
              Request account deletion
            </a>
            .
          </li>
        </ol>
        <p style={{ margin: "0 0 12px", color: "#4b5563", lineHeight: 1.65 }}>
          <strong>Accounts limited, suspended, or closed for cause.</strong> If an account was suspended or terminated because of a
          violation of our <a href={LEGAL_LINKS.terms}>Terms &amp; Conditions</a> (including messaging abuse, security incidents, or
          circumvention of product or carrier rules), deletion or export of data may be restricted while we preserve records for
          compliance, dispute resolution, or collections. Outstanding fees, administrative charges, or penalties described in the
          Terms may still apply after closure.
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
