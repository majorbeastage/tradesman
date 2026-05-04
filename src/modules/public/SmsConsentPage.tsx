import type { CSSProperties } from "react"
import { useEffect, useState } from "react"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import {
  DEFAULT_SMS_CONSENT_PAGE,
  SMS_CONSENT_SETTINGS_KEY,
  parseSmsConsentLegalPage,
  resolvedLegalHeroKicker,
  resolvedSmsConsentSectionTitle,
  resolvedSmsDetailsSectionTitle,
  resolvedSmsSampleSectionTitle,
  smsNoticeCardVisible,
  type SmsConsentLegalPage,
} from "../../types/legal-pages"
import { PublicLegalLayout } from "./PublicLegalLayout"

/** Same document-style card as Privacy / Terms (plain text, no “disclosure” chrome). */
const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 22,
}

const bodyText: CSSProperties = {
  margin: 0,
  color: "#4b5563",
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
}

/**
 * SMS consent — same shell and “legal document” look as Privacy and Terms (`PublicLegalLayout` + white cards).
 * Crawlable HTML: `/sms` via API rewrite (same `platform_settings` data).
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
  const kicker = resolvedLegalHeroKicker(content)
  const detailsTitle = resolvedSmsDetailsSectionTitle(content)
  const consentTitle = resolvedSmsConsentSectionTitle(content)
  const sampleTitle = resolvedSmsSampleSectionTitle(content)
  const sampleIntro =
    (content.sample_section_intro ?? "").trim() ||
    (DEFAULT_SMS_CONSENT_PAGE.sample_section_intro ?? "").trim()
  const showNotice = smsNoticeCardVisible(content)
  const lastUpdated = (content.hero_last_updated ?? "").trim()
  const customFooter = content.footer_note?.trim()

  return (
    <PublicLegalLayout
      title={content.title}
      subtitle={content.subtitle}
      heroKicker={kicker}
      heroSubline={lastUpdated || undefined}
      noticeTitle={showNotice ? (content.notice_title ?? "").trim() || "Notice" : undefined}
      noticeBody={showNotice ? (content.notice_body ?? "").trim() || undefined : undefined}
      footerNote={customFooter}
      showSmsComplianceStrapline={false}
      footerPrivacyTermsStrapline={!customFooter}
    >
      {bodyExtra ? (
        <div style={card}>
          <h2 style={{ margin: "0 0 10px", color: theme.text, fontSize: "1.15rem" }}>{detailsTitle}</h2>
          <p style={bodyText}>{loading ? "Loading…" : bodyExtra}</p>
        </div>
      ) : null}

      <div style={card}>
        <h2 style={{ margin: "0 0 10px", color: theme.text, fontSize: "1.15rem" }}>{consentTitle}</h2>
        <p style={bodyText}>{consent}</p>
      </div>

      <div style={card}>
        <h2 style={{ margin: "0 0 10px", color: theme.text, fontSize: "1.15rem" }}>{sampleTitle}</h2>
        {sampleIntro ? <p style={{ ...bodyText, marginBottom: 12, fontSize: 14 }}>{sampleIntro}</p> : null}
        <p style={bodyText}>{sample}</p>
      </div>
    </PublicLegalLayout>
  )
}
