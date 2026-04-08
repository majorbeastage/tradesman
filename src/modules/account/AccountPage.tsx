import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react"
import { HELP_DESK_PHONE_DISPLAY, HELP_DESK_PHONE_E164 } from "../../constants/helpDesk"
import { supabase } from "../../lib/supabase"
import { getPasswordRecoveryRedirectTo } from "../../lib/authRedirectBase"
import { theme } from "../../styles/theme"
import { useAuth } from "../../contexts/AuthContext"
import { usePortalConfigForPage } from "../../contexts/OfficeManagerScopeContext"
import { getAccountSectionVisible, getOrderedAccountPortalSections } from "../../types/portal-builder"

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

type BusinessHour = {
  enabled: boolean
  open: string
  close: string
}

type BusinessHours = Record<DayKey, BusinessHour>

type ProfileForm = {
  display_name: string
  website_url: string
  primary_phone: string
  best_contact_phone: string
  address_line_1: string
  address_line_2: string
  address_city: string
  address_state: string
  address_zip: string
  service_radius_enabled: boolean
  service_radius_miles: string
  timezone: string
  call_forwarding_enabled: boolean
  call_forwarding_outside_business_hours: boolean
  business_hours: BusinessHours
  voicemail_greeting_mode: "ai_text" | "recorded"
  voicemail_greeting_text: string
  voicemail_greeting_recording_url: string
  voicemail_greeting_pin: string
  forward_whisper_on_answer: boolean
  forward_whisper_announcement_template: string
  forward_whisper_only_outside_business_hours: boolean
  forward_whisper_require_keypress: boolean
  /** profiles.voicemail_conversations_display — overrides Conversations UI only. */
  voicemail_conversations_display: "use_channel" | "summary" | "full_transcript"
  embed_lead_enabled: boolean
  embed_lead_slug: string
  ai_thread_summary_enabled: boolean
  ai_assistant_visible: boolean
  document_template_quote: string
  document_template_receipt: string
}

const DEFAULT_WHISPER_TEMPLATE_HINT =
  "Incoming Tradesman call from {caller_name}. Caller number {caller_phone_spoken}. Leave blank for the default announcement."

const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
]

const DAY_LABELS: Array<{ key: DayKey; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
]

const VOICEMAIL_GREETING_BUCKET = "voicemail-greetings"

const ACCOUNT_SECTION_CARD: CSSProperties = {
  padding: 16,
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: "#fafafa",
  display: "grid",
  gap: 12,
}

function defaultBusinessHours(): BusinessHours {
  return {
    mon: { enabled: true, open: "09:00", close: "17:00" },
    tue: { enabled: true, open: "09:00", close: "17:00" },
    wed: { enabled: true, open: "09:00", close: "17:00" },
    thu: { enabled: true, open: "09:00", close: "17:00" },
    fri: { enabled: true, open: "09:00", close: "17:00" },
    sat: { enabled: false, open: "09:00", close: "17:00" },
    sun: { enabled: false, open: "09:00", close: "17:00" },
  }
}

function normalizePhone(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const keepPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return ""
  return `${keepPlus ? "+" : ""}${digits}`
}

function formatPhone(value: string): string {
  const normalized = normalizePhone(value)
  const digits = normalized.replace(/\D/g, "")
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return normalized || value.trim()
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function formatBusinessAddress(form: ProfileForm): string {
  const lines = [form.address_line_1.trim(), form.address_line_2.trim()].filter(Boolean)
  const cityStateZip = [form.address_city.trim(), form.address_state.trim(), form.address_zip.trim()].filter(Boolean)
  if (cityStateZip.length) lines.push(cityStateZip.join(", ").replace(", ,", ","))
  return lines.join("\n")
}

function parseBusinessHours(value: unknown): BusinessHours {
  const base = defaultBusinessHours()
  if (!value || typeof value !== "object" || Array.isArray(value)) return base
  const input = value as Record<string, unknown>
  for (const { key } of DAY_LABELS) {
    const raw = input[key]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const day = raw as Record<string, unknown>
    base[key] = {
      enabled: day.enabled !== false,
      open: typeof day.open === "string" && day.open ? day.open : base[key].open,
      close: typeof day.close === "string" && day.close ? day.close : base[key].close,
    }
  }
  return base
}

function normalizePin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6)
}

function createGreetingPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export type AccountProfilePanelProps = {
  profileUserId: string
  loginEmail?: string
  showPasswordReset?: boolean
  adminContext?: boolean
}

