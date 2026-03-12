import { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useView } from "../../contexts/ViewContext"
import { theme } from "../../styles/theme"
import AdminUsersSection from "./AdminUsersSection"

/**
 * Admin portal: manage all users, settings, dropdowns, office manager clients.
 * To be built out with Supabase queries and UI.
 */
export default function AdminApp() {
  const { user, signOut } = useAuth()
  const { setView } = useView()
  const [section, setSection] = useState<"users" | "settings" | "dropdowns" | "office-managers">("users")

  const navStyle: React.CSSProperties = {
    padding: "8px 12px",
    margin: "4px 0",
    border: "none",
    background: "transparent",
    color: theme.text,
    cursor: "pointer",
    textAlign: "left",
    borderRadius: 6,
    fontWeight: 500,
  }
  const navActiveStyle: React.CSSProperties = { ...navStyle, background: theme.primary, color: "white" }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 220,
          background: theme.charcoalSmoke,
          padding: 20,
          color: "white",
        }}
      >
        <h2 style={{ margin: "0 0 20px", fontSize: 18 }}>Admin</h2>
        <button
          style={section === "users" ? navActiveStyle : navStyle}
          onClick={() => setSection("users")}
        >
          Users
        </button>
        <button
          style={section === "settings" ? navActiveStyle : navStyle}
          onClick={() => setSection("settings")}
        >
          Settings
        </button>
        <button
          style={section === "dropdowns" ? navActiveStyle : navStyle}
          onClick={() => setSection("dropdowns")}
        >
          Dropdowns & options
        </button>
        <button
          style={section === "office-managers" ? navActiveStyle : navStyle}
          onClick={() => setSection("office-managers")}
        >
          Office Manager clients
        </button>
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{user?.email}</p>
          <button
            type="button"
            onClick={() => { signOut(); setView("home") }}
            style={{ marginTop: 8, padding: "6px 12px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24, background: theme.background }}>
        <h1 style={{ color: theme.text, marginBottom: 16 }}>
          {section === "users" && "Users"}
          {section === "settings" && "Settings"}
          {section === "dropdowns" && "Dropdowns & selectable options"}
          {section === "office-managers" && "Office Manager clients"}
        </h1>
        {section === "users" && <AdminUsersSection />}
        {section === "settings" && (
          <p style={{ color: theme.text, opacity: 0.8 }}>Global settings for all users. (To be built.)</p>
        )}
        {section === "dropdowns" && (
          <p style={{ color: theme.text, opacity: 0.8 }}>Add or remove dropdown options and selectable boxes used across the app. (To be built.)</p>
        )}
        {section === "office-managers" && (
          <p style={{ color: theme.text, opacity: 0.8 }}>Assign users to office managers (who can manage their settings and calendars). (To be built.)</p>
        )}
      </main>
    </div>
  )
}
