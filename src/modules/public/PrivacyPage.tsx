import type { CSSProperties } from "react"
import { useEffect, useState } from "react"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import {
  DEFAULT_PRIVACY_PAGE,
  PRIVACY_SETTINGS_KEY,
  parseSimpleLegalPage,
  resolvedLegalHeroKicker,
  type SimpleLegalPage,
} from "../../types/legal-pages"
import { PublicLegalLayout } from "./PublicLegalLayout"

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 22,
}

export default function PrivacyPage() {
  const [content, setContent] = useState<SimpleLegalPage>({ ...DEFAULT_PRIVACY_PAGE })
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
          .eq("key", PRIVACY_SETTINGS_KEY)
          .maybeSingle()
        if (!error && data?.value) {
          const parsed = parseSimpleLegalPage(data.value, DEFAULT_PRIVACY_PAGE)
          setContent(parsed)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const bodyText = content.body?.trim() ? content.body : DEFAULT_PRIVACY_PAGE.body

  return (
    <PublicLegalLayout
      title={content.title || DEFAULT_PRIVACY_PAGE.title}
      subtitle={content.subtitle}
      heroKicker={resolvedLegalHeroKicker(content)}
      noticeTitle={content.notice_title}
      noticeBody={content.notice_body}
      footerNote={content.footer_note}
    >
      <div style={card}>
        {loading ? (
          <p style={{ margin: 0, color: "#6b7280" }}>Loading…</p>
        ) : (
          <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{bodyText}</p>
        )}
      </div>
    </PublicLegalLayout>
  )
}