export function AccountProfilePanel({
  profileUserId,
  loginEmail,
  showPasswordReset = false,
  adminContext = false,
}: AccountProfilePanelProps) {
  const { user, refetchProfile } = useAuth()
  const portalConfig = usePortalConfigForPage()
  const showAccountSection = (sectionId: string) =>
    adminContext || getAccountSectionVisible(portalConfig, sectionId)
  const orderedAccountSectionIds = useMemo(
    () => getOrderedAccountPortalSections(portalConfig).map((s) => s.id),
    [portalConfig],
  )
  /** Voicemail + help desk render in one card when both are enabled in portal order. */
  const accountSectionIdsForRender = useMemo(() => {
    const ids = [...orderedAccountSectionIds]
    const showVm = showAccountSection("voicemail")
    const showHd = showAccountSection("help_desk")
    if (showVm && showHd && ids.includes("voicemail") && ids.includes("help_desk")) {
      return ids.filter((id) => id !== "help_desk")
    }
    return ids
  }, [orderedAccountSectionIds, portalConfig, adminContext])
  const [profileEmailFromDb, setProfileEmailFromDb] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [uploadingGreeting, setUploadingGreeting] = useState(false)
  const [recordingGreeting, setRecordingGreeting] = useState(false)
  const [recordingSupported, setRecordingSupported] = useState(false)
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState("")
  const [voicemailExpanded, setVoicemailExpanded] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const [form, setForm] = useState<ProfileForm>({
    display_name: "",
    website_url: "",
    primary_phone: "",
    best_contact_phone: "",
    address_line_1: "",
    address_line_2: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    service_radius_enabled: false,
    service_radius_miles: "",
    timezone: "America/New_York",
    call_forwarding_enabled: true,
    call_forwarding_outside_business_hours: false,
    business_hours: defaultBusinessHours(),
    voicemail_greeting_mode: "ai_text",
    voicemail_greeting_text: "Sorry we missed your call. Please leave a message after the tone.",
    voicemail_greeting_recording_url: "",
    voicemail_greeting_pin: createGreetingPin(),
    forward_whisper_on_answer: false,
    forward_whisper_announcement_template: "",
    forward_whisper_only_outside_business_hours: false,
    forward_whisper_require_keypress: false,
    voicemail_conversations_display: "use_channel",
    embed_lead_enabled: false,
    embed_lead_slug: "",
    ai_thread_summary_enabled: false,
    ai_assistant_visible: false,
    document_template_quote: "",
    document_template_receipt: "",
  })

  const emailForDisplay = useMemo(() => (loginEmail?.trim() || profileEmailFromDb).trim(), [loginEmail, profileEmailFromDb])

  useEffect(() => {
    setRecordingSupported(typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia)
  }, [])

  useEffect(() => {
    return () => {
      if (recordingPreviewUrl) URL.revokeObjectURL(recordingPreviewUrl)
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [recordingPreviewUrl])

  useEffect(() => {
    if (!supabase || !profileUserId) return
    setLoading(true)
    setError("")
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("email, display_name, website_url, primary_phone, best_contact_phone, business_address, address_line_1, address_line_2, address_city, address_state, address_zip, service_radius_enabled, service_radius_miles, timezone, business_hours, call_forwarding_enabled, call_forwarding_outside_business_hours, voicemail_greeting_mode, voicemail_greeting_text, voicemail_greeting_recording_url, voicemail_greeting_pin, forward_whisper_on_answer, forward_whisper_announcement_template, forward_whisper_only_outside_business_hours, forward_whisper_require_keypress, voicemail_conversations_display, embed_lead_enabled, embed_lead_slug, ai_thread_summary_enabled, ai_assistant_visible, document_template_quote, document_template_receipt")
          .eq("id", profileUserId)
          .single()
        if (error) throw error
        setProfileEmailFromDb(typeof data?.email === "string" ? data.email : "")
        const row = data as {
          service_radius_enabled?: boolean | null
          service_radius_miles?: number | string | null
        }
        const milesRaw = row.service_radius_miles
        const milesStr =
          milesRaw != null && milesRaw !== ""
            ? String(typeof milesRaw === "number" ? milesRaw : String(milesRaw).trim())
            : ""
        setForm({
          display_name: data?.display_name ?? "",
          website_url: data?.website_url ?? "",
          primary_phone: formatPhone(data?.primary_phone ?? ""),
          best_contact_phone: formatPhone((data as { best_contact_phone?: string | null })?.best_contact_phone ?? ""),
          address_line_1: data?.address_line_1 ?? "",
          address_line_2: data?.address_line_2 ?? "",
          address_city: data?.address_city ?? "",
          address_state: data?.address_state ?? "",
          address_zip: data?.address_zip ?? "",
          service_radius_enabled: row.service_radius_enabled === true,
          service_radius_miles: milesStr,
          timezone: data?.timezone ?? "America/New_York",
          call_forwarding_enabled: data?.call_forwarding_enabled !== false,
          call_forwarding_outside_business_hours: data?.call_forwarding_outside_business_hours === true,
          business_hours: parseBusinessHours(data?.business_hours),
          voicemail_greeting_mode: data?.voicemail_greeting_mode === "recorded" ? "recorded" : "ai_text",
          voicemail_greeting_text: data?.voicemail_greeting_text ?? "Sorry we missed your call. Please leave a message after the tone.",
          voicemail_greeting_recording_url: data?.voicemail_greeting_recording_url ?? "",
          voicemail_greeting_pin: normalizePin(data?.voicemail_greeting_pin ?? "") || createGreetingPin(),
          forward_whisper_on_answer: data?.forward_whisper_on_answer === true,
          forward_whisper_announcement_template: typeof data?.forward_whisper_announcement_template === "string" ? data.forward_whisper_announcement_template : "",
          forward_whisper_only_outside_business_hours: data?.forward_whisper_only_outside_business_hours === true,
          forward_whisper_require_keypress: data?.forward_whisper_require_keypress === true,
          voicemail_conversations_display:
            (data as { voicemail_conversations_display?: string }).voicemail_conversations_display === "summary" ||
            (data as { voicemail_conversations_display?: string }).voicemail_conversations_display === "full_transcript"
              ? ((data as { voicemail_conversations_display?: string }).voicemail_conversations_display as ProfileForm["voicemail_conversations_display"])
              : "use_channel",
          embed_lead_enabled: (data as { embed_lead_enabled?: boolean }).embed_lead_enabled === true,
          embed_lead_slug: String((data as { embed_lead_slug?: string | null }).embed_lead_slug ?? "").trim(),
          ai_thread_summary_enabled: (data as { ai_thread_summary_enabled?: boolean }).ai_thread_summary_enabled === true,
          ai_assistant_visible: (data as { ai_assistant_visible?: boolean }).ai_assistant_visible === true,
          document_template_quote: String((data as { document_template_quote?: string | null }).document_template_quote ?? ""),
          document_template_receipt: String((data as { document_template_receipt?: string | null }).document_template_receipt ?? ""),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [profileUserId])

  async function handleSave() {
    if (!supabase || !profileUserId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const website_url = form.website_url.trim() ? normalizeUrl(form.website_url) : null
      const payload = {
        display_name: form.display_name.trim() || null,
        website_url,
        primary_phone: normalizePhone(form.primary_phone) || null,
        best_contact_phone: form.best_contact_phone.trim() ? normalizePhone(form.best_contact_phone) || null : null,
        address_line_1: form.address_line_1.trim() || null,
        address_line_2: form.address_line_2.trim() || null,
        address_city: form.address_city.trim() || null,
        address_state: form.address_state.trim() || null,
        address_zip: form.address_zip.trim() || null,
        business_address: formatBusinessAddress(form) || null,
        service_radius_enabled: form.service_radius_enabled,
        service_radius_miles: (() => {
          if (!form.service_radius_enabled) return null
          const t = form.service_radius_miles.trim()
          if (!t) return null
          const n = Number.parseFloat(t)
          return Number.isFinite(n) && n >= 0 ? n : null
        })(),
        timezone: form.timezone || "America/New_York",
        business_hours: form.business_hours,
        call_forwarding_enabled: form.call_forwarding_enabled,
        call_forwarding_outside_business_hours: form.call_forwarding_outside_business_hours,
        voicemail_greeting_mode: form.voicemail_greeting_mode,
        voicemail_greeting_text: form.voicemail_greeting_text.trim() || "Sorry we missed your call. Please leave a message after the tone.",
        voicemail_greeting_recording_url: form.voicemail_greeting_recording_url.trim() || null,
        voicemail_greeting_pin: normalizePin(form.voicemail_greeting_pin) || createGreetingPin(),
        forward_whisper_on_answer: form.forward_whisper_on_answer,
        forward_whisper_announcement_template: form.forward_whisper_announcement_template.trim() || null,
        forward_whisper_only_outside_business_hours: form.forward_whisper_only_outside_business_hours,
        forward_whisper_require_keypress: form.forward_whisper_require_keypress,
        voicemail_conversations_display: form.voicemail_conversations_display,
        embed_lead_enabled: form.embed_lead_enabled,
        embed_lead_slug: form.embed_lead_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64) || null,
        ai_thread_summary_enabled: form.ai_thread_summary_enabled,
        ai_assistant_visible: form.ai_assistant_visible,
        document_template_quote: form.document_template_quote.trim() || null,
        document_template_receipt: form.document_template_receipt.trim() || null,
        updated_at: new Date().toISOString(),
      }
      let { error } = await supabase.from("profiles").update(payload).eq("id", profileUserId)
      if (
        error &&
        (error.code === "23505" || /duplicate key|unique constraint|voicemail_greeting_pin/i.test(error.message ?? ""))
      ) {
        const freshPin = createGreetingPin()
        const payloadRetry = { ...payload, voicemail_greeting_pin: normalizePin(freshPin) }
        setForm((prev) => ({ ...prev, voicemail_greeting_pin: freshPin }))
        const second = await supabase.from("profiles").update(payloadRetry).eq("id", profileUserId)
        error = second.error
      }
      if (error) throw error
      if (user?.id === profileUserId) await refetchProfile()
      setForm((prev) => ({
        ...prev,
        website_url: website_url ?? "",
        primary_phone: formatPhone(payload.primary_phone ?? ""),
        best_contact_phone: formatPhone(payload.best_contact_phone ?? ""),
      }))
      setMessage(adminContext ? "User account updated." : "Account updated.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordReset() {
    if (!supabase || !emailForDisplay) return
    setResetting(true)
    setMessage("")
    setError("")
    try {
      const redirectTo = getPasswordRecoveryRedirectTo() || undefined
      const { error } = await supabase.auth.resetPasswordForEmail(emailForDisplay, redirectTo ? { redirectTo } : undefined)
      if (error) throw error
      setMessage("Password reset email sent.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResetting(false)
    }
  }

  function getGreetingFilePath(extension: string): string {
    return `${profileUserId}/greeting-${Date.now()}.${extension}`
  }

  async function uploadGreetingFile(file: Blob, extension: string, contentType: string) {
    if (!supabase || !profileUserId) return
    setUploadingGreeting(true)
    setMessage("")
    setError("")
    try {
      const filePath = getGreetingFilePath(extension)
      const { error: uploadError } = await supabase.storage
        .from(VOICEMAIL_GREETING_BUCKET)
        .upload(filePath, file, { upsert: true, contentType })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(VOICEMAIL_GREETING_BUCKET).getPublicUrl(filePath)
      const publicUrl = data.publicUrl
      setForm((prev) => ({
        ...prev,
        voicemail_greeting_mode: "recorded",
        voicemail_greeting_recording_url: publicUrl,
      }))
      setRecordingPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return ""
      })
      const { error: persistErr } = await supabase
        .from("profiles")
        .update({
          voicemail_greeting_mode: "recorded",
          voicemail_greeting_recording_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileUserId)
      if (persistErr) throw persistErr
      if (user?.id === profileUserId) await refetchProfile()
      setMessage(adminContext ? "Greeting uploaded and saved to this user’s profile." : "Greeting uploaded and saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadingGreeting(false)
    }
  }

  async function handleGreetingFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const extension = file.name.split(".").pop()?.toLowerCase() || "mp3"
    await uploadGreetingFile(file, extension, file.type || "audio/mpeg")
  }

  async function handleStartRecording() {
    if (!recordingSupported) {
      setError("This browser does not support microphone recording.")
      return
    }
    setMessage("")
    setError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm"
      const recorder = new MediaRecorder(stream, { mimeType })
      recordedChunksRef.current = []
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        setRecordingGreeting(false)
        if (!blob.size) return
        await uploadGreetingFile(blob, "webm", blob.type || "audio/webm")
      }
      recorder.start()
      setRecordingGreeting(true)
    } catch (err) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
      mediaRecorderRef.current = null
      setRecordingGreeting(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
  }

  return (
    <div style={{ padding: 20, borderRadius: 12, background: "#ffffff", border: `1px solid ${theme.border}` }}>
      {adminContext && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 18, color: theme.text }}>User account (My T)</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Same fields as the client sees on Account. Saves to this user&apos;s profile row in Supabase.
          </p>
        </div>
      )}
        {loading ? (
          <p style={{ color: theme.text, margin: 0 }}>Loading account...</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {accountSectionIdsForRender.map((sectionId) => {
              if (!showAccountSection(sectionId)) return null
              if (sectionId === "profile") return (
            <Fragment key={sectionId}>
            <div style={ACCOUNT_SECTION_CARD}>
              <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>Contact &amp; profile</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
                Login email, display name, website, and phones.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Login email</span>
                <input value={emailForDisplay} readOnly style={{ ...theme.formInput, background: "#f9fafb", color: "#6b7280" }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Business / display name</span>
                <input value={form.display_name} onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))} style={theme.formInput} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Website URL</span>
                <input value={form.website_url} onChange={(e) => setForm((prev) => ({ ...prev, website_url: e.target.value }))} style={theme.formInput} placeholder="https://example.com" />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Primary phone</span>
                <input value={form.primary_phone} onChange={(e) => setForm((prev) => ({ ...prev, primary_phone: e.target.value }))} onBlur={() => setForm((prev) => ({ ...prev, primary_phone: formatPhone(prev.primary_phone) }))} style={theme.formInput} placeholder="(555) 123-4567" />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Best contact phone (optional)</span>
                <input
                  value={form.best_contact_phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, best_contact_phone: e.target.value }))}
                  onBlur={() => setForm((prev) => ({ ...prev, best_contact_phone: formatPhone(prev.best_contact_phone) }))}
                  style={theme.formInput}
                  placeholder="If different from primary"
                />
              </label>
              </div>
            </div>
            </Fragment>
              )
              if (sectionId === "business_address") return (
            <Fragment key={sectionId}>
            <div style={ACCOUNT_SECTION_CARD}>
              <h2 style={{ margin: 0, fontSize: 18, color: theme.text }}>Business Address</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Address line 1</span>
                  <input value={form.address_line_1} onChange={(e) => setForm((prev) => ({ ...prev, address_line_1: e.target.value }))} style={theme.formInput} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Address line 2</span>
                  <input value={form.address_line_2} onChange={(e) => setForm((prev) => ({ ...prev, address_line_2: e.target.value }))} style={theme.formInput} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>City</span>
                  <input value={form.address_city} onChange={(e) => setForm((prev) => ({ ...prev, address_city: e.target.value }))} style={theme.formInput} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>State</span>
                  <input value={form.address_state} onChange={(e) => setForm((prev) => ({ ...prev, address_state: e.target.value }))} style={theme.formInput} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Zip</span>
                  <input value={form.address_zip} onChange={(e) => setForm((prev) => ({ ...prev, address_zip: e.target.value }))} style={theme.formInput} />
                </label>
              </div>
              <div style={{ padding: 12, borderRadius: 8, background: "#fff", border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>Formatted address</div>
                <div style={{ color: "#4b5563", whiteSpace: "pre-line" }}>{formatBusinessAddress(form) || "No address entered yet."}</div>
              </div>
            </div>
            </Fragment>
              )
              if (sectionId === "service_area") return (
            <Fragment key={sectionId}>
            <div style={ACCOUNT_SECTION_CARD}>
              <h2 style={{ margin: 0, fontSize: 18, color: theme.text }}>Service area</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
                Optional. Set how far you typically travel from your business address (miles). Saved for your account; lead matching can use this later.
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 10, color: theme.text, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={form.service_radius_enabled}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      service_radius_enabled: e.target.checked,
                      ...(!e.target.checked ? { service_radius_miles: "" } : {}),
                    }))
                  }
                />
                Add service radius
              </label>
              {form.service_radius_enabled && (
                <label style={{ display: "grid", gap: 6, maxWidth: 220 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Radius (miles)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.service_radius_miles}
                    onChange={(e) => setForm((prev) => ({ ...prev, service_radius_miles: e.target.value }))}
                    style={theme.formInput}
                    placeholder="e.g. 25"
                  />
                </label>
              )}
            </div>
            </Fragment>
              )
              if (sectionId === "business_hours") return (
            <Fragment key={sectionId}>
            <div style={ACCOUNT_SECTION_CARD}>
              <h2 style={{ margin: 0, fontSize: 18, color: theme.text }}>Timezone & Business Hours</h2>
              <label style={{ display: "grid", gap: 6, maxWidth: 320 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Timezone</span>
                <select value={form.timezone} onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))} style={theme.formInput}>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: "grid", gap: 10 }}>
                {DAY_LABELS.map(({ key, label }) => (
                  <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 160px) 120px 120px 120px", gap: 10, alignItems: "center" }}>
                    <div style={{ color: theme.text, fontWeight: 600 }}>{label}</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={form.business_hours[key].enabled}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            business_hours: {
                              ...prev.business_hours,
                              [key]: { ...prev.business_hours[key], enabled: e.target.checked },
                            },
                          }))
                        }
                      />
                      Open
                    </label>
                    <input
                      type="time"
                      value={form.business_hours[key].open}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          business_hours: {
                            ...prev.business_hours,
                            [key]: { ...prev.business_hours[key], open: e.target.value },
                          },
                        }))
                      }
                      style={theme.formInput}
                      disabled={!form.business_hours[key].enabled}
                    />
                    <input
                      type="time"
                      value={form.business_hours[key].close}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          business_hours: {
                            ...prev.business_hours,
                            [key]: { ...prev.business_hours[key], close: e.target.value },
                          },
                        }))
                      }
                      style={theme.formInput}
                      disabled={!form.business_hours[key].enabled}
                    />
                  </div>
                ))}
              </div>
            </div>
            </Fragment>
              )
              if (sectionId === "call_forwarding") return (
            <Fragment key={sectionId}>
            <div style={ACCOUNT_SECTION_CARD}>
              <h2 style={{ margin: 0, fontSize: 18, color: theme.text }}>Call forwarding</h2>
            <div style={{ padding: 14, borderRadius: 10, background: "#fff7ed", border: "1px solid #fdba74" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, color: theme.text, fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={form.call_forwarding_enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, call_forwarding_enabled: e.target.checked }))}
                />
                Call forwarding from Twilio to my phone is enabled
              </label>
              <p style={{ margin: "8px 0 0", color: "#9a3412", fontSize: 13 }}>
                Saving this updates live routing immediately for inbound forwarded calls.
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 10, color: theme.text, fontWeight: 600, marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={!form.call_forwarding_outside_business_hours}
                  onChange={(e) => setForm((prev) => ({ ...prev, call_forwarding_outside_business_hours: !e.target.checked }))}
                />
                Turn forwarding off outside of business hours
              </label>
              <p style={{ margin: "8px 0 0", color: "#9a3412", fontSize: 13 }}>
                When checked, calls only forward during the business hours you set above. When unchecked, calls may still forward on closed days or outside those hours. If forwarding is off entirely, unanswered calls use Tradesman voicemail.
              </p>

              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Call screening (whisper)</span>
                {!form.call_forwarding_enabled && (
                  <p style={{ margin: 0, padding: 10, borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", fontSize: 13, lineHeight: 1.5 }}>
                    <strong>Forwarding is off.</strong> Whisper and press-1/2 screening only run when a call is <strong>forwarded to your phone</strong>. With forwarding unchecked, inbound calls go straight to Tradesman voicemail — you will not hear the announcement on your cell. Turn on <strong>Call forwarding</strong> above (and set your forward number on the channel in Admin → Communications) to use screening.
                  </p>
                )}
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, color: theme.text, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.forward_whisper_on_answer}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        forward_whisper_on_answer: e.target.checked,
                        ...(e.target.checked
                          ? {}
                          : {
                              forward_whisper_only_outside_business_hours: false,
                              forward_whisper_require_keypress: false,
                            }),
                      }))
                    }
                  />
                  <span style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 700 }}>Announce caller before I connect</span>
                    <span style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                      Short audio on your phone when you pick up a forwarded call: name (from your CRM when known) and number. Does not play if the call is not forwarded to you.
                    </span>
                  </span>
                </label>
                {form.forward_whisper_on_answer && (
                  <div style={{ display: "grid", gap: 12, marginTop: 4 }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, color: theme.text, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={form.forward_whisper_only_outside_business_hours}
                        onChange={(e) => setForm((prev) => ({ ...prev, forward_whisper_only_outside_business_hours: e.target.checked }))}
                      />
                      <span style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>Whisper only after hours</span>
                        <span style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                          Uses the same business-hours schedule as above. When checked, open hours connect without the announcement.
                        </span>
                      </span>
                    </label>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, color: theme.text, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={form.forward_whisper_require_keypress}
                        onChange={(e) => setForm((prev) => ({ ...prev, forward_whisper_require_keypress: e.target.checked }))}
                      />
                      <span style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>Require accept or decline</span>
                        <span style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                          After the announcement: press 1 (or say answer) to connect, 2 (or decline) to send the caller to Tradesman voicemail. Silence times out as decline.
                        </span>
                      </span>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Custom announcement (optional)</span>
                      <textarea
                        value={form.forward_whisper_announcement_template}
                        onChange={(e) => setForm((prev) => ({ ...prev, forward_whisper_announcement_template: e.target.value }))}
                        style={{ ...theme.formInput, minHeight: 88, resize: "vertical" }}
                        placeholder={DEFAULT_WHISPER_TEMPLATE_HINT}
                      />
                      <span style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                        Placeholders: <code style={{ fontSize: 11 }}>{"{caller_name}"}</code>, <code style={{ fontSize: 11 }}>{"{caller_phone}"}</code>,{" "}
                        <code style={{ fontSize: 11 }}>{"{caller_phone_spoken}"}</code> (digits with pauses for text-to-speech). If the name is unknown,{" "}
                        <code style={{ fontSize: 11 }}>{"{caller_name}"}</code> is read as &quot;Unknown caller&quot;.
                      </span>
                    </label>
                    <p style={{ margin: 0, color: "#9a3412", fontSize: 12, lineHeight: 1.45 }}>
                      <strong>Fine print:</strong> Screening avoids odd carrier behavior if you hang up during the whisper. Unclear or timed-out responses are treated like decline (voicemail).
                    </p>
                  </div>
                )}
              </div>
            </div>
            </div>
            </Fragment>
              )
              if (sectionId === "voicemail") return (
            <Fragment key={sectionId}>
            <div style={{ ...ACCOUNT_SECTION_CARD, background: "#f8fafc" }}>
              <button
                type="button"
                onClick={() => setVoicemailExpanded((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 15,
                  color: theme.text,
                }}
              >
                <span>
                  Voicemail greeting
                  <span style={{ display: "block", marginTop: 4, fontWeight: 400, fontSize: 12, color: "#6b7280" }}>
                    {form.voicemail_greeting_mode === "ai_text" ? "AI reads your script" : "Custom audio recording"}
                    {!voicemailExpanded ? " · Expand to change" : ""}
                  </span>
                </span>
                <span style={{ fontSize: 14, color: "#6b7280", flexShrink: 0 }} aria-hidden>
                  {voicemailExpanded ? "▲" : "▼"}
                </span>
              </button>

              {voicemailExpanded && (
                <div style={{ display: "grid", gap: 14, paddingTop: 4 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Conversations → Voicemails</span>
                    <select
                      value={form.voicemail_conversations_display}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          voicemail_conversations_display: e.target.value as ProfileForm["voicemail_conversations_display"],
                        }))
                      }
                      style={theme.formInput}
                    >
                      <option value="use_channel">Match each line (Admin → Communications → Voicemail mode)</option>
                      <option value="summary">Prefer summary (full transcript shown below when available)</option>
                      <option value="full_transcript">Prefer full transcript</option>
                    </select>
                    <span style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                      Controls how voicemail text appears in the portal. Admins set the default per Twilio channel; this choice overrides only your view.
                    </span>
                  </label>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
                    Optional. Leave collapsed if the default greeting is fine. Use <strong style={{ color: theme.text }}>Save account</strong> below after changes.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="voicemail_greeting_mode"
                        checked={form.voicemail_greeting_mode === "ai_text"}
                        onChange={() => setForm((prev) => ({ ...prev, voicemail_greeting_mode: "ai_text" }))}
                      />
                      AI text to voice
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="voicemail_greeting_mode"
                        checked={form.voicemail_greeting_mode === "recorded"}
                        onChange={() => setForm((prev) => ({ ...prev, voicemail_greeting_mode: "recorded" }))}
                      />
                      Recorded greeting
                    </label>
                  </div>

                  {form.voicemail_greeting_mode === "ai_text" && (
                    <>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Greeting script</span>
                        <textarea
                          value={form.voicemail_greeting_text}
                          onChange={(e) => setForm((prev) => ({ ...prev, voicemail_greeting_text: e.target.value }))}
                          style={{ ...theme.formInput, minHeight: 96, resize: "vertical" }}
                          placeholder="Thanks for calling. We missed you. Please leave your name, number, and a short message after the tone."
                        />
                      </label>
                      <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
                        This text is what callers hear when your mailbox uses the AI voice path. No upload or PIN needed for this option.
                      </p>
                    </>
                  )}

                  {form.voicemail_greeting_mode === "recorded" && (
                    <>
                      {/\.webm(\?|$)/i.test(form.voicemail_greeting_recording_url.trim()) && (
                        <p style={{ margin: 0, padding: 10, borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", fontSize: 13, lineHeight: 1.5 }}>
                          <strong>WebM greeting:</strong> Twilio often cannot play WebM on the phone network (you may hear static or silence). Use <strong>MP3 or WAV</strong> (upload file), or record via the help-desk phone flow so the file is saved in a phone-friendly format.
                        </p>
                      )}
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Recorded greeting URL (optional)</span>
                        <input
                          value={form.voicemail_greeting_recording_url}
                          onChange={(e) => setForm((prev) => ({ ...prev, voicemail_greeting_recording_url: e.target.value }))}
                          style={theme.formInput}
                          placeholder="https://..."
                        />
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 220px) auto", gap: 10, alignItems: "end" }}>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Call-in PIN (6 digits)</span>
                          <input
                            value={form.voicemail_greeting_pin}
                            onChange={(e) => setForm((prev) => ({ ...prev, voicemail_greeting_pin: normalizePin(e.target.value) }))}
                            style={theme.formInput}
                            placeholder="Required to update by phone"
                            maxLength={6}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, voicemail_greeting_pin: createGreetingPin() }))}
                          style={{ padding: "10px 16px", background: "#fff", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 600, cursor: "pointer", height: 42 }}
                        >
                          New PIN
                        </button>
                      </div>
                      <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
                        Call {HELP_DESK_PHONE_DISPLAY} from the <strong style={{ color: theme.text }}>Primary phone</strong> on this account (or verify that number if you call from another line), enter this PIN, then record. That number is Tradesman&apos;s line—not your business caller ID.
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                        <label style={{ padding: "10px 16px", background: "#fff", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 600, cursor: uploadingGreeting ? "wait" : "pointer" }}>
                          {uploadingGreeting ? "Uploading..." : "Upload audio (MP3 or WAV)"}
                          <input type="file" accept="audio/*" onChange={(e) => void handleGreetingFileChange(e)} disabled={uploadingGreeting} style={{ display: "none" }} />
                        </label>
                        {recordingSupported && (
                          <button
                            type="button"
                            onClick={() => (recordingGreeting ? handleStopRecording() : void handleStartRecording())}
                            disabled={uploadingGreeting}
                            style={{ padding: "10px 16px", background: recordingGreeting ? "#7f1d1d" : "#fff", color: recordingGreeting ? "#fff" : theme.text, border: `1px solid ${recordingGreeting ? "#7f1d1d" : theme.border}`, borderRadius: 8, fontWeight: 600, cursor: uploadingGreeting ? "wait" : "pointer" }}
                          >
                            {recordingGreeting ? "Stop recording" : "Record in browser"}
                          </button>
                        )}
                      </div>
                      {(recordingPreviewUrl || form.voicemail_greeting_recording_url) && (
                        <div style={{ display: "grid", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Preview</span>
                          <audio controls src={recordingPreviewUrl || form.voicemail_greeting_recording_url} />
                        </div>
                      )}
                      <p style={{ margin: 0, color: "#6b7280", fontSize: 12, lineHeight: 1.45 }}>
                        If no recording URL is saved, callers still hear the script text as a fallback. Prefer MP3 or WAV for phone networks.
                      </p>
                    </>
                  )}
                </div>
              )}

              {showAccountSection("help_desk") &&
                orderedAccountSectionIds.includes("help_desk") &&
                !accountSectionIdsForRender.includes("help_desk") && (
                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 16,
                      borderTop: `1px solid ${theme.border}`,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 16, color: theme.text }}>Help &amp; greeting line</h3>
                    <p style={{ margin: "0 0 8px", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
                      <span style={{ fontWeight: 700, color: theme.text }}>Tradesman toll-free:</span>{" "}
                      <a href={`tel:${HELP_DESK_PHONE_E164}`} style={{ color: theme.primary, fontWeight: 600 }}>
                        {HELP_DESK_PHONE_DISPLAY}
                      </a>
                    </p>
                    <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
                      Same number for product help and for updating a <strong style={{ color: theme.text }}>recorded</strong> mailbox greeting by phone (open Voicemail greeting above, choose Recorded, save your PIN, then call from your saved Primary phone).
                    </p>
                    {adminContext && (
                      <div style={{ marginTop: 4, padding: 12, borderRadius: 8, background: "#fff", border: `1px solid ${theme.border}`, color: "#4b5563", fontSize: 12, display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 700, color: theme.text }}>Admin: Twilio toll-free</div>
                        <div>
                          The shared toll-free should use <code style={{ fontSize: 11 }}>POST /api/help-desk-voice</code> for the main menu. Callers press <strong>9</strong> there to open the PIN / record flow (<code style={{ fontSize: 11 }}>/api/voicemail-greeting</code>). Do not point the toll-free directly at voicemail-greeting or the keypad menu will never run.
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
            </Fragment>
              )
              if (sectionId === "help_desk") return (
            <Fragment key={sectionId}>
              <div style={ACCOUNT_SECTION_CARD}>
                <h3 style={{ margin: "0 0 10px", fontSize: 16, color: theme.text }}>Help &amp; greeting line</h3>
                <p style={{ margin: "0 0 8px", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: theme.text }}>Tradesman toll-free:</span>{" "}
                  <a href={`tel:${HELP_DESK_PHONE_E164}`} style={{ color: theme.primary, fontWeight: 600 }}>
                    {HELP_DESK_PHONE_DISPLAY}
                  </a>
                </p>
                <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
                  Same number for product help and for updating a <strong style={{ color: theme.text }}>recorded</strong> mailbox greeting by phone (open Voicemail greeting above, choose Recorded, save your PIN, then call from your saved Primary phone).
                </p>
                {adminContext && (
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#f9fafb", border: `1px solid ${theme.border}`, color: "#4b5563", fontSize: 12, display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700, color: theme.text }}>Admin: Twilio toll-free</div>
                    <div>
                      The shared toll-free should use <code style={{ fontSize: 11 }}>POST /api/help-desk-voice</code> for the main menu. Callers press <strong>9</strong> there to open the PIN / record flow (<code style={{ fontSize: 11 }}>/api/voicemail-greeting</code>). Do not point the toll-free directly at voicemail-greeting or the keypad menu will never run.
                    </div>
                  </div>
                )}
              </div>
            </Fragment>
              )
              if (sectionId === "capture_documents") {
                const origin = typeof window !== "undefined" ? window.location.origin : ""
                const slug = form.embed_lead_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64)
                const embedUrl = slug ? `${origin}/embed/lead/${encodeURIComponent(slug)}` : ""
                return (
                  <Fragment key={sectionId}>
                    <div style={ACCOUNT_SECTION_CARD}>
                      <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>Web lead form, AI, and PDF templates</h2>
                      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
                        Public embed posts to your app&apos;s API (no login). Enable only after you set a unique slug. Thread summary uses OpenAI on the server when{" "}
                        <code style={{ fontSize: 11 }}>OPENAI_API_KEY</code> is set on Vercel.
                      </p>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, color: theme.text, fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={form.embed_lead_enabled}
                          onChange={(e) => setForm((prev) => ({ ...prev, embed_lead_enabled: e.target.checked }))}
                        />
                        Enable embeddable lead form
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Embed slug (letters, numbers, hyphens; min 3)</span>
                        <input
                          value={form.embed_lead_slug}
                          onChange={(e) => setForm((prev) => ({ ...prev, embed_lead_slug: e.target.value }))}
                          style={theme.formInput}
                          placeholder="e.g. joes-plumbing"
                        />
                      </label>
                      {embedUrl ? (
                        <p style={{ margin: 0, fontSize: 12, color: "#4b5563", wordBreak: "break-all" }}>
                          <strong>Form URL:</strong>{" "}
                          <a href={embedUrl} style={{ color: theme.primary }} target="_blank" rel="noopener noreferrer">
                            {embedUrl}
                          </a>
                        </p>
                      ) : null}
                      <label style={{ display: "flex", alignItems: "center", gap: 10, color: theme.text, fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={form.ai_thread_summary_enabled}
                          onChange={(e) => setForm((prev) => ({ ...prev, ai_thread_summary_enabled: e.target.checked }))}
                        />
                        Allow AI thread summary (Conversations)
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, color: theme.text, fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={form.ai_assistant_visible}
                          onChange={(e) => setForm((prev) => ({ ...prev, ai_assistant_visible: e.target.checked }))}
                        />
                        Show AI assistant entry points (reserved for future UI)
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Quote PDF — header/footer notes (plain text)</span>
                        <textarea
                          value={form.document_template_quote}
                          onChange={(e) => setForm((prev) => ({ ...prev, document_template_quote: e.target.value }))}
                          rows={4}
                          style={{ ...theme.formInput, resize: "vertical", fontFamily: "inherit" }}
                          placeholder="Shown on generated quote PDFs from the Quotes tab."
                        />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Receipt PDF — footer note (plain text)</span>
                        <textarea
                          value={form.document_template_receipt}
                          onChange={(e) => setForm((prev) => ({ ...prev, document_template_receipt: e.target.value }))}
                          rows={3}
                          style={{ ...theme.formInput, resize: "vertical", fontFamily: "inherit" }}
                          placeholder="Shown on receipt PDFs from Calendar."
                        />
                      </label>
                    </div>
                  </Fragment>
                )
              }
              if (sectionId === "password_reset") {
                if (!showPasswordReset) return null
                return (
                  <Fragment key={sectionId}>
                    <button type="button" onClick={() => void handlePasswordReset()} disabled={resetting || !emailForDisplay} style={{ padding: "10px 16px", background: "#fff", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 600, cursor: resetting ? "wait" : "pointer", justifySelf: "start" }}>
                      {resetting ? "Sending..." : "Reset password"}
                    </button>
                  </Fragment>
                )
              }
              return null
            })}

            {message && <p style={{ margin: 0, color: "#059669", fontSize: 13 }}>{message}</p>}
            {error && <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" onClick={() => void handleSave()} disabled={saving} style={{ padding: "10px 16px", background: theme.primary, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
                {saving ? "Saving..." : adminContext ? "Save user account" : "Save account"}
              </button>
            </div>
          </div>
        )}
    </div>
  )
}

export default function AccountPage() {
  const { user } = useAuth()
  if (!user?.id) {
    return <p style={{ padding: 24, color: theme.text }}>Sign in to manage your account.</p>
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ padding: 20, borderRadius: 12, background: "#ffffff", border: `1px solid ${theme.border}` }}>
        <h1 style={{ margin: "0 0 8px", color: theme.text }}>Account</h1>
        <p style={{ margin: 0, color: "#6b7280" }}>
          This information is saved directly to Supabase and will power profile, routing, and Google Business Profile data.
        </p>
      </div>
      <AccountProfilePanel profileUserId={user.id} loginEmail={user.email ?? undefined} showPasswordReset />
    </div>
  )
}
