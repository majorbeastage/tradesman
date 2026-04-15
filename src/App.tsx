import { useState, useEffect, useCallback, useMemo } from "react"
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
import AccountPage from "./modules/account/AccountPage"
import PaymentsPage from "./modules/payments/PaymentsPage"
import HomePage from "./modules/home/HomePage"
import LoginPage from "./modules/auth/LoginPage"
import DemoPage from "./modules/demo/DemoPage"
import SignupPage from "./modules/auth/SignupPage"
import ResetPasswordPage from "./modules/auth/ResetPasswordPage"
import AboutUsPage from "./modules/public/AboutUsPage"
import PricingPage from "./modules/public/PricingPage"
import OfficeManagerApp from "./modules/office-manager/OfficeManagerApp"
import AdminApp from "./modules/admin/AdminApp"
import SmsConsentPage from "./modules/public/SmsConsentPage"
import PrivacyPage from "./modules/public/PrivacyPage"
import TermsPage from "./modules/public/TermsPage"
import EmbedLeadPage from "./modules/public/EmbedLeadPage"
import { useAuth } from "./contexts/AuthContext"
import type { UserRole } from "./contexts/AuthContext"
import { ErrorBoundary } from "./ErrorBoundary"
import { usePortalTabs } from "./hooks/usePortalTabs"
import { useManagedByOfficeManager } from "./hooks/useManagedByOfficeManager"
import { useIsMobile } from "./hooks/useIsMobile"
import {
  filterUserPortalTabsForManagedPaymentsPolicy,
  getPortalTabListForConfig,
  type PortalConfig,
  type PortalTab,
} from "./types/portal-builder"
import { supabase } from "./lib/supabase"
import { useLocale } from "./i18n/LocaleContext"
import { formatPortalTabLabel } from "./i18n/navLabel"
import { PRODUCT_PACKAGE_IDS, SIGNUP_PRODUCT_PACKAGE_STORAGE_KEY, type ProductPackageId } from "./lib/productPackages"

type View = "home" | "login" | "admin-login" | "demo" | "signup" | "about" | "pricing" | "app" | "office" | "admin"
type LoginType = "user" | "office_manager" | "admin"

function buildPortalTabsFromConfig(portalConfig: PortalConfig | null): Array<{ tab_id: string; label: string | null }> | undefined {
  if (!portalConfig) return undefined
  const hasTabs = (portalConfig.tabs && Object.keys(portalConfig.tabs).length > 0) || (portalConfig.customTabs?.length ?? 0) > 0
  if (!hasTabs) return undefined
  const ordered = getPortalTabListForConfig(portalConfig)
  const visible = ordered.filter(({ tab_id }) => portalConfig.tabs?.[tab_id] !== false)
  return visible.length > 0 ? visible : undefined
}

function MainApp() {
  const [page, setPage] = useState("dashboard")
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "ok" | "failed" | "no-config">("checking")
  const [connectionError, setConnectionError] = useState<string>("")
  const { clientId, portalConfig, role: authRole } = useAuth()
  const { tabs: portalTabsFromApi } = usePortalTabs(clientId, "user")
  const managedByOfficeManager = useManagedByOfficeManager()
  const isMobile = useIsMobile()
  const { t } = useLocale()
  const mergedTabs = useMemo(() => {
    const fromConfig = buildPortalTabsFromConfig(portalConfig)
    if (fromConfig) return fromConfig
    if (portalTabsFromApi.length > 0) {
      return portalTabsFromApi.map((t: PortalTab) => ({ tab_id: t.tab_id, label: t.label }))
    }
    return getPortalTabListForConfig({})
  }, [portalConfig, portalTabsFromApi])
  const portalTabs = useMemo(
    () => filterUserPortalTabsForManagedPaymentsPolicy(mergedTabs, portalConfig, managedByOfficeManager),
    [mergedTabs, portalConfig, managedByOfficeManager],
  )

  useEffect(() => {
    if (page !== "payments") return
    if (!portalTabs.some((t) => t.tab_id === "payments")) setPage("dashboard")
  }, [page, portalTabs])

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

  const currentTabMeta = portalTabs?.find((x) => x.tab_id === page)
  const currentPageTitle = formatPortalTabLabel(page, currentTabMeta?.label ?? null, t)

  return (
    <AppLayout setPage={setPage} portalTabs={portalTabs} currentPage={currentPageTitle}>
      {authRole === "demo_user" && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            color: "#92400e",
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          <strong>{t("dashboard.demoLabel")}</strong> {t("dashboard.demoBanner")}
        </div>
      )}

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
          {connectionStatus === "checking" && t("app.connection.checking")}
          {connectionStatus === "no-config" && t("app.connection.noConfig")}
          {connectionStatus === "failed" && (
            <>
              {t("app.connection.failed")}
              {connectionError ? ` ${t("app.connection.errorPrefix")} ${connectionError}` : ""}
            </>
          )}
        </div>
      )}

      {page === "dashboard" && (
        <>
          <h1 style={{ marginBottom: 10, fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb" }}>{t("dashboard.title")}</h1>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              marginTop: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ padding: 16, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("dashboard.kicker.pipeline")}</p>
              <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 700, color: "#111827" }}>{t("dashboard.card.pipeline")}</p>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>{t("dashboard.card.pipelineSub")}</p>
            </div>
            <div style={{ padding: 16, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("dashboard.kicker.comm")}</p>
              <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 700, color: "#111827" }}>{t("dashboard.card.comm")}</p>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>{t("dashboard.card.commSub")}</p>
            </div>
            <div style={{ padding: 16, borderRadius: 10, border: "1px solid #e5e7eb", background: "#ffffff" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("dashboard.kicker.schedule")}</p>
              <p style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 700, color: "#111827" }}>{t("dashboard.card.schedule")}</p>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>{t("dashboard.card.scheduleSub")}</p>
            </div>
          </div>
          <div style={{ maxWidth: "920px", marginTop: "8px", padding: isMobile ? "18px" : "24px", background: "var(--charcoal-smoke, #1f2937)", border: "1px solid var(--border, #374151)", borderRadius: "10px", lineHeight: 1.6, color: "var(--text, #e5e7eb)" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, color: "#fff" }}>{t("dashboard.welcomeTitle")}</h2>
            <p style={{ margin: "0 0 10px" }}>{t("dashboard.welcomeBody1")}</p>
            <p style={{ margin: 0 }}>{t("dashboard.welcomeBody2")}</p>
          </div>
        </>
      )}

      {page === "customers" && <CustomersPage />}
      {page === "leads" && <LeadsPage setPage={setPage} />}
      {page === "conversations" && <ConversationsPage />}
      {page === "quotes" && <QuotesPage />}
      {page === "calendar" && <CalendarPage />}
      {page === "web-support" && <WebSupportPage />}
      {page === "tech-support" && <TechSupportPage />}
      {page === "settings" && <SettingsPage />}
      {page === "payments" && <PaymentsPage />}
      {page === "account" && <AccountPage />}
      {!["dashboard", "leads", "conversations", "quotes", "calendar", "customers", "payments", "account", "web-support", "tech-support", "settings"].includes(page) && (
        <div style={{ padding: 24 }}>
          <h1 style={{ color: "var(--text, #1f2937)" }}>{page}</h1>
          <p style={{ color: "var(--text, #6b7280)", margin: "0 0 8px" }}>{t("app.customTab.title")}</p>
          <p style={{ color: "var(--text, #6b7280)", margin: 0 }}>{t("app.customTab.body")}</p>
        </div>
      )}
    </AppLayout>
  )
}

