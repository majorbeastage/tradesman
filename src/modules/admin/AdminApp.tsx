import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useView } from "../../contexts/ViewContext"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import Sidebar from "../../components/Sidebar"
import type { PortalConfig, PortalCustomItem, PageControl } from "../../types/portal-builder"
import {
  USER_PORTAL_TAB_IDS,
  TAB_ID_LABELS,
  PORTAL_SETTING_KEYS,
  PORTAL_SETTING_LABELS,
  PORTAL_DROPDOWN_KEYS,
  PORTAL_DROPDOWN_LABELS,
  PAGE_CONTROLS,
  DEFAULT_OPTIONS,
} from "../../types/portal-builder"

type ProfileRow = {
  id: string
  role: string
  display_name: string | null
  portal_config: PortalConfig | null
  /** From admin_users_list when available */
  email?: string | null
}

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

function setVisible(config: PortalConfig, section: "tabs" | "settings" | "dropdowns", key: string, value: boolean): PortalConfig {
  const next = { ...config }
  if (!next[section]) next[section] = {}
  next[section] = { ...next[section], [key]: value }
  return next
}

/** All tab ids (default + custom) for current config */
function getAllTabIds(config: PortalConfig): { id: string; label: string }[] {
  const defaultTabs = USER_PORTAL_TAB_IDS.map((id) => ({ id, label: TAB_ID_LABELS[id] ?? id }))
  const custom = (config.customTabs ?? []).map((t) => ({ id: t.id, label: t.label }))
  return [...defaultTabs, ...custom]
}

/** Visible tabs only, for sidebar preview / app */
function getVisibleTabs(config: PortalConfig): Array<{ tab_id: string; label: string | null }> {
  const all = getAllTabIds(config)
  return all
    .filter((t) => getVisible(config, "tabs", t.id))
    .map((t) => ({ tab_id: t.id, label: t.label }))
}

function getAllSettingIds(config: PortalConfig): { id: string; label: string }[] {
  const default_ = PORTAL_SETTING_KEYS.map((id) => ({ id, label: PORTAL_SETTING_LABELS[id] ?? id }))
  const custom = (config.customSettings ?? []).map((t) => ({ id: t.id, label: t.label }))
  return [...default_, ...custom]
}

function getAllDropdownIds(config: PortalConfig): { id: string; label: string }[] {
  const default_ = PORTAL_DROPDOWN_KEYS.map((id) => ({ id, label: PORTAL_DROPDOWN_LABELS[id] ?? id }))
  const custom = (config.customDropdowns ?? []).map((t) => ({ id: t.id, label: t.label }))
  return [...default_, ...custom]
}

type MockFn = (onSelect: (controlId: string) => void, selectedId: string | null) => React.ReactNode

