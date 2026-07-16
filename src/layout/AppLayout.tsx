import { useState, useEffect } from "react"
import Sidebar from "../components/Sidebar"
import { CopyrightVersionFooter } from "../components/CopyrightVersionFooter"
import mytIcon from "../assets/MyT.png"
import { useAuth } from "../contexts/AuthContext"
import { useView } from "../contexts/ViewContext"
import { useIsMobile } from "../hooks/useIsMobile"
import { useLocale } from "../i18n/LocaleContext"
import { supabase } from "../lib/supabase"
import { fetchUserPublicTwilioNumber } from "../lib/userPublicBusinessLine"
import PortalViewBar from "../components/PortalViewBar"
import NotificationCenter from "../components/NotificationCenter"
import MessengerWidget from "../components/MessengerWidget"
import { SchemeMatrixShellBackdrop } from "../components/SchemeSidebarDecorations"
import { readSidebarCollapsed, writeSidebarCollapsed } from "../lib/sidebarLayoutPrefs"
import { useAppScheme } from "../contexts/AppSchemeContext"
import { resolveSchemeTone } from "../lib/appSchemes"
import { hasSchemeThemeAssets, schemeThemeCssVars } from "../lib/themeSchemeAssets"

type AppLayoutProps = {
  children: React.ReactNode
  setPage: (page: string) => void
  /** Portal tabs from admin config (user or office manager). When set, sidebar is driven by config. */
  portalTabs?: Array<{ tab_id: string; label: string | null }>
  /** Mobile header title */
  currentPage?: string
  /** In-app page id for sidebar highlight */
  activePage?: string
  /** Hide left nav (email client full-width layout). */
  hideSidebar?: boolean
  /** Hide portal view-as bar (standalone email pop-out). */
  hidePortalChrome?: boolean
}

export default function AppLayout({
  children,
  setPage,
  portalTabs,
  currentPage,
  activePage,
  hideSidebar = false,
  hidePortalChrome = false,
}: AppLayoutProps) {
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed())
  const { signOut, profilePhotoUrl, user } = useAuth()
  const { setView } = useView()
  const isMobile = useIsMobile()
  const { t } = useLocale()
  const [headerBusinessName, setHeaderBusinessName] = useState("")
  const [headerPublicLine, setHeaderPublicLine] = useState<string | null>(null)

  useEffect(() => {
    if (!isMobile || !supabase || !user?.id) {
      setHeaderBusinessName("")
      setHeaderPublicLine(null)
      return
    }
    let cancelled = false
    void (async () => {
      const [{ data }, line] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        fetchUserPublicTwilioNumber(supabase, user.id),
      ])
      if (cancelled) return
      setHeaderBusinessName(typeof data?.display_name === "string" ? data.display_name.trim() : "")
      setHeaderPublicLine(line)
    })()
    return () => {
      cancelled = true
    }
  }, [isMobile, user?.id])

  const handleLogout = () => {
    signOut()
    setView("home")
    setShowMobileNav(false)
  }

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      writeSidebarCollapsed(next)
      return next
    })
  }

  const { schemeId, scheme, portalStyle } = useAppScheme()
  const schemeTone = resolveSchemeTone(schemeId, scheme.custom)
  const schemePhotoVars = schemeThemeCssVars(schemeId)

  return (
    <div
      className="portal-charcoal"
      data-app-scheme={schemeId}
      data-scheme-tone={schemeTone}
      data-scheme-sidebar-photos={hasSchemeThemeAssets(schemeId) ? "true" : undefined}
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "stretch",
        ...portalStyle,
        ...schemePhotoVars,
      }}
    >
      <SchemeMatrixShellBackdrop />
      {!hideSidebar && isMobile ? (
        <Sidebar
          setPage={setPage}
          onLogout={handleLogout}
          portalTabs={portalTabs}
          isMobile
          isOpen={showMobileNav}
          onClose={() => setShowMobileNav(false)}
          activePage={activePage}
        />
      ) : !hideSidebar ? (
        <Sidebar
          setPage={setPage}
          onLogout={handleLogout}
          portalTabs={portalTabs}
          activePage={activePage}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
        />
      ) : null}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {isMobile && !hideSidebar && (
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 14px",
              background: "var(--scheme-sidebar-bg, #2a2a2a)",
              color: "#fff",
              boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
            }}
          >
            <button
              type="button"
              onClick={() => setShowMobileNav(true)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t("layout.menu")}
            </button>
            <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {currentPage ?? "Tradesman"}
            </div>
            <button
              type="button"
              onClick={() => setPage("account")}
              aria-label={t("layout.account")}
              title={t("layout.account")}
              style={{
                padding: "6px 10px",
                minWidth: 48,
                minHeight: 48,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
                maxWidth: "52vw",
              }}
            >
              {(headerBusinessName || headerPublicLine) ? (
                <span style={{ display: "grid", gap: 2, minWidth: 0, textAlign: "right" }}>
                  {headerBusinessName ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        lineHeight: 1.2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {headerBusinessName}
                    </span>
                  ) : null}
                  {headerPublicLine ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        color: "#fcd34d",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {headerPublicLine}
                    </span>
                  ) : null}
                </span>
              ) : null}
              <img src={mytIcon} alt="" width={30} height={22} style={{ objectFit: "contain", display: "block", flexShrink: 0 }} />
              {profilePhotoUrl ? (
                <img
                  src={profilePhotoUrl}
                  alt=""
                  width={32}
                  height={32}
                  style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.4)", display: "block", flexShrink: 0 }}
                />
              ) : null}
            </button>
          </div>
        )}
        <main
          className="app-main-safe scheme-main-content"
          style={{
            flex: 1,
            padding: isMobile
              ? "10px calc(10px + env(safe-area-inset-right, 0)) calc(14px + env(safe-area-inset-bottom, 0)) calc(10px + env(safe-area-inset-left, 0))"
              : hideSidebar
                ? "16px 20px"
                : "20px",
            minWidth: 0,
            maxWidth: "100%",
            overflowX: isMobile ? "hidden" : "auto",
            background: "transparent",
          }}
        >
          {!hidePortalChrome ? <PortalViewBar /> : null}
          {children}
        </main>
        <CopyrightVersionFooter variant="portal" align={isMobile ? "center" : "left"} style={{ paddingLeft: isMobile ? 12 : 20, paddingRight: isMobile ? 12 : 20 }} />
      </div>
      {!isMobile && !hidePortalChrome && user?.id ? <NotificationCenter userId={user.id} setPage={setPage} /> : null}
      {!isMobile && !hidePortalChrome && user?.id ? <MessengerWidget /> : null}
    </div>
  )
}
