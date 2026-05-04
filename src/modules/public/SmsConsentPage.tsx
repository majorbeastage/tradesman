import { useEffect, useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { LEGAL_LINKS } from "../../lib/legalLinks"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import {
  DEFAULT_SMS_CONSENT_PAGE,
  SMS_CONSENT_SETTINGS_KEY,
  parseSmsConsentLegalPage,
  type SmsConsentLegalPage,
} from "../../types/legal-pages"
import { PublicLegalNav } from "./PublicLegalNav"

/**
 * In-app SMS consent (loads optional copy from platform_settings).
 * Public crawlable copy: `/sms` and `/sms-consent` serve static `public/sms.html` (synced from `sms-consent.html` via `npm run legal:static-html`).
 */
export default function SmsConsentPage() {
  const [content, setContent] = useState<SmsConsentLegalPage>({ ...DEFAULT_SMS_CONSENT_PAGE })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", SMS_CONSENT_SETTINGS_KEY)
          .maybeSingle()
        if (!error && data?.value) setContent(parseSmsConsentLegalPage(data.value, DEFAULT_SMS_CONSENT_PAGE))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const consent =
    content.consent_statement?.trim() ? content.consent_statement : DEFAULT_SMS_CONSENT_PAGE.consent_statement
  const sample = content.sample_message?.trim() ? content.sample_message : DEFAULT_SMS_CONSENT_PAGE.sample_message
  const bodyExtra = content.body?.trim() ? content.body : DEFAULT_SMS_CONSENT_PAGE.body

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
          <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.8 }}>
            Tradesman Systems
          </div>
          <h1 style={{ margin: "8px 0 10px", fontSize: 34, lineHeight: 1.1 }}>{content.title}</h1>
          <p style={{ margin: 0, opacity: 0.9, maxWidth: 760 }}>{content.subtitle}</p>
        </div>

        {bodyExtra ? (
          <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
            <h2 style={{ margin: "0 0 10px", color: theme.text }}>Details</h2>
            <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {loading ? "Loading…" : bodyExtra}
            </p>
          </div>
        ) : null}

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
          <h2 style={{ margin: "0 0 10px", color: theme.text }}>Consent Language</h2>
          <div
            style={{
              background: "#f9fafb",
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: 16,
              color: "#374151",
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
            }}
          >
            {consent}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
          <h2 style={{ margin: "0 0 10px", color: theme.text }}>Sample Message</h2>
          <div
            style={{
              background: "#f9fafb",
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: 16,
              color: "#374151",
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
            }}
          >
            {sample}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18 }}>
          <PublicLegalNav />
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
        </div>
        <CopyrightVersionFooter variant="default" align="center" style={{ borderTop: "none", paddingTop: 8 }} />
      </div>
    </div>
  )
}