/** What each tab shows in the real app; mock can be static or a function for clickable controls */
const TAB_PREVIEW: Record<string, { title: string; description: string; mock: React.ReactNode | MockFn }> = {
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
    description: "Click a button or dropdown below to edit its options on the right.",
    mock: ((onSelect, selectedId) => {
      const btn = (id: string, label: string, primary?: boolean) => (
        <button
          key={id}
          type="button"
          onClick={(e) => { e.preventDefault(); onSelect(id) }}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: `2px solid ${selectedId === id ? theme.primary : theme.border}`,
            background: selectedId === id ? theme.primary : primary ? theme.primary : theme.background,
            color: selectedId === id || primary ? "white" : theme.text,
            fontSize: 12,
            cursor: "pointer",
            fontWeight: selectedId === id ? 600 : 400,
          }}
        >
          {label}
        </button>
      )
      return (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", background: theme.charcoalSmoke, color: "white", fontSize: 12, fontWeight: 600 }}>Leads</div>
          <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {btn("filter", "Filter")}
            {btn("add_lead", "+ Add lead", true)}
            <span style={{ fontSize: 11, color: theme.text, opacity: 0.8 }}>Dropdowns:</span>
            {btn("lead_source", "Lead source")}
            {btn("status", "Status")}
            {btn("priority", "Priority")}
          </div>
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${theme.border}`, fontSize: 12, color: theme.text }}>
            Name · Source · Status · Date
          </div>
          <div style={{ padding: "12px", fontSize: 12, color: theme.text, opacity: 0.7 }}>Lead list rows appear here</div>
        </div>
      )
    }) as MockFn,
  },
  conversations: {
    title: "Conversations",
    description: "Click a control to edit its options on the right.",
    mock: ((onSelect, selectedId) => (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", background: theme.charcoalSmoke, color: "white", fontSize: 12 }}>Conversations</div>
        <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onSelect("conversation_settings")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "conversation_settings" ? theme.primary : theme.border}`, background: selectedId === "conversation_settings" ? theme.primary : theme.background, color: selectedId === "conversation_settings" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Conversation settings</button>
        </div>
        <div style={{ padding: 12, fontSize: 12, color: theme.text, opacity: 0.8 }}>Thread list · Reply</div>
      </div>
    )) as MockFn,
  },
  quotes: {
    title: "Quotes",
    description: "Click a control to edit its options on the right.",
    mock: ((onSelect, selectedId) => (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", background: theme.charcoalSmoke, color: "white", fontSize: 12 }}>Quotes</div>
        <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onSelect("quote_settings")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "quote_settings" ? theme.primary : theme.border}`, background: selectedId === "quote_settings" ? theme.primary : theme.background, color: selectedId === "quote_settings" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Quote settings</button>
          <button type="button" onClick={() => onSelect("status")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "status" ? theme.primary : theme.border}`, background: selectedId === "status" ? theme.primary : theme.background, color: selectedId === "status" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Status</button>
        </div>
      </div>
    )) as MockFn,
  },
  calendar: {
    title: "Calendar",
    description: "Click a control to edit its options on the right.",
    mock: ((onSelect, selectedId) => (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", background: theme.charcoalSmoke, color: "white", fontSize: 12 }}>Calendar</div>
        <div style={{ padding: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onSelect("working_hours")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "working_hours" ? theme.primary : theme.border}`, background: selectedId === "working_hours" ? theme.primary : theme.background, color: selectedId === "working_hours" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Working hours</button>
          <button type="button" onClick={() => onSelect("job_type")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "job_type" ? theme.primary : theme.border}`, background: selectedId === "job_type" ? theme.primary : theme.background, color: selectedId === "job_type" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Job type</button>
        </div>
        <div style={{ padding: 8, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 11, color: theme.text }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} style={{ padding: 4, textAlign: "center", border: `1px solid ${theme.border}`, borderRadius: 4 }}>{d}</div>
          ))}
        </div>
      </div>
    )) as MockFn,
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
    mock: ((onSelect, selectedId) => (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", background: theme.charcoalSmoke, color: "white", fontSize: 12 }}>Settings</div>
        <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onSelect("custom_fields")} style={{ padding: "6px 12px", borderRadius: 6, border: `2px solid ${selectedId === "custom_fields" ? theme.primary : theme.border}`, background: selectedId === "custom_fields" ? theme.primary : theme.background, color: selectedId === "custom_fields" ? "white" : theme.text, fontSize: 12, cursor: "pointer" }}>Custom fields</button>
        </div>
      </div>
    )) as MockFn,
  },
}

function getPreviewForTab(
  tabId: string,
  config: PortalConfig,
  onSelectControl?: (controlId: string) => void,
  selectedControlId?: string | null
): { title: string; description: string; mock: React.ReactNode } {
  const builtIn = TAB_PREVIEW[tabId]
  if (builtIn) {
    const mock: React.ReactNode =
      typeof builtIn.mock === "function"
        ? builtIn.mock(onSelectControl ?? (() => {}), selectedControlId ?? null)
        : builtIn.mock
    return { title: builtIn.title, description: builtIn.description, mock }
  }
  const custom = (config.customTabs ?? []).find((t) => t.id === tabId)
  return {
    title: custom?.label ?? tabId,
    description: "Custom section added by admin. You can add real content for this tab later.",
    mock: <div style={{ padding: 12, fontSize: 12, color: theme.text, opacity: 0.8 }}>Custom section</div>,
  }
}

