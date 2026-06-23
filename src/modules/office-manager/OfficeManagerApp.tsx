import { useState, useEffect, useCallback, useMemo } from "react"
import AppLayout from "../../layout/AppLayout"
import CustomersPage from "../customers/CustomersPage"
import LeadsPage from "../leads/LeadsPage"
import ConversationsPage from "../conversations/ConversationsPage"
import QuotesPage from "../quotes/QuotesPage"
import CalendarPage from "../calendar/CalendarPage"
import WebSupportPage from "../web-support/WebSupportPage"
import TechSupportPage from "../tech-support/TechSupportPage"
import AccountPage from "../account/AccountPage"
import PaymentsPage from "../payments/PaymentsPage"
import InsuranceOptionsPage from "../insurance/InsuranceOptionsPage"
import ReportingPage from "../reporting/ReportingPage"
import BusinessWorkflowPage from "../workflow/BusinessWorkflowPage"
import OrganizationChartPage from "../org-chart/OrganizationChartPage"
import OperationsPage from "../operations/OperationsPage"
import GrowthPage from "../growth/GrowthPage"
import { useAuth } from "../../contexts/AuthContext"
import {
  useOfficeManagerScopeOptional,
} from "../../contexts/OfficeManagerScopeContext"
import { useEffectiveClientId, useEffectivePortalConfig } from "../../contexts/PortalViewContext"
import { usePortalTabs } from "../../hooks/usePortalTabs"
import { theme } from "../../styles/theme"
import { useIsMobile } from "../../hooks/useIsMobile"
import { useLocale } from "../../i18n/LocaleContext"
import { supabase } from "../../lib/supabase"
import {
  filterPortalTabsForV2,
  getOfficePortalTabListForConfig,
  getOmPageActionVisible,
  getPageActionVisible,
  getPortalTabListForConfig,
  isPortalTabVisibleInV2,
  parseOperationsSubTabFromPage,
  USER_PORTAL_TAB_IDS,
  TAB_ID_LABELS,
  type PortalConfig,
} from "../../types/portal-builder"
import BillingDueDashboardBanner from "../../components/BillingDueDashboardBanner"
import DashboardQuickActions from "../../components/DashboardQuickActions"
import DashboardTodayWorkPreview from "../../components/DashboardTodayWorkPreview"
import DashboardReportsPreview from "../../components/DashboardReportsPreview"
import CustomerProfilePage from "../customers/CustomerProfilePage"
import SetupGuideModal from "../../components/SetupGuideModal"
import GlobalAssistantFab from "../../components/GlobalAssistantFab"
import CustomerProfileReturnBar from "../../components/CustomerProfileReturnBar"
import HelpDeskChatPanel from "../../components/HelpDeskChatPanel"
import SandboxControlPanel, { SandboxTrainingBanner, SandboxTrainingProvider } from "../../components/SandboxControlPanel"
import { isSandboxProfile } from "../../lib/sandboxEnvironment"
import { GlobalAssistantProvider } from "../../contexts/GlobalAssistantContext"
import { SetupWizardProvider } from "../../contexts/SetupWizardContext"
import RegisterSetupGuideOpener from "../../components/RegisterSetupGuideOpener"
import { AppNavigationProvider, useAppNavigation } from "../../contexts/AppNavigationContext"
import { JobTypesModalProvider } from "../../contexts/JobTypesModalContext"
const OM_CALENDAR_TOOLBAR_ACTIONS: { id: string; label: string }[] = [
  { id: "add_item", label: "Add item to calendar" },
  { id: "auto_response", label: "Auto Response Options" },
  { id: "job_types", label: "Job Types" },
  { id: "settings", label: "Settings" },
  { id: "completion_settings", label: "Job completion" },
  { id: "receipt_template", label: "Receipt template" },
  { id: "customize_user", label: "Customize user" },
  { id: "customer_payment", label: "Customer payment" },
]

function buildPortalTabsFromConfig(portalConfig: PortalConfig | null): Array<{ tab_id: string; label: string | null }> | undefined {
  if (!portalConfig) return undefined
  const hasTabs = (portalConfig.tabs && Object.keys(portalConfig.tabs).length > 0) || (portalConfig.customTabs?.length ?? 0) > 0
  if (!hasTabs) return undefined
  const ordered = getOfficePortalTabListForConfig(portalConfig)
  const visible = ordered.filter(({ tab_id }) => isPortalTabVisibleInV2(tab_id, portalConfig))
  return visible.length > 0 ? visible : undefined
}

