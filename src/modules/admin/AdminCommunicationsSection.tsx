import { useEffect, useState, type ChangeEvent } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import { AccountProfilePanel } from "../account/AccountPage"

type ChannelRow = {
  id: string
  user_id: string
  provider: string
  channel_kind: "voice_sms" | "email"
  provider_sid: string | null
  friendly_name: string | null
  public_address: string
  forward_to_phone: string | null
  forward_to_email: string | null
  voice_enabled: boolean
  sms_enabled: boolean
  email_enabled: boolean
  voicemail_enabled: boolean
  voicemail_mode: "summary" | "full_transcript"
  active: boolean
}

type AccessLogRow = {
  id: string
  user_id: string
  system_kind: "google_business_profile" | "other"
  account_label: string
  account_identifier: string | null
  access_email: string | null
  access_level: string | null
  status: "pending" | "active" | "revoked"
  notes: string | null
  granted_at: string
  revoked_at: string | null
}

type Props = {
  selectedUserId: string | null
  selectedUserLabel: string
  allUsersId: string
}

type HelpDeskOption = {
  id: string
  digit: string
  label: string
  enabled: boolean
}

type HelpDeskSettings = {
  title: string
  greeting_mode: "ai_text" | "recorded"
  greeting_text: string
  greeting_recording_url: string
  menu_enabled: boolean
  options: HelpDeskOption[]
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const keepPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return null
  return `${keepPlus ? "+" : ""}${digits}`
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed ? trimmed : null
}

function createHelpDeskOption(): HelpDeskOption {
  return {
    id: crypto.randomUUID(),
    digit: "",
    label: "",
    enabled: true,
  }
}

function defaultHelpDeskSettings(): HelpDeskSettings {
  return {
    title: "Tradesman Help Desk",
    greeting_mode: "ai_text",
    greeting_text: "Thank you for calling Tradesman. Please listen carefully to the following options.",
    greeting_recording_url: "",
    menu_enabled: false,
    options: [
      { id: crypto.randomUUID(), digit: "1", label: "Customer care", enabled: true },
      { id: crypto.randomUUID(), digit: "2", label: "Technical support", enabled: true },
    ],
  }
}

function normalizeDigit(value: string): string {
  return value.replace(/\D/g, "").slice(0, 1)
}

function emptyChannel(userId: string): ChannelRow {
  return {
    id: `new-${crypto.randomUUID()}`,
    user_id: userId,
    provider: "twilio",
    channel_kind: "voice_sms",
    provider_sid: "",
    friendly_name: "",
    public_address: "",
    forward_to_phone: "",
    forward_to_email: "",
    voice_enabled: true,
    sms_enabled: true,
    email_enabled: false,
    voicemail_enabled: true,
    voicemail_mode: "summary",
    active: true,
  }
}

function emptyAccessLog(userId: string): AccessLogRow {
  return {
    id: `new-${crypto.randomUUID()}`,
    user_id: userId,
    system_kind: "google_business_profile",
    account_label: "",
    account_identifier: "",
    access_email: "",
    access_level: "",
    status: "active",
    notes: "",
    granted_at: new Date().toISOString().slice(0, 10),
    revoked_at: "",
  }
}

