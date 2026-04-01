import { useEffect, useMemo, useState } from "react"
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
}

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

export default function AccountPage() {
  const { user, refetchProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
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
  })

  const email = useMemo(() => user?.email ?? "", [user?.email])

  useEffect(() => {
    if (!supabase || !user?.id) return
    setLoading(true)
    setError("")
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, website_url, primary_phone, business_address, address_line_1, address_line_2, address_city, address_state, address_zip, timezone, business_hours, call_forwarding_enabled, call_forwarding_outside_business_hours")
          .eq("id", user.id)
          .single()
        if (error) throw error
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
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.id])

  async function handleSave() {
    if (!supabase || !user?.id) return
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
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from("profiles").update(payload).eq("id", user.id)
      if (error) throw error
      await refetchProfile()
      setForm((prev) => ({
        ...prev,
        website_url: website_url ?? "",
        primary_phone: formatPhone(payload.primary_phone ?? ""),
      }))
      setMessage("Account updated.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordReset() {
    if (!supabase || !email) return
    setResetting(true)
    setMessage("")
    setError("")
    try {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined
      const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
      if (error) throw error
      setMessage("Password reset email sent.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResetting(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ padding: 20, borderRadius: 12, background: "#ffffff", border: `1px solid ${theme.border}` }}>
        <h1 style={{ margin: "0 0 8px", color: theme.text }}>Account</h1>
        <p style={{ margin: 0, color: "#6b7280" }}>
          This information is saved directly to Supabase and will power profile, routing, and Google Business Profile data.
        </p>
      </div>

      <div style={{ padding: 20, borderRadius: 12, background: "#ffffff", border: `1px solid ${theme.border}` }}>
        {loading ? (
          <p style={{ color: theme.text, margin: 0 }}>Loading account...</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Login email</span>
                <input value={email} readOnly style={{ ...theme.formInput, background: "#f9fafb", color: "#6b7280" }} />
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
                  checked={form.call_forwarding_outside_business_hours}
                  onChange={(e) => setForm((prev) => ({ ...prev, call_forwarding_outside_business_hours: e.target.checked }))}
                />
                Keep forwarding on outside business hours
              </label>
            </div>

            {message && <p style={{ margin: 0, color: "#059669", fontSize: 13 }}>{message}</p>}
            {error && <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" onClick={() => void handleSave()} disabled={saving} style={{ padding: "10px 16px", background: theme.primary, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
                {saving ? "Saving..." : "Save account"}
              </button>
              <button type="button" onClick={() => void handlePasswordReset()} disabled={resetting || !email} style={{ padding: "10px 16px", background: "#fff", color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 600, cursor: resetting ? "wait" : "pointer" }}>
                {resetting ? "Sending..." : "Reset password"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
