import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../contexts/AuthContext"
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
  completed_at?: string | null
  job_types?: JobType | null
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const HOUR_HEIGHT = 48
const DAY_START_HOUR = 6
const DAY_END_HOUR = 20

function getAllDayTimes12hr(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      let label: string
      if (h === 0) label = `12:${String(m).padStart(2, "0")} AM`
      else if (h < 12) label = `${h}:${String(m).padStart(2, "0")} AM`
      else if (h === 12) label = `12:${String(m).padStart(2, "0")} PM`
      else label = `${h - 12}:${String(m).padStart(2, "0")} PM`
      options.push({ value, label })
    }
  }
  return options
}

const ALL_DAY_TIMES_12HR = getAllDayTimes12hr()

function hourLabel12hr(hour: number, minute = 0): string {
  if (hour === 0) return `12:${String(minute).padStart(2, "0")} AM`
  if (hour < 12) return `${hour}:${String(minute).padStart(2, "0")} AM`
  if (hour === 12) return `12:${String(minute).padStart(2, "0")} PM`
  return `${hour - 12}:${String(minute).padStart(2, "0")} PM`
}

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

function getTimeOptions(incrementMinutes: 15 | 60): string[] {
  const options: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += incrementMinutes) {
      options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
    }
  }
  return options
}

