import { useEffect, useState, type ChangeEvent } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import { AdminSortableRow } from "../../components/admin/AdminSortableRow"
import { reorderByIndex } from "../../lib/reorderArray"
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

export type AdminCommunicationsMode = "all_users_insights" | "single_client" | "select_user_first"

type Props = {
  mode: AdminCommunicationsMode
  selectedUserId: string | null
  selectedUserLabel: string
}

type HelpDeskOption = {
  id: string
  digit: string
  label: string
  enabled: boolean
  /** Optional: Twilio will dial this E.164 number when caller presses this digit. */
  forward_to_phone: string
}

type HelpDeskSettings = {
  title: string
  greeting_mode: "ai_text" | "recorded"
  greeting_text: string
  greeting_recording_url: string
  menu_enabled: boolean
  options: HelpDeskOption[]
  /** Comma-separated profile UUIDs; each receives help-desk voicemails in their portal. */
  voicemail_notify_user_ids: string
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

/** Lowercase so inbound routing and Resend `to` matching stay consistent. */
function normalizeEmailPublicAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? ""
  return trimmed ? trimmed : null
}

function createHelpDeskOption(): HelpDeskOption {
  return {
    id: crypto.randomUUID(),
    digit: "",
    label: "",
    enabled: true,
    forward_to_phone: "",
  }
}

