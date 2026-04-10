import { useState, useEffect, useCallback } from "react"
import type { CSSProperties, ReactNode } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useView } from "../../contexts/ViewContext"
import { AdminVisibilityProvider } from "../../contexts/AdminVisibilityContext"
import { AdminSettingBlock, AdminVisibilityFooter } from "../../components/admin/AdminSettingChrome"
import { AdminSortableRow } from "../../components/admin/AdminSortableRow"
import { reorderByIndex } from "../../lib/reorderArray"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import Sidebar from "../../components/Sidebar"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import AdminUsersSection from "./AdminUsersSection"
import CalendarUserPreferencesEditor from "./CalendarUserPreferencesEditor"
import AdminPortalAssistant from "./AdminPortalAssistant"
import PortalItemDependencyEditor from "../../components/admin/PortalItemDependencyEditor"
import AdminCommunicationsSection from "./AdminCommunicationsSection"
import AdminAboutUsSection from "./AdminAboutUsSection"
import AdminSignupRequirementsSection from "./AdminSignupRequirementsSection"
import AdminTroubleTicketsSection from "./AdminTroubleTicketsSection"
import type { PortalConfig, PortalCustomItem, PageControl, PortalSettingItem, CustomActionButton } from "../../types/portal-builder"
import {
  TAB_ID_LABELS,
  PAGE_CONTROLS,
  DEFAULT_OPTIONS,
  LEADS_TABLE_COLUMN_IDS,
  LEADS_TABLE_COLUMN_LABELS,
  getDefaultControlItems,
  getAccountSectionVisible,
  getPortalTabListForConfig,
  getOrderedAccountPortalSections,
  formatPortalItemDependenciesSummary,
  sanitizePortalSettingItemDependencies,
} from "../../types/portal-builder"
import {
  ALL_PROFILES_ID,
  ALL_USERS_ID,
  ALL_OFFICE_MANAGERS_ID,
  ALL_NEW_USERS_ID,
  ALL_ADMINS_ID,
  isBulkPortalAudienceId,
  isProfileUserId,
  profilesMatchingPortalAudience,
  labelForPortalAudience,
} from "./portalAudiences"

function getCustomActionButtonsFromConfig(cfg: PortalConfig, tabId: string): CustomActionButton[] {
  if (tabId === "leads") {
    const arr = cfg.customActionButtons
    if (Array.isArray(arr) && arr.length > 0) return arr
    const legacy = (cfg as { customHeaderButtons?: PortalCustomItem[] }).customHeaderButtons
    if (Array.isArray(legacy) && legacy.length > 0) return legacy.map((b) => ({ id: b.id, label: b.label, items: [] }))
  }
  const byTab = cfg.customActionButtonsByTab?.[tabId]
  return Array.isArray(byTab) ? byTab : []
}

type ProfileRow = {
  id: string
  role: string
  display_name: string | null
  portal_config: PortalConfig | null
  /** From admin_users_list when available */
  email?: string | null
}

/** Batch-edit only: apply config to all profiles. Not used for login or admin auth — login uses the signed-in user's profile. */

/** User dropdown label: prefer email, then display_name, then role + short id */
function profileOptionLabel(p: ProfileRow): string {
  if (p.email) return `${p.email} (${p.role})`
  if (p.display_name?.trim()) return `${p.display_name.trim()} (${p.role})`
  return `${p.role} • ${p.id.slice(0, 8)}`
}

/** Default: everything visible (no keys or all true) */
function getVisible(config: PortalConfig | null, section: "tabs" | "settings" | "dropdowns", key: string): boolean {
  const sectionConfig = config?.[section]
  if (!sectionConfig || sectionConfig[key] === undefined) return true
  return sectionConfig[key] === true
}

/** True if config has any visibility set to false, any control/custom item hidden, fewer options than default, or fewer control items than default. */
function hasRemovals(config: PortalConfig): boolean {
  try {
    const sectionHasFalse = (section: "tabs" | "settings" | "dropdowns") => {
      const s = config[section]
      if (!s || typeof s !== "object" || Array.isArray(s)) return false
      return Object.values(s).some((v) => v === false)
    }
    if (sectionHasFalse("tabs") || sectionHasFalse("settings") || sectionHasFalse("dropdowns")) return true
    // Control items: any item hidden from user, or fewer items than default (item was removed)
    const items = config.controlItems ?? {}
    for (const [key, list] of Object.entries(items)) {
      if (!Array.isArray(list)) continue
      if (list.some((item) => item?.visibleToUser === false)) return true
      const [tabId, controlId] = key.split(":")
      if (tabId && controlId && list.length < getDefaultControlItems(tabId, controlId).length) return true
    }
    const byTab = config.customActionButtonsByTab ?? {}
    const flatFromByTab = typeof byTab === "object" && !Array.isArray(byTab) ? Object.values(byTab).flat() : []
    const customButtons = [...(Array.isArray(config.customActionButtons) ? config.customActionButtons : []), ...flatFromByTab]
    for (const btn of customButtons) {
      if (btn && Array.isArray(btn.items) && btn.items.some((item) => item?.visibleToUser === false)) return true
    }
    const leads = config.leadsSettingsItems
    if (Array.isArray(leads) && leads.some((item) => item?.visibleToUser === false)) return true
    // Option values: fewer dropdown/column options than default (option was removed)
    const ov = config.optionValues ?? {}
    const leadCols = ov.leads_table_columns
    if (Array.isArray(leadCols) && leadCols.length < LEADS_TABLE_COLUMN_IDS.length) return true
    for (const [controlId, defaultArr] of Object.entries(DEFAULT_OPTIONS)) {
      if (!Array.isArray(defaultArr)) continue
      const current = ov[controlId]
      if (Array.isArray(current) && current.length < defaultArr.length) return true
    }
    const acct = config.accountSections
    if (acct && typeof acct === "object" && !Array.isArray(acct) && Object.values(acct).some((v) => v === false)) return true
    return false
  } catch {
    return false
  }
}

const REMOVE_BTN_STYLE: CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  border: "none",
  borderRadius: 4,
  background: "#000",
  color: "#b91c1c",
  cursor: "pointer",
}
const REMOVE_BTN_STYLE_SMALL: CSSProperties = { ...REMOVE_BTN_STYLE, fontSize: 10 }

function setVisible(config: PortalConfig, section: "tabs" | "settings" | "dropdowns", key: string, value: boolean): PortalConfig {
  const next = { ...config }
  if (!next[section]) next[section] = {}
  next[section] = { ...next[section], [key]: value }
  return next
}

/** Visible tabs only (respects sidebar order), for sidebar preview / app */
function getVisibleTabs(config: PortalConfig): Array<{ tab_id: string; label: string | null }> {
  return getPortalTabListForConfig(config)
    .filter(({ tab_id }) => getVisible(config, "tabs", tab_id))
    .map(({ tab_id, label }) => ({ tab_id, label }))
}

type MockFn = (onSelect: (controlId: string) => void, selectedId: string | null, config?: PortalConfig) => ReactNode

