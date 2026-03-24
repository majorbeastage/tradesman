import { useState, useEffect, useCallback } from "react"
import AppLayout from "../../layout/AppLayout"
import CustomersPage from "../customers/CustomersPage"
import LeadsPage from "../leads/LeadsPage"
import ConversationsPage from "../conversations/ConversationsPage"
import QuotesPage from "../quotes/QuotesPage"
import CalendarPage from "../calendar/CalendarPage"
import WebSupportPage from "../web-support/WebSupportPage"
import TechSupportPage from "../tech-support/TechSupportPage"
import SettingsPage from "../settings/SettingsPage"
import { useAuth } from "../../contexts/AuthContext"
import {
  OfficeManagerScopeProvider,
  useOfficeManagerScopeOptional,
} from "../../contexts/OfficeManagerScopeContext"
import { usePortalTabs } from "../../hooks/usePortalTabs"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { USER_PORTAL_TAB_IDS, TAB_ID_LABELS, type PortalConfig } from "../../types/portal-builder"

const OM_CALENDAR_TOOLBAR_ACTIONS: { id: string; label: string }[] = [
  { id: "add_item", label: "Add item to calendar" },
  { id: "auto_response", label: "Auto Response Options" },
  { id: "job_types", label: "Job Types" },
  { id: "settings", label: "Settings" },
  { id: "customize_user", label: "Customize user" },
]

const OM_QUOTES_TOOLBAR_ACTIONS: { id: string; label: string }[] = [
  { id: "add_customer", label: "Add Customer to quotes" },
  { id: "auto_response", label: "Auto Response Options" },
  { id: "settings", label: "Settings" },
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
      next[id] = cfg?.tabs?.[id] !== false
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
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {USER_PORTAL_TAB_IDS.map((tabId) => (
              <label key={tabId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                <input
                  type="checkbox"
                  checked={localTabs[tabId] !== false}
                  onChange={(e) => setLocalTabs((prev) => ({ ...prev, [tabId]: e.target.checked }))}
                />
                {TAB_ID_LABELS[tabId] ?? tabId}
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

  useEffect(() => {
    const om = ctx?.scopedPortalConfig?.om_page_actions
    const cal: Record<string, boolean> = {}
    for (const { id } of OM_CALENDAR_TOOLBAR_ACTIONS) cal[id] = om?.calendar?.[id] !== false
    const qu: Record<string, boolean> = {}
    for (const { id } of OM_QUOTES_TOOLBAR_ACTIONS) qu[id] = om?.quotes?.[id] !== false
    setCalendarVisible(cal)
    setQuotesVisible(qu)
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
    const portal_config: PortalConfig = {
      ...prev,
      om_page_actions: {
        ...(prev.om_page_actions ?? {}),
        calendar,
        quotes,
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
    setMsg("Saved toolbar visibility for Calendar and Quotes (when you manage this user).")
    await ctx.refreshScopedPortalConfig()
  }, [ctx, calendarVisible, quotesVisible, uid])

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
        {open ? "Hide" : "OM toolbar (Calendar / Quotes)"}
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
            When you work as this user in the office manager portal, unchecked items are hidden on <strong>Calendar</strong> and{" "}
            <strong>Quotes</strong> (standard toolbar buttons only).
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
  const ctx = useOfficeManagerScopeOptional()
  if (!ctx) return null
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
  const { clientId } = useAuth()
  const { tabs: portalTabs } = usePortalTabs(clientId, "office_manager")
  const scope = useOfficeManagerScopeOptional()
  const hasClients = (scope?.clients.length ?? 0) > 0

  return (
    <AppLayout setPage={setPage} portalTabs={portalTabs}>
      <ManagedUserBar />

      {page === "dashboard" && (
        <>
          <h1 style={{ color: theme.text }}>Office manager</h1>
          <p style={{ color: theme.text, marginTop: 12, opacity: 0.85 }}>
            Use the sidebar for the same areas as your team. You can work as <strong>office manager (me)</strong> or switch to
            any assigned user to load their leads, quotes, calendar, and customers. Calendar <strong>team view</strong> and
            drag-and-drop scheduling are planned next.
          </p>
          {hasClients && (
            <div style={{ maxWidth: "720px", marginTop: "24px", padding: "24px", background: "var(--charcoal-smoke, #1f2937)", border: "1px solid var(--border, #374151)", borderRadius: "8px", lineHeight: 1.6, color: "var(--text, #e5e7eb)" }}>
              <p style={{ margin: "0 0 1em" }}>
                Data and actions on other tabs apply to the <strong>selected user</strong>. Use <strong>User portal tabs</strong> to
                show or hide tabs for that user&apos;s login experience.
              </p>
            </div>
          )}
        </>
      )}
      {hasClients && page === "customers" && <CustomersPage />}
      {hasClients && page === "leads" && <LeadsPage setPage={setPage} />}
      {hasClients && page === "conversations" && <ConversationsPage setPage={setPage} />}
      {hasClients && page === "quotes" && <QuotesPage setPage={setPage} />}
      {hasClients && page === "calendar" && <CalendarPage />}
      {hasClients && page === "web-support" && <WebSupportPage />}
      {hasClients && page === "tech-support" && <TechSupportPage />}
      {hasClients && page === "settings" && <SettingsPage />}
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
