import type { CSSProperties } from "react"
import { theme } from "../../styles/theme"
import { PublicLegalLayout } from "./PublicLegalLayout"

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 22,
}

export default function TermsPage() {
  return (
    <PublicLegalLayout
      title="Terms & Conditions"
      subtitle="Replace the placeholder sections below with your final terms of use. This URL is intended for use at https://www.tradesman-us.com/terms once this app is served on that domain."
    >
      <div style={card}>
        <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
          <strong style={{ color: theme.text }}>Last updated:</strong> [Add date]
        </p>
        <p style={{ margin: "0 0 20px", color: "#4b5563", lineHeight: 1.65 }}>
          These terms govern your use of Tradesman services.{" "}
          <strong>Edit this introduction and all sections below after legal review.</strong>
        </p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>1. Agreement</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Acceptance of terms, eligibility, authority to bind a business if applicable.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>2. Services</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Description of what you provide, accounts, acceptable use.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>3. User responsibilities</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Accurate information, compliance with laws, no misuse.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>4. Fees and payment</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[If applicable: billing, taxes, refunds.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>5. Intellectual property</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Your IP, license to use the service, user content.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>6. Disclaimers and limitation of liability</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[As advised by counsel for your jurisdiction.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>7. Termination</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[How accounts or access may be suspended or ended.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>8. Governing law</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>[Venue and governing law.]</p>

        <h2 style={{ margin: "24px 0 10px", color: theme.text, fontSize: 20 }}>9. Contact</h2>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65 }}>
          Questions about these terms: [your legal or support email]. You may also contact{" "}
          <a href="mailto:Admin@tradesman-us.com" style={{ color: theme.primary, fontWeight: 600 }}>
            Admin@tradesman-us.com
          </a>
          .
        </p>
      </div>
    </PublicLegalLayout>
  )
}