export default function CalendarPage() {
  const { userId } = useAuth()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [jobTypes, setJobTypes] = useState<JobType[]>([])
  const [jobTypesLoadError, setJobTypesLoadError] = useState<string>("")
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
  const [hasCompletedAtColumn, setHasCompletedAtColumn] = useState(true)

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
  const [editingJobTypeId, setEditingJobTypeId] = useState<string | null>(null)

  // Settings (localStorage)
  const [firstDayOfWeek, setFirstDayOfWeek] = useState(() => {
    try { return parseInt(localStorage.getItem("calendar_firstDayOfWeek") ?? "0", 10) } catch { return 0 }
  })
  const [arReminderMins, setArReminderMins] = useState(() => {
    try { return localStorage.getItem("calendar_arReminderMins") ?? "15" } catch { return "15" }
  })
  const [timeIncrement, setTimeIncrement] = useState<15 | 60>(() => {
    try { const v = localStorage.getItem("calendar_timeIncrement"); return v === "60" ? 60 : 15 } catch { return 15 }
  })
  const [noDuplicateTimes, setNoDuplicateTimes] = useState(() => {
    try { return localStorage.getItem("calendar_noDuplicateTimes") === "true" } catch { return false }
  })
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(() => {
    try { return localStorage.getItem("calendar_workingHoursEnabled") === "true" } catch { return false }
  })
  const [workingStart, setWorkingStart] = useState(() => {
    try { return localStorage.getItem("calendar_workingStart") ?? "08:00" } catch { return "08:00" }
  })
  const [workingEnd, setWorkingEnd] = useState(() => {
    try { return localStorage.getItem("calendar_workingEnd") ?? "17:00" } catch { return "17:00" }
  })
  const [addError, setAddError] = useState("")

  async function loadEvents() {
    if (!userId || !supabase) return
    const client = supabase
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
    const baseQuery = () =>
      client
        .from("calendar_events")
        .select("id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total")
        .eq("user_id", userId)
        .is("removed_at", null)
        .lte("start_at", end.toISOString())
        .gte("end_at", start.toISOString())
        .order("start_at")
    const { data, error } = await baseQuery().is("completed_at", null)
    if (error && error.message?.includes("completed_at")) {
      setHasCompletedAtColumn(false)
      const { data: data2, error: error2 } = await baseQuery()
      if (error2) {
        setLoadError(error2.message)
        setEvents([])
        return
      }
      setEvents((data2 || []) as CalendarEvent[])
      return
    }
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
    if (!userId || !supabase) return
    setJobTypesLoadError("")
    const { data, error } = await supabase
      .from("job_types")
      .select("id, name, description, duration_minutes, color_hex")
      .eq("user_id", userId)
      .order("name")
    if (error) {
      setJobTypesLoadError(error.message)
      setJobTypes([])
      return
    }
    setJobTypes((data as JobType[]) || [])
  }

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    void loadEvents().then(() => setLoading(false))
  }, [userId, currentDate, view, jobTypes.length])

  useEffect(() => {
    if (!userId) return
    loadJobTypes()
  }, [userId])

  async function saveEvent() {
    if (!supabase || !userId || !addTitle.trim()) return
    setAddError("")
    const start = new Date(`${addStartDate}T${addStartTime}`)
    const end = new Date(start.getTime() + addDuration * 60 * 1000)

    if (noDuplicateTimes) {
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id, start_at, end_at")
        .eq("user_id", userId)
        .is("removed_at", null)
        .lt("start_at", end.toISOString())
        .gt("end_at", start.toISOString())
      if (existing && existing.length > 0) {
        setAddError("This time overlaps an existing event. Choose a different time or turn off \"Do not allow duplicate times\" in Settings.")
        return
      }
    }

    setAddSaving(true)
    const { error } = await supabase.from("calendar_events").insert({
      user_id: userId,
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
      setAddError(error.message)
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

  async function saveJobType() {
    if (!jtName.trim()) {
      alert("Please enter a name for the job type.")
      return
    }
    if (!supabase) {
      alert("App is not connected to Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env")
      return
    }
    if (!userId) {
      alert("You must be signed in to add or update job types.")
      return
    }
    setJtSaving(true)
    const payload = {
      name: jtName.trim(),
      description: jtDescription.trim() || null,
      duration_minutes: jtDuration,
      color_hex: jtColor
    }
    const { error } = editingJobTypeId
      ? await supabase.from("job_types").update(payload).eq("id", editingJobTypeId).eq("user_id", userId)
      : await supabase.from("job_types").insert({ user_id: userId, ...payload })
    setJtSaving(false)
    if (error) {
      const msg = error.message || String(error)
      console.error("[Job type save failed]", { error, userId, payload })
      const hint = (msg.includes("policy") || msg.includes("RLS") || msg.includes("row-level") || msg.includes("permission") || msg.includes("does not exist"))
        ? "\n\nFix: In Supabase Dashboard → SQL Editor, run the full script in tradesman/supabase-job-types-setup.sql (creates job_types table + RLS policies), then try again."
        : ""
      alert("Could not save job type: " + msg + hint)
      return
    }
    setJtName("")
    setJtDescription("")
    setJtDuration(60)
    setJtColor("#F97316")
    setEditingJobTypeId(null)
    loadJobTypes()
  }

  function startEditJobType(jt: JobType) {
    setJtName(jt.name)
    setJtDescription(jt.description ?? "")
    setJtDuration(jt.duration_minutes)
    setJtColor(jt.color_hex ?? "#F97316")
    setEditingJobTypeId(jt.id)
  }

  function cancelEditJobType() {
    setJtName("")
    setJtDescription("")
    setJtDuration(60)
    setJtColor("#F97316")
    setEditingJobTypeId(null)
  }

  async function removeJobType(jt: JobType) {
    if (!supabase || !userId) return
    if (!confirm(`Remove job type "${jt.name}"? Events using this type will keep their color but the type will no longer appear in the list.`)) return
    const { error } = await supabase.from("job_types").delete().eq("id", jt.id).eq("user_id", userId)
    if (error) {
      alert(error.message)
      return
    }
    if (editingJobTypeId === jt.id) cancelEditJobType()
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

  function minutesFromDayStart(d: Date, dayStart: Date): number {
    return (d.getTime() - dayStart.getTime()) / (60 * 1000)
  }

  const grid = view === "month" ? getMonthGrid(currentDate) : []
  const weekStart = view === "week" ? getWeekStart(currentDate) : new Date(currentDate)
  const timeOptions = getTimeOptions(timeIncrement)
  const dayViewStartHour = workingHoursEnabled ? parseInt(workingStart.slice(0, 2), 10) : DAY_START_HOUR
  const dayViewEndHour = workingHoursEnabled ? parseInt(workingEnd.slice(0, 2), 10) : DAY_END_HOUR
  const dayViewHours = Array.from(
    { length: Math.max(1, dayViewEndHour - dayViewStartHour + 1) },
    (_, i) => dayViewStartHour + i
  )
  const addInputStyle: React.CSSProperties = {
    ...theme.formInput,
  }

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
          onClick={() => setShowJobTypes(true)}
          style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
        >
          Job Types
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
            <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${theme.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ background: "#f9fafb", padding: "8px" }} />
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(weekStart)
                  d.setDate(d.getDate() + i)
                  return (
                    <div key={i} style={{ background: "#f9fafb", padding: "6px 8px", fontSize: "12px", fontWeight: 600, textAlign: "center", color: theme.text }}>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>{WEEKDAY_NAMES_FULL[d.getDay()]}</div>
                      {WEEKDAY_NAMES[d.getDay()]} {d.getDate()}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", overflow: "hidden" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {dayViewHours.map((hour) => (
                    <div key={hour} style={{ height: HOUR_HEIGHT, padding: "2px 4px", fontSize: "11px", color: theme.text, background: "#f9fafb", borderBottom: `1px solid ${theme.border}` }}>
                      {hourLabel12hr(hour, 0)}
                    </div>
                  ))}
                </div>
                {Array.from({ length: 7 }, (_, dayIdx) => {
                  const dayStart = new Date(weekStart)
                  dayStart.setDate(dayStart.getDate() + dayIdx)
                  dayStart.setHours(dayViewStartHour, 0, 0, 0)
                  const dayEnd = new Date(dayStart)
                  dayEnd.setHours(dayViewEndHour, 0, 0, 0)
                  const dayEvents = events.filter((e) => {
                    const start = new Date(e.start_at)
                    const end = new Date(e.end_at)
                    return isSameDay(start, dayStart) && start < dayEnd && end > dayStart
                  })
                  return (
                    <div key={dayIdx} style={{ position: "relative", height: dayViewHours.length * HOUR_HEIGHT, background: "white", borderLeft: `1px solid ${theme.border}` }}>
                      {dayEvents.map((ev) => {
                        const start = new Date(ev.start_at)
                        const end = new Date(ev.end_at)
                        const clipStart = start < dayStart ? dayStart : start
                        const clipEnd = end > dayEnd ? dayEnd : end
                        const topMin = minutesFromDayStart(clipStart, dayStart)
                        const durMin = (clipEnd.getTime() - clipStart.getTime()) / (60 * 1000)
                        const topPx = (topMin / 60) * HOUR_HEIGHT
                        const heightPx = Math.max(2, (durMin / 60) * HOUR_HEIGHT)
                        return (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            style={{
                              position: "absolute",
                              left: 2,
                              right: 2,
                              top: topPx,
                              height: heightPx,
                              padding: "2px 4px",
                              borderRadius: "4px",
                              background: getEventColor(ev),
                              color: "#fff",
                              cursor: "pointer",
                              fontSize: "11px",
                              overflow: "hidden",
                              boxSizing: "border-box"
                            }}
                            title={`${new Date(ev.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ${ev.title}`}
                          >
                            {new Date(ev.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {ev.title}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "0", border: `1px solid ${theme.border}` }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {dayViewHours.map((hour) => (
                  <div key={hour} style={{ padding: "4px 8px", fontSize: "12px", fontWeight: 500, background: "#f9fafb", borderBottom: `1px solid ${theme.border}`, height: HOUR_HEIGHT, boxSizing: "border-box", color: theme.text }}>
                    {hourLabel12hr(hour, 0)}
                  </div>
                ))}
              </div>
              <div style={{ position: "relative", height: dayViewHours.length * HOUR_HEIGHT, background: "white" }}>
                {dayViewHours.map((hour, i) => (
                  <div
                    key={hour}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: i * HOUR_HEIGHT,
                      height: 1,
                      background: theme.border,
                      pointerEvents: "none"
                    }}
                  />
                ))}
                {(() => {
                  const dayStart = new Date(currentDate)
                  dayStart.setHours(dayViewStartHour, 0, 0, 0)
                  const dayEnd = new Date(currentDate)
                  dayEnd.setHours(dayViewEndHour, 0, 0, 0)
                  return events
                    .filter((e) => {
                      const start = new Date(e.start_at)
                      const end = new Date(e.end_at)
                      return isSameDay(start, currentDate) && start < dayEnd && end > dayStart
                    })
                    .map((ev) => {
                      const start = new Date(ev.start_at)
                      const end = new Date(ev.end_at)
                      const clipStart = start < dayStart ? dayStart : start
                      const clipEnd = end > dayEnd ? dayEnd : end
                      const topMin = minutesFromDayStart(clipStart, dayStart)
                      const durMin = (clipEnd.getTime() - clipStart.getTime()) / (60 * 1000)
                      const topPx = (topMin / 60) * HOUR_HEIGHT
                      const heightPx = Math.max(2, (durMin / 60) * HOUR_HEIGHT)
                      return (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          style={{
                            position: "absolute",
                            left: 4,
                            right: 4,
                            top: topPx,
                            height: heightPx,
                            padding: "4px 6px",
                            borderRadius: "4px",
                            background: getEventColor(ev),
                            color: "#fff",
                            cursor: "pointer",
                            fontSize: "12px",
                            overflow: "hidden",
                            boxSizing: "border-box"
                          }}
                          title={ev.title}
                        >
                          <strong>{new Date(ev.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong> {ev.title}
                        </div>
                      )
                    })
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add item modal */}
      {showAddItem && (
        <>
          <div onClick={() => { setShowAddItem(false); setAddError("") }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "420px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 16px", color: theme.text }}>Add to calendar</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input placeholder="Title" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} style={addInputStyle} />
              <div style={{ display: "flex", gap: "8px" }}>
                <input type="date" value={addStartDate} onChange={(e) => setAddStartDate(e.target.value)} style={{ ...addInputStyle, flex: 1 }} />
                <select
                  value={addStartTime}
                  onChange={(e) => setAddStartTime(e.target.value)}
                  style={addInputStyle}
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {(() => {
                        const [h, m] = t.split(":").map(Number)
                        if (h === 0) return `12:${String(m).padStart(2, "0")} AM`
                        if (h < 12) return `${h}:${String(m).padStart(2, "0")} AM`
                        if (h === 12) return `12:${String(m).padStart(2, "0")} PM`
                        return `${h - 12}:${String(m).padStart(2, "0")} PM`
                      })()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "12px", color: theme.text }}>Job type</label>
                <select
                  value={addJobTypeId}
                  onChange={(e) => {
                    const id = e.target.value
                    setAddJobTypeId(id)
                    const jt = jobTypes.find((j) => j.id === id)
                    if (jt) {
                      const mins = jt.duration_minutes
                      setAddDuration(timeIncrement === 60 ? Math.max(60, Math.round(mins / 60) * 60) : mins)
                    }
                  }}
                  style={addInputStyle}
                >
                  <option value="">— None —</option>
                  {jobTypes.map((jt) => (
                    <option key={jt.id} value={jt.id}>{jt.name} ({jt.duration_minutes} min)</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "12px", color: theme.text }}>Time increments</label>
                <select
                  value={timeIncrement}
                  onChange={(e) => {
                    const v = e.target.value === "60" ? 60 : 15
                    setTimeIncrement(v)
                    const rounded = Math.max(v, Math.round(addDuration / v) * v)
                    setAddDuration(rounded)
                    try { localStorage.setItem("calendar_timeIncrement", String(v)) } catch { /* ignore */ }
                  }}
                  style={addInputStyle}
                >
                  <option value={15}>15 minute increments</option>
                  <option value={60}>Hourly increments</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "12px", color: theme.text }}>
                  {timeIncrement === 60 ? "Duration (hours)" : "Duration (minutes)"}
                </label>
                <input
                  type="number"
                  min={timeIncrement === 60 ? 1 : timeIncrement}
                  step={timeIncrement === 60 ? 1 : timeIncrement}
                  value={timeIncrement === 60 ? Math.max(1, Math.round(addDuration / 60)) : addDuration}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10)
                    if (timeIncrement === 60) {
                      setAddDuration((raw || 1) * 60)
                    } else {
                      setAddDuration(raw || timeIncrement)
                    }
                  }}
                  style={addInputStyle}
                />
              </div>
              <textarea placeholder="Notes" value={addNotes} onChange={(e) => setAddNotes(e.target.value)} rows={2} style={{ ...addInputStyle, resize: "vertical" }} />
              {addError && <p style={{ color: "#b91c1c", fontSize: "14px", margin: 0 }}>{addError}</p>}
              <button onClick={saveEvent} disabled={addSaving} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                {addSaving ? "Saving..." : "Add to calendar"}
              </button>
              <button onClick={() => { setShowAddItem(false); setAddError("") }} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
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
            {jobTypesLoadError && (
              <p style={{ margin: "0 0 12px", padding: "10px", background: "#fef2f2", color: "#b91c1c", borderRadius: "6px", fontSize: "13px" }}>
                Could not load job types: {jobTypesLoadError}
                <br />
                <strong>Fix:</strong> In Supabase Dashboard → SQL Editor, run the full script in <code style={{ fontSize: "12px" }}>tradesman/supabase-job-types-setup.sql</code>, then close and reopen this window.
              </p>
            )}
            <p style={{ fontSize: "14px", color: theme.text, marginBottom: "12px" }}>Create job types with description, time required, and a custom color for the calendar.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              <input placeholder="Name" value={jtName} onChange={(e) => setJtName(e.target.value)} style={{ ...theme.formInput }} />
              <input placeholder="Description (optional)" value={jtDescription} onChange={(e) => setJtDescription(e.target.value)} style={{ ...theme.formInput }} />
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="number" min={15} step={15} placeholder="Duration (min)" value={jtDuration} onChange={(e) => setJtDuration(parseInt(e.target.value, 10) || 60)} style={{ ...theme.formInput, width: "120px" }} />
                <input type="color" value={jtColor} onChange={(e) => setJtColor(e.target.value)} style={{ width: "40px", height: "36px", border: `1px solid ${theme.border}`, borderRadius: "6px", cursor: "pointer" }} />
                <span style={{ fontSize: "14px", color: theme.text }}>{jtColor}</span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={saveJobType} disabled={jtSaving} style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                  {jtSaving ? (editingJobTypeId ? "Updating..." : "Adding...") : editingJobTypeId ? "Update job type" : "Add job type"}
                </button>
                {editingJobTypeId && (
                  <button onClick={cancelEditJobType} style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: "12px" }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600, color: theme.text }}>Your job types</h4>
              {jobTypes.length === 0 && !jobTypesLoadError ? (
                <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>No job types yet. Create one above; they will appear here and in the &quot;Add to calendar&quot; job type dropdown.</p>
              ) : jobTypes.length === 0 ? null : (
                jobTypes.map((jt) => (
                  <div key={jt.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", padding: "8px", background: "#f9fafb", borderRadius: "6px" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "4px", background: jt.color_hex ?? theme.primary, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontWeight: 600, color: theme.text }}>{jt.name}</span>
                    <span style={{ fontSize: "13px", color: "#6b7280" }}>{jt.duration_minutes} min</span>
                    <button type="button" onClick={() => startEditJobType(jt)} style={{ padding: "4px 10px", fontSize: "12px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>
                      Edit
                    </button>
                    <button type="button" onClick={() => removeJobType(jt)} style={{ padding: "4px 10px", fontSize: "12px", border: "1px solid #fca5a5", borderRadius: "6px", background: "white", cursor: "pointer", color: "#b91c1c" }}>
                      Remove
                    </button>
                  </div>
                ))
              )}
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
                  style={{ ...theme.formInput }}
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: theme.text }}>
                <input
                  type="checkbox"
                  checked={workingHoursEnabled}
                  onChange={(e) => {
                    const v = e.target.checked
                    setWorkingHoursEnabled(v)
                    try { localStorage.setItem("calendar_workingHoursEnabled", v ? "true" : "false") } catch { /* ignore */ }
                  }}
                />
                Have calendar reflect time of day start and end
              </label>
              {workingHoursEnabled && (
                <div style={{ display: "flex", gap: "12px", marginLeft: "20px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text }}>Start time</label>
                    <select
                      value={workingStart}
                      onChange={(e) => {
                        const v = e.target.value
                        setWorkingStart(v)
                        try { localStorage.setItem("calendar_workingStart", v) } catch { /* ignore */ }
                      }}
                      style={{ ...theme.formInput }}
                    >
                      {ALL_DAY_TIMES_12HR.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text }}>End time</label>
                    <select
                      value={workingEnd}
                      onChange={(e) => {
                        const v = e.target.value
                        setWorkingEnd(v)
                        try { localStorage.setItem("calendar_workingEnd", v) } catch { /* ignore */ }
                      }}
                      style={{ ...theme.formInput }}
                    >
                      {ALL_DAY_TIMES_12HR.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: theme.text }}>
                <input
                  type="checkbox"
                  checked={noDuplicateTimes}
                  onChange={(e) => {
                    const v = e.target.checked
                    setNoDuplicateTimes(v)
                    try { localStorage.setItem("calendar_noDuplicateTimes", v ? "true" : "false") } catch { /* ignore */ }
                  }}
                />
                Do not allow duplicate times to be installed
              </label>
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
                  style={{ ...theme.formInput }}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", gap: "8px", flexWrap: "wrap" }}>
              <button onClick={() => setSelectedEvent(null)} style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Close</button>
              <div style={{ display: "flex", gap: "8px" }}>
                {hasCompletedAtColumn && (
                  <button
                    onClick={async () => {
                      if (!supabase || !selectedEvent.id) return
                      const { error: err } = await supabase.from("calendar_events").update({ completed_at: new Date().toISOString() }).eq("id", selectedEvent.id)
                      if (err) { alert(err.message); return }
                      setSelectedEvent(null); loadEvents()
                    }}
                    style={{ padding: "8px 14px", borderRadius: "6px", background: theme.primary, color: "white", border: "none", cursor: "pointer", fontSize: "14px" }}
                  >
                    Complete
                  </button>
                )}
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
          </div>
        </>
      )}
    </div>
  )
}
