import { useState, useEffect, useCallback, useMemo } from "react"
import AppLayout from "../../layout/AppLayout"
import CustomersPage from "../customers/CustomersPage"
import LeadsPage from "../leads/LeadsPage"
import ConversationsPage from "../conversations/ConversationsPage"
import QuotesPage from "../quotes/QuotesPage"
import CalendarPage from "../calendar/CalendarPage"
import WebSupportPage from "../web-support/WebSupportPage"
import TechSupportPage from "../tech-support/TechSupportPage"
import SettingsPage from "../settings/SettingsPage"
import AccountPage from "../account/AccountPage"
import PaymentsPage from "../payments/PaymentsPage"
import InsuranceOptionsPage from "../insurance/InsuranceOptionsPage"
import ReportingPage from "../reporting/ReportingPage"
import { useAuth } from "../../contexts/AuthContext"
import {
  OfficeManagerScopeProvider,
  useOfficeManagerScopeOptional,
} from "../../contexts/OfficeManagerScopeContext"
import { usePortalTabs } from "../../hooks/usePortalTabs"
import { theme } from "../../styles/theme"
import { useIsMobile } from "../../hooks/useIsMobile"
import { useLocale } from "../../i18n/LocaleContext"
import { supabase } from "../../lib/supabase"
import {
  getOfficePortalTabListForConfig,
  getPortalTabListForConfig,
  USER_PORTAL_TAB_IDS,
  TAB_ID_LABELS,
  type PortalConfig,
} from "../../types/portal-builder"
import BillingDueDashboardBanner from "../../components/BillingDueDashboardBanner"
import DashboardQuickActions from "../../components/DashboardQuickActions"

const OM_CALENDAR_TOOLBAR_ACTIONS: { id: string; label: string }[] = [
  { id: "add_item", label: "Add item to calendar" },
  { id: "auto_response", label: "Auto Response Options" },
  { id: "job_types", label: "Job Types" },
  { id: "settings", label: "Settings" },
  { id: "completion_settings", label: "Job completion" },
  { id: "receipt_template", label: "Receipt template" },
  { id: "customize_user", label: "Customize user" },
]

function buildPortalTabsFromConfig(portalConfig: PortalConfig | null): Array<{ tab_id: string; label: string | null }> | undefined {
  if (!portalConfig) return undefined
  const hasTabs = (portalConfig.tabs && Object.keys(portalConfig.tabs).length > 0) || (portalConfig.customTabs?.length ?? 0) > 0
  if (!hasTabs) return undefined
  const ordered = getOfficePortalTabListForConfig(portalConfig)
  const visible = ordered.filter(({ tab_id }) => portalConfig.tabs?.[tab_id] !== false)
  return visible.length > 0 ? visible : undefined
}

const OM_QUOTES_TOOLBAR_ACTIONS: { id: string; label: string }[] = [
  { id: "auto_response", label: "Automatic replies" },
  { id: "settings", label: "Settings" },
  { id: "estimate_template", label: "Estimate template" },
  { id: "estimate_line_items", label: "Estimate line items" },
  { id: "job_types", label: "Job types" },
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

function ManagedUserBar() {
  const { portalConfig } = useAuth()
  const ctx = useOfficeManagerScopeOptional()
  if (!ctx) return null
  if (portalConfig?.office_manager_show_working_as_bar !== true) return null
  const { clients, selectedUserId, setSelectedUserId, loadingClients, loadingPortalConfig, error } = ctx
  const selected = clients.find((c) => c.userId === selectedUserId)
  const managedCount = clients.filter((c) => !c.isSelf).length

  if (loadingClients) {
    return (
      <p style={{ color: theme.text, marginBottom: 16, fontSize: 14 }}>
        Loading assigned users…
      </p>
    )
  }
  if (error) {
    return (
      <p style={{ color: "#b91c1c", marginBottom: 16, fontSize: 14 }}>
        {error}
      </p>
    )
  }
  if (clients.length === 0) {
    return (
      <div
        style={{
          marginBottom: 20,
          padding: 14,
          background: "#fef3c7",
          borderRadius: 8,
          color: "#92400e",
          fontSize: 14,
        }}
      >
        No users are linked to your office manager account.         An admin can assign them in the app:{" "}
        <strong>Admin Login → Users &amp; office managers → Office manager</strong> column. Then refresh this page. See{" "}
        <code>OFFICE-MANAGER.md</code>.
      </div>
    )
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 20,
        padding: "12px 14px",
        background: "white",
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: theme.text }}>Working as</span>
        <select
          value={selectedUserId ?? ""}
          onChange={(e) => setSelectedUserId(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: `1px solid ${theme.border}`,
            fontSize: 14,
            minWidth: 220,
            color: theme.text,
            background: "white",
          }}
        >
          {clients.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.isSelf ? "Office manager (me)" : c.label}
            </option>
          ))}
        </select>
        {loadingPortalConfig && (
          <span style={{ fontSize: 12, color: theme.text, opacity: 0.7 }}>Loading profile…</span>
        )}
        {!loadingPortalConfig && selected?.isSelf && (
          <span style={{ fontSize: 12, color: theme.text, opacity: 0.8 }}>
            You are viewing your own office manager scope.
          </span>
        )}
        {!loadingPortalConfig && !selected?.isSelf && (
          <span style={{ fontSize: 12, color: theme.text, opacity: 0.8 }}>
            Managing selected user data.
          </span>
        )}
      </div>
      {managedCount === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: theme.text, opacity: 0.75 }}>
          No managed users assigned yet. You can still work as office manager (me).
        </p>
      )}
      <ManagedUserTabEditor />
      <ManagedUserOmToolbarEditor />
    </div>
  )
}

