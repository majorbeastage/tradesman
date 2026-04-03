import type { ReactNode } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { LEGAL_LINKS } from "../../lib/legalLinks"
import { theme } from "../../styles/theme"
import { PublicLegalNav } from "./PublicLegalNav"

type Props = {
  title: string
  subtitle: string
  children: ReactNode
}

export function PublicLegalLayout({ title, subtitle, children }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        padding: "24px 16px 48px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          display: "grid",
          gap: 18,
        }}
      >
        <div
          style={{
            background: theme.charcoalSmoke,
            color: "#fff",
            borderRadius: 16,
            padding: 24,
            border: `1px solid ${theme.charcoal}`,
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.8 }}>Tradesman</div>
          <h1 style={{ margin: "8px 0 10px", fontSize: 34, lineHeight: 1.1 }}>{title}</h1>
          <p style={{ margin: 0, opacity: 0.9, maxWidth: 760 }}>{subtitle}</p>
        </div>
        {children}
        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18 }}>
          <PublicLegalNav />
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6b7280" }}>
            For SMS opt-in and carrier compliance details, see{" "}
            <a href={LEGAL_LINKS.smsConsent} style={{ color: theme.primary, fontWeight: 600 }}>
              SMS consent &amp; messaging
            </a>
            .
          </p>
        </div>
        <CopyrightVersionFooter variant="default" align="center" style={{ borderTop: "none", paddingTop: 8 }} />
      </div>
    </div>
  )
}
