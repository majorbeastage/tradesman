import { useState, useEffect } from "react"
import AppLayout from "./layout/AppLayout"
import CustomersPage from "./modules/customers/CustomersPage"
import LeadsPage from "./modules/leads/LeadsPage"
import ConversationsPage from "./modules/conversations/ConversationsPage"
import QuotesPage from "./modules/quotes/QuotesPage"
import CalendarPage from "./modules/calendar/CalendarPage"
import WebSupportPage from "./modules/web-support/WebSupportPage"
import TechSupportPage from "./modules/tech-support/TechSupportPage"
import LoginPage from "./modules/auth/LoginPage"
import { useAuth } from "./contexts/AuthContext"
import { supabase } from "./lib/supabase"

function App() {
  const { user, loading: authLoading } = useAuth()
  const [page, setPage] = useState("dashboard")
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "ok" | "failed" | "no-config">("checking")
  const [connectionError, setConnectionError] = useState<string>("")

  useEffect(() => {
    if (!supabase) {
      setConnectionStatus("no-config")
      return
    }
    if (!user) return
    setConnectionError("")
    void (async () => {
      try {
        const { error } = await supabase.from("customers").select("id").limit(1)
        if (error) {
          setConnectionStatus("failed")
          setConnectionError(error.message)
        } else {
          setConnectionStatus("ok")
        }
      } catch (err: unknown) {
        setConnectionStatus("failed")
        setConnectionError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [user])

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
        <p style={{ color: "#374151" }}>Loading…</p>
      </div>
    )
  }
  if (!user) {
    return <LoginPage />
  }

  return (
    <AppLayout setPage={setPage}>
      {connectionStatus !== "ok" && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          padding: "8px 16px",
          background: connectionStatus === "checking" ? "#e5e7eb" : connectionStatus === "no-config" ? "#fef3c7" : "#fecaca",
          color: connectionStatus === "failed" ? "#991b1b" : "#92400e",
          fontSize: "14px",
          zIndex: 9999,
          textAlign: "center"
        }}>
          {connectionStatus === "checking" && "Checking connection…"}
          {connectionStatus === "no-config" && "Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to tradesman/.env and restart the dev server."}
          {connectionStatus === "failed" && (
            <>
              Supabase connection failed. {connectionError && `Error: ${connectionError} `}
              If you see "row-level security" or "policy", add RLS policies in Supabase (see below).
            </>
          )}
        </div>
      )}

      {page === "dashboard" && (
        <>
          <h1>Dashboard</h1>
          <div style={{ maxWidth: "720px", marginTop: "24px", padding: "24px", background: "var(--charcoal-smoke, #1f2937)", border: "1px solid var(--border, #374151)", borderRadius: "8px", lineHeight: 1.6, color: "var(--text, #e5e7eb)" }}>
            <p style={{ margin: "0 0 1em" }}>
              Thank you for visiting our company. We are committed to assisting contractors and small businesses in their day to day operations. Whether it be by reaching new clients, or managing existing clients and scheduling. We are here to help in any way we can.
            </p>
            <p style={{ margin: "0 0 1em" }}>
              Our primary purpose is to utilize as many modern tools as possible, to save you time and help you earn more revenue in the process. Please take a look around and do not hesitate to reach out to us. Thank you.
            </p>
          </div>
        </>
      )}

      {page === "customers" && (
        <CustomersPage />
      )}

      {page === "leads" && (
        <LeadsPage setPage={setPage} />
      )}

      {page === "conversations" && (
        <ConversationsPage setPage={setPage} />
      )}

      {page === "quotes" && (
        <QuotesPage setPage={setPage} />
      )}

      {page === "calendar" && (
        <CalendarPage />
      )}

      {page === "web-support" && (
        <WebSupportPage />
      )}

      {page === "tech-support" && (
        <TechSupportPage />
      )}

    </AppLayout>
  )
}

export default App
