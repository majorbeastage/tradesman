import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { DEV_USER_ID } from "../../core/dev"
import { theme } from "../../styles/theme"

type JobType = {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  color_hex: string | null
}

type CalendarEvent = {
  id: string
  title: string
  start_at: string
  end_at: string
  job_type_id: string | null
  quote_id: string | null
  customer_id: string | null
  notes: string | null
  quote_total?: number | null
  removed_at?: string | null
  job_types?: JobType | null
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const HOURS = Array.from({ length: 14 }, (_, i) => i + 6) // 6am–8pm

function getWeekStart(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

function getMonthGrid(date: Date): Date[][] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const first = new Date(year, month, 1)
  const start = getWeekStart(first)
  const grid: Date[][] = []
  for (let week = 0; week < 6; week++) {
    const row: Date[] = []
    for (let day = 0; day < 7; day++) {
      const cell = new Date(start)
      cell.setDate(start.getDate() + week * 7 + day)
      row.push(cell)
    }
    grid.push(row)
  }
  return grid
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date())
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [jobTypes, setJobTypes] = useState<JobType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>("")
  const [view, setView] = useState<"day" | "week" | "month">("month")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [expanded, setExpanded] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showJobTypes, setShowJobTypes] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAutoResponse, setShowAutoResponse] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  // Add item form
  const [addTitle, setAddTitle] = useState("")
  const [addStartDate, setAddStartDate] = useState("")
  const [addStartTime, setAddStartTime] = useState("09:00")
  const [addDuration, setAddDuration] = useState(60)
  const [addJobTypeId, setAddJobTypeId] = useState<string>("")
  const [addNotes, setAddNotes] = useState("")
  const [addQuoteId, setAddQuoteId] = useState<string | null>(null)
  const [addCustomerId, setAddCustomerId] = useState<string | null>(null)
  const [addSaving, setAddSaving] = useState(false)

  // Job type form
  const [jtName, setJtName] = useState("")
  const [jtDescription, setJtDescription] = useState("")
  const [jtDuration, setJtDuration] = useState(60)
  const [jtColor, setJtColor] = useState("#F97316")
  const [jtSaving, setJtSaving] = useState(false)

  // Settings (localStorage)
  const [firstDayOfWeek, setFirstDayOfWeek] = useState(() => {
    try { return parseInt(localStorage.getItem("calendar_firstDayOfWeek") ?? "0", 10) } catch { return 0 }
  })
  const [arReminderMins, setArReminderMins] = useState(() => {
    try { return localStorage.getItem("calendar_arReminderMins") ?? "15" } catch { return "15" }
  })

  async function loadEvents() {
    if (!supabase) return
    setLoadError("")
    const start = new Date(currentDate)
    const end = new Date(currentDate)
    if (view === "day") {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else if (view === "week") {
      const ws = getWeekStart(start)
      start.setTime(ws.getTime())
      end.setTime(ws.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
    } else {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(end.getMonth() + 1)
      end.setDate(0)
      end.setHours(23, 59, 59, 999)
    }
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total")
      .eq("user_id", DEV_USER_ID)
      .is("removed_at", null)
      .lte("start_at", end.toISOString())
      .gte("end_at", start.toISOString())
      .order("start_at")
    if (error) {
      setLoadError(error.message)
      setEvents([])
      return
    }
    setEvents((data || []) as CalendarEvent[])
  }

  function getEventColor(ev: CalendarEvent): string {
    const jt = ev.job_types ?? jobTypes.find((j) => j.id === ev.job_type_id)
    return (jt as JobType)?.color_hex ?? theme.primary
  }

  async function loadJobTypes() {
    if (!supabase) return
    const { data } = await supabase
      .from("job_types")
      .select("id, name, description, duration_minutes, color_hex")
      .eq("user_id", DEV_USER_ID)
      .order("name")
    setJobTypes((data as JobType[]) || [])
  }

  useEffect(() => {
    setLoading(true)
    void loadEvents().then(() => setLoading(false))
  }, [currentDate, view, jobTypes.length])

  useEffect(() => {
    loadJobTypes()
  }, [])

  async function saveEvent() {
    if (!supabase || !addTitle.trim()) return
    setAddSaving(true)
    const start = new Date(`${addStartDate}T${addStartTime}`)
    const end = new Date(start.getTime() + addDuration * 60 * 1000)
    const { error } = await supabase.from("calendar_events").insert({
      user_id: DEV_USER_ID,
      title: addTitle.trim(),
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      job_type_id: addJobTypeId || null,
      quote_id: addQuoteId || null,
      customer_id: addCustomerId || null,
      notes: addNotes.trim() || null
    })
    setAddSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setShowAddItem(false)
    resetAddForm()
    loadEvents()
  }

  function resetAddForm() {
    setAddTitle("")
    const today = new Date().toISOString().slice(0, 10)
    setAddStartDate(today)
    setAddStartTime("09:00")
    setAddDuration(60)
    setAddJobTypeId("")
    setAddNotes("")
    setAddQuoteId(null)
    setAddCustomerId(null)
  }

  function openAddFromQuote(quoteId: string, customerId: string, customerName: string) {
    setAddQuoteId(quoteId)
    setAddCustomerId(customerId)
    setAddTitle(`${customerName} – Quote`)
    setAddStartDate(new Date().toISOString().slice(0, 10))
    setAddStartTime("09:00")
    setAddDuration(60)
    setShowAddItem(true)
  }

  async function saveJobType() {
    if (!supabase || !jtName.trim()) return
    setJtSaving(true)
    const { error } = await supabase.from("job_types").insert({
      user_id: DEV_USER_ID,
      name: jtName.trim(),
      description: jtDescription.trim() || null,
      duration_minutes: jtDuration,
      color_hex: jtColor
    })
    setJtSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setJtName("")
    setJtDescription("")
    setJtDuration(60)
    setJtColor("#F97316")
    loadJobTypes()
  }

  function getEventsForDay(d: Date): CalendarEvent[] {
    const dayStart = new Date(d)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(d)
    dayEnd.setHours(23, 59, 59, 999)
    return events.filter((e) => {
      const start = new Date(e.start_at)
      return start >= dayStart && start <= dayEnd
    })
  }

  const grid = view === "month" ? getMonthGrid(currentDate) : []
  const weekStart = view === "week" ? getWeekStart(currentDate) : new Date(currentDate)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <h1>Calendar</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
        <button
          onClick={() => { setShowAddItem(true); resetAddForm() }}
          style={{ background: theme.primary, color: "white", padding: "8px 14px", borderRadius: "6px", border: "none", cursor: "pointer" }}
        >
          Add item to calendar
        </button>
        <button
          onClick={() => setShowAutoResponse(true)}
          style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
        >
          Auto Response Options
        </button>
        <button
          onClick={() => setShowSettings(true)}
          style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
        >
          Settings
        </button>
      </div>

      {/* Calendar area: view switcher + expand + job types */}
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: "8px", padding: "16px", background: "white" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as "day" | "week" | "month")}
            style={{ padding: "6px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", color: theme.text, cursor: "pointer" }}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
          <button
            onClick={() => setCurrentDate(new Date())}
            style={{ padding: "6px 12px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}
          >
            Today
          </button>
          <button
            onClick={() => {
              const d = new Date(currentDate)
              if (view === "month") d.setMonth(d.getMonth() - 1)
              else if (view === "week") d.setDate(d.getDate() - 7)
              else d.setDate(d.getDate() - 1)
              setCurrentDate(d)
            }}
            style={{ padding: "6px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}
          >
            ←
          </button>
          <button
            onClick={() => {
              const d = new Date(currentDate)
              if (view === "month") d.setMonth(d.getMonth() + 1)
              else if (view === "week") d.setDate(d.getDate() + 7)
              else d.setDate(d.getDate() + 1)
              setCurrentDate(d)
            }}
            style={{ padding: "6px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}
          >
            →
          </button>
          <span style={{ fontWeight: 600, color: theme.text, marginLeft: "8px" }}>
            {view === "month" && `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
            {view === "week" && `Week of ${weekStart.toLocaleDateString()}`}
            {view === "day" && currentDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ marginLeft: "auto", padding: "6px 12px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={() => setShowJobTypes(true)}
            style={{ padding: "6px 12px", background: theme.charcoalSmoke, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
          >
            Job Types
          </button>
        </div>

        <div style={{ minHeight: expanded ? "70vh" : "400px", overflow: "auto" }}>
          {loadError && (
            <p style={{ color: "#b91c1c", marginBottom: "8px", fontSize: "14px" }}>Calendar error: {loadError}</p>
          )}
          {loading ? (
            <p style={{ color: theme.text }}>Loading...</p>
          ) : view === "month" ? (
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  {WEEKDAY_NAMES.map((name) => (
                    <th key={name} style={{ padding: "8px", borderBottom: `2px solid ${theme.border}`, textAlign: "left", fontSize: "12px", color: theme.text }}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, wi) => (
                  <tr key={wi}>
                    {row.map((cell, di) => {
                      const dayEvents = getEventsForDay(cell)
                      const inMonth = cell.getMonth() === currentDate.getMonth()
                      return (
                        <td
                          key={di}
                          style={{
                            padding: "4px",
                            border: `1px solid ${theme.border}`,
                            verticalAlign: "top",
                            height: expanded ? "120px" : "80px",
                            background: inMonth ? "white" : "#f9fafb",
                            color: inMonth ? theme.text : "#9ca3af"
                          }}
                        >
                          <div style={{ fontWeight: isToday(cell) ? 700 : 400, fontSize: "13px", marginBottom: "4px" }}>{cell.getDate()}</div>
                          {dayEvents.slice(0, expanded ? 10 : 3).map((ev) => (
                            <div
                              key={ev.id}
                              onClick={() => setSelectedEvent(ev)}
                              style={{
                                fontSize: "11px",
                                padding: "2px 6px",
                                marginBottom: "2px",
                                borderRadius: "4px",
                                background: getEventColor(ev),
                                color: "#fff",
                                cursor: "pointer",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              }}
                              title={ev.title}
                            >
                              {new Date(ev.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {ev.title}
                            </div>
                          ))}
                          {dayEvents.length > (expanded ? 10 : 3) && <div style={{ fontSize: "11px", color: "#6b7280" }}>+{dayEvents.length - (expanded ? 10 : 3)} more</div>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : view === "week" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", gap: "1px", background: theme.border, border: `1px solid ${theme.border}` }}>
                <div style={{ background: "#f9fafb", padding: "8px", fontSize: "12px" }} />
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(weekStart)
                  d.setDate(d.getDate() + i)
                  return (
                    <div key={i} style={{ background: "#f9fafb", padding: "8px", fontSize: "12px", fontWeight: 600, textAlign: "center" }}>
                      {WEEKDAY_NAMES[d.getDay()]} {d.getDate()}
                    </div>
                  )
                })}
                {HOURS.map((hour) => (
                  <div key={hour} style={{ display: "contents" }}>
                    <div style={{ background: "#f9fafb", padding: "4px", fontSize: "11px", color: "#6b7280" }}>
                      {hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`}
                    </div>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = new Date(weekStart)
                      d.setDate(d.getDate() + i)
                      d.setHours(hour, 0, 0, 0)
                      const cellEvents = events.filter((e) => {
                        const start = new Date(e.start_at)
                        return isSameDay(start, d) && start.getHours() === hour
                      })
                      return (
                        <div key={`${hour}-${i}`} style={{ minHeight: "32px", background: "white", padding: "2px", borderBottom: `1px solid ${theme.border}` }}>
                          {cellEvents.map((ev) => (
                            <div
                              key={ev.id}
                              onClick={() => setSelectedEvent(ev)}
                              style={{
                                fontSize: "11px",
                                padding: "2px 4px",
                                borderRadius: "4px",
                                background: getEventColor(ev),
                                color: "#fff",
                                cursor: "pointer",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                              }}
                              title={ev.title}
                            >
                              {ev.title}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: "0", border: `1px solid ${theme.border}` }}>
              {HOURS.map((hour) => (
                <div key={hour} style={{ display: "contents" }}>
                  <div style={{ padding: "8px", fontSize: "12px", background: "#f9fafb", borderBottom: `1px solid ${theme.border}` }}>
                    {hour === 12 ? "12:00 PM" : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
                  </div>
                  <div style={{ minHeight: "48px", padding: "4px", background: "white", borderBottom: `1px solid ${theme.border}` }}>
                    {events
                      .filter((e) => {
                        const start = new Date(e.start_at)
                        return isSameDay(start, currentDate) && start.getHours() === hour
                      })
                      .map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          style={{
                            padding: "6px 8px",
                            borderRadius: "6px",
                            background: getEventColor(ev),
                            color: "#fff",
                            cursor: "pointer",
                            marginBottom: "4px"
                          }}
                        >
                          <strong>{ev.title}</strong>
                          <div style={{ fontSize: "12px", opacity: 0.9 }}>
                            {new Date(ev.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – {new Date(ev.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add item modal */}
      {showAddItem && (
        <>
          <div onClick={() => setShowAddItem(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "420px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 16px", color: theme.text }}>Add to calendar</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input placeholder="Title" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text }} />
              <div style={{ display: "flex", gap: "8px" }}>
                <input type="date" value={addStartDate} onChange={(e) => setAddStartDate(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text, flex: 1 }} />
                <input type="time" value={addStartTime} onChange={(e) => setAddStartTime(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text }} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: theme.text }}>Duration (minutes)</label>
                <input type="number" min={15} step={15} value={addDuration} onChange={(e) => setAddDuration(parseInt(e.target.value, 10) || 60)} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text }} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: theme.text }}>Job type</label>
                <select
                  value={addJobTypeId}
                  onChange={(e) => {
                    const id = e.target.value
                    setAddJobTypeId(id)
                    const jt = jobTypes.find((j) => j.id === id)
                    if (jt) setAddDuration(jt.duration_minutes)
                  }}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text }}
                >
                  <option value="">— None —</option>
                  {jobTypes.map((jt) => (
                    <option key={jt.id} value={jt.id}>{jt.name} ({jt.duration_minutes} min)</option>
                  ))}
                </select>
              </div>
              <textarea placeholder="Notes" value={addNotes} onChange={(e) => setAddNotes(e.target.value)} rows={2} style={{ padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text, resize: "vertical" }} />
              <button onClick={saveEvent} disabled={addSaving} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                {addSaving ? "Saving..." : "Add to calendar"}
              </button>
              <button onClick={() => setShowAddItem(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* Job Types modal */}
      {showJobTypes && (
        <>
          <div onClick={() => setShowJobTypes(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 16px", color: theme.text }}>Job Types</h3>
            <p style={{ fontSize: "14px", color: theme.text, marginBottom: "12px" }}>Create job types with description, time required, and a custom color for the calendar.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              <input placeholder="Name" value={jtName} onChange={(e) => setJtName(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text }} />
              <input placeholder="Description (optional)" value={jtDescription} onChange={(e) => setJtDescription(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text }} />
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="number" min={15} step={15} placeholder="Duration (min)" value={jtDuration} onChange={(e) => setJtDuration(parseInt(e.target.value, 10) || 60)} style={{ padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text, width: "120px" }} />
                <input type="color" value={jtColor} onChange={(e) => setJtColor(e.target.value)} style={{ width: "40px", height: "36px", border: `1px solid ${theme.border}`, borderRadius: "6px", cursor: "pointer" }} />
                <span style={{ fontSize: "14px", color: theme.text }}>{jtColor}</span>
              </div>
              <button onClick={saveJobType} disabled={jtSaving} style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                {jtSaving ? "Adding..." : "Add job type"}
              </button>
            </div>
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: "12px" }}>
              {jobTypes.map((jt) => (
                <div key={jt.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", padding: "8px", background: "#f9fafb", borderRadius: "6px" }}>
                  <div style={{ width: "16px", height: "16px", borderRadius: "4px", background: jt.color_hex ?? theme.primary }} />
                  <span style={{ flex: 1, fontWeight: 600, color: theme.text }}>{jt.name}</span>
                  <span style={{ fontSize: "13px", color: "#6b7280" }}>{jt.duration_minutes} min</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowJobTypes(false)} style={{ marginTop: "16px", padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Done</button>
          </div>
        </>
      )}

      {/* Settings modal */}
      {showSettings && (
        <>
          <div onClick={() => setShowSettings(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "400px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 16px", color: theme.text }}>Calendar Settings</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text }}>First day of week</label>
                <select
                  value={firstDayOfWeek}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setFirstDayOfWeek(v)
                    try { localStorage.setItem("calendar_firstDayOfWeek", String(v)) } catch { /* ignore */ }
                  }}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text }}
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                </select>
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} style={{ marginTop: "20px", padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>Done</button>
          </div>
        </>
      )}

      {/* Auto Response Options modal */}
      {showAutoResponse && (
        <>
          <div onClick={() => setShowAutoResponse(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "440px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 16px", color: theme.text }}>Calendar Auto Response Options</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text }}>Remind before event (minutes)</label>
                <input
                  type="number"
                  min={0}
                  value={arReminderMins}
                  onChange={(e) => {
                    setArReminderMins(e.target.value)
                    try { localStorage.setItem("calendar_arReminderMins", e.target.value) } catch { /* ignore */ }
                  }}
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", color: theme.text }}
                />
              </div>
            </div>
            <button onClick={() => setShowAutoResponse(false)} style={{ marginTop: "20px", padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>Done</button>
          </div>
        </>
      )}

      {/* Selected event popover */}
      {selectedEvent && (
        <>
          <div onClick={() => setSelectedEvent(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 9998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "360px", background: "white", borderRadius: "8px", padding: "20px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 12px", color: theme.text }}>{selectedEvent.title}</h3>
            <p style={{ margin: "0 0 8px", fontSize: "14px", color: theme.text }}>
              {new Date(selectedEvent.start_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} – {new Date(selectedEvent.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
            {selectedEvent.quote_total != null && selectedEvent.quote_total > 0 && (
              <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600, color: theme.text }}>
                Total: ${Number(selectedEvent.quote_total).toFixed(2)}
              </p>
            )}
            {selectedEvent.notes && <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>{selectedEvent.notes}</p>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", gap: "8px" }}>
              <button onClick={() => setSelectedEvent(null)} style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Close</button>
              <button
                onClick={async () => {
                  if (!supabase || !selectedEvent.id) return
                  const { error: err } = await supabase.from("calendar_events").update({ removed_at: new Date().toISOString() }).eq("id", selectedEvent.id)
                  if (err) alert(err.message)
                  else { setSelectedEvent(null); loadEvents() }
                }}
                style={{ padding: "8px 14px", borderRadius: "6px", background: "#b91c1c", color: "white", border: "none", cursor: "pointer", fontSize: "14px" }}
              >
                Remove
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
