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
import AccountPage from "./modules/account/AccountPage"
import PaymentsPage from "./modules/payments/PaymentsPage"
import InsuranceOptionsPage from "./modules/insurance/InsuranceOptionsPage"
import ReportingPage from "./modules/reporting/ReportingPage"
import BusinessWorkflowPage from "./modules/workflow/BusinessWorkflowPage"
import OrganizationChartPage from "./modules/org-chart/OrganizationChartPage"
import OperationsPage from "./modules/operations/OperationsPage"
import GrowthPage from "./modules/growth/GrowthPage"
import HomePage from "./modules/home/HomePage"
import MarketingHomePreviewPage from "./modules/home/MarketingHomePreviewPage"
import LoginPage from "./modules/auth/LoginPage"
import DemoPage from "./modules/demo/DemoPage"
import TrainingPage from "./modules/training/TrainingPage"
import SignupPage from "./modules/auth/SignupPage"
import ResetPasswordPage from "./modules/auth/ResetPasswordPage"
import AboutUsPage from "./modules/public/AboutUsPage"
import PricingPage from "./modules/public/PricingPage"
import OfficeManagerApp from "./modules/office-manager/OfficeManagerApp"
import AdminApp from "./modules/admin/AdminApp"
import SmsConsentPage from "./modules/public/SmsConsentPage"
import PrivacyPage from "./modules/public/PrivacyPage"
import AccountDeletionPage from "./modules/public/AccountDeletionPage"
import TermsPage from "./modules/public/TermsPage"
import EmbedLeadPage from "./modules/public/EmbedLeadPage"
import { useAuth, type UserRole } from "./contexts/AuthContext"
import { shouldUseOfficeManagerPortal, isOfficeManagerLikeRole } from "./lib/profileRoles"
import { ErrorBoundary } from "./ErrorBoundary"
import { usePortalTabs } from "./hooks/usePortalTabs"
import { useManagedByOfficeManager } from "./hooks/useManagedByOfficeManager"
import { useManagedOmCalendarPolicy } from "./hooks/useManagedOmCalendarPolicy"
import { usePortalViewOptional } from "./contexts/PortalViewContext"
import { isSandboxDemoUserId } from "./lib/sandboxDemoTeam"
import { useIsMobile } from "./hooks/useIsMobile"
import {
  endUserHasSeparateBillingPortal,
  filterPortalTabsForV2,
  filterUserPortalTabsForManagedPaymentsPolicy,
  getPortalTabListForConfig,
  getPageActionVisible,
  getOmPageActionVisible,
  isPortalTabVisibleInV2,
  parseOperationsSubTabFromPage,
  type PortalConfig,
  type PortalTab,
} from "./types/portal-builder"
import { filterPortalTabsForOmCalendarPolicy, omCalendarPolicyNavContext } from "./lib/teamCalendarPolicy"
import BillingDueDashboardBanner from "./components/BillingDueDashboardBanner"
import DashboardQuickActions from "./components/DashboardQuickActions"
import DashboardTodayWorkPreview from "./components/DashboardTodayWorkPreview"
import DashboardReportsPreview from "./components/DashboardReportsPreview"
import CustomerProfilePage from "./modules/customers/CustomerProfilePage"
import SetupGuideModal from "./components/SetupGuideModal"
import GlobalAssistantFab from "./components/GlobalAssistantFab"
import CustomerProfileReturnBar from "./components/CustomerProfileReturnBar"
import HelpDeskChatPanel from "./components/HelpDeskChatPanel"
import SandboxControlPanel, { SandboxTrainingBanner, SandboxTrainingProvider } from "./components/SandboxControlPanel"
import { isSandboxProfile } from "./lib/sandboxEnvironment"
import { GlobalAssistantProvider } from "./contexts/GlobalAssistantContext"
import { SetupWizardProvider } from "./contexts/SetupWizardContext"
import RegisterSetupGuideOpener from "./components/RegisterSetupGuideOpener"
import { supabase } from "./lib/supabase"
import { useLocale } from "./i18n/LocaleContext"
import { formatPortalTabLabel } from "./i18n/navLabel"
import { PRODUCT_PACKAGE_IDS, SIGNUP_OPEN_PRODUCT_ADVISOR_KEY, SIGNUP_PRODUCT_PACKAGE_STORAGE_KEY, type ProductPackageId } from "./lib/productPackages"
import { normalizePasswordRecoveryUrlInBrowser } from "./lib/authRedirectBase"
import { theme } from "./styles/theme"
import { useEffectivePortalConfig, useEffectiveUserId, useEffectiveClientId } from "./contexts/PortalViewContext"
import { PortalViewProvider } from "./contexts/PortalViewContext"
import type { PortalShell } from "./lib/portalViewRules"
import { AppNavigationProvider, useAppNavigation } from "./contexts/AppNavigationContext"
import { JobTypesModalProvider } from "./contexts/JobTypesModalContext"

