import type { CSSProperties } from "react"
import { HELP_DESK_PHONE_DISPLAY, HELP_DESK_PHONE_E164 } from "../constants/helpDesk"
import { theme } from "../styles/theme"
import logo from "../assets/logo.png"
import accountIcon from "../assets/MyT.png"
import { TAB_ID_LABELS } from "../types/portal-builder"
import { useLocale } from "../i18n/LocaleContext"
import { formatPortalTabLabel } from "../i18n/navLabel"

type SidebarProps = {
  setPage: (page: string) => void
  onLogout?: () => void
  /** When set, sidebar items are driven by portal config (admin-customizable). */
  portalTabs?: Array<{ tab_id: string; label: string | null }>
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

const DEFAULT_TABS = [
  "dashboard", "leads", "conversations", "quotes", "calendar",
  "customers", "web-support", "tech-support", "settings",
]

export default function Sidebar({ setPage, onLogout, portalTabs, isMobile = false, isOpen = true, onClose }: SidebarProps) {
  const { t } = useLocale()
  const itemStyle: CSSProperties = { cursor: "pointer", margin: "8px 0", color: theme.primary }
  const allTabs = portalTabs && portalTabs.length > 0
    ? portalTabs
    : DEFAULT_TABS.map((tab_id) => ({ tab_id, label: TAB_ID_LABELS[tab_id] ?? tab_id }))
  const showAccount = allTabs.some((t) => t.tab_id === "account") || !portalTabs
  const showPayments = allTabs.some((t) => t.tab_id === "payments") || !portalTabs
  const tabs = allTabs.filter((t) => t.tab_id !== "account" && t.tab_id !== "payments")
  const mainNavTabs = tabs.filter((t) => t.tab_id !== "tech-support")
  const techSupportNavTabs = tabs.filter((t) => t.tab_id === "tech-support")

  const grainUrl =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/></filter><rect width="200" height="200" filter="url(#n)" opacity="0.07"/></svg>'
    )

  const sidebarBody = (
    <div
      style={{
        width: isMobile ? "min(86vw, 320px)" : "240px",
        background: theme.charcoalSmoke,
        backgroundImage: grainUrl,
        color: theme.primary,
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxSizing: "border-box"
      }}
    >
      <style>{`
        @keyframes logoGlowPulse {
          0%, 100% { opacity: 0.45; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.85; transform: translate(-50%, -50%) scale(1.12); }
        }
        .logo-glow-wrapper {
          position: relative;
          display: block;
          width: 100%;
        }
        .logo-glow-wrapper .logo-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 85%;
          height: 85%;
          transform: translate(-50%, -50%);
          background: ${theme.primary};
          border-radius: 8px;
          filter: blur(22px);
          z-index: 0;
          animation: logoGlowPulse 2.5s ease-in-out infinite;
          pointer-events: none;
        }
        .logo-glow-wrapper img {
          position: relative;
          z-index: 1;
        }
      `}</style>
      <div className="logo-glow-wrapper">
        <div className="logo-glow" aria-hidden />
        <img src={logo} alt="Tradesman" style={{ maxHeight: "128px", width: "100%", maxWidth: "240px", display: "block" }} />
      </div>

      <div style={{ marginTop: "30px", flex: 1 }}>
        {mainNavTabs.map((tab) => (
          <p key={tab.tab_id} onClick={() => { setPage(tab.tab_id); onClose?.() }} style={itemStyle}>
            {formatPortalTabLabel(tab.tab_id, tab.label, t)}
          </p>
        ))}
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 12,
          borderTop: `1px solid rgba(249,115,22,0.25)`,
          fontSize: 11,
          lineHeight: 1.45,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        {techSupportNavTabs.map((tab) => (
          <p
            key={tab.tab_id}
            onClick={() => { setPage(tab.tab_id); onClose?.() }}
            style={{ ...itemStyle, margin: "8px 0 10px" }}
          >
            {formatPortalTabLabel(tab.tab_id, tab.label, t)}
          </p>
        ))}
        <div style={{ fontWeight: 700, color: theme.primary, marginBottom: 6, fontSize: 11, letterSpacing: 0.3 }}>{t("sidebar.helpDesk")}</div>
        <a href={`tel:${HELP_DESK_PHONE_E164}`} style={{ color: "inherit", textDecoration: "none" }} onClick={onClose}>
          {HELP_DESK_PHONE_DISPLAY}
        </a>
        {onLogout && (
          <button
            type="button"
            onClick={() => { onLogout?.(); onClose?.() }}
            style={{
              display: "block",
              marginTop: 12,
              marginBottom: 4,
              padding: "8px 0",
              width: "100%",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: theme.primary,
              fontSize: 14,
              fontWeight: 500,
              textAlign: "left",
            }}
          >
            {t("layout.logout")}
          </button>
        )}
        {showPayments && (
          <p
            onClick={() => { setPage("payments"); onClose?.() }}
            style={{ ...itemStyle, marginTop: 8, marginBottom: 4, fontSize: 14, fontWeight: 600 }}
          >
            {t("nav.payments")}
          </p>
        )}
        {showAccount && (
          <button
            type="button"
            onClick={() => { setPage("account"); onClose?.() }}
            style={{
              marginTop: 4,
              marginBottom: "16px",
              padding: "4px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              alignSelf: "flex-start"
            }}
            title={t("layout.account")}
          >
            <img src={accountIcon} alt={t("layout.account")} style={{ width: "52px", height: "36px", display: "block", objectFit: "contain" }} />
          </button>
        )}
      </div>
    </div>
  )

  if (!isMobile) return sidebarBody
  if (!isOpen) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 9999,
          boxShadow: "0 18px 36px rgba(0,0,0,0.25)",
        }}
      >
        {sidebarBody}
      </div>
    </>
  )
}
