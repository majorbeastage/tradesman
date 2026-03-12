import { useState, useEffect, useCallback } from "react"
import { ViewProvider } from "./contexts/ViewContext"
import AppLayout from "./layout/AppLayout"
import CustomersPage from "./modules/customers/CustomersPage"
import LeadsPage from "./modules/leads/LeadsPage"
import ConversationsPage from "./modules/conversations/ConversationsPage"
import QuotesPage from "./modules/quotes/QuotesPage"
import CalendarPage from "./modules/calendar/CalendarPage"
import WebSupportPage from "./modules/web-support/WebSupportPage"
import TechSupportPage from "./modules/tech-support/TechSupportPage"
import SettingsPage from "./modules/settings/SettingsPage"
import HomePage from "./modules/home/HomePage"
import LoginPage from "./modules/auth/LoginPage"
import DemoPage from "./modules/demo/DemoPage"
import OfficeManagerApp from "./modules/office-manager/OfficeManagerApp"
import AdminApp from "./modules/admin/AdminApp"
import { useAuth } from "./contexts/AuthContext"
import type { UserRole } from "./contexts/AuthContext"
import { usePortalTabs } from "./hooks/usePortalTabs"
import { supabase } from "./lib/supabase"

type View = "home" | "login" | "admin-login" | "demo" | "app" | "office" | "admin"
type LoginType = "user" | "office_manager" | "admin"

function MainApp() {
  const [page, setPage] = useState("dashboard")
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "ok" | "failed" | "no-config">("checking")
  const [connectionError, setConnectionError] = useState<string>("")
  const { clientId } = useAuth()
  const { tabs: portalTabs } = usePortalTabs(clientId, "user")

  useEffect(() => {
    if (!supabase) {
      setConnectionStatus("no-config")
      return
    }
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
  }, [])

  return (
    <AppLayout setPage={setPage} portalTabs={portalTabs}>
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

      {page === "customers" && <CustomersPage />}
      {page === "leads" && <LeadsPage setPage={setPage} />}
      {page === "conversations" && <ConversationsPage setPage={setPage} />}
      {page === "quotes" && <QuotesPage setPage={setPage} />}
      {page === "calendar" && <CalendarPage />}
      {page === "web-support" && <WebSupportPage />}
      {page === "tech-support" && <TechSupportPage />}
      {page === "settings" && <SettingsPage />}
    </AppLayout>
  )
}

function App() {
  const { user, role, loading, refetchProfile } = useAuth()
  const [view, setView] = useState<View>("home")
  const [loginType, setLoginType] = useState<LoginType>("user")
  const [loginError, setLoginError] = useState("")

  // If already logged in (e.g. refresh), send to the right portal
  useEffect(() => {
    if (loading || !user || !role) return
    if (view !== "home") return
    setView(role === "admin" ? "admin" : role === "office_manager" ? "office" : "app")
  }, [loading, user, role, view])

  const handleLoginSuccess = useCallback(async (r: UserRole) => {
    setLoginError("")
    if (view === "admin-login") {
      if (r !== "admin") {
        // Retry once in case profile wasn't ready right after sign-in
        const { role: refetched, error: fetchErr } = await refetchProfile()
        if (refetched === "admin") {
          setView("admin")
          return
        }
        const roleLabel = refetched ?? "none"
        const errDetail = fetchErr ? ` Profile fetch error: ${fetchErr}` : ""
        setLoginError(`This account is not an admin. (App sees role: ${roleLabel}.${errDetail} In Supabase Table Editor → profiles, ensure this account's row has role = admin.)`)
        return
      }
      setView("admin")
      return
    }
    // Regular login: send to the portal they chose on the home page
    if (view === "login") {
      if (loginType === "office_manager") setView("office")
      else setView("app")
      return
    }
    if (r === "admin") setView("admin")
    else if (r === "office_manager") setView("office")
    else setView("app")
  }, [view, loginType, refetchProfile])

  if (view === "home") {
    return (
      <HomePage
        onLogin={() => { setLoginType("user"); setView("login"); setLoginError("") }}
        onOfficeManagerLogin={() => { setLoginType("office_manager"); setView("login"); setLoginError("") }}
        onAdminLogin={() => { setLoginType("admin"); setView("admin-login"); setLoginError("") }}
        onRequestDemo={() => setView("demo")}
      />
    )
  }

  if (view === "demo") {
    return <DemoPage onBack={() => setView("home")} />
  }

  if (view === "login" || view === "admin-login") {
    return (
      <>
        {loginError && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: 12, background: "#fecaca", color: "#991b1b", textAlign: "center", zIndex: 10000 }}>
            {loginError}
          </div>
        )}
        <LoginPage
          loginType={loginType}
          onSuccess={handleLoginSuccess}
          onBack={() => { setView("home"); setLoginError("") }}
        />
      </>
    )
  }

  if (view === "admin") {
    return (
      <ViewProvider setView={setView}>
        <AdminApp />
      </ViewProvider>
    )
  }

  if (view === "office") {
    return (
      <ViewProvider setView={setView}>
        <OfficeManagerApp />
      </ViewProvider>
    )
  }

  return (
    <ViewProvider setView={setView}>
      <MainApp />
    </ViewProvider>
  )
}

export default App
