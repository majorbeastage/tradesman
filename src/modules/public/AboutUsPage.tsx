import { useEffect, useState, type CSSProperties } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { sanitizeAboutCaptionHtml } from "../../lib/sanitizeAboutCaptionHtml"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import {
  ABOUT_US_SETTINGS_KEY,
  DEFAULT_ABOUT_US_CONTENT,
  groupAboutUsBlocks,
  parseAboutUsContent,
  type AboutUsContent,
} from "../../types/about-us"
import logo from "../../assets/logo.png"
import { useLocale } from "../../i18n/LocaleContext"

type Props = {
  onBack: () => void
}

const CAPTION_HTML_BOX: CSSProperties = {
  marginTop: 10,
  fontSize: 15,
  lineHeight: 1.55,
  color: "rgba(229,231,235,0.9)",
}

export default function AboutUsPage({ onBack }: Props) {
  const { t } = useLocale()
  const [content, setContent] = useState<AboutUsContent>({ ...DEFAULT_ABOUT_US_CONTENT, blocks: [...DEFAULT_ABOUT_US_CONTENT.blocks] })
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
          .eq("key", ABOUT_US_SETTINGS_KEY)
          .maybeSingle()
        if (!error && data?.value) setContent(parseAboutUsContent(data.value))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const groups = groupAboutUsBlocks(content.blocks)

  return (
    <div style={{ minHeight: "100vh", background: "#0f1419", color: "#e5e7eb" }}>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(800px 400px at 15% 0%, rgba(249,115,22,0.15), transparent 55%), radial-gradient(600px 300px at 85% 30%, rgba(255,255,255,0.06), transparent 50%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", maxWidth: 900, margin: "0 auto", padding: "28px 20px 56px" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            marginBottom: 24,
            padding: "10px 16px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 10,
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          {t("about.backHome")}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <img src={logo} alt="" style={{ width: 56, height: "auto", borderRadius: 12, opacity: 0.95 }} />
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: theme.primary, fontWeight: 800 }}>Tradesman</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>Leads • Quotes • Scheduling</div>
          </div>
        </div>

        {loading ? (
          <p style={{ opacity: 0.8 }}>{t("about.loading")}</p>
        ) : (
          <>
            <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.35rem)", fontWeight: 800, margin: "0 0 12px", letterSpacing: -0.5, lineHeight: 1.2 }}>
              {content.title}
            </h1>
            <p style={{ fontSize: 18, opacity: 0.88, lineHeight: 1.55, margin: "0 0 36px", maxWidth: 640 }}>
              {content.subtitle}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {groups.map((group, gi) => {
                if (group.kind === "text") {
                  const block = group.block
                  const href = block.link_url?.trim()
                  return (
                    <div
                      key={block.id}
                      style={{
                        padding: "22px 24px",
                        borderRadius: 14,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        fontSize: 16,
                        lineHeight: 1.7,
                        color: "rgba(229,231,235,0.92)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {block.body}
                      {href ? (
                        <div style={{ marginTop: 14 }}>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: theme.primary, fontWeight: 700, textDecoration: "underline" }}
                          >
                            {block.link_label?.trim() || href}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  )
                }

                return (
                  <div
                    key={`about-us-image-row-${gi}-${group.blocks[0]?.id ?? "x"}`}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 24,
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                    }}
                  >
                    {group.blocks.map((block) => {
                      const safeCaption = sanitizeAboutCaptionHtml(block.caption_html ?? "")
                      const imgAlt = block.alt?.trim() || t("about.imageAltDefault")
                      return (
                        <figure
                          key={block.id}
                          style={{
                            flex: "1 1 220px",
                            maxWidth: 380,
                            minWidth: 200,
                            margin: 0,
                          }}
                        >
                          <div
                            style={{
                              borderRadius: 14,
                              overflow: "hidden",
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(0,0,0,0.25)",
                            }}
                          >
                            {block.url ? (
                              <img src={block.url} alt={imgAlt} style={{ width: "100%", height: "auto", display: "block" }} />
                            ) : (
                              <div style={{ padding: 48, textAlign: "center", opacity: 0.5 }}>{t("about.noImageYet")}</div>
                            )}
                          </div>
                          {safeCaption ? (
                            <figcaption style={CAPTION_HTML_BOX}>
                              <div dangerouslySetInnerHTML={{ __html: safeCaption }} />
                            </figcaption>
                          ) : block.alt?.trim() ? (
                            <figcaption style={{ marginTop: 10, fontSize: 13, opacity: 0.65, fontStyle: "italic" }}>{block.alt.trim()}</figcaption>
                          ) : null}
                        </figure>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <CopyrightVersionFooter variant="about" />
      </div>
    </div>
  )
}
