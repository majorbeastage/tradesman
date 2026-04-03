import { useState } from "react"
import Sidebar from "../components/Sidebar"
import { CopyrightVersionFooter } from "../components/CopyrightVersionFooter"
import { useAuth } from "../contexts/AuthContext"
import { useView } from "../contexts/ViewContext"
import { theme } from "../styles/theme"
import { useIsMobile } from "../hooks/useIsMobile"

type AppLayoutProps = {
  children: React.ReactNode
  setPage: (page: string) => void
  /** Portal tabs from admin config (user or office manager). When set, sidebar is driven by config. */
  portalTabs?: Array<{ tab_id: string; label: string | null }>
  currentPage?: string
}

export default function AppLayout({ children, setPage, portalTabs, currentPage }: AppLayoutProps) {
  const [showMobileNav, setShowMobileNav] = useState(false)
  const { signOut } = useAuth()
  const { setView } = useView()
  const isMobile = useIsMobile()

  const handleLogout = () => {
    signOut()
    setView("home")
    setShowMobileNav(false)
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: theme.charcoalSmoke }}>
      {isMobile ? (
        <Sidebar
          setPage={setPage}
          onLogout={handleLogout}
          portalTabs={portalTabs}
          isMobile
          isOpen={showMobileNav}
          onClose={() => setShowMobileNav(false)}
        />
      ) : (
        <Sidebar setPage={setPage} onLogout={handleLogout} portalTabs={portalTabs} />
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {isMobile && (
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
              background: theme.charcoalSmoke,
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
              Menu
            </button>
            <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {currentPage ?? "Tradesman"}
            </div>
            <button
              type="button"
              onClick={() => setPage("account")}
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
              Account
            </button>
          </div>
        )}
        <main style={{ flex: 1, padding: isMobile ? "12px" : "20px", minWidth: 0, background: theme.charcoalSmoke }}>{children}</main>
        <CopyrightVersionFooter variant="portal" align={isMobile ? "center" : "left"} style={{ paddingLeft: isMobile ? 12 : 20, paddingRight: isMobile ? 12 : 20 }} />
      </div>
    </div>
  )
}
