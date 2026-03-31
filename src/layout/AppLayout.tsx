import { useState } from "react"
import Sidebar from "../components/Sidebar"
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
  const [showAccount, setShowAccount] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const { user, signOut } = useAuth()
  const { setView } = useView()
  const isMobile = useIsMobile()

  const handleLogout = () => {
    signOut()
    setView("home")
    setShowAccount(false)
    setShowMobileNav(false)
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: theme.background }}>
      {isMobile ? (
        <Sidebar
          setPage={setPage}
          onOpenAccount={() => setShowAccount(true)}
          onLogout={handleLogout}
          portalTabs={portalTabs}
          isMobile
          isOpen={showMobileNav}
          onClose={() => setShowMobileNav(false)}
        />
      ) : (
        <Sidebar setPage={setPage} onOpenAccount={() => setShowAccount(true)} onLogout={handleLogout} portalTabs={portalTabs} />
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
              onClick={() => setShowAccount(true)}
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
        <main style={{ flex: 1, padding: isMobile ? "12px" : "20px", minWidth: 0 }}>{children}</main>
      </div>

      {showAccount && (
        <>
          <div
            onClick={() => setShowAccount(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: "420px",
              background: "white",
              borderRadius: "8px",
              padding: isMobile ? "18px" : "24px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              zIndex: 9999
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>Account & Profile</h3>
              <button
                onClick={() => setShowAccount(false)}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}
              >
                ✕
              </button>
            </div>
            {user?.email ? (
              <p style={{ color: theme.text, fontSize: "14px", margin: "0 0 16px" }}>
                Signed in as <strong>{user.email}</strong>
              </p>
            ) : (
              <p style={{ color: theme.text, fontSize: "14px", margin: "0 0 16px" }}>
                Not signed in. You're using the app with shared dev data.
              </p>
            )}
            {user && (
              <button
                type="button"
                onClick={handleLogout}
                style={{ padding: "8px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                Log out
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
