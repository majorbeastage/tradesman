import type { ReactNode } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { LEGAL_LINKS } from "../../lib/legalLinks"
import { theme } from "../../styles/theme"
import { PublicLegalNav } from "./PublicLegalNav"

type Props = {
  title: string
  subtitle: string
  /** Upper line above the title (never empty at call sites). */
  heroKicker: string
  /** Optional muted line under the subtitle in the hero (e.g. “Last updated: …”). */
  heroSubline?: string
  /** Optional notice card between hero and main content. */
  noticeTitle?: string
  noticeBody?: string
  /** When set, replaces the default cross-link footer paragraph (plain text, pre-wrap). */
  footerNote?: string
  /** When false, hides the default SMS-compliance strapline under the nav (nav links still show). */
  showSmsComplianceStrapline?: boolean
  /**
   * When true (with no custom footerNote), shows the Privacy + Terms strapline used on the SMS consent page.
   * Ignored if footerNote is set.
   */
  footerPrivacyTermsStrapline?: boolean
  children: ReactNode
}

export function PublicLegalLayout({
  title,
  subtitle,
  heroKicker,
  heroSubline,
  noticeTitle,
  noticeBody,
  footerNote,
  showSmsComplianceStrapline = true,
  footerPrivacyTermsStrapline = false,
  children,
}: Props) {
  const showNotice = Boolean((noticeTitle ?? "").trim() || (noticeBody ?? "").trim())
  const noticeHeading = (noticeTitle ?? "").trim() || "Notice"
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
          <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.8 }}>{heroKicker}</div>
          <h1 style={{ margin: "8px 0 10px", fontSize: 34, lineHeight: 1.1 }}>{title}</h1>
          <p style={{ margin: 0, opacity: 0.9, maxWidth: 760 }}>{subtitle}</p>
          {heroSubline?.trim() ? (
            <p style={{ margin: "14px 0 0", fontSize: 13, opacity: 0.75 }}>{heroSubline.trim()}</p>
          ) : null}
        </div>
        {showNotice ? (
          <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
            <h2 style={{ margin: "0 0 10px", color: theme.text, fontSize: "1.15rem" }}>{noticeHeading}</h2>
            {(noticeBody ?? "").trim() ? (
              <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{noticeBody}</p>
            ) : null}
          </div>
        ) : null}
        {children}
        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18 }}>
          <PublicLegalNav />
          {footerNote?.trim() ? (
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6b7280", whiteSpace: "pre-wrap" }}>{footerNote.trim()}</p>
          ) : footerPrivacyTermsStrapline ? (
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6b7280" }}>
              For general privacy practices see{" "}
              <a href={LEGAL_LINKS.privacy} style={{ color: theme.primary, fontWeight: 600 }}>
                Privacy Policy
              </a>{" "}
              and{" "}
              <a href={LEGAL_LINKS.terms} style={{ color: theme.primary, fontWeight: 600 }}>
                Terms &amp; Conditions
              </a>
              .
            </p>
          ) : showSmsComplianceStrapline ? (
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6b7280" }}>
              For SMS opt-in and carrier compliance details, see{" "}
              <a href={LEGAL_LINKS.smsConsent} style={{ color: theme.primary, fontWeight: 600 }}>
                SMS consent &amp; messaging
              </a>
              .
            </p>
          ) : null}
        </div>
        <CopyrightVersionFooter variant="default" align="center" style={{ borderTop: "none", paddingTop: 8 }} />
      </div>
    </div>
  )
}
