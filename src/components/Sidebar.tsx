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
  "dashboard",
  "leads",
  "conversations",
  "quotes",
  "calendar",
  "customers",
  "payments",
  "web-support",
  "tech-support",
  "settings",
]

export default function Sidebar({ setPage, onLogout, portalTabs, isMobile = false, isOpen = true, onClose }: SidebarProps) {
  const { t } = useLocale()
  const itemStyle: CSSProperties = { cursor: "pointer", margin: "8px 0", color: theme.primary }
  const allTabs = portalTabs && portalTabs.length > 0
    ? portalTabs
    : DEFAULT_TABS.map((tab_id) => ({ tab_id, label: TAB_ID_LABELS[tab_id] ?? tab_id }))
  const showAccount = allTabs.some((t) => t.tab_id === "account") || !portalTabs
  const showPayments = allTabs.some((t) => t.tab_id === "payments") || !portalTabs
  const paymentsTabEntry = allTabs.find((t) => t.tab_id === "payments")
  /** Account + Payments: pinned in the footer (desktop) or header stack (mobile), not in the long scroll list — Payments sits right above My T. */
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
        width: isMobile ? "min(88vw, 300px)" : "240px",
        background: theme.charcoalSmoke,
        backgroundImage: grainUrl,
        color: theme.primary,
        padding: isMobile ? "16px 14px 20px" : "20px",
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
        <img
          src={logo}
          alt="Tradesman"
          style={{
            maxHeight: isMobile ? "72px" : "128px",
            width: "100%",
            maxWidth: "240px",
            display: "block",
          }}
        />
      </div>

      {isMobile && (showAccount || showPayments) ? (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          {showPayments ? (
            <button
              type="button"
              onClick={() => {
                setPage("payments")
                onClose?.()
              }}
              style={{
                minHeight: 48,
                padding: "0 14px",
                borderRadius: 10,
                border: `1px solid rgba(249,115,22,0.45)`,
                background: "rgba(249,115,22,0.12)",
                color: theme.primary,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {formatPortalTabLabel("payments", paymentsTabEntry?.label ?? null, t)}
            </button>
          ) : null}
          {showAccount ? (
            <button
              type="button"
              onClick={() => {
                setPage("account")
                onClose?.()
              }}
              title={t("layout.account")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 48,
                minWidth: 48,
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid rgba(249,115,22,0.45)`,
                background: "rgba(249,115,22,0.12)",
                cursor: "pointer",
              }}
            >
              <img src={accountIcon} alt="" style={{ width: 44, height: 30, display: "block", objectFit: "contain" }} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: isMobile ? 18 : 30, flex: 1, minHeight: 0, overflowY: "auto" }}>
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
        {!isMobile && showPayments ? (
          <p
            onClick={() => {
              setPage("payments")
              onClose?.()
            }}
            style={{ ...itemStyle, margin: "10px 0 6px", fontSize: 14, fontWeight: 600 }}
          >
            {formatPortalTabLabel("payments", paymentsTabEntry?.label ?? null, t)}
          </p>
        ) : null}
        {!isMobile && showAccount ? (
          <button
            type="button"
            onClick={() => { setPage("account"); onClose?.() }}
            style={{
              marginTop: 2,
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
        ) : null}
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
