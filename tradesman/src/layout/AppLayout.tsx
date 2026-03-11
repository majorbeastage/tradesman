import { useState } from "react"
import Sidebar from "../components/Sidebar"
import { useAuth } from "../contexts/AuthContext"
import { theme } from "../styles/theme"

export default function AppLayout({ children, setPage }: any) {
  const [showAccount, setShowAccount] = useState(false)
  const { user, signOut } = useAuth()

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar setPage={setPage} onOpenAccount={() => setShowAccount(true)} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px" }}>
        <main style={{ flex: 1 }}>{children}</main>
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
              padding: "24px",
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
            {user?.email && (
              <p style={{ color: theme.text, fontSize: "14px", margin: "0 0 16px" }}>
                Signed in as <strong>{user.email}</strong>
              </p>
            )}
            <button
              type="button"
              onClick={() => { signOut(); setShowAccount(false) }}
              style={{ padding: "8px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