function OfficeManagerAppContent() {
  const [page, setPage] = useState("dashboard")
  const { clientId, user, portalConfig } = useAuth()
  const isMobile = useIsMobile()
  const { t } = useLocale()
  const { tabs: portalTabs } = usePortalTabs(clientId, "office_manager")
  const scope = useOfficeManagerScopeOptional()
  const hasClients = (scope?.clients.length ?? 0) > 0
  const resolvedPortalTabs = useMemo(() => {
    let r = buildPortalTabsFromConfig(scope?.scopedPortalConfig ?? null) ?? portalTabs
    if (portalConfig?.show_legacy_contractor_leads_conversations !== true) {
      r = r.filter((t) => t.tab_id !== "leads" && t.tab_id !== "conversations")
    }
    return r
  }, [scope?.scopedPortalConfig, portalTabs, portalConfig?.show_legacy_contractor_leads_conversations])
  const selectedRow = scope?.clients.find((c) => c.userId === scope.selectedUserId) ?? null
  /** Bundled managed users (no Payments tab) do not get separate Helcim / dashboard billing alerts. */
  const separateBillingForScope =
    Boolean(scope?.selectedUserId) && (selectedRow?.isSelf === true || scope?.scopedPortalConfig?.tabs?.payments === true)
  const omPaymentsTabAvailable = hasClients && resolvedPortalTabs.some((t) => t.tab_id === "payments")
  const omSettingsTabAvailable = resolvedPortalTabs.some((t) => t.tab_id === "settings")

  useEffect(() => {
    if (portalConfig?.show_legacy_contractor_leads_conversations === true) return
    if (page === "leads" || page === "conversations") setPage("dashboard")
  }, [page, portalConfig?.show_legacy_contractor_leads_conversations])

  return (
    <AppLayout setPage={setPage} portalTabs={resolvedPortalTabs}>
      <ManagedUserBar />

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
            showSettingsShortcut={omSettingsTabAvailable}
            showPaymentsShortcut={omPaymentsTabAvailable}
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
            }}
          />
        </>
      )}
      {hasClients && page === "customers" && <CustomersPage setPage={setPage} />}
      {hasClients && page === "leads" && <LeadsPage setPage={setPage} />}
      {hasClients && page === "conversations" && <ConversationsPage setPage={setPage} />}
      {hasClients && page === "quotes" && <QuotesPage setPage={setPage} />}
      {hasClients && page === "calendar" && <CalendarPage setPage={setPage} />}
      {hasClients && page === "web-support" && <WebSupportPage />}
      {hasClients && page === "tech-support" && <TechSupportPage />}
      {hasClients && page === "settings" && <SettingsPage />}
      {hasClients && page === "payments" && <PaymentsPage />}
      {page === "insurance-options" && <InsuranceOptionsPage />}
      {page === "reporting" && <ReportingPage />}
      {page === "account" && <AccountPage />}
      {!hasClients && page !== "dashboard" && (
        <p style={{ color: theme.text, opacity: 0.8 }}>Assign users to your office manager account to use this section.</p>
      )}
    </AppLayout>
  )
}

export default function OfficeManagerApp() {
  return (
    <OfficeManagerScopeProvider>
      <OfficeManagerAppContent />
    </OfficeManagerScopeProvider>
  )
}