function App() {
  const { refetchProfile } = useAuth()
  const [view, setView] = useState<View>("home")
  const [signupPackagePreset, setSignupPackagePreset] = useState<string | null>(null)
  const [loginType, setLoginType] = useState<LoginType>("user")
  const [loginError, setLoginError] = useState("")
  const pathname = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "/"

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SIGNUP_PRODUCT_PACKAGE_STORAGE_KEY)
      if (!raw) return
      sessionStorage.removeItem(SIGNUP_PRODUCT_PACKAGE_STORAGE_KEY)
      if (PRODUCT_PACKAGE_IDS.includes(raw as ProductPackageId)) {
        setSignupPackagePreset(raw)
        setView("signup")
      }
    } catch {
      /* ignore */
    }
  }, [])

  // No auto-redirect when logged in: if the user navigates to home, they stay on home and can choose to open a portal or log in as someone else.

  const embedLeadMatch = /^\/embed\/lead\/([^/]+)\/?$/i.exec(pathname)
  if (embedLeadMatch) {
    return <EmbedLeadPage slug={decodeURIComponent(embedLeadMatch[1] || "")} />
  }

  if (pathname === "/reset-password") {
    return <ResetPasswordPage onDone={() => { window.history.replaceState(null, "", "/"); window.location.assign("/") }} />
  }

  if (pathname === "/privacy") {
    return <PrivacyPage />
  }
  if (pathname === "/terms") {
    return <TermsPage />
  }
  if (pathname === "/sms-consent") {
    return <SmsConsentPage />
  }
  if (pathname === "/about") {
    return <AboutUsPage onBack={() => (window.location.href = "/")} />
  }
  if (pathname === "/pricing") {
    return (
      <PricingPage
        onBack={() => {
          window.location.href = "/"
        }}
        onSignupWithPackage={(packageId) => {
          try {
            sessionStorage.setItem(SIGNUP_PRODUCT_PACKAGE_STORAGE_KEY, packageId)
          } catch {
            /* ignore */
          }
          window.location.href = "/"
        }}
      />
    )
  }

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
        onSignup={() => {
          setSignupPackagePreset(null)
          setView("signup")
        }}
        onAboutUs={() => setView("about")}
        onRequestDemo={() => setView("demo")}
        onPricing={() => setView("pricing")}
      />
    )
  }

  if (view === "demo") {
    return <DemoPage onBack={() => setView("home")} />
  }

  if (view === "signup") {
    return (
      <SignupPage
        onBack={() => {
          setSignupPackagePreset(null)
          setView("home")
        }}
        initialProductPackage={signupPackagePreset}
      />
    )
  }

  if (view === "pricing") {
    return (
      <PricingPage
        onBack={() => setView("home")}
        onSignupWithPackage={(packageId) => {
          setSignupPackagePreset(packageId)
          setView("signup")
        }}
      />
    )
  }

  if (view === "about") {
    return <AboutUsPage onBack={() => setView("home")} />
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