/** What each tab shows in the real app; mock can be static or a function for clickable controls */
const TAB_PREVIEW: Record<string, { title: string; description: string; mock: ReactNode | MockFn }> = {
  dashboard: {
    title: "Dashboard",
    description: "Welcome message and company intro. First thing the user sees after login.",
    mock: (
      <div style={{ padding: 16, background: "var(--charcoal-smoke, #1f2937)", borderRadius: 8, color: "var(--text, #e5e7eb)", fontSize: 13, lineHeight: 1.5 }}>
        <p style={{ margin: "0 0 8px" }}>Thank you for visiting our company. We are committed to assisting contractors…</p>
        <p style={{ margin: 0, opacity: 0.9 }}>Our primary purpose is to utilize as many modern tools as possible…</p>
      </div>
    ),
  },
  leads: {
    title: "Leads",
    description: "Click any element to customize it. Matches what the user sees on the Leads page.",
    mock: ((onSelect, selectedId, cfg) => {
      const config = cfg ?? {}
      const getLabel = (id: string, fallback: string) => (config.controlLabels?.[id]?.trim() || fallback)
      const btn = (id: string, label: string, primary?: boolean) => (
        <button
          key={id}
          type="button"
          onClick={(e) => { e.preventDefault(); onSelect(id) }}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: `2px solid ${selectedId === id ? theme.primary : theme.border}`,
            background: selectedId === id ? theme.primary : primary ? "#F97316" : "white",
            color: selectedId === id || primary ? "white" : theme.text,
            fontSize: 13,
            cursor: "pointer",
            fontWeight: selectedId === id ? 600 : 400,
          }}
        >
          {label}
        </button>
      )
      const raw = config.optionValues?.leads_table_columns
      const colIds = Array.isArray(raw) ? raw : [...LEADS_TABLE_COLUMN_IDS]
      return (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden", background: "white" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.border}` }}>
            <h1
              onClick={(e) => { e.preventDefault(); onSelect("page_title") }}
              style={{
                margin: 0,
                fontSize: 24,
                color: theme.text,
                cursor: "pointer",
                border: `2px solid ${selectedId === "page_title" ? theme.primary : "transparent"}`,
                borderRadius: 4,
                padding: "2px 6px",
                display: "inline-block",
              }}
            >
              Leads
            </h1>
          </div>
          <div style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {btn("create_lead", getLabel("create_lead", "+ Create Lead"), true)}
                {btn("settings", getLabel("settings", "Settings"))}
                {getCustomActionButtonsFromConfig(config, "leads").map((b) => {
                  const cid = "custom_action_button:" + b.id
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={(e) => { e.preventDefault(); onSelect(cid) }}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 6,
                        border: `2px solid ${selectedId === cid ? theme.primary : theme.border}`,
                        background: selectedId === cid ? theme.primary : "white",
                        color: selectedId === cid ? "white" : theme.text,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {b.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 16, padding: 12, background: theme.charcoalSmoke, borderRadius: 8, border: `1px solid ${theme.border}` }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb" }}>Filter</label>
                <div
                  onClick={(e) => { e.preventDefault(); onSelect("filter") }}
                  style={{
                    padding: "6px 10px",
                    width: 160,
                    background: "white",
                    borderRadius: 6,
                    border: `2px solid ${selectedId === "filter" ? theme.primary : theme.border}`,
                    cursor: "pointer",
                    fontSize: 12,
                    color: theme.text,
                  }}
                >
                  By name... · By phone...
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb" }}>Sort by</label>
                <div
                  onClick={(e) => { e.preventDefault(); onSelect("sort_by") }}
                  style={{
                    padding: "6px 10px",
                    minWidth: 120,
                    background: "white",
                    borderRadius: 6,
                    border: `2px solid ${selectedId === "sort_by" ? theme.primary : theme.border}`,
                    cursor: "pointer",
                    fontSize: 12,
                    color: theme.text,
                  }}
                >
                  Name ▾
                </div>
              </div>
              {["lead_source", "status", "priority"].map((id) => (
                <div key={id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb" }}>{PAGE_CONTROLS.leads.find((c) => c.id === id)?.label ?? id}</label>
                  <div
                    onClick={(e) => { e.preventDefault(); onSelect(id) }}
                    style={{
                      padding: "6px 10px",
                      minWidth: 100,
                      background: "white",
                      borderRadius: 6,
                      border: `2px solid ${selectedId === id ? theme.primary : theme.border}`,
                      cursor: "pointer",
                      fontSize: 12,
                      color: theme.text,
                    }}
                  >
                    {id === "lead_source" ? "Web" : id === "status" ? "New" : "Low"} ▾
                  </div>
                </div>
              ))}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  {colIds.map((colId) => (
                    <th
                      key={colId}
                      onClick={(e) => { e.preventDefault(); onSelect("table_columns") }}
                      style={{
                        padding: 8,
                        cursor: "pointer",
                        border: `2px solid ${selectedId === "table_columns" ? theme.primary : "transparent"}`,
                        borderRadius: 4,
                        color: theme.text,
                        fontSize: 12,
                      }}
                    >
                      {LEADS_TABLE_COLUMN_LABELS[colId] ?? colId}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={colIds.length} style={{ padding: 12, fontSize: 12, color: theme.text, opacity: 0.7 }}>Lead rows appear here</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )
    }) as MockFn,
  },
  conversations: {
    title: "Conversations",
    description: "Click a control to edit its options on the right. Same item options (checkboxes, dropdowns, custom fields, dependency) on every tab.",
    mock: ((onSelect, selectedId, cfg) => {
      const buttons = getCustomActionButtonsFromConfig(cfg ?? {}, "conversations")
      return (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.border}` }}>
            <h1 onClick={() => onSelect("page_title")} style={{ margin: 0, fontSize: 24, color: theme.text, cursor: "pointer", border: `2px solid ${selectedId === "page_title" ? theme.primary : "transparent"}`, borderRadius: 4, padding: "2px 6px", display: "inline-block" }}>Conversations</h1>
          </div>
          <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {buttons.map((b) => {
              const cid = "custom_action_button:" + b.id
              return (
                <button key={b.id} type="button" onClick={() => onSelect(cid)} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === cid ? theme.primary : theme.border}`, background: selectedId === cid ? theme.primary : theme.background, color: selectedId === cid ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>{b.label}</button>
              )
            })}
            <button type="button" onClick={() => onSelect("add_conversation")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "add_conversation" ? theme.primary : theme.border}`, background: selectedId === "add_conversation" ? theme.primary : theme.background, color: selectedId === "add_conversation" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Add conversation</button>
            <button type="button" onClick={() => onSelect("conversation_settings")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "conversation_settings" ? theme.primary : theme.border}`, background: selectedId === "conversation_settings" ? theme.primary : theme.background, color: selectedId === "conversation_settings" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Conversation settings</button>
          </div>
          <div style={{ padding: 12, fontSize: 12, color: theme.text, opacity: 0.8 }}>Thread list · Reply</div>
        </div>
      )
    }) as MockFn,
  },
  quotes: {
    title: "Quotes",
    description: "Click a control to edit its options on the right.",
    mock: ((onSelect, selectedId, cfg) => {
      const buttons = getCustomActionButtonsFromConfig(cfg ?? {}, "quotes")
      return (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.border}` }}>
            <h1 onClick={() => onSelect("page_title")} style={{ margin: 0, fontSize: 24, color: theme.text, cursor: "pointer", border: `2px solid ${selectedId === "page_title" ? theme.primary : "transparent"}`, borderRadius: 4, padding: "2px 6px", display: "inline-block" }}>Quotes</h1>
          </div>
          <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {buttons.map((b) => {
              const cid = "custom_action_button:" + b.id
              return (
                <button key={b.id} type="button" onClick={() => onSelect(cid)} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === cid ? theme.primary : theme.border}`, background: selectedId === cid ? theme.primary : theme.background, color: selectedId === cid ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>{b.label}</button>
              )
            })}
            <button type="button" onClick={() => onSelect("add_customer_to_quotes")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "add_customer_to_quotes" ? theme.primary : theme.border}`, background: selectedId === "add_customer_to_quotes" ? theme.primary : theme.background, color: selectedId === "add_customer_to_quotes" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Add Customer to quotes</button>
            <button type="button" onClick={() => onSelect("add_quote_to_calendar")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "add_quote_to_calendar" ? theme.primary : theme.border}`, background: selectedId === "add_quote_to_calendar" ? theme.primary : theme.background, color: selectedId === "add_quote_to_calendar" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Add quote to calendar</button>
            <button type="button" onClick={() => onSelect("auto_response_options")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "auto_response_options" ? theme.primary : theme.border}`, background: selectedId === "auto_response_options" ? theme.primary : theme.background, color: selectedId === "auto_response_options" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Auto Response Options</button>
            <button type="button" onClick={() => onSelect("quote_settings")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "quote_settings" ? theme.primary : theme.border}`, background: selectedId === "quote_settings" ? theme.primary : theme.background, color: selectedId === "quote_settings" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Quote settings</button>
            <button type="button" onClick={() => onSelect("estimate_template")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "estimate_template" ? theme.primary : theme.border}`, background: selectedId === "estimate_template" ? theme.primary : theme.background, color: selectedId === "estimate_template" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Estimate template</button>
            <button type="button" onClick={() => onSelect("status")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "status" ? theme.primary : theme.border}`, background: selectedId === "status" ? theme.primary : theme.background, color: selectedId === "status" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Status</button>
          </div>
        </div>
      )
    }) as MockFn,
  },
  calendar: {
    title: "Calendar",
    description: "Click a control to edit its options on the right.",
    mock: ((onSelect, selectedId, cfg) => {
      const buttons = getCustomActionButtonsFromConfig(cfg ?? {}, "calendar")
      return (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.border}` }}>
            <h1 onClick={() => onSelect("page_title")} style={{ margin: 0, fontSize: 24, color: theme.text, cursor: "pointer", border: `2px solid ${selectedId === "page_title" ? theme.primary : "transparent"}`, borderRadius: 4, padding: "2px 6px", display: "inline-block" }}>Calendar</h1>
          </div>
          <div style={{ padding: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {buttons.map((b) => {
              const cid = "custom_action_button:" + b.id
              return (
                <button key={b.id} type="button" onClick={() => onSelect(cid)} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === cid ? theme.primary : theme.border}`, background: selectedId === cid ? theme.primary : theme.background, color: selectedId === cid ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>{b.label}</button>
              )
            })}
            <button type="button" onClick={() => onSelect("add_item_to_calendar")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "add_item_to_calendar" ? theme.primary : theme.border}`, background: selectedId === "add_item_to_calendar" ? theme.primary : theme.background, color: selectedId === "add_item_to_calendar" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Add item to calendar</button>
            <button type="button" onClick={() => onSelect("auto_response_options")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "auto_response_options" ? theme.primary : theme.border}`, background: selectedId === "auto_response_options" ? theme.primary : theme.background, color: selectedId === "auto_response_options" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Auto Response Options</button>
            <button type="button" onClick={() => onSelect("job_types")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "job_types" ? theme.primary : theme.border}`, background: selectedId === "job_types" ? theme.primary : theme.background, color: selectedId === "job_types" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Job Types</button>
            <button type="button" onClick={() => onSelect("working_hours")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "working_hours" ? theme.primary : theme.border}`, background: selectedId === "working_hours" ? theme.primary : theme.background, color: selectedId === "working_hours" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Settings</button>
            <button type="button" onClick={() => onSelect("receipt_template")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "receipt_template" ? theme.primary : theme.border}`, background: selectedId === "receipt_template" ? theme.primary : theme.background, color: selectedId === "receipt_template" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Receipt template</button>
            <button type="button" onClick={() => onSelect("customize_user")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "customize_user" ? theme.primary : theme.border}`, background: selectedId === "customize_user" ? theme.primary : theme.background, color: selectedId === "customize_user" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Customize user</button>
            <button type="button" onClick={() => onSelect("job_type")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "job_type" ? theme.primary : theme.border}`, background: selectedId === "job_type" ? theme.primary : theme.background, color: selectedId === "job_type" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Job type</button>
          </div>
          <div style={{ padding: 8, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 11, color: theme.text }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{ padding: 4, textAlign: "center", border: `1px solid ${theme.border}`, borderRadius: 4 }}>{d}</div>
            ))}
          </div>
        </div>
      )
    }) as MockFn,
  },
  customers: {
    title: "Customers",
    description: "Customer list and details.",
    mock: (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", background: theme.charcoalSmoke, color: "white", fontSize: 12 }}>Customers</div>
        <div style={{ padding: 12, fontSize: 12, color: theme.text }}>Customer list</div>
      </div>
    ),
  },
  "web-support": {
    title: "Web Support",
    description: "Web support / help content.",
    mock: (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, fontSize: 12, color: theme.text }}>
        Web Support content
      </div>
    ),
  },
  "tech-support": {
    title: "Tech Support",
    description: "Tech support / help content.",
    mock: (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, fontSize: 12, color: theme.text }}>
        Tech Support content
      </div>
    ),
  },
  settings: {
    title: "Settings",
    description: "Click a control to edit its options on the right.",
    mock: ((onSelect, selectedId, cfg) => {
      const buttons = getCustomActionButtonsFromConfig(cfg ?? {}, "settings")
      return (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.border}` }}>
            <h1 onClick={() => onSelect("page_title")} style={{ margin: 0, fontSize: 24, color: theme.text, cursor: "pointer", border: `2px solid ${selectedId === "page_title" ? theme.primary : "transparent"}`, borderRadius: 4, padding: "2px 6px", display: "inline-block" }}>Settings</h1>
          </div>
          <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {buttons.map((b) => {
              const cid = "custom_action_button:" + b.id
              return (
                <button key={b.id} type="button" onClick={() => onSelect(cid)} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === cid ? theme.primary : theme.border}`, background: selectedId === cid ? theme.primary : theme.background, color: selectedId === cid ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>{b.label}</button>
              )
            })}
            <button type="button" onClick={() => onSelect("custom_fields")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "custom_fields" ? theme.primary : theme.border}`, background: selectedId === "custom_fields" ? theme.primary : theme.background, color: selectedId === "custom_fields" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Custom fields</button>
          </div>
        </div>
      )
    }) as MockFn,
  },
  account: {
    title: "My T (Account)",
    description: "Business profile, routing-related fields, and support. Use the panel on the right to show or hide each block for this user (including service radius).",
    mock: (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden", background: "var(--charcoal-smoke, #1f2937)", color: "#e5e7eb" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.border}`, fontSize: 12, opacity: 0.9 }}>Account</div>
        <div style={{ padding: 16, fontSize: 13, lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 8px" }}>Profile, address, service radius, hours, call forwarding, voicemail, help desk, password reset — visibility is controlled in the builder.</p>
        </div>
      </div>
    ),
  },
}

function getPreviewForTab(
  tabId: string,
  config: PortalConfig,
  onSelectControl?: (controlId: string) => void,
  selectedControlId?: string | null
): { title: string; description: string; mock: ReactNode } {
  const builtIn = TAB_PREVIEW[tabId]
  if (builtIn) {
    let mock: ReactNode
    try {
      mock =
        typeof builtIn.mock === "function"
          ? builtIn.mock(onSelectControl ?? (() => {}), selectedControlId ?? null, config ?? {})
          : builtIn.mock
    } catch (e) {
      console.error("Admin preview mock error:", e)
      mock = <div style={{ padding: 12, fontSize: 12, color: "#b91c1c" }}>Preview could not be rendered. Check console.</div>
    }
    return { title: builtIn.title, description: builtIn.description, mock }
  }
  const customList = Array.isArray(config.customTabs) ? config.customTabs : []
  const custom = customList.find((t) => t.id === tabId)
  return {
    title: custom?.label ?? tabId,
    description: "Custom section added by admin. You can add real content for this tab later.",
    mock: <div style={{ padding: 12, fontSize: 12, color: theme.text, opacity: 0.8 }}>Custom section</div>,
  }
}

export default function AdminApp() {
  return (
    <AdminVisibilityProvider>
      <AdminAppInner />
    </AdminVisibilityProvider>
  )
}

function AdminAppInner() {
  const { user, signOut } = useAuth()
  const { setView } = useView()
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(ALL_PROFILES_ID)
  const [config, setConfig] = useState<PortalConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [previewPage, setPreviewPage] = useState("dashboard")

  // Preview: which control is selected (tab + controlId) for showing options on the right
  const [selectedControl, setSelectedControl] = useState<{ tab: string; controlId: string } | null>(null)
  // When control is custom_action_button, which specific button (by id) is selected for editing its items
  const [selectedCustomActionButtonId, setSelectedCustomActionButtonId] = useState<string | null>(null)

  // Add custom (inline new id/label)
  const [newTabLabel, setNewTabLabel] = useState("")
  const [newHeaderButtonLabel, setNewHeaderButtonLabel] = useState("")
  const [newSettingItemLabel, setNewSettingItemLabel] = useState("")
  const [newSettingItemType, setNewSettingItemType] = useState<'checkbox' | 'dropdown' | 'custom_field'>('checkbox')
  const [newSettingItemOptions, setNewSettingItemOptions] = useState("")
  const [selectedCustomButtonItemId, setSelectedCustomButtonItemId] = useState<string | null>(null)
  const [selectedControlItemId, setSelectedControlItemId] = useState<string | null>(null)
  const [newDropdownOptionValue, setNewDropdownOptionValue] = useState("")
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  /** Set when user clicks Remove on anything (including custom items they added); triggers confirm-before-save. */
  const [hasRemovedSomething, setHasRemovedSomething] = useState(false)
  /** When false, control items with hideFromAdmin are omitted from this list (toggle to edit them). */
  const [showPortalItemsHiddenFromAdmin, setShowPortalItemsHiddenFromAdmin] = useState(false)
  const [adminPanel, setAdminPanel] = useState<
    "signup" | "communications" | "users" | "portal" | "tickets" | "about"
  >("portal")

  const loadProfiles = useCallback(async () => {
    if (!supabase) return
    setError("")
    const { data: profileData, error: err } = await supabase
      .from("profiles")
      .select("id, role, display_name, portal_config")
      .order("created_at", { ascending: false })
    if (err) {
      setError(err.message)
      setProfiles([])
      return
    }
    const rows = (profileData ?? []) as ProfileRow[]
    // Try to get emails from admin_users_list so dropdown can show email
    const { data: listData } = await supabase.from("admin_users_list").select("id, email")
    const emailById = new Map((listData ?? []).map((r: { id: string; email?: string }) => [r.id, r.email ?? null]))
    const withEmail = rows.map((p) => ({ ...p, email: emailById.get(p.id) ?? null }))
    setProfiles(withEmail)
  }, [])

  const filteredProfiles = profiles.filter((p) =>
    profileOptionLabel(p).toLowerCase().includes(userSearchQuery.trim().toLowerCase())
  )
  const selectedProfile =
    !selectedId || isBulkPortalAudienceId(selectedId) ? null : profiles.find((p) => p.id === selectedId)
  const selectedDisplayLabel =
    !selectedId
      ? ""
      : isBulkPortalAudienceId(selectedId)
        ? labelForPortalAudience(selectedId)
        : selectedProfile
          ? profileOptionLabel(selectedProfile)
          : ""

  const communicationsMode: "all_users_insights" | "select_user_first" | "single_client" =
    selectedId === ALL_PROFILES_ID
      ? "all_users_insights"
      : Boolean(selectedId) && isBulkPortalAudienceId(selectedId as string)
        ? "select_user_first"
        : "single_client"
  const communicationsSelectedUserId = selectedId && isProfileUserId(selectedId) ? selectedId : null

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    loadProfiles().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setConfig({})
      setHasRemovedSomething(false)
      return
    }
    if (isBulkPortalAudienceId(selectedId)) {
      const subset = profilesMatchingPortalAudience(profiles, selectedId)
      const p0 = subset[0]
      const raw = p0?.portal_config
      setConfig(raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as PortalConfig) : {})
      setHasRemovedSomething(false)
      return
    }
    const p = profiles.find((x) => x.id === selectedId)
    const raw = p?.portal_config
    setConfig(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {})
    setHasRemovedSomething(false)
  }, [selectedId, profiles])

  // When current preview tab is hidden, switch to first visible tab
  const visibleTabIds = getVisibleTabs(config).map((t) => t.tab_id)
  useEffect(() => {
    if (visibleTabIds.length > 0 && !visibleTabIds.includes(previewPage)) setPreviewPage(visibleTabIds[0])
  }, [visibleTabIds.join(","), previewPage])

  async function handleSave() {
    if (!supabase || !selectedId) return
    if ((hasRemovals(config) || hasRemovedSomething) && !window.confirm("Are you sure you want to remove options?")) return
    setSaving(true)
    setError("")
    setMessage("")
    if (isBulkPortalAudienceId(selectedId)) {
      const targets = profilesMatchingPortalAudience(profiles, selectedId)
      if (targets.length === 0) {
        setSaving(false)
        setMessage("No profiles match this audience yet.")
        return
      }
      let failed = 0
      for (const p of targets) {
        const { error: err } = await supabase.from("profiles").update({ portal_config: config }).eq("id", p.id)
        if (err) failed++
      }
      setSaving(false)
      const label = labelForPortalAudience(selectedId)
      setMessage(
        failed === 0
          ? `Saved. Portal config applied to ${targets.length} profile(s) (${label}).`
          : `Saved for ${targets.length - failed} of ${targets.length} profiles. ${failed} failed.`
      )
      if (failed === 0) {
        const targetIds = new Set(targets.map((t) => t.id))
        setProfiles((prev) => prev.map((p) => (targetIds.has(p.id) ? { ...p, portal_config: config } : p)))
        setHasRemovedSomething(false)
      }
      return
    }
    const { error: err } = await supabase.from("profiles").update({ portal_config: config }).eq("id", selectedId)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage("Saved. That user's portal will reflect these visibility settings.")
    setProfiles((prev) => prev.map((p) => (p.id === selectedId ? { ...p, portal_config: config } : p)))
    setHasRemovedSomething(false)
  }

  const toggle = (section: "tabs" | "settings" | "dropdowns", key: string) => {
    setConfig(setVisible(config, section, key, !getVisible(config, section, key)))
  }

  function addCustomTab(label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    const id = trimmed.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "")
    if (!id) return
    const arr = (config.customTabs ?? []) as PortalCustomItem[]
    if (arr.some((x) => x.id === id)) return
    setConfig({
      ...config,
      customTabs: [...arr, { id, label: trimmed }],
      tabs: { ...config.tabs, [id]: true },
    })
    setNewTabLabel("")
  }

  function removeCustomTab(id: string) {
    setHasRemovedSomething(true)
    const arr = (config.customTabs ?? []).filter((x) => x.id !== id)
    const next: PortalConfig = { ...config, customTabs: arr.length ? arr : undefined }
    const keyObj = { ...(next.tabs ?? {}) }
    delete keyObj[id]
    next.tabs = Object.keys(keyObj).length ? keyObj : undefined
    if (config.sidebarTabOrder?.length) {
      const filtered = config.sidebarTabOrder.filter((x) => x !== id)
      next.sidebarTabOrder = filtered.length ? filtered : undefined
    }
    setConfig(next)
  }

  function reorderSidebarTabs(from: number, to: number) {
    const ids = getPortalTabListForConfig(config).map((t) => t.tab_id)
    setConfig({ ...config, sidebarTabOrder: reorderByIndex(ids, from, to) })
  }

  function reorderAccountSections(from: number, to: number) {
    const ids = getOrderedAccountPortalSections(config).map((s) => s.id)
    setConfig({ ...config, accountSectionOrder: reorderByIndex(ids, from, to) })
  }

  function reorderOptionValues(controlId: string, from: number, to: number) {
    const cur = [...getOptionValues(controlId)]
    setConfig({ ...config, optionValues: { ...config.optionValues, [controlId]: reorderByIndex(cur, from, to) } })
  }

  function reorderCustomActionButtonsRow(from: number, to: number) {
    const arr = [...getCustomActionButtons()]
    const next = reorderByIndex(arr, from, to)
    if (previewPage === "leads") {
      setConfig({ ...config, customActionButtons: next })
    } else {
      setConfig({ ...config, customActionButtonsByTab: { ...config.customActionButtonsByTab, [previewPage]: next } })
    }
  }

  function reorderCustomActionButtonItemsRow(buttonId: string, from: number, to: number) {
    const btn = getCustomActionButton(buttonId)
    if (!btn) return
    const allItems = btn.items
    const visibleOnly = showPortalItemsHiddenFromAdmin ? allItems : allItems.filter((x) => !x.hideFromAdmin)
    const fromItem = visibleOnly[from]
    const toItem = visibleOnly[to]
    if (!fromItem || !toItem) return
    const full = [...allItems]
    const fromIdx = full.findIndex((x) => x.id === fromItem.id)
    const toIdx = full.findIndex((x) => x.id === toItem.id)
    if (fromIdx < 0 || toIdx < 0) return
    updateCustomActionButton(buttonId, { items: reorderByIndex(full, fromIdx, toIdx) })
  }

  function reorderControlItemsRow(tabId: string, controlId: string, from: number, to: number) {
    const allItems = getControlItems(tabId, controlId)
    const visibleOnly = showPortalItemsHiddenFromAdmin ? allItems : allItems.filter((x) => !x.hideFromAdmin)
    const fromItem = visibleOnly[from]
    const toItem = visibleOnly[to]
    if (!fromItem || !toItem) return
    const full = [...allItems]
    const fromIdx = full.findIndex((x) => x.id === fromItem.id)
    const toIdx = full.findIndex((x) => x.id === toItem.id)
    if (fromIdx < 0 || toIdx < 0) return
    setControlItems(tabId, controlId, reorderByIndex(full, fromIdx, toIdx))
  }

  function toggleAccountPortalSection(sectionId: string) {
    const visible = getAccountSectionVisible(config, sectionId)
    const acc = { ...(config.accountSections ?? {}) }
    if (visible) acc[sectionId] = false
    else delete acc[sectionId]
    setConfig({ ...config, accountSections: Object.keys(acc).length ? acc : undefined })
  }

  function getOptionValues(controlId: string): string[] {
    const raw = config.optionValues?.[controlId]
    if (Array.isArray(raw)) return raw
    const def = DEFAULT_OPTIONS[controlId]
    return Array.isArray(def) ? def : []
  }

  function addOptionValue(controlId: string, value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    const raw = config.optionValues?.[controlId]
    const current = Array.isArray(raw) ? raw : []
    if (current.includes(trimmed)) return
    setConfig({
      ...config,
      optionValues: { ...config.optionValues, [controlId]: [...current, trimmed] },
    })
  }

  function removeOptionValue(controlId: string, index: number) {
    setHasRemovedSomething(true)
    const current = getOptionValues(controlId)
    const next = current.filter((_, i) => i !== index)
    const optionValues = { ...config.optionValues, [controlId]: next }
    setConfig({ ...config, optionValues })
  }

  function setControlLabel(controlId: string, label: string) {
    setConfig({ ...config, controlLabels: { ...config.controlLabels, [controlId]: label } })
  }

  function setPageActionVisible(tabId: string, actionId: string, visible: boolean) {
    setConfig((prev) => ({
      ...prev,
      pageActions: {
        ...(prev.pageActions ?? {}),
        [tabId]: {
          ...(prev.pageActions?.[tabId] ?? {}),
          [actionId]: visible,
        },
      },
    }))
  }

  function addCustomActionButton(label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    const id = trimmed.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "") || "custom-" + Date.now()
    const arr = getCustomActionButtons()
    if (arr.some((x) => x.id === id)) return
    if (previewPage === "leads") {
      setConfig({ ...config, customActionButtons: [...arr, { id, label: trimmed, items: [] }] })
    } else {
      setConfig({ ...config, customActionButtonsByTab: { ...config.customActionButtonsByTab, [previewPage]: [...arr, { id, label: trimmed, items: [] }] } })
    }
    setNewHeaderButtonLabel("")
  }

  function removeCustomActionButton(id: string) {
    setHasRemovedSomething(true)
    const arr = getCustomActionButtons().filter((x) => x.id !== id)
    if (previewPage === "leads") {
      setConfig({ ...config, customActionButtons: arr.length ? arr : undefined })
    } else {
      setConfig({ ...config, customActionButtonsByTab: { ...config.customActionButtonsByTab, [previewPage]: arr } })
    }
    if (selectedCustomActionButtonId === id) setSelectedCustomActionButtonId(null)
  }

  const controlItemsKey = (tabId: string, controlId: string) => `${tabId}:${controlId}`

  function getControlItems(tabId: string, controlId: string): PortalSettingItem[] {
    const key = controlItemsKey(tabId, controlId)
    if (key === "leads:settings") {
      return config.controlItems?.[key] ?? config.leadsSettingsItems ?? getDefaultControlItems(tabId, controlId)
    }
    return config.controlItems?.[key] ?? getDefaultControlItems(tabId, controlId)
  }

  function setControlItems(tabId: string, controlId: string, items: PortalSettingItem[]) {
    const key = controlItemsKey(tabId, controlId)
    const next = { ...config, controlItems: { ...config.controlItems, [key]: items } }
    if (key === "leads:settings") (next as PortalConfig).leadsSettingsItems = items
    setConfig(next)
  }

  function applyControlItemsPatchFromAssistant(patch: Record<string, PortalSettingItem[]>) {
    setConfig((prev) => {
      const controlItems = { ...(prev.controlItems ?? {}) }
      for (const [key, items] of Object.entries(patch)) {
        controlItems[key] = items
      }
      const next: PortalConfig = { ...prev, controlItems }
      if (patch["leads:settings"]) {
        next.leadsSettingsItems = patch["leads:settings"]
      }
      return next
    })
  }

  function addControlItem(tabId: string, controlId: string, item: PortalSettingItem) {
    const current = getControlItems(tabId, controlId)
    if (current.some((x) => x.id === item.id)) return
    setControlItems(tabId, controlId, [...current, item])
  }

  function updateControlItem(tabId: string, controlId: string, itemId: string, updates: Partial<PortalSettingItem>) {
    setControlItems(
      tabId,
      controlId,
      getControlItems(tabId, controlId).map((x) =>
        x.id === itemId ? sanitizePortalSettingItemDependencies({ ...x, ...updates }) : x,
      ),
    )
  }

  function setControlItemVisible(tabId: string, controlId: string, itemId: string, visibleToUser: boolean) {
    setControlItems(tabId, controlId, getControlItems(tabId, controlId).map((x) => (x.id === itemId ? { ...x, visibleToUser } : x)))
  }

  function removeControlItem(tabId: string, controlId: string, itemId: string) {
    setHasRemovedSomething(true)
    setControlItems(tabId, controlId, getControlItems(tabId, controlId).filter((x) => x.id !== itemId))
    if (selectedControlItemId === itemId) setSelectedControlItemId(null)
  }

  function removeCustomActionButtonItem(buttonId: string, itemId: string) {
    setHasRemovedSomething(true)
    const btn = getCustomActionButton(buttonId)
    if (!btn) return
    updateCustomActionButton(buttonId, { items: btn.items.filter((x) => x.id !== itemId) })
    if (selectedCustomButtonItemId === itemId) setSelectedCustomButtonItemId(null)
  }

  function addControlItemOption(tabId: string, controlId: string, itemId: string, option: string) {
    const items = getControlItems(tabId, controlId)
    const item = items.find((x) => x.id === itemId)
    if (!item || !option.trim()) return
    const opts = item.options ?? []
    if (opts.includes(option.trim())) return
    updateControlItem(tabId, controlId, itemId, { options: [...opts, option.trim()] })
  }

  function removeControlItemOption(tabId: string, controlId: string, itemId: string, index: number) {
    setHasRemovedSomething(true)
    const item = getControlItems(tabId, controlId).find((x) => x.id === itemId)
    if (!item?.options) return
    updateControlItem(tabId, controlId, itemId, { options: item.options.filter((_, i) => i !== index) })
  }

  function getCustomActionButtons(): CustomActionButton[] {
    return getCustomActionButtonsFromConfig(config, previewPage)
  }

  function getCustomActionButton(id: string): CustomActionButton | undefined {
    return getCustomActionButtons().find((b) => b.id === id)
  }

  function updateCustomActionButton(id: string, updates: Partial<CustomActionButton>) {
    const arr = getCustomActionButtons()
    const next = arr.map((b) => (b.id === id ? { ...b, ...updates } : b))
    if (previewPage === "leads") {
      setConfig({ ...config, customActionButtons: next })
    } else {
      setConfig({ ...config, customActionButtonsByTab: { ...config.customActionButtonsByTab, [previewPage]: next } })
    }
  }

  function addCustomActionButtonItem(buttonId: string, item: PortalSettingItem) {
    const btn = getCustomActionButton(buttonId)
    if (!btn || btn.items.some((x) => x.id === item.id)) return
    updateCustomActionButton(buttonId, { items: [...btn.items, item] })
  }

  function setCustomActionButtonItemVisible(buttonId: string, itemId: string, visibleToUser: boolean) {
    const btn = getCustomActionButton(buttonId)
    if (!btn) return
    updateCustomActionButton(buttonId, {
      items: btn.items.map((x) => (x.id === itemId ? { ...x, visibleToUser } : x)),
    })
  }

  function updateCustomActionButtonItem(buttonId: string, itemId: string, updates: Partial<PortalSettingItem>) {
    const btn = getCustomActionButton(buttonId)
    if (!btn) return
    updateCustomActionButton(buttonId, {
      items: btn.items.map((x) => (x.id === itemId ? sanitizePortalSettingItemDependencies({ ...x, ...updates }) : x)),
    })
  }

  function addCustomActionButtonItemOption(buttonId: string, itemId: string, option: string) {
    const btn = getCustomActionButton(buttonId)
    const item = btn?.items.find((x) => x.id === itemId)
    if (!item || !option.trim()) return
    const opts = item.options ?? []
    if (opts.includes(option.trim())) return
    updateCustomActionButtonItem(buttonId, itemId, { options: [...opts, option.trim()] })
  }

  function removeCustomActionButtonItemOption(buttonId: string, itemId: string, index: number) {
    setHasRemovedSomething(true)
    const btn = getCustomActionButton(buttonId)
    const item = btn?.items.find((x) => x.id === itemId)
    if (!item?.options) return
    updateCustomActionButtonItem(buttonId, itemId, { options: item.options.filter((_, i) => i !== index) })
  }

  const pageControls: PageControl[] = PAGE_CONTROLS[previewPage] ?? []
  const showGlobalToggles = previewPage === "dashboard" || pageControls.length === 0
  const selectedControlForPage =
    selectedControl?.tab === previewPage ? selectedControl.controlId : null
  const selectedControlMeta =
    selectedControlForPage && !selectedControlForPage.startsWith("custom_action_button:")
      ? pageControls.find((c) => c.id === selectedControlForPage)
      : null

  useEffect(() => {
    setSelectedCustomButtonItemId(null)
    setSelectedControlItemId(null)
  }, [selectedControlForPage])

  const labelStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    marginBottom: 4,
    background: theme.background,
    borderRadius: 6,
    cursor: "pointer",
    border: `1px solid ${theme.border}`,
  }

  const visibleTabs = getVisibleTabs(config)

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Admin sidebar */}
      <aside style={{ width: 260, background: theme.charcoalSmoke, padding: 20, color: "white", flexShrink: 0 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Admin</h2>
        <AdminSettingBlock id="admin:sidebar:nav" variant="dark">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setAdminPanel("signup")}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid rgba(255,255,255,0.35)`,
              background: adminPanel === "signup" ? "rgba(249,115,22,0.45)" : "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: adminPanel === "signup" ? 600 : 400,
              textAlign: "left",
            }}
          >
            Sign up requirements
          </button>
          <button
            type="button"
            onClick={() => setAdminPanel("communications")}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid rgba(255,255,255,0.35)`,
              background: adminPanel === "communications" ? "rgba(249,115,22,0.45)" : "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: adminPanel === "communications" ? 600 : 400,
              textAlign: "left",
            }}
          >
            Routing &amp; Access
          </button>
          <button
            type="button"
            onClick={() => setAdminPanel("users")}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid rgba(255,255,255,0.35)`,
              background: adminPanel === "users" ? "rgba(249,115,22,0.45)" : "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: adminPanel === "users" ? 600 : 400,
              textAlign: "left",
            }}
          >
            Users &amp; office managers
          </button>
          <button
            type="button"
            onClick={() => setAdminPanel("portal")}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid rgba(255,255,255,0.35)`,
              background: adminPanel === "portal" ? "rgba(249,115,22,0.45)" : "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: adminPanel === "portal" ? 600 : 400,
              textAlign: "left",
            }}
          >
            Portal builder
          </button>
          <button
            type="button"
            onClick={() => setAdminPanel("tickets")}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid rgba(255,255,255,0.35)`,
              background: adminPanel === "tickets" ? "rgba(249,115,22,0.45)" : "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: adminPanel === "tickets" ? 600 : 400,
              textAlign: "left",
            }}
          >
            Trouble tickets
          </button>
          <button
            type="button"
            onClick={() => setAdminPanel("about")}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid rgba(255,255,255,0.35)`,
              background: adminPanel === "about" ? "rgba(249,115,22,0.45)" : "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: adminPanel === "about" ? 600 : 400,
              textAlign: "left",
            }}
          >
            About Us page
          </button>
        </div>
        </AdminSettingBlock>
        {(adminPanel === "portal" || adminPanel === "communications") && (
        <AdminSettingBlock id="admin:sidebar:portal_intro" variant="dark">
        <p style={{ fontSize: 12, opacity: 0.85, marginBottom: 12 }}>
          Pick a person or an audience row (all profiles, all users with role user, all office managers, etc.) for portal defaults. Routing &amp; Access still needs one specific user.
        </p>
        </AdminSettingBlock>
        )}
        {(adminPanel === "portal" || adminPanel === "communications") && (
        <AdminSettingBlock id="admin:sidebar:user_selector" variant="dark">
        <div style={{ display: "block", marginBottom: 16, position: "relative" }}>
          <span style={{ fontSize: 11, opacity: 0.8, display: "block", marginBottom: 4 }}>User (profile)</span>
          <input
            type="text"
            value={userDropdownOpen ? userSearchQuery : selectedDisplayLabel}
            onChange={(e) => {
              setUserSearchQuery(e.target.value)
              setUserDropdownOpen(true)
            }}
            onFocus={() => { setUserDropdownOpen(true); setUserSearchQuery("") }}
            onBlur={() => setTimeout(() => setUserDropdownOpen(false), 200)}
            placeholder="Search or select user..."
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
          {userDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                maxHeight: 220,
                overflow: "auto",
                background: theme.charcoalSmoke,
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                zIndex: 1000,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              <button
                type="button"
                onClick={() => { setSelectedId(ALL_PROFILES_ID); setUserDropdownOpen(false); setUserSearchQuery("") }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 12px",
                  textAlign: "left",
                  background: selectedId === ALL_PROFILES_ID ? "rgba(249,115,22,0.3)" : "transparent",
                  border: "none",
                  color: "white",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {labelForPortalAudience(ALL_PROFILES_ID)}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedId(ALL_USERS_ID); setUserDropdownOpen(false); setUserSearchQuery("") }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 12px",
                  textAlign: "left",
                  background: selectedId === ALL_USERS_ID ? "rgba(249,115,22,0.3)" : "transparent",
                  border: "none",
                  color: "white",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {labelForPortalAudience(ALL_USERS_ID)}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedId(ALL_OFFICE_MANAGERS_ID); setUserDropdownOpen(false); setUserSearchQuery("") }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 12px",
                  textAlign: "left",
                  background: selectedId === ALL_OFFICE_MANAGERS_ID ? "rgba(249,115,22,0.3)" : "transparent",
                  border: "none",
                  color: "white",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {labelForPortalAudience(ALL_OFFICE_MANAGERS_ID)}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedId(ALL_NEW_USERS_ID); setUserDropdownOpen(false); setUserSearchQuery("") }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 12px",
                  textAlign: "left",
                  background: selectedId === ALL_NEW_USERS_ID ? "rgba(249,115,22,0.3)" : "transparent",
                  border: "none",
                  color: "white",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {labelForPortalAudience(ALL_NEW_USERS_ID)}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedId(ALL_ADMINS_ID); setUserDropdownOpen(false); setUserSearchQuery("") }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 12px",
                  textAlign: "left",
                  background: selectedId === ALL_ADMINS_ID ? "rgba(249,115,22,0.3)" : "transparent",
                  border: "none",
                  color: "white",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {labelForPortalAudience(ALL_ADMINS_ID)}
              </button>
              {filteredProfiles.length === 0 && (
                <div style={{ padding: "10px 12px", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>No matching users</div>
              )}
              {filteredProfiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setSelectedId(p.id); setUserDropdownOpen(false); setUserSearchQuery("") }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 12px",
                    textAlign: "left",
                    background: selectedId === p.id ? "rgba(249,115,22,0.3)" : "transparent",
                    border: "none",
                    color: "white",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {profileOptionLabel(p)}
                </button>
              ))}
            </div>
          )}
        </div>
        </AdminSettingBlock>
        )}

        <AdminSettingBlock id="admin:sidebar:account" variant="dark">
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
        </AdminSettingBlock>
      </aside>

      <main style={{ flex: 1, padding: 24, background: theme.background, overflow: "auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {adminPanel === "users" ? (
          <div>
            <AdminSettingBlock id="admin:users:page_intro">
            <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Users & office managers</h1>
            <p style={{ color: theme.text, opacity: 0.8, marginBottom: 20, fontSize: 14 }}>
              Assign each <strong>user</strong> to an <strong>office manager</strong> (or admin) so they appear in the office manager portal. This is not in the Supabase dashboard—it lives here in the app.
            </p>
            </AdminSettingBlock>
            <AdminUsersSection />
          </div>
        ) : adminPanel === "communications" ? (
          <AdminCommunicationsSection
            mode={communicationsMode}
            selectedUserId={communicationsSelectedUserId}
            selectedUserLabel={selectedDisplayLabel}
          />
        ) : adminPanel === "tickets" ? (
          <AdminTroubleTicketsSection />
        ) : adminPanel === "about" ? (
          <AdminAboutUsSection />
        ) : adminPanel === "signup" ? (
          <AdminSignupRequirementsSection />
        ) : loading ? (
          <AdminSettingBlock id="admin:portal:loading_profiles">
          <p style={{ color: theme.text }}>Loading profiles…</p>
          </AdminSettingBlock>
        ) : error && !selectedId ? (
          <AdminSettingBlock id="admin:portal:load_error">
          <p style={{ color: "#b91c1c" }}>{error}</p>
          </AdminSettingBlock>
        ) : !selectedId ? (
          <AdminSettingBlock id="admin:portal:no_user_selected">
          <p style={{ color: theme.text, opacity: 0.8 }}>Create a user above or run supabase-profiles-roles.sql and add a user, then select one.</p>
          </AdminSettingBlock>
        ) : (
          <>
            <AdminSettingBlock id="admin:portal:header">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <h1 style={{ color: theme.text, margin: 0 }}>
                Portal config for{" "}
                {isBulkPortalAudienceId(selectedId ?? "")
                  ? labelForPortalAudience(selectedId!)
                  : selectedProfile
                    ? profileOptionLabel(selectedProfile)
                    : "User"}
              </h1>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "10px 20px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: saving ? "wait" : "pointer",
                }}
              >
                {saving ? "Saving…" : "Save portal config"}
              </button>
            </div>
            {message && <p style={{ color: "#059669", margin: 0 }}>{message}</p>}
            {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
            </AdminSettingBlock>

            <AdminPortalAssistant
              previewPage={previewPage}
              selectedControl={selectedControl?.tab === previewPage ? selectedControl : null}
              config={config}
              onApplyControlItems={(tabId, controlId, items) => {
                setControlItems(tabId, controlId, items)
                setPreviewPage(tabId)
                setSelectedControl({ tab: tabId, controlId })
              }}
              onApplyControlItemsPatch={applyControlItemsPatchFromAssistant}
            />

            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
              {/* Preview: looks like the real user portal */}
              <AdminSettingBlock id="admin:portal:preview_panel">
              <section
                style={{
                  flex: "1 1 420px",
                  minWidth: 320,
                  maxWidth: 560,
                  border: `2px solid ${theme.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: theme.background,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ fontSize: 11, padding: "6px 12px", background: theme.charcoalSmoke, color: "rgba(255,255,255,0.8)" }}>
                  Preview — what this user sees
                </div>
                <div style={{ display: "flex", height: 620, minHeight: 620 }}>
                  <div style={{ flexShrink: 0, height: "100%" }}>
                    <div style={{ height: "100%", overflow: "auto" }}>
                      <Sidebar
                        setPage={setPreviewPage}
                        portalTabs={visibleTabs.length > 0 ? visibleTabs : undefined}
                      />
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: 16, overflow: "auto", background: "rgba(0,0,0,0.02)", display: "flex", flexDirection: "column", gap: 12 }}>
                    {(() => {
                      const prev = getPreviewForTab(
                        previewPage,
                        config,
                        (id) => setSelectedControl({ tab: previewPage, controlId: id }),
                        selectedControlForPage
                      )
                      return (
                        <>
                          <div>
                            <h2 style={{ color: theme.text, margin: "0 0 4px", fontSize: 16 }}>{prev.title}</h2>
                            <p style={{ color: theme.text, opacity: 0.8, margin: 0, fontSize: 12, lineHeight: 1.4 }}>{prev.description}</p>
                          </div>
                          <div style={{ flex: 1, minHeight: 0 }}>{prev.mock}</div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </section>
              </AdminSettingBlock>

              {/* Right side: global toggles when Dashboard (or no page controls), else page controls + options */}
              <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                {showGlobalToggles ? (
                  <>
                    <section style={{ marginBottom: 24 }}>
                      <h2 style={{ color: theme.text, fontSize: 16, marginBottom: 8 }}>Sidebar tabs</h2>
                      <p style={{ fontSize: 12, color: theme.text, opacity: 0.8, margin: "0 0 8px" }}>Drag ⋮⋮ to reorder. Order applies to the user and office manager portals.</p>
                      {getPortalTabListForConfig(config).map(({ tab_id: id, label }, index) => (
                        <AdminSortableRow key={id} scope="portal-sidebar-tabs" index={index} onReorder={reorderSidebarTabs} rowStyle={{ marginBottom: 4 }}>
                        <AdminSettingBlock id={`admin:portal:tab_row:${id}`}>
                        <div style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", margin: 0 }} onClick={() => toggle("tabs", id)}>
                            <input type="checkbox" checked={getVisible(config, "tabs", id)} onChange={() => toggle("tabs", id)} />
                            <span style={{ color: theme.text }}>{label ?? TAB_ID_LABELS[id] ?? id}</span>
                          </label>
                          <button type="button" onClick={(e) => { e.preventDefault(); (config.customTabs ?? []).some((t) => t.id === id) ? removeCustomTab(id) : setConfig(setVisible(config, "tabs", id, false)) }} style={REMOVE_BTN_STYLE}>Remove</button>
                        </div>
                        </AdminSettingBlock>
                        </AdminSortableRow>
                      ))}
                      <AdminSettingBlock id="admin:portal:add_custom_tab">
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input type="text" placeholder="New tab label" value={newTabLabel} onChange={(e) => setNewTabLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomTab(newTabLabel))} style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13 }} />
                        <button type="button" onClick={() => addCustomTab(newTabLabel)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, color: theme.text, cursor: "pointer", fontSize: 13 }}>Add tab</button>
                      </div>
                      </AdminSettingBlock>
                    </section>
                    {previewPage === "account" ? (
                      <section style={{ marginBottom: 24 }}>
                        <h2 style={{ color: theme.text, fontSize: 16, marginBottom: 8 }}>My T (Account) — visible to user</h2>
                        <p style={{ fontSize: 12, color: theme.text, opacity: 0.8, margin: "0 0 10px" }}>
                          Drag ⋮⋮ to reorder blocks on the user&apos;s Account tab. Uncheck to hide. Admins always see the full form in Routing &amp; Access.
                        </p>
                        {getOrderedAccountPortalSections(config).map(({ id, label }, index) => (
                          <AdminSortableRow key={id} scope="portal-account-sections" index={index} onReorder={reorderAccountSections} rowStyle={{ marginBottom: 4 }}>
                          <AdminSettingBlock id={`admin:portal:account_section:${id}`}>
                            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", margin: 0 }} onClick={() => toggleAccountPortalSection(id)}>
                              <input type="checkbox" checked={getAccountSectionVisible(config, id)} onChange={() => toggleAccountPortalSection(id)} />
                              <span style={{ color: theme.text }}>{label}</span>
                            </label>
                          </AdminSettingBlock>
                          </AdminSortableRow>
                        ))}
                      </section>
                    ) : null}
                  </>
                ) : (
                  <>
                    <AdminSettingBlock id={`admin:portal:page_controls_section:${previewPage}`}>
                    <section style={{ marginBottom: 16 }}>
                      <h2 style={{ color: theme.text, fontSize: 16, marginBottom: 8 }}>
                        Controls on {TAB_ID_LABELS[previewPage] ?? previewPage}
                      </h2>
                      <p style={{ fontSize: 12, color: theme.text, opacity: 0.8, marginBottom: 8 }}>Click a control in the preview or below to edit its options.</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {pageControls.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedControl({ tab: previewPage, controlId: c.id })}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: `2px solid ${selectedControlForPage === c.id ? theme.primary : theme.border}`,
                              background: selectedControlForPage === c.id ? theme.primary : theme.background,
                              color: selectedControlForPage === c.id ? "white" : theme.text,
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            {c.label}
                          </button>
                        ))}
                        {getCustomActionButtons().map((b) => {
                          const cid = "custom_action_button:" + b.id
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setSelectedControl({ tab: previewPage, controlId: cid })}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 6,
                                border: `2px solid ${selectedControlForPage === cid ? theme.primary : theme.border}`,
                                background: selectedControlForPage === cid ? theme.primary : theme.background,
                                color: selectedControlForPage === cid ? "white" : theme.text,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              {b.label}
                            </button>
                          )
                        })}
                      </div>
                    </section>
                    </AdminSettingBlock>
                    {selectedControlForPage && (
                      <AdminSettingBlock id={`admin:portal:control_editor:${previewPage}:${selectedControlForPage.replace(/:/g, "_")}`}>
                      <section style={{ marginBottom: 24, padding: 12, background: "rgba(0,0,0,0.03)", borderRadius: 8, border: `1px solid ${theme.border}` }}>
                        <h3 style={{ color: theme.text, fontSize: 14, margin: "0 0 8px" }}>
                          {selectedControlForPage.startsWith("custom_action_button:")
                            ? (getCustomActionButton(selectedControlForPage.replace("custom_action_button:", ""))?.label ?? "Custom button")
                            : (pageControls.find((c) => c.id === selectedControlForPage)?.label ?? selectedControlForPage)}
                        </h3>
                        {selectedControlForPage === "custom_header_button" && (
                          <>
                            <p style={{ fontSize: 11, color: theme.text, opacity: 0.8, marginBottom: 8 }}>Custom buttons appear next to Settings. Drag ⋮⋮ to reorder. Add below; click a button to add/remove checkboxes, dropdowns, and custom fields inside it.</p>
                            <div style={{ margin: "0 0 12px", fontSize: 13, color: theme.text }}>
                              {getCustomActionButtons().map((b, index) => (
                                <AdminSortableRow key={b.id} scope={`custom-actions-${previewPage}`} index={index} onReorder={reorderCustomActionButtonsRow} rowStyle={{ marginBottom: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span>{b.label}</span>
                                  <button type="button" onClick={() => setSelectedControl({ tab: previewPage, controlId: "custom_action_button:" + b.id })} style={{ fontSize: 11, padding: "2px 6px" }}>Edit</button>
                                  <button type="button" onClick={() => removeCustomActionButton(b.id)} style={REMOVE_BTN_STYLE}>Remove</button>
                                </div>
                                </AdminSortableRow>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <input
                                type="text"
                                placeholder="Button label"
                                value={newHeaderButtonLabel}
                                onChange={(e) => setNewHeaderButtonLabel(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomActionButton(newHeaderButtonLabel) } }}
                                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13 }}
                              />
                              <button type="button" onClick={() => addCustomActionButton(newHeaderButtonLabel)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontSize: 13 }}>Add button</button>
                            </div>
                          </>
                        )}
                        {selectedControlForPage.startsWith("custom_action_button:") && (() => {
                          const buttonId = selectedControlForPage.replace("custom_action_button:", "")
                          const btn = getCustomActionButton(buttonId)
                          if (!btn) return null
                          const allBtnItems = btn.items
                          const itemsForButtonBuilder = showPortalItemsHiddenFromAdmin ? allBtnItems : allBtnItems.filter((x) => !x.hideFromAdmin)
                          const hiddenInButtonCount = allBtnItems.filter((x) => x.hideFromAdmin).length
                          const otherItemsInButton = (itemId: string) => allBtnItems.filter((x) => x.id !== itemId)
                          return (
                            <>
                              <p style={{ fontSize: 11, color: theme.text, opacity: 0.8, marginBottom: 8 }}>
                                Button label and items. Edit each item&apos;s <strong>Label</strong> (shown to users unless you add per-tab overrides later). Type, Options, Dependency, visibility — same as other controls.
                              </p>
                              <input
                                type="text"
                                value={btn.label}
                                onChange={(e) => updateCustomActionButton(buttonId, { label: e.target.value })}
                                placeholder="Button label"
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13, marginBottom: 12 }}
                              />
                              <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 6 }}>Items inside this button</p>
                              {hiddenInButtonCount > 0 && (
                                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme.text, marginBottom: 10, cursor: "pointer" }}>
                                  <input type="checkbox" checked={showPortalItemsHiddenFromAdmin} onChange={(e) => setShowPortalItemsHiddenFromAdmin(e.target.checked)} />
                                  <span>Show {hiddenInButtonCount} item{hiddenInButtonCount === 1 ? "" : "s"} hidden from admin</span>
                                </label>
                              )}
                              <div style={{ margin: "0 0 12px", fontSize: 13, color: theme.text }}>
                                {itemsForButtonBuilder.map((item, itemIndex) => {
                                  const isSelected = selectedCustomButtonItemId === item.id
                                  const otherItems = otherItemsInButton(item.id)
                                  return (
                                    <AdminSortableRow key={item.id} scope={`cab-items-${buttonId.replace(/[^a-zA-Z0-9_-]/g, "_")}`} index={itemIndex} onReorder={(from, to) => reorderCustomActionButtonItemsRow(buttonId, from, to)} rowStyle={{ marginBottom: 10 }}>
                                    <div style={{ padding: 8, background: isSelected ? "rgba(0,0,0,0.04)" : "transparent", borderRadius: 6, border: `1px solid ${isSelected ? theme.primary : theme.border}` }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: isSelected ? 8 : 0 }}>
                                        <input
                                          type="text"
                                          title="Label shown to users in this button"
                                          aria-label="Item label"
                                          value={item.label}
                                          onChange={(e) => updateCustomActionButtonItem(buttonId, item.id, { label: e.target.value })}
                                          style={{
                                            minWidth: 140,
                                            flex: "1 1 140px",
                                            padding: "4px 8px",
                                            borderRadius: 6,
                                            border: `1px solid ${theme.border}`,
                                            fontSize: 12,
                                            fontWeight: 500,
                                          }}
                                        />
                                        <select
                                          value={item.type}
                                          onChange={(e) => updateCustomActionButtonItem(buttonId, item.id, { type: e.target.value as PortalSettingItem["type"], options: e.target.value === "dropdown" ? (item.options ?? []) : undefined })}
                                          style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 11 }}
                                        >
                                          <option value="checkbox">Checkbox</option>
                                          <option value="dropdown">Dropdown</option>
                                          <option value="custom_field">Custom field</option>
                                        </select>
                                        {item.type === "dropdown" && (
                                          <button type="button" onClick={() => setSelectedCustomButtonItemId(selectedCustomButtonItemId === item.id ? null : item.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "1px solid #d1d5db", background: "#e5e7eb", color: "#1f2937", cursor: "pointer" }}>
                                            Options ({(item.options ?? []).length}) ▾
                                          </button>
                                        )}
                                        {(item.type === "checkbox" || item.type === "dropdown" || item.type === "custom_field") && (
                                          <button type="button" onClick={() => setSelectedCustomButtonItemId(selectedCustomButtonItemId === item.id ? null : item.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "1px solid #d1d5db", background: "#e5e7eb", color: "#1f2937", cursor: "pointer" }}>
                                            Dependency ▾
                                          </button>
                                        )}
                                        {(item.type === "checkbox" || item.type === "dropdown" || item.type === "custom_field") && (
                                          <span style={{ fontSize: 10, color: theme.text, opacity: 0.8 }}>
                                            {formatPortalItemDependenciesSummary(item, otherItems)}
                                          </span>
                                        )}
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>
                                          <input type="checkbox" checked={item.visibleToUser !== false} onChange={(e) => setCustomActionButtonItemVisible(buttonId, item.id, e.target.checked)} />
                                          <span>Visible to user</span>
                                        </label>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                          <input type="checkbox" checked={item.hideFromAdmin === true} onChange={(e) => updateCustomActionButtonItem(buttonId, item.id, { hideFromAdmin: e.target.checked ? true : undefined })} />
                                          <span>Hide from admin</span>
                                        </label>
                                        <button type="button" onClick={() => removeCustomActionButtonItem(buttonId, item.id)} style={REMOVE_BTN_STYLE}>Remove</button>
                                      </div>
                                      {isSelected && (
                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
                                          {item.type === "dropdown" && (
                                            <div style={{ marginBottom: 8 }}>
                                              <p style={{ fontSize: 11, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Dropdown options</p>
                                              <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 12 }}>
                                                {(item.options ?? []).map((opt, i) => (
                                                  <li key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span>{opt}</span>
                                                    <button type="button" onClick={() => removeCustomActionButtonItemOption(buttonId, item.id, i)} style={REMOVE_BTN_STYLE_SMALL}>Remove</button>
                                                  </li>
                                                ))}
                                              </ul>
                                              <div style={{ display: "flex", gap: 6 }}>
                                                <input type="text" placeholder="Add option" value={newDropdownOptionValue} onChange={(e) => setNewDropdownOptionValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomActionButtonItemOption(buttonId, item.id, newDropdownOptionValue); setNewDropdownOptionValue(""); } }} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }} />
                                                <button type="button" onClick={() => { addCustomActionButtonItemOption(buttonId, item.id, newDropdownOptionValue); setNewDropdownOptionValue(""); }} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, color: theme.text, cursor: "pointer", fontSize: 12 }}>Add</button>
                                              </div>
                                            </div>
                                          )}
                                          <PortalItemDependencyEditor
                                            item={item}
                                            siblingItems={otherItems}
                                            onApply={(patch) => updateCustomActionButtonItem(buttonId, item.id, patch)}
                                          />
                                          <button type="button" onClick={() => setSelectedCustomButtonItemId(null)} style={{ marginTop: 6, padding: "4px 10px", fontSize: 11, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, color: theme.text, cursor: "pointer" }}>Done</button>
                                        </div>
                                      )}
                                    </div>
                                    </AdminSortableRow>
                                  )
                                })}
                              </div>
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
                                <p style={{ fontSize: 11, color: theme.text, marginBottom: 6 }}>Add item</p>
                                <input type="text" placeholder="Label" value={newSettingItemLabel} onChange={(e) => setNewSettingItemLabel(e.target.value)} style={{ width: "100%", padding: "6px 8px", marginBottom: 6, borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }} />
                                <select value={newSettingItemType} onChange={(e) => setNewSettingItemType(e.target.value as 'checkbox' | 'dropdown' | 'custom_field')} style={{ width: "100%", padding: "6px 8px", marginBottom: 6, borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }}>
                                  <option value="checkbox">Checkbox</option>
                                  <option value="dropdown">Dropdown</option>
                                  <option value="custom_field">Custom field (text/textarea)</option>
                                </select>
                                {newSettingItemType === "dropdown" && <input type="text" placeholder="Options (comma-separated)" value={newSettingItemOptions} onChange={(e) => setNewSettingItemOptions(e.target.value)} style={{ width: "100%", padding: "6px 8px", marginBottom: 6, borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }} />}
                                <button type="button" onClick={() => { const id = (newSettingItemLabel.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "") || "item-" + Date.now()); addCustomActionButtonItem(buttonId, { id, type: newSettingItemType, label: newSettingItemLabel.trim() || "Item", options: newSettingItemType === "dropdown" && newSettingItemOptions ? newSettingItemOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined }); setNewSettingItemLabel(""); setNewSettingItemOptions(""); }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, color: theme.text, cursor: "pointer", fontSize: 12 }}>Add</button>
                              </div>
                            </>
                          )
                        })()}
                        {selectedControlForPage === "page_title" && (
                          <p style={{ fontSize: 11, color: theme.text, opacity: 0.8 }}>Page title. Custom buttons are next to Settings.</p>
                        )}
                        {selectedControlMeta?.type === "button" && selectedControlForPage && (
                          <>
                            <p style={{ fontSize: 11, color: theme.text, opacity: 0.8, marginBottom: 8 }}>Button label and visibility for this standard action button.</p>
                            <input
                              type="text"
                              value={config.controlLabels?.[selectedControlForPage] ?? selectedControlMeta.label}
                              onChange={(e) => setControlLabel(selectedControlForPage, e.target.value)}
                              placeholder={selectedControlMeta.label}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13, marginBottom: 8 }}
                            />
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme.text, marginBottom: 10, cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={config.pageActions?.[previewPage]?.[selectedControlForPage] !== false}
                                onChange={(e) => setPageActionVisible(previewPage, selectedControlForPage, e.target.checked)}
                              />
                              <span>Visible to user</span>
                            </label>
                          </>
                        )}
                        {previewPage === "calendar" && selectedControlForPage === "customize_user" && (
                          <>
                            <p style={{ fontSize: 11, color: theme.text, opacity: 0.8, marginBottom: 10 }}>
                              Stored in <code style={{ fontSize: 10 }}>user_calendar_preferences</code> (not in portal JSON). Add optional checkboxes here only if you later wire them in code; ribbon and auto-assign are edited below.
                            </p>
                            <CalendarUserPreferencesEditor
                              profiles={profiles.map((p) => ({ id: p.id, display_name: p.display_name, email: p.email ?? null }))}
                              defaultUserId={selectedId && isProfileUserId(selectedId) ? selectedId : null}
                            />
                          </>
                        )}
                        {(() => {
                          const isItemsControl =
                            selectedControlForPage &&
                            selectedControlForPage !== "page_title" &&
                            selectedControlForPage !== "table_columns" &&
                            selectedControlForPage !== "custom_header_button" &&
                            selectedControlForPage !== "customize_user" &&
                            !selectedControlForPage.startsWith("custom_action_button:")
                          if (!isItemsControl) return null
                          const tabId = previewPage
                          const controlId = selectedControlForPage
                          const allItems = getControlItems(tabId, controlId)
                          const itemsForBuilderList = showPortalItemsHiddenFromAdmin ? allItems : allItems.filter((x) => !x.hideFromAdmin)
                          const hiddenPortalItemCount = allItems.filter((x) => x.hideFromAdmin).length
                          const otherItemsFor = (itemId: string) => allItems.filter((x) => x.id !== itemId)
                          return (
                          <>
                            <p style={{ fontSize: 11, color: theme.text, opacity: 0.8, marginBottom: 8 }}>
                              Drag ⋮⋮ to reorder. <strong>Label</strong> is what users see in the portal (and here). Item <code style={{ fontSize: 10 }}>id</code> is fixed for automations — only change the label text to summarize settings. Options, Dependency, visibility — same on every tab.
                            </p>
                            {hiddenPortalItemCount > 0 && (
                              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme.text, marginBottom: 10, cursor: "pointer" }}>
                                <input type="checkbox" checked={showPortalItemsHiddenFromAdmin} onChange={(e) => setShowPortalItemsHiddenFromAdmin(e.target.checked)} />
                                <span>Show {hiddenPortalItemCount} item{hiddenPortalItemCount === 1 ? "" : "s"} hidden from admin ({showPortalItemsHiddenFromAdmin ? "visible" : "concealed"})</span>
                              </label>
                            )}
                            <div style={{ margin: "0 0 12px", fontSize: 13, color: theme.text }}>
                              {itemsForBuilderList.map((item, itemIndex) => {
                                const isSelected = selectedControlItemId === item.id
                                const otherItems = otherItemsFor(item.id)
                                const ctlScope = `ctl-${tabId}-${controlId}`.replace(/[^a-zA-Z0-9_-]/g, "_")
                                return (
                                  <AdminSortableRow key={item.id} scope={ctlScope} index={itemIndex} onReorder={(from, to) => reorderControlItemsRow(tabId, controlId, from, to)} rowStyle={{ marginBottom: 10 }}>
                                  <div style={{ padding: 8, background: isSelected ? "rgba(0,0,0,0.04)" : "transparent", borderRadius: 6, border: `1px solid ${isSelected ? theme.primary : theme.border}` }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: isSelected ? 8 : 0 }}>
                                      <input
                                        type="text"
                                        title="Label shown to users in the portal and in this admin list"
                                        aria-label="Item label"
                                        value={item.label}
                                        onChange={(e) => updateControlItem(tabId, controlId, item.id, { label: e.target.value })}
                                        style={{
                                          minWidth: 200,
                                          flex: "1 1 200px",
                                          padding: "4px 8px",
                                          borderRadius: 6,
                                          border: `1px solid ${theme.border}`,
                                          fontSize: 12,
                                          fontWeight: 500,
                                        }}
                                      />
                                      <select
                                        value={item.type}
                                        onChange={(e) => updateControlItem(tabId, controlId, item.id, { type: e.target.value as PortalSettingItem["type"], options: e.target.value === "dropdown" ? (item.options ?? []) : undefined })}
                                        style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 11 }}
                                      >
                                        <option value="checkbox">Checkbox</option>
                                        <option value="dropdown">Dropdown</option>
                                        <option value="custom_field">Custom field</option>
                                      </select>
                                      {item.type === "dropdown" && (
                                        <button type="button" onClick={() => setSelectedControlItemId(selectedControlItemId === item.id ? null : item.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "1px solid #d1d5db", background: "#e5e7eb", color: "#1f2937", cursor: "pointer" }}>
                                          Options ({(item.options ?? []).length}) ▾
                                        </button>
                                      )}
                                      {(item.type === "checkbox" || item.type === "dropdown" || item.type === "custom_field") && (
                                        <button type="button" onClick={() => setSelectedControlItemId(selectedControlItemId === item.id ? null : item.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "1px solid #d1d5db", background: "#e5e7eb", color: "#1f2937", cursor: "pointer" }}>
                                          Dependency ▾
                                        </button>
                                      )}
                                      {(item.type === "checkbox" || item.type === "dropdown" || item.type === "custom_field") && (
                                        <span style={{ fontSize: 10, color: theme.text, opacity: 0.8 }}>
                                          {formatPortalItemDependenciesSummary(item, otherItems)}
                                        </span>
                                      )}
                                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>
                                        <input type="checkbox" checked={item.visibleToUser !== false} onChange={(e) => setControlItemVisible(tabId, controlId, item.id, e.target.checked)} />
                                        <span>Visible to user</span>
                                      </label>
                                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                                        <input type="checkbox" checked={item.hideFromAdmin === true} onChange={(e) => updateControlItem(tabId, controlId, item.id, { hideFromAdmin: e.target.checked ? true : undefined })} />
                                        <span>Hide from admin</span>
                                      </label>
                                      <button type="button" onClick={() => removeControlItem(tabId, controlId, item.id)} style={REMOVE_BTN_STYLE}>Remove</button>
                                    </div>
                                    {isSelected && (
                                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
                                        {item.type === "dropdown" && (
                                          <div style={{ marginBottom: 8 }}>
                                            <p style={{ fontSize: 11, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Dropdown options</p>
                                            <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 12 }}>
                                              {(item.options ?? []).map((opt, i) => (
                                                <li key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                  <span>{opt}</span>
                                                  <button type="button" onClick={() => removeControlItemOption(tabId, controlId, item.id, i)} style={REMOVE_BTN_STYLE_SMALL}>Remove</button>
                                                </li>
                                              ))}
                                            </ul>
                                            <div style={{ display: "flex", gap: 6 }}>
                                              <input type="text" placeholder="Add option" value={newDropdownOptionValue} onChange={(e) => setNewDropdownOptionValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addControlItemOption(tabId, controlId, item.id, newDropdownOptionValue); setNewDropdownOptionValue(""); } }} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }} />
                                              <button type="button" onClick={() => { addControlItemOption(tabId, controlId, item.id, newDropdownOptionValue); setNewDropdownOptionValue(""); }} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, color: theme.text, cursor: "pointer", fontSize: 12 }}>Add</button>
                                            </div>
                                          </div>
                                        )}
                                        <PortalItemDependencyEditor
                                          item={item}
                                          siblingItems={otherItems}
                                          onApply={(patch) => updateControlItem(tabId, controlId, item.id, patch)}
                                        />
                                        <button type="button" onClick={() => setSelectedControlItemId(null)} style={{ marginTop: 6, padding: "4px 10px", fontSize: 11, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, color: theme.text, cursor: "pointer" }}>Done</button>
                                      </div>
                                    )}
                                  </div>
                                  </AdminSortableRow>
                                )
                              })}
                            </div>
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
                              <p style={{ fontSize: 11, color: theme.text, marginBottom: 6 }}>Add item</p>
                              <input type="text" placeholder="Label" value={newSettingItemLabel} onChange={(e) => setNewSettingItemLabel(e.target.value)} style={{ width: "100%", padding: "6px 8px", marginBottom: 6, borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }} />
                              <select value={newSettingItemType} onChange={(e) => setNewSettingItemType(e.target.value as 'checkbox' | 'dropdown' | 'custom_field')} style={{ width: "100%", padding: "6px 8px", marginBottom: 6, borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }}>
                                <option value="checkbox">Checkbox</option>
                                <option value="dropdown">Dropdown</option>
                                <option value="custom_field">Custom field (text/textarea)</option>
                              </select>
                              {newSettingItemType === "dropdown" && <input type="text" placeholder="Options (comma-separated)" value={newSettingItemOptions} onChange={(e) => setNewSettingItemOptions(e.target.value)} style={{ width: "100%", padding: "6px 8px", marginBottom: 6, borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 12 }} />}
                              <button type="button" onClick={() => { const id = (newSettingItemLabel.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "") || "item-" + Date.now()); addControlItem(tabId, controlId, { id, type: newSettingItemType, label: newSettingItemLabel.trim() || "Item", options: newSettingItemType === "dropdown" && newSettingItemOptions ? newSettingItemOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined }); setNewSettingItemLabel(""); setNewSettingItemOptions(""); }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, color: theme.text, cursor: "pointer", fontSize: 12 }}>Add</button>
                            </div>
                          </>
                          )
                        })()}
                        {selectedControlForPage === "table_columns" && (
                          <>
                            <p style={{ fontSize: 11, color: theme.text, opacity: 0.8, marginBottom: 8 }}>Drag ⋮⋮ to reorder columns. Remove to hide; add back below.</p>
                            <div style={{ margin: "0 0 12px", fontSize: 13, color: theme.text }}>
                              {getOptionValues("leads_table_columns").map((colId, i) => (
                                <AdminSortableRow key={colId} scope="leads-table-columns" index={i} onReorder={(from, to) => reorderOptionValues("leads_table_columns", from, to)} rowStyle={{ marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span>{LEADS_TABLE_COLUMN_LABELS[colId] ?? colId}</span>
                                  <button type="button" onClick={() => removeOptionValue("leads_table_columns", i)} style={REMOVE_BTN_STYLE}>Remove</button>
                                </div>
                                </AdminSortableRow>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {(LEADS_TABLE_COLUMN_IDS as readonly string[]).filter((colId) => !getOptionValues("leads_table_columns").includes(colId)).map((colId) => (
                                <button key={colId} type="button" onClick={() => addOptionValue("leads_table_columns", colId)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontSize: 12 }}>{LEADS_TABLE_COLUMN_LABELS[colId] ?? colId}</button>
                              ))}
                            </div>
                          </>
                        )}
                      </section>
                      </AdminSettingBlock>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
        <AdminVisibilityFooter />
        <CopyrightVersionFooter variant="default" />
      </main>
    </div>
  )
}