export default function AdminApp() {
  const { user, signOut } = useAuth()
  const { setView } = useView()
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [config, setConfig] = useState<PortalConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [previewPage, setPreviewPage] = useState("dashboard")

  // Create user
  const [createEmail, setCreateEmail] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createFirstName, setCreateFirstName] = useState("")
  const [createLastName, setCreateLastName] = useState("")
  const [createRole, setCreateRole] = useState<"user" | "office_manager" | "admin">("user")
  const [creating, setCreating] = useState(false)

  // Preview: which control is selected (tab + controlId) for showing options on the right
  const [selectedControl, setSelectedControl] = useState<{ tab: string; controlId: string } | null>(null)

  // Add custom (inline new id/label)
  const [newTabLabel, setNewTabLabel] = useState("")
  const [newSettingLabel, setNewSettingLabel] = useState("")
  const [newDropdownLabel, setNewDropdownLabel] = useState("")
  const [newOptionValue, setNewOptionValue] = useState("")

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
    if (withEmail.length && !selectedId) setSelectedId(withEmail[0].id)
  }, [])

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
      return
    }
    const p = profiles.find((x) => x.id === selectedId)
    setConfig(p?.portal_config ?? {})
  }, [selectedId, profiles])

  // When current preview tab is hidden, switch to first visible tab
  const visibleTabIds = getVisibleTabs(config).map((t) => t.tab_id)
  useEffect(() => {
    if (visibleTabIds.length > 0 && !visibleTabIds.includes(previewPage)) setPreviewPage(visibleTabIds[0])
  }, [visibleTabIds.join(","), previewPage])

  const selectedProfile = profiles.find((p) => p.id === selectedId)

  async function handleSave() {
    if (!supabase || !selectedId) return
    setSaving(true)
    setError("")
    setMessage("")
    const { error: err } = await supabase.from("profiles").update({ portal_config: config }).eq("id", selectedId)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage("Saved. That user's portal will reflect these visibility settings.")
    setProfiles((prev) => prev.map((p) => (p.id === selectedId ? { ...p, portal_config: config } : p)))
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    const email = createEmail.trim()
    if (!email || !createPassword) {
      setError("Email and password required.")
      return
    }
    if (createPassword.length < 6) {
      setError("Password at least 6 characters.")
      return
    }
    if (!supabase) {
      setError("Supabase not configured.")
      return
    }
    setCreating(true)
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: createPassword,
      options: { data: {} },
    })
    if (signUpError) {
      setError(signUpError.message)
      setCreating(false)
      return
    }
    const newUserId = authData.user?.id
    if (!newUserId) {
      setError("User created but could not get id.")
      setCreating(false)
      return
    }
    const displayName = [createFirstName.trim(), createLastName.trim()].filter(Boolean).join(" ").trim() || null
    await supabase
      .from("profiles")
      .upsert(
        { id: newUserId, role: createRole, display_name: displayName, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      )
    setMessage(`User ${displayName || email} created with role ${createRole}.`)
    setCreateEmail("")
    setCreatePassword("")
    setCreateFirstName("")
    setCreateLastName("")
    setCreateRole("user")
    loadProfiles()
    setCreating(false)
  }

  const toggle = (section: "tabs" | "settings" | "dropdowns", key: string) => {
    setConfig(setVisible(config, section, key, !getVisible(config, section, key)))
  }

  function addCustom(section: "customTabs" | "customSettings" | "customDropdowns", label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    const id = trimmed.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "")
    if (!id) return
    const key = section === "customTabs" ? "tabs" : section === "customSettings" ? "settings" : "dropdowns"
    const arr = (config[section] ?? []) as PortalCustomItem[]
    if (arr.some((x) => x.id === id)) return
    const next: PortalConfig = {
      ...config,
      [section]: [...arr, { id, label: trimmed }],
      [key]: { ...config[key], [id]: true },
    }
    setConfig(next)
    if (section === "customTabs") setNewTabLabel("")
    if (section === "customSettings") setNewSettingLabel("")
    if (section === "customDropdowns") setNewDropdownLabel("")
  }

  function removeCustom(section: "customTabs" | "customSettings" | "customDropdowns", id: string) {
    const key = section === "customTabs" ? "tabs" : section === "customSettings" ? "settings" : "dropdowns"
    const arr = ((config[section] ?? []) as PortalCustomItem[]).filter((x) => x.id !== id)
    const next: PortalConfig = { ...config, [section]: arr.length ? arr : undefined }
    const keyObj = { ...next[key] }
    delete keyObj[id]
    next[key] = Object.keys(keyObj).length ? keyObj : undefined
    setConfig(next)
  }

  function getOptionValues(controlId: string): string[] {
    return config.optionValues?.[controlId] ?? DEFAULT_OPTIONS[controlId] ?? []
  }

  function addOptionValue(controlId: string, value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    const current = config.optionValues?.[controlId] ?? []
    if (current.includes(trimmed)) return
    setConfig({
      ...config,
      optionValues: { ...config.optionValues, [controlId]: [...current, trimmed] },
    })
  }

  function removeOptionValue(controlId: string, index: number) {
    const current = getOptionValues(controlId)
    const next = current.filter((_, i) => i !== index)
    const optionValues = { ...config.optionValues, [controlId]: next }
    setConfig({ ...config, optionValues })
  }

  const pageControls: PageControl[] = PAGE_CONTROLS[previewPage] ?? []
  const showGlobalToggles = previewPage === "dashboard" || pageControls.length === 0
  const selectedControlForPage =
    selectedControl?.tab === previewPage ? selectedControl.controlId : null

  const labelStyle: React.CSSProperties = {
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
        <p style={{ fontSize: 12, opacity: 0.85, marginBottom: 12 }}>
          Select a user to configure their portal. Toggle visibility; add custom items below.
        </p>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ fontSize: 11, opacity: 0.8, display: "block", marginBottom: 4 }}>User (profile)</span>
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(0,0,0,0.2)",
              color: "white",
              fontSize: 14,
            }}
          >
            {profiles.length === 0 && <option value="">— No profiles —</option>}
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {profileOptionLabel(p)}
              </option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Create user</h3>
          <form onSubmit={handleCreateUser}>
            <input
              type="text"
              placeholder="First name"
              value={createFirstName}
              onChange={(e) => setCreateFirstName(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                marginBottom: 6,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
            <input
              type="text"
              placeholder="Last name"
              value={createLastName}
              onChange={(e) => setCreateLastName(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                marginBottom: 6,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
            <input
              type="email"
              placeholder="Email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                marginBottom: 6,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
            <input
              type="password"
              placeholder="Password (6+)"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              minLength={6}
              style={{
                width: "100%",
                padding: "6px 8px",
                marginBottom: 6,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as "user" | "office_manager" | "admin")}
              style={{
                width: "100%",
                padding: "6px 8px",
                marginBottom: 8,
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: 12,
              }}
            >
              <option value="user">User</option>
              <option value="office_manager">Office Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={creating}
              style={{
                width: "100%",
                padding: "8px",
                background: "rgba(255,255,255,0.2)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                cursor: creating ? "wait" : "pointer",
                fontSize: 12,
              }}
            >
              {creating ? "Creating…" : "Create user"}
            </button>
          </form>
        </div>

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
      </aside>

      <main style={{ flex: 1, padding: 24, background: theme.background, overflow: "auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {loading ? (
          <p style={{ color: theme.text }}>Loading profiles…</p>
        ) : error && !selectedId ? (
          <p style={{ color: "#b91c1c" }}>{error}</p>
        ) : !selectedId ? (
          <p style={{ color: theme.text, opacity: 0.8 }}>Create a user above or run supabase-profiles-roles.sql and add a user, then select one.</p>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <h1 style={{ color: theme.text, margin: 0 }}>
                Portal config for {selectedProfile ? profileOptionLabel(selectedProfile) : "User"}
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

            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
              {/* Preview: looks like the real user portal */}
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
                <div style={{ display: "flex", height: 380 }}>
                  <div style={{ flexShrink: 0, height: "100%" }}>
                    <div style={{ height: "100%", overflow: "hidden" }}>
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

              {/* Right side: global toggles when Dashboard (or no page controls), else page controls + options */}
              <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                {showGlobalToggles ? (
                  <>
                    <section style={{ marginBottom: 24 }}>
                      <h2 style={{ color: theme.text, fontSize: 16, marginBottom: 8 }}>Sidebar tabs</h2>
                      {getAllTabIds(config).map(({ id, label }) => (
                        <label key={id} style={labelStyle} onClick={() => toggle("tabs", id)}>
                          <input type="checkbox" checked={getVisible(config, "tabs", id)} onChange={() => toggle("tabs", id)} />
                          <span style={{ color: theme.text }}>{label}</span>
                          {(config.customTabs ?? []).some((t) => t.id === id) && (
                            <button type="button" onClick={(e) => { e.preventDefault(); removeCustom("customTabs", id) }} style={{ marginLeft: "auto", fontSize: 11, padding: "2px 6px" }}>Remove</button>
                          )}
                        </label>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input type="text" placeholder="New tab label" value={newTabLabel} onChange={(e) => setNewTabLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom("customTabs", newTabLabel))} style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13 }} />
                        <button type="button" onClick={() => addCustom("customTabs", newTabLabel)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontSize: 13 }}>Add tab</button>
                      </div>
                    </section>
                    <section style={{ marginBottom: 24 }}>
                      <h2 style={{ color: theme.text, fontSize: 16, marginBottom: 8 }}>Settings sections</h2>
                      {getAllSettingIds(config).map(({ id, label }) => (
                        <label key={id} style={labelStyle} onClick={() => toggle("settings", id)}>
                          <input type="checkbox" checked={getVisible(config, "settings", id)} onChange={() => toggle("settings", id)} />
                          <span style={{ color: theme.text }}>{label}</span>
                          {(config.customSettings ?? []).some((t) => t.id === id) && (
                            <button type="button" onClick={(e) => { e.preventDefault(); removeCustom("customSettings", id) }} style={{ marginLeft: "auto", fontSize: 11, padding: "2px 6px" }}>Remove</button>
                          )}
                        </label>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input type="text" placeholder="New setting label" value={newSettingLabel} onChange={(e) => setNewSettingLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom("customSettings", newSettingLabel))} style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13 }} />
                        <button type="button" onClick={() => addCustom("customSettings", newSettingLabel)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontSize: 13 }}>Add</button>
                      </div>
                    </section>
                    <section style={{ marginBottom: 24 }}>
                      <h2 style={{ color: theme.text, fontSize: 16, marginBottom: 8 }}>Dropdowns / options</h2>
                      {getAllDropdownIds(config).map(({ id, label }) => (
                        <label key={id} style={labelStyle} onClick={() => toggle("dropdowns", id)}>
                          <input type="checkbox" checked={getVisible(config, "dropdowns", id)} onChange={() => toggle("dropdowns", id)} />
                          <span style={{ color: theme.text }}>{label}</span>
                          {(config.customDropdowns ?? []).some((t) => t.id === id) && (
                            <button type="button" onClick={(e) => { e.preventDefault(); removeCustom("customDropdowns", id) }} style={{ marginLeft: "auto", fontSize: 11, padding: "2px 6px" }}>Remove</button>
                          )}
                        </label>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input type="text" placeholder="New dropdown label" value={newDropdownLabel} onChange={(e) => setNewDropdownLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom("customDropdowns", newDropdownLabel))} style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13 }} />
                        <button type="button" onClick={() => addCustom("customDropdowns", newDropdownLabel)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontSize: 13 }}>Add</button>
                      </div>
                    </section>
                  </>
                ) : (
                  <>
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
                      </div>
                    </section>
                    {selectedControlForPage && (
                      <section style={{ marginBottom: 24, padding: 12, background: "rgba(0,0,0,0.03)", borderRadius: 8, border: `1px solid ${theme.border}` }}>
                        <h3 style={{ color: theme.text, fontSize: 14, margin: "0 0 8px" }}>
                          Options for {pageControls.find((c) => c.id === selectedControlForPage)?.label ?? selectedControlForPage}
                        </h3>
                        <p style={{ fontSize: 11, color: theme.text, opacity: 0.8, marginBottom: 8 }}>Current options (user will see these). Add or remove below.</p>
                        <ul style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 13, color: theme.text }}>
                          {getOptionValues(selectedControlForPage).map((opt, i) => (
                            <li key={i} style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                              <span>{opt}</span>
                              <button type="button" onClick={() => removeOptionValue(selectedControlForPage, i)} style={{ fontSize: 11, padding: "2px 6px", color: "#b91c1c" }}>Remove</button>
                            </li>
                          ))}
                        </ul>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            placeholder="Add option"
                            value={newOptionValue}
                            onChange={(e) => setNewOptionValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOptionValue(selectedControlForPage, newOptionValue); setNewOptionValue("") } }}
                            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 13 }}
                          />
                          <button type="button" onClick={() => { addOptionValue(selectedControlForPage, newOptionValue); setNewOptionValue("") }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontSize: 13 }}>Add</button>
                        </div>
                        {DEFAULT_OPTIONS[selectedControlForPage] && (
                          <p style={{ fontSize: 11, color: theme.text, opacity: 0.7, marginTop: 8 }}>
                            Suggested: {DEFAULT_OPTIONS[selectedControlForPage].join(", ")}
                          </p>
                        )}
                      </section>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
