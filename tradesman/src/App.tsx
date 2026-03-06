import { useState, useEffect } from "react"
import AppLayout from "./layout/AppLayout"
import CustomersPage from "./modules/customers/CustomersPage"
import LeadsPage from "./modules/leads/LeadsPage"
import ConversationsPage from "./modules/conversations/ConversationsPage"
import QuotesPage from "./modules/quotes/QuotesPage"
import WebSupportPage from "./modules/web-support/WebSupportPage"
import TechSupportPage from "./modules/tech-support/TechSupportPage"
import { supabase } from "./lib/supabase"

function App() {

  const [page, setPage] = useState("dashboard")
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "ok" | "failed" | "no-config">("checking")
  const [connectionError, setConnectionError] = useState<string>("")

  useEffect(() => {
    if (!supabase) {
      setConnectionStatus("no-config")
      return
    }
    setConnectionError("")
    const p = supabase.from("customers").select("id").limit(1)
    void Promise.resolve(p)
      .then(({ error }) => {
        if (error) {
          setConnectionStatus("failed")
          setConnectionError(error.message)
        } else {
          setConnectionStatus("ok")
        }
      })
      .catch((err: unknown) => {
        setConnectionStatus("failed")
        setConnectionError(err instanceof Error ? err.message : String(err))
      })
  }, [])

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
          <p>Welcome to Tradesman</p>
        </>
      )}

      {page === "customers" && (
        <CustomersPage />
      )}

      {page === "leads" && (
        <LeadsPage />
      )}

      {page === "conversations" && (
        <ConversationsPage setPage={setPage} />
      )}

      {page === "quotes" && (
        <QuotesPage />
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
