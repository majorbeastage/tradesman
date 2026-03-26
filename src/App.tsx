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
import { ErrorBoundary } from "./ErrorBoundary"
import { usePortalTabs } from "./hooks/usePortalTabs"
import { USER_PORTAL_TAB_IDS, TAB_ID_LABELS, type PortalConfig } from "./types/portal-builder"
import { supabase } from "./lib/supabase"

type View = "home" | "login" | "admin-login" | "demo" | "app" | "office" | "admin"
type LoginType = "user" | "office_manager" | "admin"

function buildPortalTabsFromConfig(portalConfig: PortalConfig | null): Array<{ tab_id: string; label: string | null }> | undefined {
  if (!portalConfig) return undefined
  const hasTabs = (portalConfig.tabs && Object.keys(portalConfig.tabs).length > 0) || (portalConfig.customTabs?.length ?? 0) > 0
  if (!hasTabs) return undefined
  const defaultEntries = USER_PORTAL_TAB_IDS.map((tab_id) => ({ tab_id, label: TAB_ID_LABELS[tab_id] ?? null }))
  const customEntries = (portalConfig.customTabs ?? []).map((t) => ({ tab_id: t.id, label: t.label }))
  const all = [...defaultEntries, ...customEntries]
  const visible = all.filter(({ tab_id }) => portalConfig.tabs?.[tab_id] !== false)
  return visible.length > 0 ? visible : undefined
}

function MainApp() {
  const [page, setPage] = useState("dashboard")
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "ok" | "failed" | "no-config">("checking")
  const [connectionError, setConnectionError] = useState<string>("")
  const { clientId, portalConfig } = useAuth()
  const { tabs: portalTabsFromApi } = usePortalTabs(clientId, "user")
  // Prefer per-user portal_config from admin (default + custom tabs, filtered by visibility)
  const portalTabs = buildPortalTabsFromConfig(portalConfig) ?? portalTabsFromApi

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
          <h1 style={{ marginBottom: 10 }}>Dashboard</h1>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              marginTop: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ padding: 16, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Pipeline</p>
              <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 700, color: "#111827" }}>Leads → Quotes → Calendar</p>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>Track every customer from first contact to booked job.</p>
            </div>
            <div style={{ padding: 16, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Communication</p>
              <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 700, color: "#111827" }}>Messages + Notes</p>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>Keep customer history centralized and easy to review.</p>
            </div>
            <div style={{ padding: 16, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>Scheduling</p>
              <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 700, color: "#111827" }}>Smart Recurrence</p>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>Plan one-time and recurring jobs with less manual work.</p>
            </div>
          </div>
          <div style={{ maxWidth: "920px", marginTop: "8px", padding: "24px", background: "var(--charcoal-smoke, #1f2937)", border: "1px solid var(--border, #374151)", borderRadius: "10px", lineHeight: 1.6, color: "var(--text, #e5e7eb)" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, color: "#fff" }}>Welcome to Tradesman</h2>
            <p style={{ margin: "0 0 10px" }}>
              We help contractors and small businesses manage leads, conversations, quotes, and scheduling in one clean workspace.
            </p>
            <p style={{ margin: 0 }}>
              Use the sidebar to jump to the next step in your workflow. The layout is optimized for desktop and mobile web so your team can stay productive anywhere.
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
      {!["dashboard", "leads", "conversations", "quotes", "calendar", "customers", "web-support", "tech-support", "settings"].includes(page) && (
        <div style={{ padding: 24 }}>
          <h1 style={{ color: "var(--text, #1f2937)" }}>{page}</h1>
          <p style={{ color: "var(--text, #6b7280)" }}>This section is configured by your admin. Content can be added here later.</p>
        </div>
      )}
    </AppLayout>
  )
}

function App() {
  const { refetchProfile } = useAuth()
  const [view, setView] = useState<View>("home")
  const [loginType, setLoginType] = useState<LoginType>("user")
  const [loginError, setLoginError] = useState("")

  // No auto-redirect when logged in: if the user navigates to home, they stay on home and can choose to open a portal or log in as someone else.

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
      <ErrorBoundary
        fallback={
          <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: "sans-serif" }}>
            <h1 style={{ color: "#b91c1c", margin: 0 }}>Something went wrong in the admin portal</h1>
            <p style={{ color: "#6b7280", margin: 0 }}>Check the browser console for details.</p>
            <button
              type="button"
              onClick={() => setView("home")}
              style={{ padding: "10px 20px", background: "#f97316", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
            >
              Back to home
            </button>
          </div>
        }
      >
        <ViewProvider setView={setView}>
          <AdminApp />
        </ViewProvider>
      </ErrorBoundary>
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
