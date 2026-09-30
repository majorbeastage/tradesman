import { useEffect, useState, type CSSProperties, type FormEvent } from "react"
import { supabase } from "../lib/supabase"
import { loadJobTypesForUser, type JobTypeRow } from "../lib/jobTypesApi"
import {
  WEBSITE_CALENDAR_DAY_OPTIONS,
  WEBSITE_CALENDAR_REQUIRED_FIELD_OPTIONS,
  websiteCalendarSlotTimes,
  type WebsiteCalendarDay,
  type WebsiteCalendarRequiredField,
  type WebsiteCalendarToolSettings,
} from "../lib/businessPublicProfile"

const DAY_INDEX: Record<WebsiteCalendarDay, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

function formatSlotLabel(hm: string): string {
  const [hRaw, mRaw] = hm.split(":")
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hm
  const suffix = h >= 12 ? "PM" : "AM"
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`
}

export function WebsiteCalendarSettingsPanel({
  value,
  onChange,
  userId,
}: {
  value: WebsiteCalendarToolSettings
  onChange: (next: WebsiteCalendarToolSettings) => void
  userId?: string | null
}) {
  const [jobTypes, setJobTypes] = useState<JobTypeRow[]>([])

  useEffect(() => {
    if (!supabase || !userId) {
      setJobTypes([])
      return
    }
    let cancelled = false
    void loadJobTypesForUser(supabase, userId).then(({ rows }) => {
      if (!cancelled) setJobTypes(rows)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  function toggleDay(day: WebsiteCalendarDay) {
    const has = value.days.includes(day)
    const days = has ? value.days.filter((d) => d !== day) : [...value.days, day]
    onChange({ ...value, days })
  }

  function toggleRequired(field: WebsiteCalendarRequiredField) {
    const has = value.requiredFields.includes(field)
    const requiredFields = has ? value.requiredFields.filter((f) => f !== field) : [...value.requiredFields, field]
    onChange({ ...value, requiredFields })
  }

  const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 800, color: "#0f172a" }
  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontSize: 13,
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={labelStyle}>
        Job type description
        <textarea
          value={value.jobTypeDescription}
          rows={3}
          maxLength={500}
          placeholder="What this appointment is for"
          onChange={(e) => onChange({ ...value, jobTypeDescription: e.target.value })}
          style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
        />
      </label>
      <label style={labelStyle}>
        Link to a job type
        <select
          value={value.jobTypeId ?? ""}
          onChange={(e) => onChange({ ...value, jobTypeId: e.target.value || null })}
          style={inputStyle}
        >
          <option value="">No linked job type</option>
          {jobTypes.map((jt) => (
            <option key={jt.id} value={jt.id}>
              {jt.name}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>Days available</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {WEBSITE_CALENDAR_DAY_OPTIONS.map((day) => {
            const on = value.days.includes(day.id)
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => toggleDay(day.id)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: on ? "#0f766e" : "#fff",
                  color: on ? "#fff" : "#0f172a",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {day.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <label style={labelStyle}>
          From
          <input type="time" value={value.startTime} onChange={(e) => onChange({ ...value, startTime: e.target.value })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Until
          <input type="time" value={value.endTime} onChange={(e) => onChange({ ...value, endTime: e.target.value })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Slot
          <select
            value={String(value.slotMinutes)}
            onChange={(e) => onChange({ ...value, slotMinutes: Number(e.target.value) })}
            style={inputStyle}
          >
            {[30, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>Required fields</div>
        {WEBSITE_CALENDAR_REQUIRED_FIELD_OPTIONS.map((field) => (
          <label key={field.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
            <input
              type="checkbox"
              checked={value.requiredFields.includes(field.id)}
              onChange={() => toggleRequired(field.id)}
            />
            {field.label}
          </label>
        ))}
      </div>
    </div>
  )
}

export function WebsiteCalendarBookingForm({
  slug,
  businessName,
  calendar,
  fieldBackground,
  fontColor,
  primaryColor,
}: {
  slug: string
  businessName: string
  calendar: WebsiteCalendarToolSettings
  fieldBackground: string
  fontColor: string
  primaryColor: string
}) {
  const slots = websiteCalendarSlotTimes(calendar.startTime, calendar.endTime, calendar.slotMinutes)
  const [date, setDate] = useState("")
  const [time, setTime] = useState(slots[0] ?? "")
  const [secondaryTime, setSecondaryTime] = useState("")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const required = new Set(calendar.requiredFields)
  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.12)",
    background: fieldBackground,
    color: fontColor,
    fontSize: 14,
  }

  function dayAllowed(iso: string): boolean {
    if (!iso) return false
    const parsed = new Date(`${iso}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) return false
    return calendar.days.some((day) => DAY_INDEX[day] === parsed.getDay())
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    if (!dayAllowed(date)) {
      setError("Pick a day this business is available.")
      return
    }
    if (!time) {
      setError("Pick a time.")
      return
    }
    if (required.has("full_name")) {
      const parts = fullName.trim().split(/\s+/).filter(Boolean)
      if (parts.length < 2) {
        setError("Enter a full name (first and last).")
        return
      }
    }
    if (required.has("email") && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email.")
      return
    }
    if (required.has("phone") && phone.replace(/\D/g, "").length < 10) {
      setError("Enter a 10-digit phone number.")
      return
    }
    if (required.has("address") && address.trim().length < 8) {
      setError("Enter a street address.")
      return
    }
    if (required.has("secondary_time") && (!secondaryTime || secondaryTime === time)) {
      setError("Pick a different secondary time.")
      return
    }
    const sendEmail = email.trim()
    if (!sendEmail) {
      setError("Email is needed so the business can confirm this time.")
      return
    }
    const when = `${date} at ${formatSlotLabel(time)}`
    const backup = secondaryTime ? ` Secondary time: ${formatSlotLabel(secondaryTime)}.` : ""
    const jobLine = calendar.jobTypeDescription.trim()
    const description = [`Requested appointment: ${when}.${backup}`, jobLine ? `Job: ${jobLine}` : null]
      .filter(Boolean)
      .join("\n")
    setBusy(true)
    try {
      const res = await fetch("/api/platform-tools?__route=public-business-profile-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: fullName.trim() || "Website booking",
          email: sendEmail,
          phone: phone.trim(),
          address: address.trim(),
          jobDescription: description,
          preferredContact: "email",
        }),
      })
      const raw = await res.text()
      let json: { ok?: boolean; error?: string } = {}
      try {
        json = raw ? (JSON.parse(raw) as { ok?: boolean; error?: string }) : {}
      } catch {
        json = { ok: false, error: raw.slice(0, 200) || `Server error (${res.status})` }
      }
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not send this request.")
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ padding: 8, color: fontColor }}>
        <strong>Request sent.</strong> {businessName} will confirm this time.
      </div>
    )
  }

  const mark = (id: WebsiteCalendarRequiredField) => (required.has(id) ? " *" : "")

  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 8, color: fontColor }}>
      <div style={{ fontWeight: 900, fontSize: 16 }}>Schedule a time</div>
      {calendar.jobTypeDescription.trim() ? (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>{calendar.jobTypeDescription.trim()}</p>
      ) : null}
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
        Day
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
        Time
        <select value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle}>
          {slots.length === 0 ? <option value="">No times in this window</option> : null}
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {formatSlotLabel(slot)}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
        {`Full name${mark("full_name")}`}
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
        {`Email${mark("email")}`}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
        {`Phone number${mark("phone")}`}
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
        {`Address${mark("address")}`}
        <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800 }}>
        {`Secondary time${mark("secondary_time")}`}
        <select value={secondaryTime} onChange={(e) => setSecondaryTime(e.target.value)} style={inputStyle}>
          <option value="">None</option>
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {formatSlotLabel(slot)}
            </option>
          ))}
        </select>
      </label>
      {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 12 }}>{error}</p> : null}
      <button
        type="submit"
        disabled={busy || slots.length === 0}
        style={{
          justifySelf: "start",
          padding: "10px 14px",
          borderRadius: 10,
          border: "none",
          background: primaryColor,
          color: "#fff",
          fontWeight: 800,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "Sending…" : "Request this time"}
      </button>
    </form>
  )
}
