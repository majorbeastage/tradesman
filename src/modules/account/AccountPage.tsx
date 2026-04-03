import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { HELP_DESK_PHONE_DISPLAY, HELP_DESK_PHONE_E164 } from "../../constants/helpDesk"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { useAuth } from "../../contexts/AuthContext"

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
  address_line_1: string
  address_line_2: string
  address_city: string
  address_state: string
  address_zip: string
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
  const [profileEmailFromDb, setProfileEmailFromDb] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [uploadingGreeting, setUploadingGreeting] = useState(false)
  const [recordingGreeting, setRecordingGreeting] = useState(false)
  const [recordingSupported, setRecordingSupported] = useState(false)
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const [form, setForm] = useState<ProfileForm>({
    display_name: "",
    website_url: "",
    primary_phone: "",
    address_line_1: "",
    address_line_2: "",
    address_city: "",
    address_state: "",
    address_zip: "",
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
          .select("email, display_name, website_url, primary_phone, business_address, address_line_1, address_line_2, address_city, address_state, address_zip, timezone, business_hours, call_forwarding_enabled, call_forwarding_outside_business_hours, voicemail_greeting_mode, voicemail_greeting_text, voicemail_greeting_recording_url, voicemail_greeting_pin, forward_whisper_on_answer, forward_whisper_announcement_template, forward_whisper_only_outside_business_hours, forward_whisper_require_keypress")
          .eq("id", profileUserId)
          .single()
        if (error) throw error
        setProfileEmailFromDb(typeof data?.email === "string" ? data.email : "")
        setForm({
          display_name: data?.display_name ?? "",
          website_url: data?.website_url ?? "",
          primary_phone: formatPhone(data?.primary_phone ?? ""),
          address_line_1: data?.address_line_1 ?? "",
          address_line_2: data?.address_line_2 ?? "",
          address_city: data?.address_city ?? "",
          address_state: data?.address_state ?? "",
          address_zip: data?.address_zip ?? "",
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
        address_line_1: form.address_line_1.trim() || null,
        address_line_2: form.address_line_2.trim() || null,
        address_city: form.address_city.trim() || null,
        address_state: form.address_state.trim() || null,
        address_zip: form.address_zip.trim() || null,
        business_address: formatBusinessAddress(form) || null,
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
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined
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
        return URL.createObjectURL(file)
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
            </div>

            <div style={{ display: "grid", gap: 12 }}>
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
              <div style={{ padding: 12, borderRadius: 8, background: "#f9fafb", border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>Formatted address</div>
                <div style={{ color: "#4b5563", whiteSpace: "pre-line" }}>{formatBusinessAddress(form) || "No address entered yet."}</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
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
                  <span>
                    Play a short announcement (whisper) on my phone when I answer a forwarded call. Uses the caller&apos;s name from saved customers when matched, plus their number. This is audio on the call leg only.
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
                      <span>
                        Only play the whisper outside of business hours (same schedule as above). During open hours, the call connects without the whisper.
                      </span>
                    </label>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, color: theme.text, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={form.forward_whisper_require_keypress}
                        onChange={(e) => setForm((prev) => ({ ...prev, forward_whisper_require_keypress: e.target.checked }))}
                      />
                      <span>
                        After the announcement, you must accept or decline: press 1 or say answer to connect; press 2 or say decline to end the forward (caller typically goes to Tradesman voicemail). If you do nothing for a few seconds, it is treated like decline.
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
                      Without this screening step, hanging up during or after the whisper can behave inconsistently by carrier. With screening, timeout or an unclear response defaults to voicemail like declining.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: 12, padding: 16, borderRadius: 10, background: "#f8fafc", border: `1px solid ${theme.border}` }}>
              <div>
                <h2 style={{ margin: "0 0 6px", fontSize: 18, color: theme.text }}>Voicemail Greeting</h2>
                <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                  Choose an AI text-to-voice greeting or use a hosted recording URL for a custom recorded greeting.
                </p>
              </div>
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
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Greeting script</span>
                <textarea
                  value={form.voicemail_greeting_text}
                  onChange={(e) => setForm((prev) => ({ ...prev, voicemail_greeting_text: e.target.value }))}
                  style={{ ...theme.formInput, minHeight: 96, resize: "vertical" }}
                  placeholder="Thanks for calling. We missed you. Please leave your name, number, and a short message after the tone."
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Recorded greeting URL</span>
                <input
                  value={form.voicemail_greeting_recording_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, voicemail_greeting_recording_url: e.target.value }))}
                  style={theme.formInput}
                  placeholder="https://..."
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 220px) auto", gap: 10, alignItems: "end" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Call-in greeting PIN</span>
                  <input
                    value={form.voicemail_greeting_pin}
                    onChange={(e) => setForm((prev) => ({ ...prev, voicemail_greeting_pin: normalizePin(e.target.value) }))}
                    style={theme.formInput}
                    placeholder="6-digit PIN"
                    maxLength={6}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, voicemail_greeting_pin: createGreetingPin() }))}
                  style={{ padding: "10px 16px", background: "#fff", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 600, cursor: "pointer", height: 42 }}
                >
                  Generate new PIN
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <label style={{ padding: "10px 16px", background: "#fff", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 600, cursor: uploadingGreeting ? "wait" : "pointer" }}>
                  {uploadingGreeting ? "Uploading..." : "Upload greeting audio"}
                  <input type="file" accept="audio/*" onChange={(e) => void handleGreetingFileChange(e)} disabled={uploadingGreeting} style={{ display: "none" }} />
                </label>
                {recordingSupported && (
                  <button
                    type="button"
                    onClick={() => (recordingGreeting ? handleStopRecording() : void handleStartRecording())}
                    disabled={uploadingGreeting}
                    style={{ padding: "10px 16px", background: recordingGreeting ? "#7f1d1d" : "#fff", color: recordingGreeting ? "#fff" : theme.text, border: `1px solid ${recordingGreeting ? "#7f1d1d" : theme.border}`, borderRadius: 8, fontWeight: 600, cursor: uploadingGreeting ? "wait" : "pointer" }}
                  >
                    {recordingGreeting ? "Stop recording" : "Record greeting"}
                  </button>
                )}
              </div>
              {(recordingPreviewUrl || form.voicemail_greeting_recording_url) && (
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Greeting preview</span>
                  <audio controls src={recordingPreviewUrl || form.voicemail_greeting_recording_url} />
                </div>
              )}
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                If recorded greeting is selected, Twilio will play that audio file. If no recording URL is present, Tradesman will fall back to the greeting script automatically.
              </p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                Recorded greetings are uploaded to the Supabase Storage bucket `voicemail-greetings`.
              </p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
                For best Twilio playback compatibility, uploaded greeting files should be `mp3` or `wav`.
              </p>
              <div style={{ padding: 14, borderRadius: 10, background: "#fff", border: `1px solid ${theme.border}` }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 16, color: theme.text }}>Tradesman Help Desk &amp; voicemail greeting line</h3>
                <p style={{ margin: "0 0 8px", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: theme.text }}>Help Desk:</span>{" "}
                  <a href={`tel:${HELP_DESK_PHONE_E164}`} style={{ color: theme.primary, fontWeight: 600 }}>
                    {HELP_DESK_PHONE_DISPLAY}
                  </a>
                </p>
                <p style={{ margin: "0 0 12px", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: theme.text }}>Voicemail greeting (call-in):</span> same number — call from the Primary Phone saved on this account, or verify with that Primary Phone number if you call from another line; then enter your 6-digit PIN from this page and record your greeting.
                </p>
                <div style={{ padding: 12, borderRadius: 8, background: "#f9fafb", border: `1px solid ${theme.border}`, color: "#4b5563", fontSize: 13, display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700, color: theme.text }}>Call in and record (technical)</div>
                  <div>Point a Twilio number to <code style={{ fontSize: 12 }}>POST /api/voicemail-greeting</code>.</div>
                  <div>Callers enter their 6-digit PIN and record a new greeting by phone.</div>
                  <div>If they call from a number other than the Primary Phone on this account, they must also enter that number to verify ownership.</div>
                  <div>The recording updates this user&apos;s Tradesman voicemail greeting automatically.</div>
                </div>
              </div>
            </div>

            {message && <p style={{ margin: 0, color: "#059669", fontSize: 13 }}>{message}</p>}
            {error && <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" onClick={() => void handleSave()} disabled={saving} style={{ padding: "10px 16px", background: theme.primary, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
                {saving ? "Saving..." : adminContext ? "Save user account" : "Save account"}
              </button>
              {showPasswordReset && (
                <button type="button" onClick={() => void handlePasswordReset()} disabled={resetting || !emailForDisplay} style={{ padding: "10px 16px", background: "#fff", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 600, cursor: resetting ? "wait" : "pointer" }}>
                  {resetting ? "Sending..." : "Reset password"}
                </button>
              )}
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
