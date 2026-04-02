import type { CSSProperties } from "react"
import { theme } from "../../styles/theme"
import { PublicLegalLayout } from "./PublicLegalLayout"

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 22,
}

export default function PrivacyPage() {
  return (
    <PublicLegalLayout
      title="Privacy Policy"
      subtitle="Replace the placeholder sections below with your final privacy policy. This URL is intended for use at https://www.tradesman-us.com/privacy once this app is served on that domain."
    >
      <div style={card}>
        <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
          <strong style={{ color: theme.text }}>Last updated:</strong> [Add date]
        </p>
        <p style={{ margin: "0 0 20px", color: "#4b5563", lineHeight: 1.65 }}>
          Tradesman (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy. This policy describes how we collect, use, and protect information when you use our services.{" "}
          <strong>Edit this introduction and all sections below to match your actual practices and legal review.</strong>
        </p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>1. Information we collect</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Describe categories: account data, contact info, usage, cookies, communications, etc.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>2. How we use information</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Describe purposes: provide the service, support, analytics, legal compliance, marketing if applicable.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>3. Sharing and disclosure</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Subprocessors, service providers, legal requirements, business transfers.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>4. Data retention</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[How long you keep data and criteria for deletion.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>5. Your rights and choices</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Access, correction, deletion, opt-out, regional rights such as GDPR/CCPA if applicable.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>6. Security</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[High-level security practices; no need for excessive technical detail.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>7. Contact</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>
          Questions about this policy: [your privacy contact email]. You may also reach us at{" "}
          <a href="mailto:Admin@tradesman-us.com" style={{ color: theme.primary, fontWeight: 600 }}>
            Admin@tradesman-us.com
          </a>
          .
        </p>
      </div>
    </PublicLegalLayout>
  )
}