export default function AdminCommunicationsSection({ selectedUserId, selectedUserLabel, allUsersId }: Props) {
  const [rows, setRows] = useState<ChannelRow[]>([])
  const [accessLogs, setAccessLogs] = useState<AccessLogRow[]>([])
  const [allRows, setAllRows] = useState<Array<ChannelRow & { profile_name?: string | null; profile_email?: string | null }>>([])
  const [helpDeskSettings, setHelpDeskSettings] = useState<HelpDeskSettings>(defaultHelpDeskSettings())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingAccess, setSavingAccess] = useState(false)
  const [savingHelpDesk, setSavingHelpDesk] = useState(false)
  const [uploadingHelpDeskGreeting, setUploadingHelpDeskGreeting] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!supabase || selectedUserId !== allUsersId) return
    setLoading(true)
    setError("")
    void (async () => {
      try {
        const { data, error: err } = await supabase
          .from("client_communication_channels")
          .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
          .eq("active", true)
          .not("forward_to_phone", "is", null)
          .order("created_at", { ascending: true })
        if (err) {
          setError(err.message)
          setAllRows([])
          return
        }
        const baseRows = (data as ChannelRow[] | null) ?? []
        const userIds = [...new Set(baseRows.map((r) => r.user_id).filter(Boolean))]
        const { data: profiles } = userIds.length
          ? await supabase.from("profiles").select("id, display_name, email").in("id", userIds)
          : { data: [] as Array<{ id: string; display_name: string | null; email: string | null }> }
        const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
        setAllRows(
          baseRows.map((row) => ({
            ...row,
            profile_name: byId.get(row.user_id)?.display_name ?? null,
            profile_email: byId.get(row.user_id)?.email ?? null,
          }))
        )

        const { data: settingData, error: settingErr } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "tradesman_help_desk")
          .limit(1)
          .maybeSingle()
        if (settingErr) {
          setError(settingErr.message)
        } else {
          const raw = (settingData as { value?: Record<string, unknown> } | null)?.value ?? {}
          const optionInput = Array.isArray(raw.options) ? raw.options : []
          setHelpDeskSettings({
            title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Tradesman Help Desk",
            greeting_mode: raw.greeting_mode === "recorded" ? "recorded" : "ai_text",
            greeting_text:
              typeof raw.greeting_text === "string" && raw.greeting_text.trim()
                ? raw.greeting_text
                : "Thank you for calling Tradesman. Please listen carefully to the following options.",
            greeting_recording_url:
              typeof raw.greeting_recording_url === "string" ? raw.greeting_recording_url : "",
            menu_enabled: raw.menu_enabled === true,
            options: optionInput.map((option) => {
              const row = option && typeof option === "object" ? (option as Record<string, unknown>) : {}
              return {
                id: typeof row.id === "string" && row.id ? row.id : crypto.randomUUID(),
                digit: typeof row.digit === "string" ? normalizeDigit(row.digit) : "",
                label: typeof row.label === "string" ? row.label : "",
                enabled: row.enabled !== false,
              }
            }),
          })
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedUserId, allUsersId])

  useEffect(() => {
    if (!supabase || !selectedUserId || selectedUserId === allUsersId) {
      setRows([])
      setAccessLogs([])
      return
    }
    setLoading(true)
    setError("")
    void (async () => {
      try {
        const { data, error: err } = await supabase
          .from("client_communication_channels")
          .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
          .eq("user_id", selectedUserId)
          .order("created_at", { ascending: true })
        if (err) setError(err.message)
        setRows(((data as ChannelRow[] | null) ?? []).map((r) => ({ ...r })))

        const { data: accessData, error: accessErr } = await supabase
          .from("client_external_access_logs")
          .select("id, user_id, system_kind, account_label, account_identifier, access_email, access_level, status, notes, granted_at, revoked_at")
          .eq("user_id", selectedUserId)
          .order("created_at", { ascending: true })
        if (accessErr) setError(accessErr.message)
        setAccessLogs(((accessData as AccessLogRow[] | null) ?? []).map((r) => ({ ...r })))
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedUserId, allUsersId])

  function updateRow(id: string, patch: Partial<ChannelRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function updateAccessLog(id: string, patch: Partial<AccessLogRow>) {
    setAccessLogs((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  async function saveAll() {
    if (!supabase || !selectedUserId || selectedUserId === allUsersId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const existingRows = rows.filter((r) => !r.id.startsWith("new-"))
      const newRows = rows.filter((r) => r.id.startsWith("new-"))
      for (const row of existingRows) {
        const normalizedPublicAddress = row.channel_kind === "voice_sms" ? normalizePhone(row.public_address) : normalizeOptionalText(row.public_address)
        const normalizedForwardToPhone = normalizePhone(row.forward_to_phone)
        if (!normalizedPublicAddress) throw new Error("Each channel needs a public number/address before saving.")
        const { error: err } = await supabase
          .from("client_communication_channels")
          .update({
            provider: row.provider,
            channel_kind: row.channel_kind,
            provider_sid: normalizeOptionalText(row.provider_sid),
            friendly_name: normalizeOptionalText(row.friendly_name),
            public_address: normalizedPublicAddress,
            forward_to_phone: normalizedForwardToPhone,
            forward_to_email: normalizeOptionalText(row.forward_to_email),
            voice_enabled: row.voice_enabled,
            sms_enabled: row.sms_enabled,
            email_enabled: row.email_enabled,
            voicemail_enabled: row.voicemail_enabled,
            voicemail_mode: row.voicemail_mode,
            active: row.active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        if (err) throw err
      }
      if (newRows.length > 0) {
        const payload = newRows.map((row) => {
          const normalizedPublicAddress = row.channel_kind === "voice_sms" ? normalizePhone(row.public_address) : normalizeOptionalText(row.public_address)
          if (!normalizedPublicAddress) throw new Error("Each channel needs a public number/address before saving.")
          return {
            user_id: selectedUserId,
            provider: row.provider,
            channel_kind: row.channel_kind,
            provider_sid: normalizeOptionalText(row.provider_sid),
            friendly_name: normalizeOptionalText(row.friendly_name),
            public_address: normalizedPublicAddress,
            forward_to_phone: normalizePhone(row.forward_to_phone),
            forward_to_email: normalizeOptionalText(row.forward_to_email),
            voice_enabled: row.voice_enabled,
            sms_enabled: row.sms_enabled,
            email_enabled: row.email_enabled,
            voicemail_enabled: row.voicemail_enabled,
            voicemail_mode: row.voicemail_mode,
            active: row.active,
          }
        })
        const { error: err } = await supabase.from("client_communication_channels").insert(payload)
        if (err) throw err
      }
      setMessage("Communications settings saved.")
      const { data, error: reloadErr } = await supabase
        .from("client_communication_channels")
        .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
        .eq("user_id", selectedUserId)
        .order("created_at", { ascending: true })
      if (reloadErr) throw reloadErr
      setRows((data as ChannelRow[] | null) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeRow(row: ChannelRow) {
    if (!supabase) return
    if (row.id.startsWith("new-")) {
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      return
    }
    if (!window.confirm(`Remove ${row.public_address || "this channel"}?`)) return
    const { error: err } = await supabase.from("client_communication_channels").delete().eq("id", row.id)
    if (err) {
      setError(err.message)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
  }

  async function saveAccessLogs() {
    if (!supabase || !selectedUserId || selectedUserId === allUsersId) return
    setSavingAccess(true)
    setMessage("")
    setError("")
    try {
      const existingRows = accessLogs.filter((r) => !r.id.startsWith("new-"))
      const newRows = accessLogs.filter((r) => r.id.startsWith("new-"))
      for (const row of existingRows) {
        if (!row.account_label.trim()) throw new Error("Each access log needs an account label before saving.")
        const { error: err } = await supabase
          .from("client_external_access_logs")
          .update({
            system_kind: row.system_kind,
            account_label: row.account_label.trim(),
            account_identifier: normalizeOptionalText(row.account_identifier),
            access_email: normalizeOptionalText(row.access_email),
            access_level: normalizeOptionalText(row.access_level),
            status: row.status,
            notes: normalizeOptionalText(row.notes),
            granted_at: row.granted_at || new Date().toISOString(),
            revoked_at: normalizeOptionalText(row.revoked_at),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        if (err) throw err
      }
      if (newRows.length > 0) {
        const payload = newRows.map((row) => {
          if (!row.account_label.trim()) throw new Error("Each access log needs an account label before saving.")
          return {
            user_id: selectedUserId,
            system_kind: row.system_kind,
            account_label: row.account_label.trim(),
            account_identifier: normalizeOptionalText(row.account_identifier),
            access_email: normalizeOptionalText(row.access_email),
            access_level: normalizeOptionalText(row.access_level),
            status: row.status,
            notes: normalizeOptionalText(row.notes),
            granted_at: row.granted_at || new Date().toISOString(),
            revoked_at: normalizeOptionalText(row.revoked_at),
          }
        })
        const { error: err } = await supabase.from("client_external_access_logs").insert(payload)
        if (err) throw err
      }
      setMessage("Routing, email, and access settings saved.")
      const { data: accessData, error: accessErr } = await supabase
        .from("client_external_access_logs")
        .select("id, user_id, system_kind, account_label, account_identifier, access_email, access_level, status, notes, granted_at, revoked_at")
        .eq("user_id", selectedUserId)
        .order("created_at", { ascending: true })
      if (accessErr) throw accessErr
      setAccessLogs((accessData as AccessLogRow[] | null) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingAccess(false)
    }
  }

  async function removeAccessLog(row: AccessLogRow) {
    if (!supabase) return
    if (row.id.startsWith("new-")) {
      setAccessLogs((prev) => prev.filter((r) => r.id !== row.id))
      return
    }
    if (!window.confirm(`Remove access record for ${row.account_label || "this account"}?`)) return
    const { error: err } = await supabase.from("client_external_access_logs").delete().eq("id", row.id)
    if (err) {
      setError(err.message)
      return
    }
    setAccessLogs((prev) => prev.filter((r) => r.id !== row.id))
  }

  function downloadActiveForwardingReport() {
    const reportRows = allRows
      .filter((row) => row.active && row.forward_to_phone)
      .map((row) => ({
        user_name: row.profile_name ?? "",
        user_email: row.profile_email ?? "",
        provider: row.provider,
        channel_kind: row.channel_kind,
        friendly_name: row.friendly_name ?? "",
        public_address: row.public_address,
        forward_to_phone: row.forward_to_phone ?? "",
        forward_to_email: row.forward_to_email ?? "",
        voice_enabled: row.voice_enabled ? "TRUE" : "FALSE",
        sms_enabled: row.sms_enabled ? "TRUE" : "FALSE",
        email_enabled: row.email_enabled ? "TRUE" : "FALSE",
        active: row.active ? "TRUE" : "FALSE",
      }))

    const headers = Object.keys(reportRows[0] ?? {
      user_name: "",
      user_email: "",
      provider: "",
      channel_kind: "",
      friendly_name: "",
      public_address: "",
      forward_to_phone: "",
      forward_to_email: "",
      voice_enabled: "",
      sms_enabled: "",
      email_enabled: "",
      active: "",
    })
    const csv = [
      headers.join(","),
      ...reportRows.map((row) =>
        headers
          .map((key) => `"${String(row[key as keyof typeof row] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\r\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `active-forwarded-numbers-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function updateHelpDeskOption(id: string, patch: Partial<HelpDeskOption>) {
    setHelpDeskSettings((prev) => ({
      ...prev,
      options: prev.options.map((option) => (option.id === id ? { ...option, ...patch } : option)),
    }))
  }

  async function saveHelpDeskSettings() {
    if (!supabase || selectedUserId !== allUsersId) return
    setSavingHelpDesk(true)
    setMessage("")
    setError("")
    try {
      const digits = new Set<string>()
      const normalizedOptions = helpDeskSettings.options
        .map((option) => ({
          id: option.id,
          digit: normalizeDigit(option.digit),
          label: option.label.trim(),
          enabled: option.enabled,
        }))
        .filter((option) => option.digit || option.label)

      for (const option of normalizedOptions) {
        if (!option.digit || !option.label) throw new Error("Each help desk option needs both a keypad digit and a label.")
        if (digits.has(option.digit)) throw new Error("Each help desk option must use a unique keypad digit.")
        digits.add(option.digit)
      }

      const payload = {
        title: helpDeskSettings.title.trim() || "Tradesman Help Desk",
        greeting_mode: helpDeskSettings.greeting_mode,
        greeting_text:
          helpDeskSettings.greeting_text.trim() ||
          "Thank you for calling Tradesman. Please listen carefully to the following options.",
        greeting_recording_url: helpDeskSettings.greeting_recording_url.trim(),
        menu_enabled: helpDeskSettings.menu_enabled,
        options: normalizedOptions,
      }

      const { error: err } = await supabase.from("platform_settings").upsert(
        {
          key: "tradesman_help_desk",
          value: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
      if (err) throw err
      setHelpDeskSettings((prev) => ({
        ...prev,
        title: payload.title,
        greeting_text: payload.greeting_text,
        greeting_recording_url: payload.greeting_recording_url,
        options: normalizedOptions.map((option) => ({ ...option })),
      }))
      setMessage("Tradesman help desk settings saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingHelpDesk(false)
    }
  }

  async function uploadHelpDeskGreeting(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!supabase || !file) return
    setUploadingHelpDeskGreeting(true)
    setMessage("")
    setError("")
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "mp3"
      const filePath = `global/help-desk-greeting-${Date.now()}.${extension}`
      const { error: uploadErr } = await supabase.storage
        .from("voicemail-greetings")
        .upload(filePath, file, { upsert: true, contentType: file.type || "audio/mpeg" })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from("voicemail-greetings").getPublicUrl(filePath)
      setHelpDeskSettings((prev) => ({
        ...prev,
        greeting_mode: "recorded",
        greeting_recording_url: data.publicUrl,
      }))
      setMessage("Help desk greeting uploaded. Save settings to make it live.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadingHelpDeskGreeting(false)
    }
  }

  if (selectedUserId === allUsersId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <AdminSettingBlock id="admin:communications:select_user">
          <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Routing &amp; Access</h1>
          <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>
            Select a single user in the left sidebar to manage Twilio/Resend routing and future access records for that client.
          </p>
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:communications:all_users_export">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 18 }}>Active Forwarded Numbers Report</h2>
              <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>
                Download all active forwarded numbers as a spreadsheet-friendly CSV from the all-users view.
              </p>
            </div>
            <button type="button" onClick={downloadActiveForwardingReport} disabled={loading} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: theme.primary, color: "white", fontWeight: 600, cursor: loading ? "wait" : "pointer" }}>
              {loading ? "Loading..." : "Download CSV"}
            </button>
          </div>
          {!!allRows.length && (
            <p style={{ margin: "12px 0 0", color: theme.text, opacity: 0.8 }}>
              {allRows.filter((row) => row.active && row.forward_to_phone).length} active forwarded number(s) ready to export.
            </p>
          )}
          {error && <p style={{ color: "#b91c1c", marginBottom: 0 }}>{error}</p>}
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:communications:help_desk">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 18 }}>Tradesman Help Desk Options</h2>
              <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>
                Manage the shared Tradesman support number greeting now and stage future phone-menu options in one admin-only place.
              </p>
            </div>
            <button type="button" onClick={() => void saveHelpDeskSettings()} disabled={savingHelpDesk} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: theme.primary, color: "white", fontWeight: 600, cursor: savingHelpDesk ? "wait" : "pointer" }}>
              {savingHelpDesk ? "Saving..." : "Save help desk"}
            </button>
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Section title</span>
                <input value={helpDeskSettings.title} onChange={(e) => setHelpDeskSettings((prev) => ({ ...prev, title: e.target.value }))} style={theme.formInput} placeholder="Tradesman Help Desk" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Greeting mode</span>
                <select value={helpDeskSettings.greeting_mode} onChange={(e) => setHelpDeskSettings((prev) => ({ ...prev, greeting_mode: e.target.value as HelpDeskSettings["greeting_mode"] }))} style={theme.formInput}>
                  <option value="ai_text">AI text to voice</option>
                  <option value="recorded">Recorded greeting</option>
                </select>
              </label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={helpDeskSettings.menu_enabled} onChange={(e) => setHelpDeskSettings((prev) => ({ ...prev, menu_enabled: e.target.checked }))} />
              Enable keypad menu options after the greeting
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Greeting script</span>
              <textarea value={helpDeskSettings.greeting_text} onChange={(e) => setHelpDeskSettings((prev) => ({ ...prev, greeting_text: e.target.value }))} style={{ ...theme.formInput, minHeight: 96, resize: "vertical" }} placeholder="Thank you for calling Tradesman..." />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Recorded greeting URL</span>
              <input value={helpDeskSettings.greeting_recording_url} onChange={(e) => setHelpDeskSettings((prev) => ({ ...prev, greeting_recording_url: e.target.value }))} style={theme.formInput} placeholder="https://..." />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <label style={{ padding: "10px 16px", background: "#fff", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 600, cursor: uploadingHelpDeskGreeting ? "wait" : "pointer" }}>
                {uploadingHelpDeskGreeting ? "Uploading..." : "Upload greeting audio"}
                <input type="file" accept="audio/*" onChange={(e) => void uploadHelpDeskGreeting(e)} disabled={uploadingHelpDeskGreeting} style={{ display: "none" }} />
              </label>
            </div>
            {!!helpDeskSettings.greeting_recording_url && (
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Greeting preview</span>
                <audio controls src={helpDeskSettings.greeting_recording_url} />
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ color: theme.text, margin: 0, fontSize: 16 }}>Future Menu Options</h3>
                  <p style={{ color: theme.text, opacity: 0.8, margin: "6px 0 0" }}>
                    Stage the keypad choices you want this Tradesman number to offer later.
                  </p>
                </div>
                <button type="button" onClick={() => setHelpDeskSettings((prev) => ({ ...prev, options: [...prev.options, createHelpDeskOption()] }))} style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", color: theme.text, cursor: "pointer" }}>
                  Add option
                </button>
              </div>
              {helpDeskSettings.options.length === 0 ? (
                <p style={{ margin: 0, color: theme.text, opacity: 0.8 }}>No menu options yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {helpDeskSettings.options.map((option) => (
                    <div key={option.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14, background: "#fff" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "120px minmax(220px, 1fr) auto", gap: 12, alignItems: "end" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Digit</span>
                          <input value={option.digit} onChange={(e) => updateHelpDeskOption(option.id, { digit: normalizeDigit(e.target.value) })} style={theme.formInput} placeholder="1" maxLength={1} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Label</span>
                          <input value={option.label} onChange={(e) => updateHelpDeskOption(option.id, { label: e.target.value })} style={theme.formInput} placeholder="Customer care" />
                        </label>
                        <button type="button" onClick={() => setHelpDeskSettings((prev) => ({ ...prev, options: prev.options.filter((row) => row.id !== option.id) }))} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "white", color: "#b91c1c", cursor: "pointer", height: 40 }}>
                          Remove
                        </button>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontSize: 13, marginTop: 12 }}>
                        <input type="checkbox" checked={option.enabled} onChange={(e) => updateHelpDeskOption(option.id, { enabled: e.target.checked })} />
                        Option enabled
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: "#fff", border: `1px solid ${theme.border}`, color: "#4b5563", fontSize: 13, display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700, color: theme.text }}>Recommended use</div>
              <div>Point your future shared Tradesman support number to a dedicated help-desk webhook once you are ready to activate the menu logic.</div>
              <div>This section stores the global greeting and option list now, so the voice flow can be plugged into it next without redesigning the admin UI.</div>
            </div>
          </div>
          {message && <p style={{ color: "#059669", marginBottom: 0 }}>{message}</p>}
          {error && <p style={{ color: "#b91c1c", marginBottom: 0 }}>{error}</p>}
        </AdminSettingBlock>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AdminSettingBlock id="admin:communications:header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Routing &amp; Access for {selectedUserLabel}</h1>
            <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>
              Manage phone/email routing now, with room for future access tracking in the same admin area. No redeploy needed for new numbers.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => selectedUserId && setRows((prev) => [...prev, emptyChannel(selectedUserId)])} style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", color: theme.text, cursor: "pointer" }}>
              Add channel
            </button>
            <button type="button" onClick={() => void saveAll()} disabled={saving} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: theme.primary, color: "white", fontWeight: 600, cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Saving..." : "Save routing & access"}
            </button>
          </div>
        </div>
        {message && <p style={{ color: "#059669", marginBottom: 0 }}>{message}</p>}
        {error && <p style={{ color: "#b91c1c", marginBottom: 0 }}>{error}</p>}
      </AdminSettingBlock>

      {selectedUserId && (
        <AdminSettingBlock id="admin:communications:user_account">
          <AccountProfilePanel profileUserId={selectedUserId} adminContext />
        </AdminSettingBlock>
      )}

      <AdminSettingBlock id="admin:communications:channels">
        {loading ? (
          <p style={{ margin: 0, color: theme.text }}>Loading communication channels...</p>
        ) : rows.length === 0 ? (
          <p style={{ margin: 0, color: theme.text, opacity: 0.8 }}>No channels yet. Add the client's Twilio number and forwarding destination above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {rows.map((row) => (
              <div key={row.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 16, background: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Channel kind</span>
                    <select value={row.channel_kind} onChange={(e) => updateRow(row.id, { channel_kind: e.target.value as ChannelRow["channel_kind"] })} style={theme.formInput}>
                      <option value="voice_sms">Voice / SMS</option>
                      <option value="email">Email</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{row.channel_kind === "email" ? "Business email address" : "Public number / address"}</span>
                    <input value={row.public_address} onChange={(e) => updateRow(row.id, { public_address: e.target.value })} style={theme.formInput} placeholder={row.channel_kind === "email" ? "hello@clientdomain.com" : "+15551234567"} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Forward to phone</span>
                    <input value={row.forward_to_phone ?? ""} onChange={(e) => updateRow(row.id, { forward_to_phone: e.target.value })} style={theme.formInput} placeholder="+15557654321" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{row.channel_kind === "email" ? "Reply-to / forward-to email" : "Forward to email"}</span>
                    <input value={row.forward_to_email ?? ""} onChange={(e) => updateRow(row.id, { forward_to_email: e.target.value })} style={theme.formInput} placeholder="future@email.com" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Provider SID</span>
                    <input value={row.provider_sid ?? ""} onChange={(e) => updateRow(row.id, { provider_sid: e.target.value })} style={theme.formInput} placeholder="PN..." />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Friendly name</span>
                    <input value={row.friendly_name ?? ""} onChange={(e) => updateRow(row.id, { friendly_name: e.target.value })} style={theme.formInput} placeholder="Main line" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Voicemail mode</span>
                    <select value={row.voicemail_mode} onChange={(e) => updateRow(row.id, { voicemail_mode: e.target.value as ChannelRow["voicemail_mode"] })} style={theme.formInput}>
                      <option value="summary">Summary</option>
                      <option value="full_transcript">Full transcript</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
                  {[
                    ["voice_enabled", "Voice enabled"],
                    ["sms_enabled", "SMS enabled"],
                    ["email_enabled", "Email enabled"],
                    ["voicemail_enabled", "Twilio voicemail enabled"],
                    ["active", "Active"],
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontSize: 13 }}>
                      <input type="checkbox" checked={Boolean(row[key as keyof ChannelRow])} onChange={(e) => updateRow(row.id, { [key]: e.target.checked } as Partial<ChannelRow>)} />
                      {label}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => void removeRow(row)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "white", color: "#b91c1c", cursor: "pointer" }}>
                    Remove channel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSettingBlock>

      <AdminSettingBlock id="admin:communications:access_logs">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 18 }}>Google Profile Access Log</h2>
            <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>
              Track who has access to the client&apos;s Google Business Profile or related external systems.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => selectedUserId && setAccessLogs((prev) => [...prev, emptyAccessLog(selectedUserId)])} style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", color: theme.text, cursor: "pointer" }}>
              Add access record
            </button>
            <button type="button" onClick={() => void saveAccessLogs()} disabled={savingAccess} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: theme.primary, color: "white", fontWeight: 600, cursor: savingAccess ? "wait" : "pointer" }}>
              {savingAccess ? "Saving..." : "Save access log"}
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ margin: 0, color: theme.text }}>Loading access records...</p>
        ) : accessLogs.length === 0 ? (
          <p style={{ margin: 0, color: theme.text, opacity: 0.8 }}>No access records yet. Add Google Business Profile access details here.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {accessLogs.map((row) => (
              <div key={row.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 16, background: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>System</span>
                    <select value={row.system_kind} onChange={(e) => updateAccessLog(row.id, { system_kind: e.target.value as AccessLogRow["system_kind"] })} style={theme.formInput}>
                      <option value="google_business_profile">Google Business Profile</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Account label</span>
                    <input value={row.account_label} onChange={(e) => updateAccessLog(row.id, { account_label: e.target.value })} style={theme.formInput} placeholder="Main GBP listing" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Account identifier</span>
                    <input value={row.account_identifier ?? ""} onChange={(e) => updateAccessLog(row.id, { account_identifier: e.target.value })} style={theme.formInput} placeholder="Profile ID or business name" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Access email</span>
                    <input value={row.access_email ?? ""} onChange={(e) => updateAccessLog(row.id, { access_email: e.target.value })} style={theme.formInput} placeholder="manager@business.com" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Access level</span>
                    <input value={row.access_level ?? ""} onChange={(e) => updateAccessLog(row.id, { access_level: e.target.value })} style={theme.formInput} placeholder="Owner, Manager, etc." />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Status</span>
                    <select value={row.status} onChange={(e) => updateAccessLog(row.id, { status: e.target.value as AccessLogRow["status"] })} style={theme.formInput}>
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="revoked">Revoked</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Granted date</span>
                    <input type="date" value={(row.granted_at || "").slice(0, 10)} onChange={(e) => updateAccessLog(row.id, { granted_at: e.target.value })} style={theme.formInput} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Revoked date</span>
                    <input type="date" value={(row.revoked_at || "").slice(0, 10)} onChange={(e) => updateAccessLog(row.id, { revoked_at: e.target.value })} style={theme.formInput} />
                  </label>
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Notes</span>
                  <textarea value={row.notes ?? ""} onChange={(e) => updateAccessLog(row.id, { notes: e.target.value })} style={{ ...theme.formInput, minHeight: 82, resize: "vertical" }} placeholder="Notes about access, pending invites, profile ownership, etc." />
                </label>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => void removeAccessLog(row)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "white", color: "#b91c1c", cursor: "pointer" }}>
                    Remove record
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSettingBlock>
    </div>
  )
}
