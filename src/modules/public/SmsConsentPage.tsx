import type { CSSProperties } from "react"
import { useEffect, useState } from "react"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import {
  DEFAULT_SMS_CONSENT_PAGE,
  SMS_CONSENT_SETTINGS_KEY,
  parseSmsConsentLegalPage,
  resolvedLegalHeroKicker,
  resolvedSmsConsentSections,
  smsConsentBulletItems,
  smsNoticeCardVisible,
  type SmsConsentLegalPage,
  type SmsConsentResolvedSection,
} from "../../types/legal-pages"
import { PublicLegalLayout } from "./PublicLegalLayout"

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

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.25rem",
  color: "#4b5563",
  lineHeight: 1.65,
}

const disclosureBox: CSSProperties = {
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  color: "#374151",
  whiteSpace: "pre-wrap",
  lineHeight: 1.65,
  margin: 0,
}

function SmsSectionBlock({ section }: { section: SmsConsentResolvedSection }) {
  return (
    <div style={card}>
      <h2 style={{ margin: "0 0 10px", color: theme.text, fontSize: "1.15rem" }}>{section.title}</h2>
      {section.lead ? <p style={{ ...bodyText, marginBottom: 10 }}>{section.lead}</p> : null}
      {section.kind === "list" ? (
        <ul style={listStyle}>
          {smsConsentBulletItems(section.content).map((item) => (
            <li key={item} style={{ marginBottom: 6 }}>
              {item}
            </li>
          ))}
        </ul>
      ) : section.kind === "disclosure" ? (
        <>
          {section.subheading ? (
            <p style={{ margin: "0 0 10px", fontWeight: 600, color: "#374151" }}>{section.subheading}</p>
          ) : null}
          <p style={disclosureBox}>{section.content}</p>
        </>
      ) : (
        <p style={bodyText}>{section.content}</p>
      )}
    </div>
  )
}

/**
 * SMS consent — crawlable HTML at `/sms` via API rewrite; this React view matches the same sections.
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

  const kicker = resolvedLegalHeroKicker(content)
  const showNotice = smsNoticeCardVisible(content)
  const lastUpdated = (content.hero_last_updated ?? "").trim()
  const customFooter = content.footer_note?.trim()
  const sections = resolvedSmsConsentSections(content)

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
      {loading ? (
        <div style={card}>
          <p style={bodyText}>Loading…</p>
        </div>
      ) : (
        sections.map((section) => <SmsSectionBlock key={section.title} section={section} />)
      )}
    </PublicLegalLayout>
  )
}