function defaultHelpDeskSettings(): HelpDeskSettings {
  return {
    title: "Tradesman Help Desk",
    greeting_mode: "ai_text",
    greeting_text: "Thank you for calling Tradesman. Please listen carefully to the following options.",
    greeting_recording_url: "",
    menu_enabled: false,
    voicemail_notify_user_ids: "",
    options: [
      { id: crypto.randomUUID(), digit: "1", label: "Customer care", enabled: true, forward_to_phone: "" },
      { id: crypto.randomUUID(), digit: "2", label: "Technical support", enabled: true, forward_to_phone: "" },
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

export default function AdminCommunicationsSection({ mode, selectedUserId, selectedUserLabel }: Props) {
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
    if (!supabase || mode !== "all_users_insights") return
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
          const notifyRaw = raw.voicemail_notify_user_ids
          const notifyStr =
            Array.isArray(notifyRaw)
              ? notifyRaw.map(String).join(", ")
              : typeof notifyRaw === "string"
                ? notifyRaw
                : ""
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
            voicemail_notify_user_ids: notifyStr,
            options: optionInput.map((option) => {
              const row = option && typeof option === "object" ? (option as Record<string, unknown>) : {}
              return {
                id: typeof row.id === "string" && row.id ? row.id : crypto.randomUUID(),
                digit: typeof row.digit === "string" ? normalizeDigit(row.digit) : "",
                label: typeof row.label === "string" ? row.label : "",
                enabled: row.enabled !== false,
                forward_to_phone: typeof row.forward_to_phone === "string" ? row.forward_to_phone : "",
              }
            }),
          })
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [mode])

  useEffect(() => {
    if (!supabase || mode !== "single_client" || !selectedUserId) {
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
  }, [mode, selectedUserId])

  function updateRow(id: string, patch: Partial<ChannelRow>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        const next: ChannelRow = { ...row, ...patch }
        if (patch.channel_kind === "email") {
          next.provider = "resend"
          next.email_enabled = true
          next.voice_enabled = false
          next.sms_enabled = false
          next.voicemail_enabled = false
        } else if (patch.channel_kind === "voice_sms") {
          next.provider = "twilio"
          next.email_enabled = false
          next.voice_enabled = true
          next.sms_enabled = true
          next.voicemail_enabled = true
        }
        return next
      })
    )
  }

  function updateAccessLog(id: string, patch: Partial<AccessLogRow>) {
    setAccessLogs((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  async function saveAll() {
    if (!supabase || mode !== "single_client" || !selectedUserId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const existingRows = rows.filter((r) => !r.id.startsWith("new-"))
      const newRows = rows.filter((r) => r.id.startsWith("new-"))
      for (const row of existingRows) {
        const normalizedPublicAddress =
          row.channel_kind === "voice_sms"
            ? normalizePhone(row.public_address)
            : normalizeEmailPublicAddress(row.public_address)
        const normalizedForwardToPhone = normalizePhone(row.forward_to_phone)
        if (!normalizedPublicAddress) throw new Error("Each channel needs a public number/address before saving.")
        const { error: err } = await supabase
          .from("client_communication_channels")
          .update({
            provider: row.channel_kind === "email" ? "resend" : row.provider,
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
          const normalizedPublicAddress =
            row.channel_kind === "voice_sms"
              ? normalizePhone(row.public_address)
              : normalizeEmailPublicAddress(row.public_address)
          if (!normalizedPublicAddress) throw new Error("Each channel needs a public number/address before saving.")
          return {
            user_id: selectedUserId,
            provider: row.channel_kind === "email" ? "resend" : row.provider,
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
    if (!supabase || mode !== "single_client" || !selectedUserId) return
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
    if (!supabase || mode !== "all_users_insights") return
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
          forward_to_phone: normalizePhone(option.forward_to_phone) ?? "",
        }))
        .filter((option) => option.digit || option.label)

      for (const option of normalizedOptions) {
        if (!option.digit || !option.label) throw new Error("Each help desk option needs both a keypad digit and a label.")
        if (option.digit === "0") throw new Error("Digit 0 is reserved for help desk voicemail. Use 1–9 for menu options.")
        if (digits.has(option.digit)) throw new Error("Each help desk option must use a unique keypad digit.")
        digits.add(option.digit)
      }

      const notifyIds = helpDeskSettings.voicemail_notify_user_ids
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)

      const payload = {
        title: helpDeskSettings.title.trim() || "Tradesman Help Desk",
        greeting_mode: helpDeskSettings.greeting_mode,
        greeting_text:
          helpDeskSettings.greeting_text.trim() ||
          "Thank you for calling Tradesman. Please listen carefully to the following options.",
        greeting_recording_url: helpDeskSettings.greeting_recording_url.trim(),
        menu_enabled: helpDeskSettings.menu_enabled,
        voicemail_notify_user_ids: notifyIds,
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
        voicemail_notify_user_ids: notifyIds.join(", "),
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

  if (mode === "select_user_first") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <AdminSettingBlock id="admin:communications:pick_user">
          <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>Routing &amp; Access</h1>
          <p style={{ color: theme.text, opacity: 0.85, margin: 0, lineHeight: 1.55 }}>
            You have a <strong>group</strong> selected in the sidebar ({selectedUserLabel}). Choose a <strong>specific user</strong> to edit phone routing, access logs, and the account form. Group rows are for portal configuration only.
          </p>
        </AdminSettingBlock>
      </div>
    )
  }

  if (mode === "all_users_insights") {
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
        <AdminSettingBlock id="admin:communications:webhook_urls">
          <h2 style={{ color: theme.text, margin: "0 0 8px", fontSize: 18 }}>Twilio &amp; SMS webhooks (capture events)</h2>
          <p style={{ color: theme.text, opacity: 0.88, margin: "0 0 10px", fontSize: 14, lineHeight: 1.55 }}>
            For each user&apos;s <strong>Twilio SMS-capable number</strong>, set <strong>A message comes in</strong> to{" "}
            <code style={{ fontSize: 12 }}>POST {typeof window !== "undefined" ? window.location.origin : ""}/api/incoming-sms</code> (HTTP POST, form URL-encoded). The <code style={{ fontSize: 12 }}>To</code> number must match a saved{" "}
            <strong>Public number</strong> on that user&apos;s Voice/SMS channel so the app routes to the right account. Inbound SMS creates a conversation message, a <code style={{ fontSize: 12 }}>communication_events</code> row, and uses env fallbacks{" "}
            <code style={{ fontSize: 12 }}>INCOMING_SMS_DEFAULT_USER_ID</code> / <code style={{ fontSize: 12 }}>INCOMING_SMS_ROUTING_JSON</code> when no channel matches.
          </p>
        </AdminSettingBlock>
        <AdminSettingBlock id="admin:communications:help_desk">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 18 }}>Tradesman Help Desk Options</h2>
              <p style={{ color: theme.text, opacity: 0.8, margin: 0 }}>
                Configure the toll-free greeting, live keypad menu, voicemail recipients, and optional call logging for the shared Tradesman help desk number.
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
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>
                Voicemail notify user IDs (comma-separated profile UUIDs)
              </span>
              <textarea
                value={helpDeskSettings.voicemail_notify_user_ids}
                onChange={(e) => setHelpDeskSettings((prev) => ({ ...prev, voicemail_notify_user_ids: e.target.value }))}
                style={{ ...theme.formInput, minHeight: 72, resize: "vertical" }}
                placeholder="e.g. joe and justin profiles’ auth user UUIDs from Supabase"
              />
              <span style={{ fontSize: 11, color: theme.text, opacity: 0.75 }}>
                When set, callers can press 0 after the menu (or reach voicemail on a bad key / menu timeout) and each listed user gets the recording in Conversations. Digit 0 cannot be used as a menu option.
              </span>
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
                  <h3 style={{ color: theme.text, margin: 0, fontSize: 16 }}>Help Desk Menu Options</h3>
                  <p style={{ color: theme.text, opacity: 0.8, margin: "6px 0 0" }}>
                    Live keypad choices for this number (1–9 only; 0 is reserved for voicemail when notify IDs are set).
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
                  {helpDeskSettings.options.map((option, optIndex) => (
                    <AdminSortableRow
                      key={option.id}
                      scope="help-desk-keypad-options"
                      index={optIndex}
                      onReorder={(from, to) =>
                        setHelpDeskSettings((prev) => ({ ...prev, options: reorderByIndex([...prev.options], from, to) }))
                      }
                      rowStyle={{ marginBottom: 0 }}
                    >
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14, background: "#fff" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "120px minmax(200px, 1fr) minmax(180px, 1fr) auto", gap: 12, alignItems: "end" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Digit</span>
                          <input value={option.digit} onChange={(e) => updateHelpDeskOption(option.id, { digit: normalizeDigit(e.target.value) })} style={theme.formInput} placeholder="1" maxLength={1} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Label</span>
                          <input value={option.label} onChange={(e) => updateHelpDeskOption(option.id, { label: e.target.value })} style={theme.formInput} placeholder="Customer care" />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Forward to phone (optional)</span>
                          <input
                            value={option.forward_to_phone}
                            onChange={(e) => updateHelpDeskOption(option.id, { forward_to_phone: e.target.value })}
                            style={theme.formInput}
                            placeholder="+15551234567"
                          />
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
                    </AdminSortableRow>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: "#fff", border: `1px solid ${theme.border}`, color: "#4b5563", fontSize: 13, display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700, color: theme.text }}>Go live: Twilio Voice URL</div>
              <div>
                In Twilio → your toll-free / help desk number → <strong>A call comes in</strong> → Webhook →{" "}
                <code style={{ fontSize: 11 }}>POST {typeof window !== "undefined" ? window.location.origin : ""}/api/help-desk-voice</code>
                . Optional: set <code style={{ fontSize: 11 }}>HELP_DESK_LOG_USER_ID</code> on Vercel (a real <code style={{ fontSize: 11 }}>auth.users</code> UUID) to log help-desk calls in{" "}
                <strong>Communication events</strong>.
              </div>
              <div>Per menu option you can set <strong>Forward to phone</strong> to dial support or the contractor; leave blank to play a thank-you message only.</div>
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

      {mode === "single_client" && selectedUserId ? (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 8,
            border: "1px solid #fbbf24",
            background: "linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(245, 158, 11, 0.08))",
            color: theme.text,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: "#b45309" }}>Before Monday beta: voicemail &amp; greetings</div>
          <div style={{ opacity: 0.95 }}>
            Voicemail and greeting flows still need a focused test pass (upload, PIN, Twilio routing). Use <strong>Email routing</strong> below for Tradesman addresses and Resend.
          </div>
        </div>
      ) : null}

      {mode === "single_client" && selectedUserId ? (
        <AdminSettingBlock id="admin:communications:email_routing_guide">
          <h2 style={{ color: theme.text, margin: "0 0 8px", fontSize: 18 }}>Email routing (Resend + Google / lead capture)</h2>
          <p style={{ color: theme.text, opacity: 0.88, margin: "0 0 14px", lineHeight: 1.55, fontSize: 14 }}>
            Company mail and public listings should use a <strong>Tradesman-hosted address</strong> (your domain on Resend, e.g.{" "}
            <code style={{ fontSize: 12 }}>jane.plumbing@tradesman-us.com</code>) so everything can route into this user&apos;s portal. Their{" "}
            <strong>personal inbox</strong> stays private: you set it in <strong>Reply-to / forward-to email</strong> below.
          </p>
          <div
            style={{
              display: "grid",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: "#fafafa",
              fontSize: 13,
              lineHeight: 1.55,
              color: theme.text,
            }}
          >
            <div>
              <strong style={{ color: theme.text }}>1. Outbound (working today)</strong>
              <p style={{ margin: "6px 0 0", opacity: 0.9 }}>
                When this user sends email from <strong>Conversations</strong>, the app calls{" "}
                <code style={{ fontSize: 11 }}>POST {typeof window !== "undefined" ? window.location.origin : ""}/api/send-email</code> on your deployment.{" "}
                Vercel needs <code style={{ fontSize: 11 }}>RESEND_API_KEY</code>. The message is sent <strong>from</strong> the{" "}
                <strong>Business email address</strong> on the Email channel row, with <strong>Reply-To</strong> set to{" "}
                <strong>Reply-to / forward-to email</strong> when provided—so customers reply to the contractor&apos;s real inbox.
              </p>
            </div>
            <div>
              <strong style={{ color: theme.text }}>2. Public address (Google Business Profile, website, lead forms)</strong>
              <p style={{ margin: "6px 0 0", opacity: 0.9 }}>
                Add an <strong>Email</strong> channel (kind = Email). Put the published address in <strong>Business email address</strong>—that is what you list on GBP, ads, and cards.{" "}
                In Resend, enable <strong>Receiving</strong> for the same domain and create that mailbox/alias so Resend accepts mail for it.
              </p>
            </div>
            <div>
              <strong style={{ color: theme.text }}>3. Inbound into Tradesman Conversations</strong>
              <p style={{ margin: "6px 0 0", opacity: 0.9 }}>
                In Resend → <strong>Webhooks</strong>, add event <code style={{ fontSize: 11 }}>email.received</code> →{" "}
                <code style={{ fontSize: 11 }}>POST {typeof window !== "undefined" ? window.location.origin : ""}/api/incoming-email</code>. Set{" "}
                <code style={{ fontSize: 11 }}>RESEND_WEBHOOK_SECRET</code> (signing secret from Resend) and <code style={{ fontSize: 11 }}>RESEND_API_KEY</code> on Vercel.{" "}
                The app loads the full message from Resend using that API key, matches the recipient, then creates the thread.
              </p>
              <p style={{ margin: "10px 0 0", padding: "10px 12px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa", fontSize: 12, lineHeight: 1.55 }}>
                <strong style={{ color: "#9a3412" }}>Must match exactly:</strong> the <strong>To</strong> address on the inbound message (as Resend reports it) must equal this user&apos;s{" "}
                <strong>Business email address</strong> on an <strong>Email</strong> channel row — same spelling, full address (e.g.{" "}
                <code style={{ fontSize: 11 }}>support@tradesman-us.com</code>), saved lowercase. That row must be <strong>Active</strong> and <strong>Email enabled</strong>.{" "}
                MX/DNS only gets mail into Resend; the <strong>webhook</strong> is what creates the conversation. If Resend shows &quot;received&quot; but nothing appears in the app, check the webhook delivery in Resend (HTTP 200 body may say{" "}
                <code style={{ fontSize: 11 }}>routed: false</code> with a <code style={{ fontSize: 11 }}>to</code> list — fix the channel address to match).
              </p>
              <p style={{ margin: "10px 0 0", opacity: 0.9 }}>
                After a message is routed into Tradesman, the app can <strong>forward a copy</strong> to <strong>Reply-to / forward-to email</strong> using Resend send — that is separate from MX; it only runs when inbound routing succeeded.
              </p>
            </div>
            <div>
              <strong style={{ color: theme.text }}>4. Field cheat sheet</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, opacity: 0.9 }}>
                <li>
                  <strong>Business email address</strong> — public Tradesman address; must match Resend sending domain and receiving routes.
                </li>
                <li>
                  <strong>Reply-to / forward-to email</strong> — contractor&apos;s personal or work Gmail; used as Reply-To on outbound; target for optional forward when inbound is fully connected.
                </li>
                <li>
                  <strong>Email enabled</strong> — must be on for this row to be chosen as the user&apos;s primary email channel for <code style={{ fontSize: 11 }}>/api/send-email</code>.
                </li>
              </ul>
            </div>
          </div>
        </AdminSettingBlock>
      ) : null}

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
                    <input
                      value={row.public_address}
                      onChange={(e) => updateRow(row.id, { public_address: e.target.value })}
                      style={theme.formInput}
                      placeholder={row.channel_kind === "email" ? "e.g. jane.plumbing@tradesman-us.com" : "+15551234567"}
                    />
                    {row.channel_kind === "email" && (
                      <span style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                        List this exact address on Google Business Profile, lead capture, and marketing. Saved lowercase for routing.
                      </span>
                    )}
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Forward to phone</span>
                    <input value={row.forward_to_phone ?? ""} onChange={(e) => updateRow(row.id, { forward_to_phone: e.target.value })} style={theme.formInput} placeholder="+15557654321" />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{row.channel_kind === "email" ? "Reply-to / forward-to email" : "Forward to email"}</span>
                    <input
                      value={row.forward_to_email ?? ""}
                      onChange={(e) => updateRow(row.id, { forward_to_email: e.target.value })}
                      style={theme.formInput}
                      placeholder={row.channel_kind === "email" ? "contractor.personal@gmail.com" : "optional@email.com"}
                    />
                    {row.channel_kind === "email" && (
                      <span style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                        Outbound mail uses this as Reply-To. Keep it current so customers reach the right inbox.
                      </span>
                    )}
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
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6b7280" }}>
                  Provider: <strong style={{ color: theme.text }}>{row.channel_kind === "email" ? "resend" : row.provider || "twilio"}</strong>
                  {row.channel_kind === "email"
                    ? " — add the domain in Resend (send + receive) so this address works end-to-end."
                    : " — Twilio number / SMS webhooks use voice_sms channels."}
                </p>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
                  {[
                    ["voice_enabled", "Voice enabled"],
                    ["sms_enabled", "SMS enabled"],
                    ["email_enabled", "Email enabled"],
                    ["voicemail_enabled", "Twilio voicemail enabled"],
                    ["active", "Active"],
                  ]
                    .filter(([key]) => {
                      if (row.channel_kind === "email") {
                        return key === "email_enabled" || key === "active"
                      }
                      return key !== "email_enabled"
                    })
                    .map(([key, label]) => (
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

      {mode === "single_client" && selectedUserId ? (
        <AdminSettingBlock id="admin:communications:user_account">
          <h2 style={{ color: theme.text, margin: "0 0 8px", fontSize: 18 }}>User account (My T)</h2>
          <p style={{ color: theme.text, opacity: 0.8, margin: "0 0 12px", fontSize: 13 }}>
            Full account form for this user. Portal Builder controls which blocks they see on their Account tab.
          </p>
          <AccountProfilePanel profileUserId={selectedUserId} adminContext />
        </AdminSettingBlock>
      ) : null}
    </div>
  )
}
