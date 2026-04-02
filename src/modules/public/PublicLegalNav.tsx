import type { CSSProperties } from "react"
import { LEGAL_LINKS } from "../../lib/legalLinks"
import { theme } from "../../styles/theme"

const linkStyle: CSSProperties = {
  color: theme.primary,
  fontWeight: 600,
  textDecoration: "none",
}

export function PublicLegalNav() {
  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px 20px",
        alignItems: "center",
        padding: "14px 0",
        borderTop: `1px solid ${theme.border}`,
        marginTop: 8,
        fontSize: 14,
      }}
      aria-label="Legal and messaging"
    >
      <a href={LEGAL_LINKS.privacy} style={linkStyle}>
        Privacy Policy
      </a>
      <span style={{ color: "#9ca3af" }} aria-hidden>
        |
      </span>
      <a href={LEGAL_LINKS.terms} style={linkStyle}>
        Terms &amp; Conditions
      </a>
      <span style={{ color: "#9ca3af" }} aria-hidden>
        |
      </span>
      <a href={LEGAL_LINKS.smsConsent} style={linkStyle}>
        SMS consent &amp; messaging
      </a>
    </nav>
  )
}
