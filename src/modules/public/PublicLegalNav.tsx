import type { CSSProperties } from "react"
import { LEGAL_LINKS } from "../../lib/legalLinks"
import { theme } from "../../styles/theme"

const linkStyle: CSSProperties = {
  color: theme.primary,
  fontWeight: 600,
  textDecoration: "none",
}

type PublicLegalNavProps = {
  /** When false, omit the top rule so a parent section can own the divider (e.g. marketing home footer). */
  borderTop?: boolean
}

export function PublicLegalNav({ borderTop = true }: PublicLegalNavProps) {
  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px 20px",
        alignItems: "center",
        padding: borderTop ? "14px 0" : "8px 0 12px",
        borderTop: borderTop ? `1px solid ${theme.border}` : "none",
        marginTop: borderTop ? 8 : 0,
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
      <span style={{ color: "#9ca3af" }} aria-hidden>
        |
      </span>
      <a href={LEGAL_LINKS.accountDeletion} style={linkStyle}>
        Delete account
      </a>
    </nav>
  )
}
