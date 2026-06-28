import { Fragment, type CSSProperties } from "react"
import { HELP_DESK_PHONE_DISPLAY, HELP_DESK_PHONE_E164 } from "../constants/helpDesk"
import { theme } from "../styles/theme"
import logo from "../assets/logo.png"
import accountIcon from "../assets/MyT.png"
import { TAB_ID_LABELS, V2_SIDEBAR_DEFAULT_TAB_IDS } from "../types/portal-builder"
import { useLocale } from "../i18n/LocaleContext"
import { formatPortalTabLabel } from "../i18n/navLabel"
import { useAuth } from "../contexts/AuthContext"
import { CUSTOMERS_EMAIL_PAGE } from "../lib/customersEmailClientNav"
import { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../lib/sidebarLayoutPrefs"

type SidebarProps = {
  setPage: (page: string) => void
  onLogout?: () => void
  /** When set, sidebar items are driven by portal config (admin-customizable). */
  portalTabs?: Array<{ tab_id: string; label: string | null }>
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
  /** Active in-app page id (e.g. customers, customers-email). */
  activePage?: string
  /** Desktop only — narrow rail mode. */
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

const DEFAULT_TABS = [...V2_SIDEBAR_DEFAULT_TAB_IDS]

/** Shown on the dashboard only — keep off the left nav (including portal-configured tabs). */
const SIDEBAR_EXCLUDED_TAB_IDS = new Set([
  "insurance-options",
  "tech-support",
  "business-workflow",
  "organization-chart",
  "reporting",
  "settings",
])

export default function Sidebar({
  setPage,
  onLogout,
  portalTabs,
  isMobile = false,
  isOpen = true,
  onClose,
  activePage,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const { t } = useLocale()
  const { profilePhotoUrl } = useAuth()
  const itemStyle: CSSProperties = { cursor: "pointer", margin: "8px 0", color: theme.primary }
  const subItemStyle: CSSProperties = {
    cursor: "pointer",
    margin: "4px 0 8px",
    paddingLeft: 14,
    color: theme.primary,
    fontSize: 13,
    fontWeight: 600,
    opacity: 0.92,
  }
  const mobileTabButtonStyle: CSSProperties = {
    width: "100%",
    minHeight: 42,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(249,115,22,0.35)",
    background: "rgba(255,255,255,0.04)",
    color: theme.primary,
    fontWeight: 700,
    fontSize: 14,
    textAlign: "left",
    cursor: "pointer",
  }
  const allTabs = (
    portalTabs && portalTabs.length > 0
      ? portalTabs
      : DEFAULT_TABS.map((tab_id) => ({ tab_id, label: TAB_ID_LABELS[tab_id] ?? tab_id }))
  ).filter((t) => !SIDEBAR_EXCLUDED_TAB_IDS.has(t.tab_id))
  const showAccount = allTabs.some((t) => t.tab_id === "account") || !portalTabs
  const showPayments = allTabs.some((t) => t.tab_id === "payments") || !portalTabs
  const paymentsTabEntry = allTabs.find((t) => t.tab_id === "payments")
  /** Account + Payments: pinned in the footer (desktop) or header stack (mobile), not in the long scroll list — Payments sits right above My T. */
  const tabs = allTabs.filter((t) => t.tab_id !== "account" && t.tab_id !== "payments")

  const openHelpDesk = () => {
    setPage("tech-support")
    onClose?.()
  }

  const helpDeskLinkStyle: CSSProperties = {
    display: "block",
    width: "100%",
    padding: 0,
    margin: "0 0 4px",
    border: "none",
    background: "transparent",
    fontWeight: 700,
    color: theme.primary,
    fontSize: 11,
    letterSpacing: 0.3,
    textAlign: "left",
    cursor: "pointer",
  }

  const grainUrl =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/></filter><rect width="200" height="200" filter="url(#n)" opacity="0.07"/></svg>'
    )

  const navigate = (pageId: string) => {
    setPage(pageId)
    onClose?.()
  }

  const renderNavTab = (tab: { tab_id: string; label: string | null }) => {
    if (tab.tab_id === "customers") {
      const customersActive = activePage === "customers"
      const emailActive = activePage === CUSTOMERS_EMAIL_PAGE
      const showEmailSubmenu = customersActive || emailActive

      if (!showEmailSubmenu) {
        if (isMobile) {
          return (
            <button
              key="customers"
              type="button"
              onClick={() => navigate("customers")}
              style={{
                ...mobileTabButtonStyle,
                borderColor: activePage === "customers" ? theme.primary : "rgba(249,115,22,0.35)",
                background: activePage === "customers" ? "rgba(249,115,22,0.18)" : mobileTabButtonStyle.background,
              }}
            >
              {formatPortalTabLabel("customers", tab.label, t)}
            </button>
          )
        }
        return (
          <p
            key="customers"
            onClick={() => navigate("customers")}
            style={{ ...itemStyle, fontWeight: activePage === "customers" ? 800 : undefined }}
          >
            {formatPortalTabLabel("customers", tab.label, t)}
          </p>
        )
      }

      if (isMobile) {
        return (
          <Fragment key="customers-group">
            <button
              type="button"
              onClick={() => navigate("customers")}
              style={{
                ...mobileTabButtonStyle,
                borderColor: customersActive ? theme.primary : "rgba(249,115,22,0.35)",
                background: customersActive ? "rgba(249,115,22,0.18)" : mobileTabButtonStyle.background,
              }}
            >
              {formatPortalTabLabel("customers", tab.label, t)}
            </button>
            <button
              type="button"
              onClick={() => navigate(CUSTOMERS_EMAIL_PAGE)}
              style={{
                ...mobileTabButtonStyle,
                marginLeft: 12,
                minHeight: 38,
                fontSize: 13,
                fontWeight: emailActive ? 800 : 600,
                borderColor: emailActive ? theme.primary : "rgba(249,115,22,0.28)",
                background: emailActive ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.02)",
              }}
            >
              {t("nav.emailClient")}
            </button>
          </Fragment>
        )
      }
      return (
        <Fragment key="customers-group">
          <p
            onClick={() => navigate("customers")}
            style={{ ...itemStyle, fontWeight: customersActive ? 800 : undefined, marginBottom: 4 }}
          >
            {formatPortalTabLabel("customers", tab.label, t)}
          </p>
          <p
            onClick={() => navigate(CUSTOMERS_EMAIL_PAGE)}
            style={{ ...subItemStyle, fontWeight: emailActive ? 800 : 600, opacity: emailActive ? 1 : 0.88 }}
          >
            {t("nav.emailClient")}
          </p>
        </Fragment>
      )
    }

    if (isMobile) {
      return (
        <button
          key={tab.tab_id}
          type="button"
          onClick={() => navigate(tab.tab_id)}
          style={{
            ...mobileTabButtonStyle,
            borderColor: activePage === tab.tab_id ? theme.primary : "rgba(249,115,22,0.35)",
            background: activePage === tab.tab_id ? "rgba(249,115,22,0.18)" : mobileTabButtonStyle.background,
          }}
        >
          {formatPortalTabLabel(tab.tab_id, tab.label, t)}
        </button>
      )
    }

    return (
      <p
        key={tab.tab_id}
        onClick={() => navigate(tab.tab_id)}
        style={{ ...itemStyle, fontWeight: activePage === tab.tab_id ? 800 : undefined }}
      >
        {formatPortalTabLabel(tab.tab_id, tab.label, t)}
      </p>
    )
  }

  const sidebarBody = (
    <div
      style={{
        width: isMobile ? "min(88vw, 300px)" : collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        background: theme.charcoalSmoke,
        backgroundImage: grainUrl,
        color: theme.primary,
        padding: isMobile ? "16px 14px 20px" : collapsed ? "12px 8px 16px" : "20px",
        display: "flex",
        flexDirection: "column",
        height: isMobile ? "100%" : "100%",
        minHeight: isMobile ? undefined : "100%",
        flex: isMobile ? undefined : 1,
        boxSizing: "border-box",
        transition: isMobile ? undefined : "width 0.2s ease, padding 0.2s ease",
        overflow: "hidden",
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
      {!isMobile && onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.minimize")}
          title={collapsed ? t("sidebar.expand") : t("sidebar.minimize")}
          style={{
            alignSelf: collapsed ? "center" : "flex-end",
            marginBottom: collapsed ? 16 : 8,
            width: collapsed ? 36 : 32,
            height: 32,
            padding: 0,
            borderRadius: 8,
            border: "1px solid rgba(249,115,22,0.35)",
            background: "rgba(255,255,255,0.06)",
            color: theme.primary,
            fontWeight: 800,
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {collapsed ? "»" : "«"}
        </button>
      ) : null}
      {!collapsed ? (
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
      ) : null}

      {isMobile && (showAccount || showPayments || onLogout) ? (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "stretch",
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
                width: "100%",
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
                justifyContent: "flex-start",
                gap: 8,
                minHeight: 48,
                width: "100%",
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid rgba(249,115,22,0.45)`,
                background: "rgba(249,115,22,0.12)",
                cursor: "pointer",
                color: theme.primary,
                fontWeight: 700,
              }}
            >
              <img src={accountIcon} alt="" style={{ width: 28, height: 20, display: "block", objectFit: "contain" }} />
              <span>{t("layout.account")}</span>
            </button>
          ) : null}
          {onLogout ? (
            <button
              type="button"
              onClick={() => { onLogout?.(); onClose?.() }}
              style={{
                minHeight: 44,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: theme.primary,
                fontWeight: 600,
                fontSize: 14,
                textAlign: "left",
              }}
            >
              {t("layout.logout")}
            </button>
          ) : null}
        </div>
      ) : null}

      {!collapsed || isMobile ? (
      <div style={{ marginTop: isMobile ? 18 : 30, flex: 1, minHeight: 0, overflowY: "auto" }}>
        {isMobile ? (
          <div style={{ display: "grid", gap: 8 }}>{tabs.map((tab) => renderNavTab(tab))}</div>
        ) : (
          tabs.map((tab) => renderNavTab(tab))
        )}
      </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }} aria-hidden />
      )}

      <div
        style={{
          marginTop: "auto",
          paddingTop: collapsed && !isMobile ? 0 : 12,
          borderTop: collapsed && !isMobile ? "none" : `1px solid rgba(249,115,22,0.25)`,
          fontSize: 11,
          lineHeight: 1.45,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        {collapsed && !isMobile ? (
          <>
            {showAccount ? (
              <button
                type="button"
                onClick={() => {
                  setPage("account")
                  onClose?.()
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "8px 4px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
                title={t("layout.account")}
              >
                <img src={accountIcon} alt="" style={{ width: 32, height: 22, display: "block", objectFit: "contain" }} />
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt=""
                    width={28}
                    height={28}
                    style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.35)", display: "block" }}
                  />
                ) : null}
              </button>
            ) : null}
          </>
        ) : (
          <>
        <button type="button" onClick={openHelpDesk} style={{ ...helpDeskLinkStyle, marginBottom: 8 }}>
          {t("sidebar.helpDesk")}
        </button>
        <a href={`tel:${HELP_DESK_PHONE_E164}`} style={{ color: "inherit", textDecoration: "none" }} onClick={onClose}>
          {HELP_DESK_PHONE_DISPLAY}
        </a>
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
        {!isMobile && showPayments && showAccount ? (
          <div
            role="separator"
            style={{
              height: 1,
              margin: "10px 0 4px",
              background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.45), transparent)",
            }}
          />
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
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            title={t("layout.account")}
          >
            <img src={accountIcon} alt="" style={{ width: "52px", height: "36px", display: "block", objectFit: "contain" }} />
            {profilePhotoUrl ? (
              <img
                src={profilePhotoUrl}
                alt=""
                width={40}
                height={40}
                style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.35)", display: "block" }}
              />
            ) : null}
          </button>
        ) : null}
        {onLogout && !isMobile ? (
          <button
            type="button"
            onClick={() => { onLogout?.(); onClose?.() }}
            style={{
              display: "block",
              marginTop: 10,
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
        ) : null}
          </>
        )}
      </div>
    </div>
  )

  if (!isMobile) {
    return (
      <aside
        style={{
          flexShrink: 0,
          alignSelf: "stretch",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {sidebarBody}
      </aside>
    )
  }
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
