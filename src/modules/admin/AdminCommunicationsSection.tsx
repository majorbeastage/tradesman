import { useEffect, useMemo, useState, type ChangeEvent } from "react"
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

/** Resend inbound webhook (Supabase Edge). Vercel /api/* may serve the SPA instead of serverless. */
const RESEND_INBOUND_WEBHOOK_URL =
  typeof import.meta.env.VITE_SUPABASE_URL === "string" && import.meta.env.VITE_SUPABASE_URL.trim() !== ""
    ? `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, "")}/functions/v1/resend-inbound`
    : "https://YOUR_PROJECT_REF.supabase.co/functions/v1/resend-inbound"

type HelpDeskOnSelect = "dial" | "pin_greeting" | "team_voicemail" | "thanks" | "submenu" | "trouble_ticket"

type HelpDeskOption = {
  id: string
  digit: string
  label: string
  enabled: boolean
  /** Optional: Twilio will dial this E.164 number when caller presses this digit and action is Dial. */
  forward_to_phone: string
  /** Empty = main menu. Set to a main-menu digit (1–8) so this row only appears in that submenu. */
  depends_on_digit: string
  /** Optional announcement clip before the action (URL to audio). */
  play_recording_url: string
  /** Stored in platform_settings as on_select. */
  on_select: HelpDeskOnSelect
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

/** Live UI + save: public vs private inbox must differ. */
function emailChannelAddressConflict(row: ChannelRow): string | null {
  if (row.channel_kind !== "email") return null
  const pub = normalizeEmailPublicAddress(row.public_address)
  const fwd = normalizeEmailPublicAddress(row.forward_to_email)
  if (pub && fwd && pub === fwd) {
    return "Cannot match public address. Tradesman would keep forwarding copies to the same inbox Resend already delivered to — that creates an endless loop. Use a different mailbox (personal Gmail, Apple Mail, etc.)."
  }
  return null
}

function validateEmailChannelsForSave(channelRows: ChannelRow[]) {
  for (const row of channelRows) {
    if (row.channel_kind !== "email") continue
    const msg = emailChannelAddressConflict(row)
    if (msg) throw new Error(`Email channel: ${msg}`)
  }
}

function inferHelpDeskOnSelect(row: Record<string, unknown>, forward: string): HelpDeskOnSelect {
  const s = typeof row.on_select === "string" ? row.on_select.trim() : ""
  if (s === "pin_greeting" || s === "team_voicemail" || s === "thanks" || s === "dial" || s === "submenu" || s === "trouble_ticket")
    return s
  return forward.trim() ? "dial" : "thanks"
}

function createHelpDeskOption(): HelpDeskOption {
  return {
    id: crypto.randomUUID(),
    digit: "",
    label: "",
    enabled: true,
    forward_to_phone: "",
    depends_on_digit: "",
    play_recording_url: "",
    on_select: "dial",
  }
}

function defaultHelpDeskSettings(): HelpDeskSettings {
  return {
    title: "Tradesman Help Desk",
    greeting_mode: "ai_text",
    greeting_text: "Thank you for calling Tradesman. Please listen carefully to the following options.",
    greeting_recording_url: "",
    menu_enabled: true,
    voicemail_notify_user_ids: "",
    options: [
      {
        id: crypto.randomUUID(),
        digit: "1",
        label: "Customer care",
        enabled: true,
        forward_to_phone: "",
        depends_on_digit: "",
        play_recording_url: "",
        on_select: "dial",
      },
      {
        id: crypto.randomUUID(),
        digit: "2",
        label: "Technical support",
        enabled: true,
        forward_to_phone: "",
        depends_on_digit: "",
        play_recording_url: "",
        on_select: "dial",
      },
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

  const helpDeskSubmenuParentDigits = useMemo(
    () =>
      [
        ...new Set(
          helpDeskSettings.options
            .filter((o) => !o.depends_on_digit && /^[1-8]$/.test(o.digit) && o.on_select === "submenu")
            .map((o) => o.digit),
        ),
      ].sort(),
    [helpDeskSettings.options],
  )

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
            menu_enabled: raw.menu_enabled !== false,
            voicemail_notify_user_ids: notifyStr,
            options: optionInput.map((option) => {
              const row = option && typeof option === "object" ? (option as Record<string, unknown>) : {}
              const forward = typeof row.forward_to_phone === "string" ? row.forward_to_phone : ""
              const dep = typeof row.depends_on_digit === "string" ? normalizeDigit(row.depends_on_digit) : ""
              const play = typeof row.play_recording_url === "string" ? row.play_recording_url : ""
              return {
                id: typeof row.id === "string" && row.id ? row.id : crypto.randomUUID(),
                digit: typeof row.digit === "string" ? normalizeDigit(row.digit) : "",
                label: typeof row.label === "string" ? row.label : "",
                enabled: row.enabled !== false,
                forward_to_phone: forward,
                depends_on_digit: dep,
                play_recording_url: play,
                on_select: inferHelpDeskOnSelect(row, forward),
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

  /** Saves communication channels + Google access log in one action (single_client only). */
  async function saveRoutingAndAccess() {
    if (!supabase || mode !== "single_client" || !selectedUserId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      validateEmailChannelsForSave(rows)
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

      const accessExisting = accessLogs.filter((r) => !r.id.startsWith("new-"))
      const accessNew = accessLogs.filter((r) => r.id.startsWith("new-"))
      for (const row of accessExisting) {
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
      if (accessNew.length > 0) {
        const payload = accessNew.map((row) => {
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

      setMessage("Phone, email routing, and access records saved.")
      const { data, error: reloadErr } = await supabase
        .from("client_communication_channels")
        .select("id, user_id, provider, channel_kind, provider_sid, friendly_name, public_address, forward_to_phone, forward_to_email, voice_enabled, sms_enabled, email_enabled, voicemail_enabled, voicemail_mode, active")
        .eq("user_id", selectedUserId)
        .order("created_at", { ascending: true })
      if (reloadErr) throw reloadErr
      setRows((data as ChannelRow[] | null) ?? [])
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
      setSaving(false)
    }
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
      setMessage("Access records saved.")
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
      const normalizedOptions = helpDeskSettings.options
        .map((option) => ({
          id: option.id,
          digit: normalizeDigit(option.digit),
          label: option.label.trim(),
          enabled: option.enabled,
          forward_to_phone: normalizePhone(option.forward_to_phone) ?? "",
          depends_on_digit: normalizeDigit(option.depends_on_digit),
          play_recording_url: option.play_recording_url.trim(),
          on_select: option.on_select,
        }))
        .filter((option) => option.digit || option.label)

      const notifyIds = helpDeskSettings.voicemail_notify_user_ids
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)

      const rootDigits = new Set<string>()
      const childDigitsByParent = new Map<string, Set<string>>()

      for (const option of normalizedOptions) {
        if (!option.digit || !option.label) throw new Error("Each help desk option needs both a keypad digit and a label.")
        if (option.digit === "0") throw new Error("Digit 0 is reserved for help desk voicemail. Use 1–8 for menu options.")
        if (option.digit === "9") throw new Error("Digit 9 is reserved for mailbox greeting updates (PIN flow). Use 1–8 for menu options.")
        if (option.depends_on_digit && (option.depends_on_digit === "0" || option.depends_on_digit === "9")) {
          throw new Error(`Dependency key ${option.depends_on_digit}: submenus can only attach to main keys 1–8.`)
        }
        if (option.depends_on_digit) {
          if (!childDigitsByParent.has(option.depends_on_digit)) childDigitsByParent.set(option.depends_on_digit, new Set())
          const s = childDigitsByParent.get(option.depends_on_digit)!
          if (s.has(option.digit)) {
            throw new Error(`Duplicate digit ${option.digit} under submenu ${option.depends_on_digit}. Each key must be unique within that submenu.`)
          }
          s.add(option.digit)
        } else {
          if (rootDigits.has(option.digit)) throw new Error(`Main menu digit ${option.digit} is used twice. Each main key must be unique.`)
          rootDigits.add(option.digit)
        }
        if (option.on_select === "dial" && !option.forward_to_phone) {
          throw new Error(
            `Key ${option.digit}: “Dial” requires a phone number, or change “When pressed” to PIN greeting, team voicemail, submenu, or thank you.`,
          )
        }
        if (option.on_select === "team_voicemail" && notifyIds.length === 0) {
          throw new Error(
            `Key ${option.digit}: add voicemail notify user IDs above before using “Team voicemail” on a menu option.`,
          )
        }
        if (option.on_select === "submenu" && option.depends_on_digit) {
          throw new Error(`Key ${option.digit}: “Open submenu” is only allowed on main menu rows (clear “Show after key”).`)
        }
      }

      const roots = normalizedOptions.filter((o) => !o.depends_on_digit)
      if (roots.length === 0 && normalizedOptions.length > 0) {
        throw new Error("Add at least one main menu row (clear “Show after key”) so callers hear a top-level menu.")
      }

      for (const r of roots) {
        if (r.on_select !== "submenu") continue
        const kids = normalizedOptions.filter((o) => o.depends_on_digit === r.digit && o.enabled)
        if (kids.length === 0) {
          throw new Error(`Main key ${r.digit}: “Open submenu” needs at least one enabled row with “Show after key” = ${r.digit}.`)
        }
      }

      for (const o of normalizedOptions) {
        if (!o.depends_on_digit) continue
        const parent = roots.find((r) => r.digit === o.depends_on_digit)
        if (!parent) {
          throw new Error(`Row “${o.label}”: no main menu key ${o.depends_on_digit}. Add that digit on a main row first.`)
        }
        if (parent.on_select !== "submenu") {
          throw new Error(
            `Row “${o.label}”: main key ${o.depends_on_digit} must use “Open submenu” so dependent rows appear after callers press that key.`,
          )
        }
      }

      const payload = {
        title: helpDeskSettings.title.trim() || "Tradesman Help Desk",
        greeting_mode: helpDeskSettings.greeting_mode,
        greeting_text:
          helpDeskSettings.greeting_text.trim() ||
          "Thank you for calling Tradesman. Please listen carefully to the following options.",
        greeting_recording_url: helpDeskSettings.greeting_recording_url.trim(),
        menu_enabled: helpDeskSettings.menu_enabled,
        voicemail_notify_user_ids: notifyIds,
        options: normalizedOptions.map((o) => ({
          id: o.id,
          digit: o.digit,
          label: o.label,
          enabled: o.enabled,
          forward_to_phone: o.forward_to_phone,
          depends_on_digit: o.depends_on_digit || undefined,
          play_recording_url: o.play_recording_url || undefined,
          on_select: o.on_select,
        })),
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
        options: normalizedOptions.map((option) => ({
          ...option,
          depends_on_digit: option.depends_on_digit ?? "",
          play_recording_url: option.play_recording_url ?? "",
        })),
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
                When set, callers can press 0 after the menu for help-desk voicemail; each listed user gets the recording in Conversations. Digits 0 and 9 are reserved (9 transfers to the PIN-based personal greeting recorder). Use 1–8 for menu options only.
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
                    Configure digits 1–8 on the main menu or in a one-level submenu. Built-in keys <strong>0</strong> and <strong>9</strong> are always active when the menu runs (see below). Optional <strong>Announcement URL</strong> plays before dial, redirect, or voicemail. If your caller ID matches{" "}
                    <strong>Forward to phone</strong> on a channel or <strong>primary phone</strong> on the profile, the greeting recorder skips PIN entry. Twilio voice URL:{" "}
                    <code style={{ fontSize: 11 }}>POST …/api/help-desk-voice</code>.
                  </p>
                </div>
                <button type="button" onClick={() => setHelpDeskSettings((prev) => ({ ...prev, options: [...prev.options, createHelpDeskOption()] }))} style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", color: theme.text, cursor: "pointer" }}>
                  Add option
                </button>
              </div>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #93c5fd",
                  background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
                  fontSize: 13,
                  color: "#1e3a8a",
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Built-in keys (not editable here — always wired in the auto attendant)</div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>
                    <strong>0</strong> — Help-desk team voicemail (requires <em>Voicemail notify user IDs</em> above). Same behavior as a menu row set to “Team voicemail”.
                  </li>
                  <li>
                    <strong>9</strong> — Personal mailbox greeting (PIN flow at <code style={{ fontSize: 11 }}>/api/voicemail-greeting</code>). Same as a row set to “PIN greeting recorder”.
                  </li>
                </ul>
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
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, alignItems: "end" }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Show after key</span>
                            <select
                              value={option.depends_on_digit || ""}
                              onChange={(e) => updateHelpDeskOption(option.id, { depends_on_digit: normalizeDigit(e.target.value) })}
                              style={theme.formInput}
                            >
                              <option value="">Main menu (top level)</option>
                              {helpDeskSubmenuParentDigits.map((d) => (
                                <option key={d} value={d}>
                                  Submenu after caller presses {d}
                                </option>
                              ))}
                            </select>
                            <span style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.45 }}>Add a main row with “Open submenu” first, then attach rows here.</span>
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Digit</span>
                            <input value={option.digit} onChange={(e) => updateHelpDeskOption(option.id, { digit: normalizeDigit(e.target.value) })} style={theme.formInput} placeholder="1" maxLength={1} />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Label</span>
                            <input value={option.label} onChange={(e) => updateHelpDeskOption(option.id, { label: e.target.value })} style={theme.formInput} placeholder="Customer care" />
                          </label>
                          <button
                            type="button"
                            onClick={() => setHelpDeskSettings((prev) => ({ ...prev, options: prev.options.filter((row) => row.id !== option.id) }))}
                            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "white", color: "#b91c1c", cursor: "pointer", height: 40 }}
                          >
                            Remove
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end", marginTop: 12 }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Forward to phone (optional)</span>
                            <input
                              value={option.forward_to_phone}
                              onChange={(e) => updateHelpDeskOption(option.id, { forward_to_phone: e.target.value })}
                              style={theme.formInput}
                              placeholder="+15551234567"
                            />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Announcement / recording URL (optional)</span>
                            <input
                              value={option.play_recording_url}
                              onChange={(e) => updateHelpDeskOption(option.id, { play_recording_url: e.target.value })}
                              style={theme.formInput}
                              placeholder="https://…/clip.mp3"
                            />
                          </label>
                        </div>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>When caller presses this key</span>
                          <select
                            value={option.on_select}
                            onChange={(e) => updateHelpDeskOption(option.id, { on_select: e.target.value as HelpDeskOnSelect })}
                            style={theme.formInput}
                          >
                            <option value="dial">Dial the number above</option>
                            <option value="submenu">Open submenu (add rows with “Show after key” = this row&apos;s digit)</option>
                            <option value="pin_greeting">PIN greeting recorder (same as pressing 9)</option>
                            <option value="team_voicemail">Team voicemail (same as pressing 0)</option>
                            <option value="thanks">Thank you and hang up</option>
                            <option value="trouble_ticket">Trouble ticket (voicemail + AI transcript → admin Trouble Tickets)</option>
                          </select>
                          <span style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.45 }}>
                            Routing uses this dropdown. <strong>Open submenu</strong> only on main-menu rows; then add dependent rows for the second menu tier.
                          </span>
                        </label>
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
              <div style={{ padding: "8px 10px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa", color: "#9a3412" }}>
                If the voice URL is set to <code style={{ fontSize: 11 }}>/api/voicemail-greeting</code> instead, callers never hear this menu — they only get the PIN / record flow. Use <code style={{ fontSize: 11 }}>help-desk-voice</code> here; press <strong>9</strong> on the menu to reach the greeting PIN flow.
              </div>
              <div>
                <strong>Save help desk</strong> writes to <code style={{ fontSize: 11 }}>platform_settings.tradesman_help_desk</code> — the next inbound call uses that JSON. <strong>Dial</strong> needs a number; <strong>Open submenu</strong> needs dependent rows; <strong>PIN greeting</strong> matches key 9; <strong>Team voicemail</strong> matches key 0 and needs notify IDs; <strong>Trouble ticket</strong> records voicemail with Twilio transcription and creates a <code style={{ fontSize: 11 }}>CALL-</code> ticket (see admin Trouble tickets + Vercel env <code style={{ fontSize: 11 }}>HELP_DESK_TICKET_*</code>).
              </div>
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
            <p style={{ color: theme.text, opacity: 0.85, margin: 0, lineHeight: 1.5 }}>
              Use the channel cards below for <strong>both</strong> phone/SMS and email. <strong>Save all (phone, email &amp; access)</strong> saves those channels and the Google access records together. Add extra channels only when you need more numbers or addresses.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => selectedUserId && setRows((prev) => [...prev, emptyChannel(selectedUserId)])} style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", color: theme.text, cursor: "pointer" }}>
              Add channel
            </button>
            <button
              type="button"
              onClick={() => void saveRoutingAndAccess()}
              disabled={saving}
              style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: theme.primary, color: "white", fontWeight: 600, cursor: saving ? "wait" : "pointer" }}
            >
              {saving ? "Saving..." : "Save all (phone, email & access)"}
            </button>
          </div>
        </div>
        {message && <p style={{ color: "#059669", marginBottom: 0 }}>{message}</p>}
        {error && <p style={{ color: "#b91c1c", marginBottom: 0 }}>{error}</p>}
      </AdminSettingBlock>

      {mode === "single_client" && selectedUserId ? (
        <AdminSettingBlock id="admin:communications:simple_outbound_email">
          <h2 style={{ color: theme.text, margin: "0 0 8px", fontSize: 17 }}>Email to customers — simple model</h2>
          <p style={{ margin: "0 0 12px", color: theme.text, lineHeight: 1.55, fontSize: 14 }}>
            <strong>From</strong> your public Tradesman address · <strong>To</strong> the customer · <strong>BCC</strong> (and Reply-To) your real inbox in Step 2 — so you always get a copy in your own mail without anything extra.
          </p>
          <ol style={{ margin: "0 0 8px", paddingLeft: 22, color: theme.text, lineHeight: 1.55, fontSize: 14 }}>
            <li>
              <strong>Step 1</strong> = address customers see. Create it in{" "}
              <a href="https://resend.com/domains" target="_blank" rel="noreferrer" style={{ color: theme.primary }}>
                Resend
              </a>{" "}
              to match exactly.
            </li>
            <li>
              <strong>Step 2</strong> = your personal/work inbox (must differ from Step 1). Saves here → Tradesman <strong>BCCs</strong> you on every Conversations send to a customer.
            </li>
            <li>
              Click <strong>Save</strong> below. Vercel needs <code style={{ fontSize: 11 }}>RESEND_API_KEY</code>.
            </li>
          </ol>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            No separate “forward” setup for outbound copies — BCC handles it. If copies are missing, check spam and Resend delivery logs.
          </p>
        </AdminSettingBlock>
      ) : null}

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
            Voicemail and greeting flows still need a focused test pass (upload, PIN, Twilio routing). Configure Tradesman email addresses in the <strong>Email</strong> channel rows below.
          </div>
        </div>
      ) : null}

      {mode === "single_client" && selectedUserId ? (
        <AdminSettingBlock id="admin:communications:email_routing_guide">
          <details style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "12px 14px", background: "#fafafa" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: theme.text, fontSize: 16 }}>
              Email &amp; Resend reference (webhook URL, troubleshooting) — expand if needed
            </summary>
            <div style={{ marginTop: 14 }}>
          <h2 style={{ color: theme.text, margin: "0 0 8px", fontSize: 17 }}>Email routing (Resend + Google / lead capture)</h2>
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
              <strong style={{ color: theme.text }}>1. Outbound (Conversations → customer)</strong>
              <p style={{ margin: "6px 0 0", opacity: 0.9 }}>
                The app calls{" "}
                <code style={{ fontSize: 11 }}>POST {typeof window !== "undefined" ? window.location.origin : ""}/api/send-email</code>.{" "}
                Vercel needs <code style={{ fontSize: 11 }}>RESEND_API_KEY</code>. Sends <strong>from</strong> Step 1 (public business address), <strong>To</strong> = customer,{" "}
                <strong>Reply-To</strong> = Step 2, and <strong>BCC</strong> = Step 2 (so the contractor gets a copy in their real inbox).
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
                <strong>Recommended (works with Vite on Vercel):</strong> deploy the Supabase Edge Function{" "}
                <code style={{ fontSize: 11 }}>resend-inbound</code> (<code style={{ fontSize: 11 }}>supabase functions deploy resend-inbound</code>
                ). In Resend → <strong>Webhooks</strong>, set event <code style={{ fontSize: 11 }}>email.received</code> →{" "}
                <code style={{ fontSize: 11 }}>POST {RESEND_INBOUND_WEBHOOK_URL}</code>. In Supabase → Project Settings → Edge Functions → Secrets, set{" "}
                <code style={{ fontSize: 11 }}>RESEND_API_KEY</code> and <code style={{ fontSize: 11 }}>RESEND_WEBHOOK_SECRET</code> (same signing secret as in Resend).{" "}
                Open the URL in a browser: you should see JSON <code style={{ fontSize: 11 }}>{`{"ok":true,"route":"resend-inbound"}`}</code> with{" "}
                <code style={{ fontSize: 11 }}>runtime: supabase-edge</code>.
              </p>
              <p style={{ margin: "8px 0 0", opacity: 0.85, fontSize: 12 }}>
                Optional Vercel URL (often returns the SPA instead of JSON):{" "}
                <code style={{ fontSize: 11 }}>{typeof window !== "undefined" ? window.location.origin : ""}/api/incoming-email</code> — requires{" "}
                <code style={{ fontSize: 11 }}>RESEND_*</code> env vars on Vercel if routing works.
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
              <strong style={{ color: theme.text }}>4. Field cheat sheet (matches the channel form)</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, opacity: 0.9 }}>
                <li>
                  <strong>Step 1 — Public business email</strong> — the address the world uses; must match Resend receiving and inbound <code style={{ fontSize: 11 }}>To</code>.
                </li>
                <li>
                  <strong>Step 2 — Personal or work inbox</strong> — different mailbox; Reply-To on outbound and optional copy of inbound. Never the same as Step 1.
                </li>
                <li>
                  <strong>Email enabled</strong> — on so this row is used for <code style={{ fontSize: 11 }}>/api/send-email</code> and inbound routing.
                </li>
              </ul>
            </div>
          </div>
            </div>
          </details>
        </AdminSettingBlock>
      ) : null}

      <AdminSettingBlock id="admin:communications:channels">
        <h2 style={{ color: theme.text, margin: "0 0 12px", fontSize: 18 }}>Phone &amp; email channels</h2>
        {loading ? (
          <p style={{ margin: 0, color: theme.text }}>Loading communication channels...</p>
        ) : rows.length === 0 ? (
          <p style={{ margin: 0, color: theme.text, opacity: 0.8 }}>No channels yet. Add a row for Twilio (phone/SMS) and/or Email — use Step 1 + Step 2 for any Email channel.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {rows.map((row) => {
              const emailConflict = row.channel_kind === "email" ? emailChannelAddressConflict(row) : null
              return (
              <div key={row.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 16, background: "#fff" }}>
                {row.channel_kind === "email" ? (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14, alignItems: "flex-end" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Channel kind</span>
                        <select value={row.channel_kind} onChange={(e) => updateRow(row.id, { channel_kind: e.target.value as ChannelRow["channel_kind"] })} style={theme.formInput}>
                          <option value="voice_sms">Voice / SMS</option>
                          <option value="email">Email</option>
                        </select>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Label (optional)</span>
                        <input value={row.friendly_name ?? ""} onChange={(e) => updateRow(row.id, { friendly_name: e.target.value })} style={theme.formInput} placeholder="e.g. Main company email" />
                      </label>
                    </div>

                    <div
                      style={{
                        border: "1px solid #93c5fd",
                        borderRadius: 10,
                        padding: 14,
                        background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", marginBottom: 6 }}>Step 1 — Public address (where the world sends mail)</div>
                      <p style={{ fontSize: 12, color: "#1e40af", margin: "0 0 12px", lineHeight: 1.55, opacity: 0.95 }}>
                        Same address on Google Business Profile, website, and Resend receiving. Tradesman matches inbound mail to this field — not to your personal inbox below.
                      </p>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1e3a8a" }}>Public business email</span>
                        <input
                          value={row.public_address}
                          onChange={(e) => updateRow(row.id, { public_address: e.target.value })}
                          style={theme.formInput}
                          placeholder="jane.plumbing@your-domain.com"
                        />
                        <span style={{ fontSize: 11, color: "#3730a3", lineHeight: 1.45 }}>Stored lowercase. Must match the address Resend reports on inbound messages.</span>
                      </label>
                    </div>

                    <div
                      style={{
                        border: "1px solid #fcd34d",
                        borderRadius: 10,
                        padding: 14,
                        background: "linear-gradient(180deg, #fffbeb 0%, #fff 100%)",
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#78350f", marginBottom: 6 }}>Step 2 — Your real inbox (Reply-To + BCC)</div>
                      <p style={{ fontSize: 12, color: "#92400e", margin: "0 0 12px", lineHeight: 1.55 }}>
                        When this user sends email to a <strong>customer</strong> from Conversations, Tradesman sets this address as <strong>Reply-To</strong> and <strong>BCC</strong> so you get a copy in your normal mail app. Optional: inbound-forward copies can still use this address per your Resend setup. Must be <strong>different</strong> from Step 1 (same address in both causes a loop; blocked on save).
                      </p>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#78350f" }}>Personal or work inbox (Gmail, Outlook, …)</span>
                        <input
                          value={row.forward_to_email ?? ""}
                          onChange={(e) => updateRow(row.id, { forward_to_email: e.target.value })}
                          style={theme.formInput}
                          placeholder="you.personal@gmail.com"
                        />
                        <span style={{ fontSize: 11, color: "#a16207", lineHeight: 1.45 }}>
                          Leave blank to skip Reply-To and BCC on outbound (you will only see sends inside Tradesman). Tradesman blocks loops if this matches Step 1.
                        </span>
                      </label>
                      {emailConflict ? (
                        <div
                          role="alert"
                          style={{
                            marginTop: 12,
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            color: "#991b1b",
                            fontSize: 12,
                            lineHeight: 1.45,
                          }}
                        >
                          {emailConflict}
                        </div>
                      ) : null}
                    </div>

                    <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, maxWidth: 420 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Provider SID (optional)</span>
                      <input value={row.provider_sid ?? ""} onChange={(e) => updateRow(row.id, { provider_sid: e.target.value })} style={theme.formInput} placeholder="Resend reference if you use one" />
                    </label>

                    <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
                      Provider: <strong style={{ color: theme.text }}>resend</strong> — configure send + receive for this domain in Resend.
                    </p>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {[
                        ["email_enabled", "Email enabled"],
                        ["active", "Active"],
                      ].map(([key, label]) => (
                        <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontSize: 13 }}>
                          <input type="checkbox" checked={Boolean(row[key as keyof ChannelRow])} onChange={(e) => updateRow(row.id, { [key]: e.target.checked } as Partial<ChannelRow>)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Channel kind</span>
                        <select value={row.channel_kind} onChange={(e) => updateRow(row.id, { channel_kind: e.target.value as ChannelRow["channel_kind"] })} style={theme.formInput}>
                          <option value="voice_sms">Voice / SMS</option>
                          <option value="email">Email</option>
                        </select>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Public number / address</span>
                        <input
                          value={row.public_address}
                          onChange={(e) => updateRow(row.id, { public_address: e.target.value })}
                          style={theme.formInput}
                          placeholder="+15551234567"
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Forward to phone</span>
                        <input value={row.forward_to_phone ?? ""} onChange={(e) => updateRow(row.id, { forward_to_phone: e.target.value })} style={theme.formInput} placeholder="+15557654321" />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Forward to email (optional)</span>
                        <input
                          value={row.forward_to_email ?? ""}
                          onChange={(e) => updateRow(row.id, { forward_to_email: e.target.value })}
                          style={theme.formInput}
                          placeholder="optional@email.com"
                        />
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
                      Provider: <strong style={{ color: theme.text }}>{row.provider || "twilio"}</strong>
                      {" — Twilio number / SMS webhooks use voice_sms channels."}
                    </p>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
                      {[
                        ["voice_enabled", "Voice enabled"],
                        ["sms_enabled", "SMS enabled"],
                        ["voicemail_enabled", "Twilio voicemail enabled"],
                        ["active", "Active"],
                      ].map(([key, label]) => (
                        <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontSize: 13 }}>
                          <input type="checkbox" checked={Boolean(row[key as keyof ChannelRow])} onChange={(e) => updateRow(row.id, { [key]: e.target.checked } as Partial<ChannelRow>)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => void removeRow(row)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "white", color: "#b91c1c", cursor: "pointer" }}>
                    Remove channel
                  </button>
                </div>
              </div>
              )
            })}
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
            <button
              type="button"
              onClick={() => void saveAccessLogs()}
              disabled={savingAccess || saving}
              style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", color: theme.text, fontWeight: 600, cursor: savingAccess || saving ? "wait" : "pointer" }}
            >
              {savingAccess ? "Saving..." : "Save access only"}
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