type View = "home" | "login" | "admin-login" | "demo" | "training" | "signup" | "about" | "pricing" | "app" | "office" | "admin"

/** Contractor portal (user + office shells) with shared view-as context. */
function ContractorPortal({
  initialShell,
  setView,
}: {
  initialShell: PortalShell
  setView: (v: View) => void
}) {
  const [shell, setShell] = useState<PortalShell>(initialShell)

  useEffect(() => {
    setShell(initialShell)
  }, [initialShell])

  const handleShellChange = useCallback(
    (next: PortalShell) => {
      setShell(next)
      setView(next === "office" ? "office" : "app")
    },
    [setView],
  )

  return (
    <ViewProvider setView={setView}>
      <PortalViewProvider onShellChange={handleShellChange}>
        {shell === "office" ? <OfficeManagerApp /> : <MainApp />}
      </PortalViewProvider>
    </ViewProvider>
  )
}

/** Admin portal: amber Train FAB for vocabulary (mic hidden here — use contractor login for voice assistant). */
function AdminPortalWithAssistantTrain({ setView }: { setView: (v: View) => void }) {
  const { user } = useAuth()
  const [profileMetadata, setProfileMetadata] = useState<Record<string, unknown>>({
    global_assistant_mic_enabled: false,
  })

  useEffect(() => {
    if (!user?.id || !supabase) return
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const meta = data?.metadata
        const base =
          meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {}
        setProfileMetadata({ ...base, global_assistant_mic_enabled: false })
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return (
    <ViewProvider setView={setView}>
      <GlobalAssistantProvider
        setPage={() => {}}
        profileUserId={user?.id ?? null}
        profileMetadata={profileMetadata}
        onMetadataPatch={setProfileMetadata}
        platform="admin"
        isAdmin
      >
        <AdminApp />
        <GlobalAssistantFab />
        <HelpDeskChatPanel />
      </GlobalAssistantProvider>
    </ViewProvider>
  )
}

function buildPortalTabsFromConfig(portalConfig: PortalConfig | null): Array<{ tab_id: string; label: string | null }> | undefined {
  if (!portalConfig) return undefined
  const hasTabs = (portalConfig.tabs && Object.keys(portalConfig.tabs).length > 0) || (portalConfig.customTabs?.length ?? 0) > 0
  if (!hasTabs) return undefined
  const ordered = getPortalTabListForConfig(portalConfig)
  const visible = ordered.filter(({ tab_id }) => isPortalTabVisibleInV2(tab_id, portalConfig))
  return visible.length > 0 ? visible : undefined
}

function MainApp() {
  const [page, setPageState] = useState("dashboard")
  return (
    <AppNavigationProvider page={page} setPage={setPageState}>
      <MainAppInner />
    </AppNavigationProvider>
  )
}

function MainAppInner() {
  const { page, navigatePage: setPage } = useAppNavigation()
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "ok" | "failed" | "no-config">("checking")
  const [connectionError, setConnectionError] = useState<string>("")
  const { role: authRole, user } = useAuth()
  const effectiveUserId = useEffectiveUserId()
  const effectiveClientId = useEffectiveClientId()
  const portalConfig = useEffectivePortalConfig()
  const { tabs: portalTabsFromApi } = usePortalTabs(effectiveClientId, "user")
  const managedByOfficeManager = useManagedByOfficeManager()
  const omCalendarPolicy = useManagedOmCalendarPolicy()
  const portalView = usePortalViewOptional()
  const viewAsDemoUserId =
    portalView?.showViewBar && portalView.targetUserId && isSandboxDemoUserId(portalView.targetUserId)
      ? portalView.targetUserId
      : null
  const omPolicyNavContext = omCalendarPolicyNavContext(viewAsDemoUserId, managedByOfficeManager)
  const managedSchedulingToolsEnabled =
    managedByOfficeManager &&
    (omCalendarPolicy.scheduling_tools === true || omCalendarPolicy.advanced_scheduling_tools === true)
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
  const portalTabs = useMemo(() => {
    let t = filterUserPortalTabsForManagedPaymentsPolicy(mergedTabs, portalConfig, managedByOfficeManager)
    t = filterPortalTabsForV2(t, portalConfig)
    t = filterPortalTabsForOmCalendarPolicy(t, omCalendarPolicy, omPolicyNavContext)
    return t
  }, [mergedTabs, portalConfig, managedByOfficeManager, omCalendarPolicy, omPolicyNavContext])
  const estimateToolsOnlyPackage = portalConfig?.estimate_tools_only_package === true
  const separateBillingProfile = endUserHasSeparateBillingPortal(portalConfig, managedByOfficeManager)
  const paymentsTabAvailable = portalTabs.some((t) => t.tab_id === "payments")
  const calendarTabAvailable = portalTabs.some((t) => t.tab_id === "calendar")
  const showTimeClockShortcut = calendarTabAvailable && !estimateToolsOnlyPackage
  const showCustomReceiptShortcut =
    calendarTabAvailable &&
    !estimateToolsOnlyPackage &&
    getPageActionVisible(portalConfig, "calendar", "custom_receipt") &&
    getOmPageActionVisible(portalConfig, "calendar", "custom_receipt")
  const customReceiptQuickLabel = portalConfig?.controlLabels?.custom_receipt?.trim() || null

  useEffect(() => {
    if (page === "settings") setPage("dashboard")
  }, [page, setPage])

  useEffect(() => {
    if (page !== "payments") return
    if (!portalTabs.some((t) => t.tab_id === "payments")) setPage("dashboard")
  }, [page, portalTabs])

  useEffect(() => {
    if (!estimateToolsOnlyPackage) return
    if (page === "customers" || page === "calendar") setPage("dashboard")
  }, [page, estimateToolsOnlyPackage, setPage])

  useEffect(() => {
    if (page === "web-support") setPage("tech-support")
  }, [page, setPage])

  useEffect(() => {
    if (page === "work_orders") setPage("operations-work_orders")
    else if (page === "purchase_orders") setPage("operations-purchase_orders")
    else if (page === "parts_inventory") setPage("operations-inventory")
  }, [page, setPage])

  useEffect(() => {
    if (page === "operations" || page.startsWith("operations-")) {
      const hasOpsTab = portalTabs.some(
        (t) => t.tab_id === "operations" || t.tab_id === "work_orders" || t.tab_id === "purchase_orders",
      )
      if (!hasOpsTab) setPage("dashboard")
      return
    }
    if (!isPortalTabVisibleInV2(page, portalConfig)) {
      if (
        page === "leads" ||
        page === "conversations" ||
        page === "web-support" ||
        page === "work_orders" ||
        page === "purchase_orders" ||
        page === "parts_inventory"
      ) {
        setPage("dashboard")
      }
    }
  }, [page, portalConfig, portalTabs, setPage])

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
  const [profileMetadata, setProfileMetadata] = useState<Record<string, unknown>>({})
  const [setupGuideOpen, setSetupGuideOpen] = useState(false)

  useEffect(() => {
    if (!user?.id || !supabase) {
      setProfileMetadata({})
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const meta = data?.metadata
        setProfileMetadata(meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {})
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return (
    <JobTypesModalProvider>
    <SetupWizardProvider
      setPage={setPage}
      userId={effectiveUserId || null}
      profileMetadata={profileMetadata}
      onMetadataPatch={setProfileMetadata}
    >
    <GlobalAssistantProvider
      setPage={setPage}
      profileUserId={effectiveUserId || null}
      profileMetadata={profileMetadata}
      onMetadataPatch={setProfileMetadata}
      platform="user"
      availableTabIds={portalTabs.map((t) => t.tab_id)}
      isAdmin={authRole === "admin"}
      currentPage={page}
      portalConfig={portalConfig}
      accountRole={authRole}
    >
    <RegisterSetupGuideOpener onOpen={() => setSetupGuideOpen(true)} />
    <SetupGuideModal
      open={setupGuideOpen}
      onClose={() => setSetupGuideOpen(false)}
      userId={effectiveUserId || null}
      profileMetadata={profileMetadata}
      onMetadataPatch={setProfileMetadata}
      setPage={setPage}
    />
    <GlobalAssistantFab />
    <HelpDeskChatPanel />
    <SandboxTrainingProvider
      profileUserId={user?.id ?? null}
      profileMetadata={profileMetadata}
      portalConfig={portalConfig}
      authRole={authRole}
    >
    <SandboxControlPanel />
    <AppLayout setPage={setPage} portalTabs={portalTabs} currentPage={currentPageTitle}>
      {authRole === "demo_user" || portalConfig?.demo_account === true ? (
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
      ) : null}

      {isSandboxProfile(portalConfig, profileMetadata, authRole) ? (
        <SandboxTrainingBanner setPage={setPage} />
      ) : null}

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
          <h1 style={{ marginBottom: 10, fontSize: "1.75rem", fontWeight: 700, color: theme.text }}>{t("dashboard.title")}</h1>
          <BillingDueDashboardBanner
            profileUserId={effectiveUserId || null}
            separateBillingProfile={separateBillingProfile}
            paymentsTabAvailable={paymentsTabAvailable}
            onOpenPayments={paymentsTabAvailable ? () => setPage("payments") : undefined}
          />
          {!estimateToolsOnlyPackage && authRole !== "new_user" ? (
          <>
          <DashboardQuickActions
            isMobile={isMobile}
            setPage={setPage}
            sectionTitle={t("dashboard.quickSection")}
            authRole={authRole}
            managedByOfficeManager={managedByOfficeManager}
            managedSchedulingToolsEnabled={managedSchedulingToolsEnabled}
            showSettingsShortcut={false}
            showPaymentsShortcut={paymentsTabAvailable}
            showTimeClockShortcut={showTimeClockShortcut}
            showCustomReceiptShortcut={showCustomReceiptShortcut}
            profileUserId={effectiveUserId || null}
            dashboardDataUserId={effectiveUserId || null}
            labels={{
              customers: t("dashboard.quickCustomers"),
              estimates: t("dashboard.quickEstimates"),
              calendar: t("dashboard.quickCalendar"),
              teamManagement: t("dashboard.quickTeamManagement"),
              schedulingTools: t("dashboard.quickSchedulingTools"),
              settings: t("dashboard.quickSettings"),
              payments: t("dashboard.quickPayments"),
              insurance: t("dashboard.quickInsurance"),
              customerPaymentsSoon: t("dashboard.quickCustomerPaymentsSoon"),
              reporting: t("dashboard.quickReporting"),
              jobTypes: t("dashboard.quickJobTypes"),
              todayTodo: t("dashboard.quickTodayTodo"),
              timeClock: t("dashboard.quickTimeClock"),
              customReceipt: customReceiptQuickLabel || t("dashboard.quickCustomReceipt"),
              businessWorkflow: t("dashboard.quickBusinessWorkflow"),
              businessWorkflowSub: t("dashboard.quickBusinessWorkflowSub"),
              organizationChart: t("dashboard.quickOrganizationChart"),
              operations: t("dashboard.quickOperations"),
              operationsWorkOrders: t("dashboard.quickOperationsWorkOrders"),
              operationsPurchaseOrders: t("dashboard.quickOperationsPurchaseOrders"),
              operationsInvoicing: t("dashboard.quickOperationsInvoicing"),
              operationsInventory: t("dashboard.quickOperationsInventory"),
              growth: t("dashboard.quickGrowth"),
              growthSub: t("dashboard.quickGrowthSub"),
              customizeHint: t("dashboard.customizeQuickLinks"),
              customizeDone: t("dashboard.customizeQuickLinksDone"),
              customizePaletteTitle: t("dashboard.customizePaletteTitle"),
              customizeAddHint: t("dashboard.customizeAddHint"),
              customizeRemove: t("dashboard.customizeRemove"),
              savedCloud: t("dashboard.quickLinksSavedCloud"),
              savedDeviceOnly: t("dashboard.quickLinksSavedLocal"),
              cardLookLabel: t("dashboard.cardLookLabel"),
              cardLookHint: t("dashboard.cardLookHint"),
              cardLookEmber: t("dashboard.cardLookEmber"),
              cardLookOcean: t("dashboard.cardLookOcean"),
              cardLookSlate: t("dashboard.cardLookSlate"),
              cardLookPaper: t("dashboard.cardLookPaper"),
              setupGuide: t("dashboard.quickSetupGuide"),
              assistantPlaceholder: t("dashboard.assistantPlaceholder"),
            }}
            onOpenSetupGuide={() => setSetupGuideOpen(true)}
          />
          <DashboardTodayWorkPreview
            isMobile={isMobile}
            dataUserId={effectiveUserId || null}
            reportingAllowed={isOfficeManagerLikeRole(authRole)}
            onOpenReporting={() => setPage("reporting")}
            onOpenCustomers={() => setPage("customers")}
            onOpenCalendar={() => setPage("calendar")}
            labels={{
              title: t("dashboard.todayWorkTitle"),
              subtitle: t("dashboard.todayWorkSubtitle"),
              viewAllReports: t("dashboard.todayWorkViewReports"),
              loading: t("dashboard.todayWorkLoading"),
              noUser: t("dashboard.todayWorkNoUser"),
              todayJobs: t("dashboard.todayWorkTodayJobs"),
              weekJobs: t("dashboard.todayWorkWeekJobs"),
              priorityAlerts: t("dashboard.todayWorkPriority"),
              neglected: t("dashboard.todayWorkNeglected"),
              recentlyAdded: t("dashboard.todayWorkRecent"),
              nothingToday: t("dashboard.todayWorkNothingToday"),
              noPriority: t("dashboard.todayWorkNoPriority"),
              noNeglected: t("dashboard.todayWorkNoNeglected"),
              noRecent: t("dashboard.todayWorkNoRecent"),
              openCustomers: t("dashboard.todayWorkOpenCustomers"),
              openCalendar: t("dashboard.todayWorkOpenCalendar"),
            }}
          />
          {isOfficeManagerLikeRole(authRole) ? (
            <DashboardReportsPreview
              isMobile={isMobile}
              dataUserId={effectiveUserId || null}
              onOpenReporting={() => setPage("reporting")}
              labels={{
                title: t("dashboard.reportsPreviewTitle"),
                subtitle: t("dashboard.reportsPreviewSubtitle"),
                viewAll: t("dashboard.reportsPreviewViewAll"),
                loading: t("dashboard.reportsPreviewLoading"),
                noUser: t("dashboard.reportsPreviewNoUser"),
                openReport: t("dashboard.reportsPreviewOpen"),
              }}
            />
          ) : null}
          </>
          ) : null}
        </>
      )}

      {page === "customers" && <CustomersPage setPage={setPage} />}
      {page === "customer-profile" && <CustomerProfilePage setPage={setPage} />}
      {page === "leads" && <LeadsPage setPage={setPage} />}
      {page === "conversations" && <ConversationsPage />}
      {page === "quotes" && <QuotesPage setPage={setPage} />}
      {(page === "operations" || page.startsWith("operations-")) && (
        <OperationsPage setPage={setPage} initialTab={parseOperationsSubTabFromPage(page)} />
      )}
      {page === "calendar" && <CalendarPage setPage={setPage} />}
      {page === "web-support" && <WebSupportPage />}
      {page === "tech-support" && <TechSupportPage />}
      {page === "payments" && <PaymentsPage />}
      {page === "insurance-options" && <InsuranceOptionsPage />}
      {page === "reporting" && <ReportingPage />}
      {page === "growth" && <GrowthPage setPage={setPage} />}
      {page === "business-workflow" && <BusinessWorkflowPage setPage={setPage} />}
      {page === "organization-chart" && <OrganizationChartPage setPage={setPage} />}
      {page === "account" && <AccountPage />}
      {!["dashboard", "leads", "conversations", "quotes", "calendar", "customers", "customer-profile", "payments", "account", "web-support", "tech-support", "settings", "insurance-options", "reporting"].includes(page) && (
        <div style={{ padding: 24 }}>
          <h1 style={{ color: "var(--text, #1f2937)" }}>{page}</h1>
          <p style={{ color: "var(--text, #6b7280)", margin: "0 0 8px" }}>{t("app.customTab.title")}</p>
          <p style={{ color: "var(--text, #6b7280)", margin: 0 }}>{t("app.customTab.body")}</p>
        </div>
      )}
    </AppLayout>
    <CustomerProfileReturnBar page={page} onNavigate={setPage} />
    </SandboxTrainingProvider>
    </GlobalAssistantProvider>
    </SetupWizardProvider>
    </JobTypesModalProvider>
  )
}

function App() {
  if (typeof window !== "undefined") normalizePasswordRecoveryUrlInBrowser()
  const { refetchProfile } = useAuth()
  const [view, setView] = useState<View>("home")
  const [signupPackagePreset, setSignupPackagePreset] = useState<string | null>(null)
  const [loginError, setLoginError] = useState("")
  const pathname = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "/"

  useEffect(() => {
    try {
      const advisor = sessionStorage.getItem(SIGNUP_OPEN_PRODUCT_ADVISOR_KEY)
      if (advisor === "1") {
        setView("signup")
        return
      }
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

  const ctaMatch = /^\/(?:cta|embed\/lead)\/([^/]+)\/?$/i.exec(pathname)
  if (ctaMatch) {
    return <EmbedLeadPage slug={decodeURIComponent(ctaMatch[1] || "")} />
  }

  if (pathname === "/reset-password") {
    return <ResetPasswordPage onDone={() => { window.history.replaceState(null, "", "/"); window.location.assign("/") }} />
  }

  if (pathname === "/privacy") {
    return <PrivacyPage />
  }
  if (pathname === "/account-deletion") {
    return <AccountDeletionPage />
  }
  if (pathname === "/terms") {
    return <TermsPage />
  }
  if (pathname === "/sms-consent" || pathname === "/sms") {
    return <SmsConsentPage />
  }
  if (pathname === "/about") {
    return <AboutUsPage onBack={() => (window.location.href = "/")} />
  }
  if (pathname === "/home-preview" || pathname.startsWith("/home-preview/")) {
    return (
      <MarketingHomePreviewPage
        onLogin={() => {
          window.location.href = "/"
        }}
        onTrial={() => {
          window.location.href = "/"
        }}
        onPricing={() => {
          window.location.href = "/pricing"
        }}
      />
    )
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
        onHelpDecidingProduct={() => {
          try {
            sessionStorage.setItem(SIGNUP_OPEN_PRODUCT_ADVISOR_KEY, "1")
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
      if (shouldUseOfficeManagerPortal(r)) setView("office")
      else setView("app")
      return
    }
    if (r === "admin") setView("admin")
    else if (shouldUseOfficeManagerPortal(r)) setView("office")
    else setView("app")
  }, [view, refetchProfile])

  if (view === "home") {
    return (
      <HomePage
        onLogin={() => { setView("login"); setLoginError("") }}
        onAdminLogin={() => { setView("admin-login"); setLoginError("") }}
        onSignup={() => {
          setSignupPackagePreset(null)
          setView("signup")
        }}
        onAboutUs={() => setView("about")}
        onTraining={() => setView("training")}
        onPricing={() => setView("pricing")}
      />
    )
  }

  if (view === "demo") {
    return <DemoPage onBack={() => setView("home")} />
  }

  if (view === "training") {
    return (
      <TrainingPage
        onBack={() => setView("home")}
        onLogin={() => {
          setView("login")
          setLoginError("")
        }}
      />
    )
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
        onHelpDecidingProduct={() => {
          setSignupPackagePreset(null)
          try {
            sessionStorage.setItem(SIGNUP_OPEN_PRODUCT_ADVISOR_KEY, "1")
          } catch {
            /* ignore */
          }
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
          isAdminLogin={view === "admin-login"}
          onSuccess={handleLoginSuccess}
          onBack={() => { setView("home"); setLoginError("") }}
          onGoToSignup={() => {
            setSignupPackagePreset(null)
            setView("signup")
            setLoginError("")
          }}
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
        <AdminPortalWithAssistantTrain setView={setView} />
      </ErrorBoundary>
    )
  }

  if (view === "office" || view === "app") {
    return <ContractorPortal initialShell={view === "office" ? "office" : "user"} setView={setView} />
  }

  return null
}

export default App