const OM_QUOTES_TOOLBAR_ACTIONS: { id: string; label: string }[] = [
  { id: "auto_response", label: "Automatic replies" },
  { id: "settings", label: "Settings" },
  { id: "estimate_template", label: "Estimate template" },
  { id: "estimate_line_items", label: "Estimate line items" },
  { id: "job_types", label: "Job types" },
  { id: "customer_payment", label: "Customer payment" },
]

const OM_CONVERSATIONS_TOOLBAR_ACTIONS: { id: string; label: string }[] = [
  { id: "add_conversation", label: "Add conversation" },
  { id: "settings", label: "Conversation settings" },
  { id: "automatic_replies", label: "Automatic replies" },
]

function ManagedUserTabEditor() {
  const ctx = useOfficeManagerScopeOptional()
  const uid = ctx?.selectedUserId
  const selected = ctx?.clients.find((c) => c.userId === uid)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [localTabs, setLocalTabs] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const cfg = ctx?.scopedPortalConfig
    const next: Record<string, boolean> = {}
    for (const id of USER_PORTAL_TAB_IDS) {
      // Managed users: Payments defaults off until explicitly enabled (matches user-portal sidebar).
      if (id === "payments") next[id] = cfg?.tabs?.payments === true
      else next[id] = cfg?.tabs?.[id] !== false
    }
    setLocalTabs(next)
  }, [ctx?.scopedPortalConfig, uid])

  const save = useCallback(async () => {
    if (!uid || !supabase || !ctx) return
    setSaving(true)
    setMsg("")
    const { data, error: fetchErr } = await supabase.from("profiles").select("portal_config").eq("id", uid).single()
    if (fetchErr) {
      setMsg(fetchErr.message)
      setSaving(false)
      return
    }
    const prev =
      data?.portal_config && typeof data.portal_config === "object" && !Array.isArray(data.portal_config)
        ? (data.portal_config as PortalConfig)
        : {}
    const tabs: Record<string, boolean> = {}
    for (const id of USER_PORTAL_TAB_IDS) tabs[id] = localTabs[id] !== false
    const portal_config = { ...prev, tabs }
    const { error } = await supabase
      .from("profiles")
      .update({ portal_config, updated_at: new Date().toISOString() })
      .eq("id", uid)
    setSaving(false)
    if (error) {
      setMsg(error.message)
      return
    }
    setMsg("Saved tab visibility for this user.")
    await ctx.refreshScopedPortalConfig()
  }, [ctx, localTabs, uid])

  if (!ctx || !uid || selected?.isSelf) return null

  return (
    <div style={{ marginLeft: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          border: `1px solid ${theme.border}`,
          background: "white",
          cursor: "pointer",
          color: theme.text,
          fontSize: 13,
        }}
      >
        {open ? "Hide" : "User portal tabs"}
      </button>
      {open && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            background: "#fafafa",
            maxWidth: 420,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 12, color: theme.text, opacity: 0.85 }}>
            Control which tabs this user sees in the <strong>user</strong> portal (not the office manager sidebar).
            <strong> Payments</strong> stays hidden for assigned users until you check it and Save. The Helcim page URL itself is set
            in <strong>Admin → Billing &amp; Helcim</strong> (or the optional app-wide <code>VITE_HELCIM_PAYMENT_PORTAL_URL</code> on
            the web/mobile build).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {getPortalTabListForConfig((ctx.scopedPortalConfig ?? {}) as PortalConfig).map(({ tab_id: tabId, label }) => (
              <label key={tabId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                <input
                  type="checkbox"
                  checked={localTabs[tabId] !== false}
                  onChange={(e) => setLocalTabs((prev) => ({ ...prev, [tabId]: e.target.checked }))}
                />
                {label ?? TAB_ID_LABELS[tabId] ?? tabId}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            style={{
              marginTop: 12,
              padding: "8px 14px",
              background: theme.primary,
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: saving ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            {saving ? "Saving…" : "Save tab visibility"}
          </button>
          {msg && <p style={{ marginTop: 8, fontSize: 12, color: msg.startsWith("Saved") ? "#059669" : "#b91c1c" }}>{msg}</p>}
        </div>
      )}
    </div>
  )
}

function ManagedUserOmToolbarEditor() {
  const ctx = useOfficeManagerScopeOptional()
  const uid = ctx?.selectedUserId
  const selected = ctx?.clients.find((c) => c.userId === uid)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")
  const [calendarVisible, setCalendarVisible] = useState<Record<string, boolean>>({})
  const [quotesVisible, setQuotesVisible] = useState<Record<string, boolean>>({})
  const [conversationsVisible, setConversationsVisible] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const om = ctx?.scopedPortalConfig?.om_page_actions
    const cal: Record<string, boolean> = {}
    for (const { id } of OM_CALENDAR_TOOLBAR_ACTIONS) cal[id] = om?.calendar?.[id] !== false
    const qu: Record<string, boolean> = {}
    for (const { id } of OM_QUOTES_TOOLBAR_ACTIONS) qu[id] = om?.quotes?.[id] !== false
    const conv: Record<string, boolean> = {}
    for (const { id } of OM_CONVERSATIONS_TOOLBAR_ACTIONS) conv[id] = om?.conversations?.[id] !== false
    setCalendarVisible(cal)
    setQuotesVisible(qu)
    setConversationsVisible(conv)
  }, [ctx?.scopedPortalConfig, uid])

  const save = useCallback(async () => {
    if (!uid || !supabase || !ctx) return
    setSaving(true)
    setMsg("")
    const { data, error: fetchErr } = await supabase.from("profiles").select("portal_config").eq("id", uid).single()
    if (fetchErr) {
      setMsg(fetchErr.message)
      setSaving(false)
      return
    }
    const prev =
      data?.portal_config && typeof data.portal_config === "object" && !Array.isArray(data.portal_config)
        ? (data.portal_config as PortalConfig)
        : {}
    const calendar: Record<string, boolean> = {}
    for (const { id } of OM_CALENDAR_TOOLBAR_ACTIONS) calendar[id] = calendarVisible[id] !== false
    const quotes: Record<string, boolean> = {}
    for (const { id } of OM_QUOTES_TOOLBAR_ACTIONS) quotes[id] = quotesVisible[id] !== false
    const conversations: Record<string, boolean> = {}
    for (const { id } of OM_CONVERSATIONS_TOOLBAR_ACTIONS) conversations[id] = conversationsVisible[id] !== false
    const portal_config: PortalConfig = {
      ...prev,
      om_page_actions: {
        ...(prev.om_page_actions ?? {}),
        calendar,
        quotes,
        conversations,
      },
    }
    const { error } = await supabase
      .from("profiles")
      .update({ portal_config, updated_at: new Date().toISOString() })
      .eq("id", uid)
    setSaving(false)
    if (error) {
      setMsg(error.message)
      return
    }
    setMsg("Saved toolbar visibility for Calendar, Quotes, and Conversations (when you manage this user).")
    await ctx.refreshScopedPortalConfig()
  }, [ctx, calendarVisible, quotesVisible, conversationsVisible, uid])

  if (!ctx || !uid || selected?.isSelf) return null

  return (
    <div style={{ marginLeft: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          border: `1px solid ${theme.border}`,
          background: "white",
          cursor: "pointer",
          color: theme.text,
          fontSize: 13,
        }}
      >
        {open ? "Hide" : "OM toolbar (Calendar / Quotes / Conversations)"}
      </button>
      {open && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            background: "#fafafa",
            maxWidth: 440,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 12, color: theme.text, opacity: 0.85 }}>
            When you work as this user in the office manager portal, unchecked items are hidden on <strong>Calendar</strong>, <strong>Quotes</strong>, and{" "}
            <strong>Conversations</strong> (standard toolbar buttons only).
          </p>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: theme.text }}>Calendar</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {OM_CALENDAR_TOOLBAR_ACTIONS.map(({ id, label }) => (
              <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                <input
                  type="checkbox"
                  checked={calendarVisible[id] !== false}
                  onChange={(e) => setCalendarVisible((prev) => ({ ...prev, [id]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: theme.text }}>Quotes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {OM_QUOTES_TOOLBAR_ACTIONS.map(({ id, label }) => (
              <label key={`q-${id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                <input
                  type="checkbox"
                  checked={quotesVisible[id] !== false}
                  onChange={(e) => setQuotesVisible((prev) => ({ ...prev, [id]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: theme.text }}>Conversations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {OM_CONVERSATIONS_TOOLBAR_ACTIONS.map(({ id, label }) => (
              <label key={`c-${id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                <input
                  type="checkbox"
                  checked={conversationsVisible[id] !== false}
                  onChange={(e) => setConversationsVisible((prev) => ({ ...prev, [id]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            style={{
              marginTop: 4,
              padding: "8px 14px",
              background: theme.primary,
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: saving ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            {saving ? "Saving…" : "Save toolbar visibility"}
          </button>
          {msg && <p style={{ marginTop: 8, fontSize: 12, color: msg.startsWith("Saved") ? "#059669" : "#b91c1c" }}>{msg}</p>}
        </div>
      )}
    </div>
  )
}

function ManagedUserToolsStrip() {
  const ctx = useOfficeManagerScopeOptional()
  const selected = ctx?.clients.find((c) => c.userId === ctx.selectedUserId)
  if (!ctx || selected?.isSelf !== false) return null
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start", marginBottom: 12 }}>
      <ManagedUserTabEditor />
      <ManagedUserOmToolbarEditor />
    </div>
  )
}

function OfficeManagerAppContent() {
  const { page, navigatePage: setPage } = useAppNavigation()
  const { user, role: authRole } = useAuth()
  const portalConfig = useEffectivePortalConfig()
  const effectiveClientId = useEffectiveClientId()
  const isMobile = useIsMobile()
  const { t } = useLocale()
  const { tabs: portalTabs } = usePortalTabs(effectiveClientId, "office_manager")
  const scope = useOfficeManagerScopeOptional()
  const hasClients = (scope?.clients.length ?? 0) > 0
  const resolvedPortalTabs = useMemo(() => {
    const cfg = scope?.scopedPortalConfig ?? portalConfig
    let r = buildPortalTabsFromConfig(cfg ?? null) ?? portalTabs.map((t) => ({ tab_id: t.tab_id, label: t.label }))
    r = filterPortalTabsForV2(r, cfg)
    return r
  }, [scope?.scopedPortalConfig, portalTabs, portalConfig])
  const selectedRow = scope?.clients.find((c) => c.userId === scope.selectedUserId) ?? null
  /** Bundled managed users (no Payments tab) do not get separate Helcim / dashboard billing alerts. */
  const separateBillingForScope =
    Boolean(scope?.selectedUserId) && (selectedRow?.isSelf === true || scope?.scopedPortalConfig?.tabs?.payments === true)
  const omPaymentsTabAvailable = hasClients && resolvedPortalTabs.some((t) => t.tab_id === "payments")
  const scopedPortalCfg = scope?.scopedPortalConfig ?? portalConfig
  const calendarTabAvailable = resolvedPortalTabs.some((t) => t.tab_id === "calendar")
  const showTimeClockShortcut = calendarTabAvailable && hasClients
  const showCustomReceiptShortcut =
    calendarTabAvailable &&
    getPageActionVisible(scopedPortalCfg, "calendar", "custom_receipt") &&
    getOmPageActionVisible(scopedPortalCfg, "calendar", "custom_receipt")
  const customReceiptQuickLabel = scopedPortalCfg?.controlLabels?.custom_receipt?.trim() || null

  useEffect(() => {
    if (page === "web-support") setPage("tech-support")
  }, [page, setPage])

  useEffect(() => {
    if (page === "settings") setPage("dashboard")
  }, [page, setPage])

  useEffect(() => {
    if (page === "work_orders") setPage("operations-work_orders")
    else if (page === "purchase_orders") setPage("operations-purchase_orders")
    else if (page === "parts_inventory") setPage("operations-inventory")
  }, [page, setPage])

  useEffect(() => {
    const cfg = scope?.scopedPortalConfig ?? portalConfig
    if (page === "operations" || page.startsWith("operations-")) {
      if (!isPortalTabVisibleInV2("operations", cfg)) setPage("dashboard")
      return
    }
    if (!isPortalTabVisibleInV2(page, cfg)) {
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
  }, [page, portalConfig, scope?.scopedPortalConfig, setPage])

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
      userId={user?.id ?? null}
      profileMetadata={profileMetadata}
      onMetadataPatch={setProfileMetadata}
    >
    <GlobalAssistantProvider
      setPage={setPage}
      profileUserId={scope?.selectedUserId ?? user?.id ?? null}
      profileMetadata={profileMetadata}
      onMetadataPatch={setProfileMetadata}
      platform="office_manager"
      availableTabIds={resolvedPortalTabs.map((t) => t.tab_id)}
      isAdmin={authRole === "admin"}
      currentPage={page}
      portalConfig={portalConfig}
      accountRole={authRole}
    >
    <RegisterSetupGuideOpener onOpen={() => setSetupGuideOpen(true)} />
    <SetupGuideModal
      open={setupGuideOpen}
      onClose={() => setSetupGuideOpen(false)}
      userId={user?.id ?? null}
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
    <AppLayout setPage={setPage} portalTabs={resolvedPortalTabs}>
      <ManagedUserToolsStrip />

      {portalConfig?.demo_account === true ? (
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

      {page === "dashboard" && (
        <>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: theme.text }}>Office manager</h1>
          <BillingDueDashboardBanner
            profileUserId={scope?.selectedUserId ?? user?.id}
            separateBillingProfile={separateBillingForScope}
            paymentsTabAvailable={omPaymentsTabAvailable}
            onOpenPayments={omPaymentsTabAvailable ? () => setPage("payments") : undefined}
          />
          <DashboardQuickActions
            officeManager
            isMobile={isMobile}
            setPage={setPage}
            sectionTitle={t("dashboard.quickSection")}
            authRole="office_manager"
            managedByOfficeManager={false}
            managedSchedulingToolsEnabled={false}
            showSettingsShortcut={false}
            showPaymentsShortcut={omPaymentsTabAvailable}
            showTimeClockShortcut={showTimeClockShortcut}
            showCustomReceiptShortcut={showCustomReceiptShortcut}
            profileUserId={user?.id ?? null}
            dashboardDataUserId={scope?.selectedUserId ?? user?.id ?? null}
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
            dataUserId={scope?.selectedUserId ?? user?.id ?? null}
            reportingAllowed
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
          <DashboardReportsPreview
            isMobile={isMobile}
            dataUserId={scope?.selectedUserId ?? user?.id ?? null}
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
        </>
      )}
      {hasClients && page === "customers" && <CustomersPage setPage={setPage} />}
      {hasClients && page === "customer-profile" && <CustomerProfilePage setPage={setPage} />}
      {hasClients && page === "leads" && <LeadsPage setPage={setPage} />}
      {hasClients && page === "conversations" && <ConversationsPage setPage={setPage} />}
      {hasClients && page === "quotes" && <QuotesPage setPage={setPage} />}
      {hasClients && (page === "operations" || page.startsWith("operations-")) && (
        <OperationsPage setPage={setPage} initialTab={parseOperationsSubTabFromPage(page)} />
      )}
      {hasClients && page === "calendar" && <CalendarPage setPage={setPage} />}
      {hasClients && page === "web-support" && <WebSupportPage />}
      {hasClients && page === "tech-support" && <TechSupportPage />}
      {hasClients && page === "payments" && <PaymentsPage />}
      {page === "insurance-options" && <InsuranceOptionsPage />}
      {page === "reporting" && <ReportingPage />}
      {page === "growth" && <GrowthPage setPage={setPage} />}
      {page === "business-workflow" && <BusinessWorkflowPage setPage={setPage} />}
      {page === "organization-chart" && <OrganizationChartPage setPage={setPage} />}
      {page === "account" && <AccountPage />}
      {!hasClients && page !== "dashboard" && (
        <p style={{ color: theme.text, opacity: 0.8 }}>Assign users to your office manager account to use this section.</p>
      )}
    </AppLayout>
    <CustomerProfileReturnBar page={page} onNavigate={setPage} />
    </SandboxTrainingProvider>
    </GlobalAssistantProvider>
    </SetupWizardProvider>
    </JobTypesModalProvider>
  )
}

function OfficeManagerAppRoot() {
  const [page, setPageState] = useState("dashboard")
  return (
    <AppNavigationProvider page={page} setPage={setPageState}>
      <OfficeManagerAppContent />
    </AppNavigationProvider>
  )
}

export default function OfficeManagerApp() {
  return <OfficeManagerAppRoot />
}
