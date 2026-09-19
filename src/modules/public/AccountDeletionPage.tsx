import type { CSSProperties } from "react"
import { theme } from "../../styles/theme"
import { PublicLegalLayout } from "./PublicLegalLayout"
import { LEGAL_LINKS } from "../../lib/legalLinks"
import { publicSiteUrl } from "../../lib/publicSite"

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 22,
}

const cta: CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "12px 18px",
  borderRadius: 10,
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 15,
  textDecoration: "none",
}

/**
 * Public page for App Store / Google Play “delete account” URL.
 * In-app deletion (My T → Delete account) is the only complete path. Do not require email.
 */
export default function AccountDeletionPage() {
  const signInHref = `${publicSiteUrl("/")}#/login`
  const accountHref = `${publicSiteUrl("/")}#/app/account`

  return (
    <PublicLegalLayout
      title="Delete your Tradesman account"
      subtitle="Sign in and delete your account in the app. You do not need to email us or create another login."
      heroKicker="Tradesman Systems"
      showSmsComplianceStrapline={false}
    >
      <div style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Delete your account in the app</h2>
        <ol style={{ margin: "0 0 16px", paddingLeft: 22, color: "#374151", lineHeight: 1.65 }}>
          <li style={{ marginBottom: 10 }}>
            Sign in with the account you want to delete.{" "}
            <a href={signInHref} style={{ color: theme.primary, fontWeight: 700 }}>
              Open sign in
            </a>
            .
          </li>
          <li style={{ marginBottom: 10 }}>
            Open <strong>My T</strong> (Account / Profile).{" "}
            <a href={accountHref} style={{ color: theme.primary, fontWeight: 700 }}>
              Open My T
            </a>
          </li>
          <li style={{ marginBottom: 10 }}>
            Under <strong>System and Mobile Settings</strong>, open <strong>Delete account</strong>.
          </li>
          <li style={{ marginBottom: 10 }}>
            Type <strong>DELETE</strong>, tap <strong>Delete my account</strong>, and confirm. You are signed out and the
            login is removed.
          </li>
        </ol>
        <a href={signInHref} style={cta}>
          Sign in to delete your account
        </a>
        <p style={{ margin: "16px 0 0", color: "#4b5563", lineHeight: 1.65 }}>
          Deletion closes your login and removes personal profile data. Some business records may be retained where required
          for legal, tax, fraud-prevention, or carrier rules.
        </p>
        <p style={{ margin: "16px 0 0", color: "#4b5563", lineHeight: 1.65, fontSize: 14 }}>
          If you cannot sign in because the password is lost, use{" "}
          <a href={signInHref} style={{ color: theme.primary, fontWeight: 600 }}>
            Forgot password
          </a>{" "}
          on the sign-in screen, then delete the account in My T. You do not need to open a support ticket to start
          deletion.
        </p>
        <p style={{ margin: "16px 0 0", color: "#4b5563", lineHeight: 1.65, fontSize: 13 }}>
          <strong>Accounts limited, suspended, or closed for cause.</strong> If an account was suspended because of a
          violation of our <a href={LEGAL_LINKS.terms}>Terms &amp; Conditions</a>, deletion or export may be restricted
          while we preserve records for compliance or collections.
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
