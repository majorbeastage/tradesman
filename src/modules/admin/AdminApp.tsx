import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useView } from "../../contexts/ViewContext"
import { theme } from "../../styles/theme"
import { fetchClients } from "../../lib/portal-builder-api"
import type { Client } from "../../types/portal-builder"
import AdminUsersSection from "./AdminUsersSection"
import AdminPortalBuilder from "./AdminPortalBuilder"

const DEFAULT_CLIENT_ID = "00000000-0000-0000-0000-000000000001"

/**
 * Admin portal: client selector, portal builder (custom fields, tabs), users, dropdowns, office manager clients.
 */
export default function AdminApp() {
  const { user, signOut } = useAuth()
  const { setView } = useView()
  const [section, setSection] = useState<"users" | "portal-builder" | "settings" | "dropdowns" | "office-managers">("users")
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientsError, setClientsError] = useState("")

  useEffect(() => {
    fetchClients()
      .then((list) => {
        setClientsError("")
        setClients(list)
      })
      .catch((e) => {
        setClientsError(e instanceof Error ? e.message : "Failed to load clients")
        setClients([])
      })
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      if (clients.length > 0) setSelectedClientId(clients[0].id)
      else setSelectedClientId(DEFAULT_CLIENT_ID)
    }
  }, [clients, selectedClientId])

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
          width: 240,
          background: theme.charcoalSmoke,
          padding: 20,
          color: "white",
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Admin</h2>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ fontSize: 11, opacity: 0.8, display: "block", marginBottom: 4 }}>Client</span>
          <select
            value={selectedClientId ?? ""}
            onChange={(e) => setSelectedClientId(e.target.value || null)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 14,
            }}
          >
            {clients.length === 0 && (
              <option value={DEFAULT_CLIENT_ID}>Default</option>
            )}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {clientsError && (
            <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.9 }}>{clientsError}</p>
          )}
          {clients.length === 0 && !clientsError && (
            <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.8 }}>Run supabase-admin-portal-builder.sql to add clients.</p>
          )}
        </label>
        <button
          style={section === "users" ? navActiveStyle : navStyle}
          onClick={() => setSection("users")}
        >
          Users
        </button>
        <button
          style={section === "portal-builder" ? navActiveStyle : navStyle}
          onClick={() => setSection("portal-builder")}
        >
          Portal builder
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
          {section === "portal-builder" && "Portal builder"}
          {section === "settings" && "Settings"}
          {section === "dropdowns" && "Dropdowns & selectable options"}
          {section === "office-managers" && "Office Manager clients"}
        </h1>
        {section === "users" && <AdminUsersSection />}
        {section === "portal-builder" && selectedClientId && (
          <AdminPortalBuilder clientId={selectedClientId} />
        )}
        {section === "portal-builder" && !selectedClientId && (
          <p style={{ color: theme.text, opacity: 0.8 }}>Select a client to configure.</p>
        )}
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
