import { useEffect, useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import logo from "../../assets/logo.png"
import { consumeAuthHashErrorMessage } from "../../lib/authRedirectBase"
import { useLocale } from "../../i18n/LocaleContext"

type HomePageProps = {
  onLogin: () => void
  onOfficeManagerLogin: () => void
  onAdminLogin: () => void
  onSignup: () => void
  onAboutUs: () => void
  onRequestDemo: () => void
  onPricing: () => void
}

const FEATURE_IDS = ["clean", "automation", "leads", "comms", "quotes", "history", "custom"] as const

export default function HomePage({ onLogin, onOfficeManagerLogin, onAdminLogin, onSignup, onAboutUs, onRequestDemo, onPricing }: HomePageProps) {
  const { t } = useLocale()
  const [supportsHover, setSupportsHover] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [authLinkBanner, setAuthLinkBanner] = useState<string | null>(null)

  useEffect(() => {
    const msg = consumeAuthHashErrorMessage()
    if (msg) setAuthLinkBanner(msg)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)")
    const update = () => setSupportsHover(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        position: "relative",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(700px 340px at 20% 0%, rgba(249,115,22,0.18), rgba(249,115,22,0) 60%), radial-gradient(640px 280px at 90% 20%, rgba(31,41,51,0.10), rgba(31,41,51,0) 60%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 1100,
          margin: "0 auto",
          padding: "18px 18px 44px",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {authLinkBanner && (
          <div
            role="alert"
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              borderRadius: 10,
              background: "#fff7ed",
              border: "1px solid #fdba74",
              color: "#9a3412",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ display: "block", marginBottom: 4 }}>{t("home.linkIssue")}</strong>
            {authLinkBanner}{" "}
            <button
              type="button"
              onClick={() => {
                setAuthLinkBanner(null)
                onLogin()
              }}
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Open User Login to request a new reset
            </button>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 800, letterSpacing: -0.2, fontSize: 20, color: theme.text }}>Tradesman</span>
              <span style={{ fontSize: 12, color: theme.text, opacity: 0.7 }}>{t("home.tagline")}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onAdminLogin}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: theme.text,
              opacity: 0.85,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t("home.adminLogin")}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 18,
            alignItems: "start",
          }}
        >
          <div>
            <img
              src={logo}
              alt="Tradesman"
              style={{
                display: "block",
                width: "100%",
                maxWidth: 420,
                height: "auto",
                objectFit: "contain",
                marginBottom: 16,
              }}
            />
            <p
              style={{
                margin: "0 0 18px",
                color: theme.text,
                opacity: 0.9,
                fontSize: 15,
                lineHeight: 1.65,
              }}
            >
              {t("home.hero")}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                type="button"
                onClick={onLogin}
                style={{
                  padding: "14px 22px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                {t("home.userLogin")}
              </button>
              <button
                type="button"
                onClick={onOfficeManagerLogin}
                style={{
                  padding: "14px 22px",
                  background: theme.charcoal,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                {t("home.officeManagerLogin")}
              </button>
              <button
                type="button"
                onClick={onSignup}
                style={{
                  padding: "12px 20px",
                  background: "transparent",
                  color: theme.text,
                  border: `2px solid ${theme.primary}`,
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {t("home.signUp")}
              </button>
            </div>
          </div>

          <div
            style={{
              background: "white",
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              padding: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 8,
                padding: "0 4px",
              }}
            >
              <span style={{ fontWeight: 900, color: theme.charcoal, fontSize: 13 }}>{t("home.platformHighlights")}</span>
              <span style={{ fontSize: 11, color: theme.primary, fontWeight: 800 }}>{t("home.hoverOrTap")}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FEATURE_IDS.map((fid) => {
                const expanded =
                  (supportsHover && hoverId === fid) ||
                  (supportsHover && hoverId === null && pinnedId === fid) ||
                  (!supportsHover && pinnedId === fid)
                return (
                  <div
                    key={fid}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setPinnedId((p) => (p === fid ? null : fid))
                      }
                    }}
                    onMouseEnter={() => supportsHover && setHoverId(fid)}
                    onMouseLeave={() => supportsHover && setHoverId(null)}
                    onClick={() => setPinnedId((p) => (p === fid ? null : fid))}
                    style={{
                      padding: "7px 9px",
                      borderRadius: 8,
                      border: `1px solid ${expanded ? theme.primary : theme.border}`,
                      cursor: "pointer",
                      background: expanded ? "rgba(249,115,22,0.09)" : "rgba(249,115,22,0.03)",
                      transform: expanded ? "scale(1.02)" : "scale(1)",
                      transition: "transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                      boxShadow: expanded ? "0 10px 28px rgba(31,41,51,0.12)" : "none",
                      position: "relative",
                      zIndex: expanded ? 2 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 800, color: theme.charcoal, fontSize: 12, lineHeight: 1.35 }}>
                        {t(`home.feature.${fid}.title`)}
                      </span>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: theme.primary,
                          flexShrink: 0,
                          marginTop: 4,
                          opacity: expanded ? 1 : 0.65,
                          transition: "opacity 0.2s ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        marginTop: expanded ? 6 : 0,
                        fontSize: 11,
                        lineHeight: 1.5,
                        color: theme.text,
                        maxHeight: expanded ? 560 : 0,
                        opacity: expanded ? 1 : 0,
                        overflow: "hidden",
                        transition: "max-height 0.35s ease, opacity 0.28s ease, margin-top 0.2s ease",
                      }}
                    >
                      {t(`home.feature.${fid}.body`)}
                    </div>
                  </div>
                )
              })}
            </div>

            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                border: `2px solid rgba(249,115,22,0.35)`,
                background: "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(249,115,22,0.03))",
              }}
            >
              <div style={{ fontWeight: 900, color: theme.charcoal, fontSize: 12, marginBottom: 4 }}>
                {t("home.demoTitle")}
              </div>
              <div style={{ color: theme.text, opacity: 0.85, fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>{t("home.demoBody")}</div>
              <button
                type="button"
                onClick={onRequestDemo}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {t("home.requestDemo")}
              </button>
              <button
                type="button"
                onClick={onAboutUs}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "10px 12px",
                  background: "transparent",
                  color: theme.charcoal,
                  border: `2px solid ${theme.border}`,
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                About Us
              </button>
              <button
                type="button"
                onClick={onPricing}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "10px 12px",
                  background: "transparent",
                  color: theme.primary,
                  border: `2px solid ${theme.primary}`,
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Pricing
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <CopyrightVersionFooter variant="default" style={{ borderTop: "none", paddingTop: 0, paddingBottom: 0, marginTop: 0 }} />
            <div style={{ color: theme.text, opacity: 0.7, fontSize: 12, paddingBottom: 2 }}>
              {t("home.designedFor")}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
