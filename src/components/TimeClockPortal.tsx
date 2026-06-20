import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import type { ManagedClientRow } from "../contexts/OfficeManagerScopeContext"
import {
  datetimeLocalInputToIso,
  downloadTimeSessionsCsv,
  eventTitleFromSession,
  formatDurationDecimalHours,
  formatDurationShort,
  isoToDatetimeLocalInput,
  normalizeSessionKind,
  reportRangeStartIso,
  sessionDurationMs,
  sessionKindLabel,
  startOfWeekLocal,
  sumDurationByKind,
  TIME_CLOCK_SESSION_SELECT,
  TIME_CLOCK_SESSION_SELECT_LEGACY,
  todayBoundsLocal,
  type TimeClockReportRange,
  type TimeClockSessionKind,
  type TimeClockSessionRow,
} from "../lib/timeClockSessions"
import { filterRealUserIds } from "../lib/sandboxDemoTeam"

type UpcomingEventRow = {
  id: string
  user_id: string | null
  title: string
  start_at: string
}

type PortalTab = "shift" | "job" | "hours" | "reports"

type EntryFormState = {
  id?: string
  userId: string
  sessionKind: TimeClockSessionKind
  calendarEventId: string
  clockedInLocal: string
  clockedOutLocal: string
  notes: string
}

type Props = {
  viewerUserId: string
  roster: ManagedClientRow[]
  rosterLabel: (userId: string) => string
  upcomingByUser: Record<string, UpcomingEventRow[]>
  variant?: "default" | "time_clock_only"
  onOpenTimeClockWorkspace?: () => void
  timeClockWorkspacePage?: boolean
  /** When true, viewer may add/edit punches for anyone on the roster (office manager). */
  canManageTeamEntries?: boolean
  onOpenShiftSessionsChange?: (openShiftByUser: Record<string, string>) => void
}

function emptyEntryForm(userId: string): EntryFormState {
  const now = new Date()
  return {
    userId,
    sessionKind: "shift",
    calendarEventId: "",
    clockedInLocal: isoToDatetimeLocalInput(now.toISOString()),
    clockedOutLocal: "",
    notes: "",
  }
}

export default function TimeClockPortal({
  viewerUserId,
  roster,
  rosterLabel,
  upcomingByUser,
  variant = "default",
  onOpenTimeClockWorkspace,
  timeClockWorkspacePage,
  canManageTeamEntries = false,
  onOpenShiftSessionsChange,
}: Props) {
  const [tab, setTab] = useState<PortalTab>("shift")
  const [clockLoading, setClockLoading] = useState(false)
  const [clockError, setClockError] = useState("")
  const [clockActionBusy, setClockActionBusy] = useState(false)
  const [legacySchema, setLegacySchema] = useState(false)

  const [openShiftByUser, setOpenShiftByUser] = useState<Record<string, string>>({})
  const [openJobByUser, setOpenJobByUser] = useState<Record<string, { at: string; eventId: string | null; title: string }>>({})

  const [weekSessionsByUser, setWeekSessionsByUser] = useState<Record<string, TimeClockSessionRow[]>>({})
  const [todayJobEvents, setTodayJobEvents] = useState<UpcomingEventRow[]>([])
  const [selectedJobEventId, setSelectedJobEventId] = useState("")

  const [reportRange, setReportRange] = useState<TimeClockReportRange>("30d")
  const [reportUserId, setReportUserId] = useState<string>("all")
  const [reportKind, setReportKind] = useState<"all" | TimeClockSessionKind>("all")
  const [reportRows, setReportRows] = useState<TimeClockSessionRow[]>([])
  const [reportBusy, setReportBusy] = useState(false)

  const [entryForm, setEntryForm] = useState<EntryFormState | null>(null)
  const [entrySaving, setEntrySaving] = useState(false)

  const rosterIds = useMemo(
    () => filterRealUserIds(roster.map((r) => r.userId).filter(Boolean)),
    [roster],
  )
  const viewerOnRoster = rosterIds.includes(viewerUserId)
  const weekStart = useMemo(() => startOfWeekLocal(new Date()), [])
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    return d
  }, [weekStart])

  const sessionSelect = legacySchema ? TIME_CLOCK_SESSION_SELECT_LEGACY : TIME_CLOCK_SESSION_SELECT

  const editableUserIds = useMemo(() => {
    if (!canManageTeamEntries) return new Set([viewerUserId])
    return new Set(rosterIds)
  }, [canManageTeamEntries, rosterIds, viewerUserId])

  const canEditUser = useCallback((userId: string) => editableUserIds.has(userId), [editableUserIds])

  const notifyShiftOpen = useCallback(
    (next: Record<string, string>) => {
      setOpenShiftByUser(next)
      onOpenShiftSessionsChange?.(next)
    },
    [onOpenShiftSessionsChange],
  )

  const loadOpenSessions = useCallback(async () => {
    if (!supabase || rosterIds.length === 0) {
      notifyShiftOpen({})
      setOpenJobByUser({})
      return
    }
    setClockLoading(true)
    setClockError("")
    const { data, error } = await supabase
      .from("user_time_clock_sessions")
      .select(sessionSelect)
      .in("user_id", rosterIds)
      .is("clocked_out_at", null)
    setClockLoading(false)
    if (error) {
      if (!legacySchema && String(error.message).match(/session_kind|calendar_event|notes/i)) {
        setLegacySchema(true)
        return
      }
      setClockError(error.message)
      notifyShiftOpen({})
      setOpenJobByUser({})
      return
    }
    const shift: Record<string, string> = {}
    const job: Record<string, { at: string; eventId: string | null; title: string }> = {}
    for (const row of (data ?? []) as unknown as TimeClockSessionRow[]) {
      if (!row.user_id || !row.clocked_in_at) continue
      const kind = normalizeSessionKind(row.session_kind)
      if (kind === "job") {
        job[row.user_id] = {
          at: row.clocked_in_at,
          eventId: row.calendar_event_id ?? null,
          title: eventTitleFromSession(row) ?? "Job",
        }
      } else {
        shift[row.user_id] = row.clocked_in_at
      }
    }
    notifyShiftOpen(shift)
    setOpenJobByUser(job)
  }, [legacySchema, notifyShiftOpen, rosterIds, sessionSelect])

  useEffect(() => {
    void loadOpenSessions()
    const id = window.setInterval(() => void loadOpenSessions(), 45_000)
    return () => window.clearInterval(id)
  }, [loadOpenSessions])

  const loadWeekSessions = useCallback(async () => {
    if (!supabase || rosterIds.length === 0) {
      setWeekSessionsByUser({})
      return
    }
    const { data, error } = await supabase
      .from("user_time_clock_sessions")
      .select(sessionSelect)
      .in("user_id", rosterIds)
      .gte("clocked_in_at", weekStart.toISOString())
      .lt("clocked_in_at", weekEnd.toISOString())
      .order("clocked_in_at", { ascending: true })
    if (error || !data) {
      setWeekSessionsByUser({})
      return
    }
    const byUser: Record<string, TimeClockSessionRow[]> = {}
    for (const id of rosterIds) byUser[id] = []
    for (const row of data as unknown as TimeClockSessionRow[]) {
      if (!row.user_id || !byUser[row.user_id]) continue
      byUser[row.user_id].push(row)
    }
    setWeekSessionsByUser(byUser)
  }, [rosterIds, sessionSelect, weekEnd, weekStart])

  useEffect(() => {
    void loadWeekSessions()
  }, [loadWeekSessions])

  const loadTodayJobEvents = useCallback(async () => {
    if (!supabase) return
    const { startIso, endIso } = todayBoundsLocal()
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, user_id, title, start_at")
      .eq("user_id", viewerUserId)
      .is("removed_at", null)
      .is("completed_at", null)
      .gte("start_at", startIso)
      .lt("start_at", endIso)
      .order("start_at", { ascending: true })
      .limit(40)
    if (error || !data) {
      const fallback = upcomingByUser[viewerUserId] ?? []
      setTodayJobEvents(fallback)
      if (!selectedJobEventId && fallback[0]?.id) setSelectedJobEventId(fallback[0].id)
      return
    }
    const rows = data as UpcomingEventRow[]
    setTodayJobEvents(rows)
    if (!selectedJobEventId && rows[0]?.id) setSelectedJobEventId(rows[0].id)
  }, [selectedJobEventId, upcomingByUser, viewerUserId])

  useEffect(() => {
    if (tab === "job") void loadTodayJobEvents()
  }, [tab, loadTodayJobEvents])

  const loadReportRows = useCallback(async () => {
    if (!supabase || rosterIds.length === 0) {
      setReportRows([])
      return
    }
    setReportBusy(true)
    const since = reportRangeStartIso(reportRange)
    const ids = reportUserId === "all" ? rosterIds : [reportUserId]
    const { data, error } = await supabase
      .from("user_time_clock_sessions")
      .select(sessionSelect)
      .in("user_id", ids)
      .gte("clocked_in_at", since)
      .order("clocked_in_at", { ascending: false })
      .limit(800)
    setReportBusy(false)
    if (error || !data) {
      setReportRows([])
      return
    }
    let rows = ((data ?? []) as unknown) as TimeClockSessionRow[]
    if (reportKind !== "all") rows = rows.filter((r) => normalizeSessionKind(r.session_kind) === reportKind)
    setReportRows(rows)
  }, [reportKind, reportRange, reportUserId, rosterIds, sessionSelect])

  useEffect(() => {
    if (tab === "reports") void loadReportRows()
  }, [tab, loadReportRows])

  async function insertSession(payload: Record<string, unknown>) {
    if (!supabase) return { error: new Error("Supabase not configured") }
    let { error } = await supabase.from("user_time_clock_sessions").insert(payload)
    if (error && !legacySchema && String(error.message).match(/session_kind|calendar_event|notes/i)) {
      const { session_kind: _k, calendar_event_id: _e, notes: _n, ...rest } = payload
      const retry = await supabase.from("user_time_clock_sessions").insert(rest)
      error = retry.error
      if (!error) setLegacySchema(true)
    }
    return { error }
  }

  async function updateSession(id: string, patch: Record<string, unknown>) {
    if (!supabase) return { error: new Error("Supabase not configured") }
    const full: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
    let { error } = await supabase.from("user_time_clock_sessions").update(full).eq("id", id)
    if (error && !legacySchema && String(error.message).match(/session_kind|calendar_event|notes|updated_at/i)) {
      const rest: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(full)) {
        if (k === "session_kind" || k === "calendar_event_id" || k === "notes" || k === "updated_at") continue
        rest[k] = v
      }
      const retry = await supabase.from("user_time_clock_sessions").update(rest).eq("id", id)
      error = retry.error
      if (!error) setLegacySchema(true)
    }
    return { error }
  }

  async function handleShiftClockIn() {
    if (!supabase) return
    setClockActionBusy(true)
    setClockError("")
    const { error } = await insertSession({ user_id: viewerUserId, session_kind: "shift" })
    setClockActionBusy(false)
    if (error) {
      setClockError(error.message)
      return
    }
    await loadOpenSessions()
    await loadWeekSessions()
  }

  async function handleShiftClockOut() {
    if (!supabase) return
    setClockActionBusy(true)
    setClockError("")
    const { error } = await supabase
      .from("user_time_clock_sessions")
      .update({ clocked_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", viewerUserId)
      .is("clocked_out_at", null)
      .eq("session_kind", "shift")
    setClockActionBusy(false)
    if (error && String(error.message).match(/session_kind/i)) {
      const retry = await supabase
        .from("user_time_clock_sessions")
        .update({ clocked_out_at: new Date().toISOString() })
        .eq("user_id", viewerUserId)
        .is("clocked_out_at", null)
      if (retry.error) setClockError(retry.error.message)
      else {
        await loadOpenSessions()
        await loadWeekSessions()
      }
      return
    }
    if (error) {
      setClockError(error.message)
      return
    }
    await loadOpenSessions()
    await loadWeekSessions()
  }

  async function handleJobClockIn() {
    if (!supabase || !selectedJobEventId) {
      setClockError("Select a job first.")
      return
    }
    setClockActionBusy(true)
    setClockError("")
    const { error } = await insertSession({
      user_id: viewerUserId,
      session_kind: "job",
      calendar_event_id: selectedJobEventId,
    })
    setClockActionBusy(false)
    if (error) {
      setClockError(error.message)
      return
    }
    await loadOpenSessions()
    await loadWeekSessions()
  }

  async function handleJobClockOut() {
    if (!supabase) return
    setClockActionBusy(true)
    setClockError("")
    const { error } = await supabase
      .from("user_time_clock_sessions")
      .update({ clocked_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", viewerUserId)
      .is("clocked_out_at", null)
      .eq("session_kind", "job")
    setClockActionBusy(false)
    if (error && String(error.message).match(/session_kind/i)) {
      const retry = await supabase
        .from("user_time_clock_sessions")
        .update({ clocked_out_at: new Date().toISOString() })
        .eq("user_id", viewerUserId)
        .is("clocked_out_at", null)
      if (retry.error) setClockError(retry.error.message)
      else {
        await loadOpenSessions()
        await loadWeekSessions()
      }
      return
    }
    if (error) {
      setClockError(error.message)
      return
    }
    await loadOpenSessions()
    await loadWeekSessions()
  }

  async function saveEntryForm() {
    if (!entryForm || !supabase) return
    if (!canEditUser(entryForm.userId)) {
      alert("You cannot edit time for that user.")
      return
    }
    const inIso = datetimeLocalInputToIso(entryForm.clockedInLocal)
    if (!inIso) {
      alert("Clock-in time is required.")
      return
    }
    const outIso = datetimeLocalInputToIso(entryForm.clockedOutLocal)
    if (outIso && Date.parse(outIso) < Date.parse(inIso)) {
      alert("Clock-out must be after clock-in.")
      return
    }
    if (entryForm.sessionKind === "job" && !entryForm.calendarEventId.trim()) {
      alert("Select a job for job time entries.")
      return
    }
    setEntrySaving(true)
    const payload: Record<string, unknown> = {
      user_id: entryForm.userId,
      session_kind: entryForm.sessionKind,
      clocked_in_at: inIso,
      clocked_out_at: outIso,
      notes: entryForm.notes.trim() || null,
      calendar_event_id: entryForm.sessionKind === "job" ? entryForm.calendarEventId : null,
    }
    const editingId = entryForm.id
    const { error } = editingId ? await updateSession(editingId, payload) : await insertSession(payload)
    setEntrySaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setEntryForm(null)
    await loadOpenSessions()
    await loadWeekSessions()
    if (tab === "reports") await loadReportRows()
  }

  const myOpenShift = openShiftByUser[viewerUserId]
  const myOpenJob = openJobByUser[viewerUserId]

  const reportTotals = useMemo(() => sumDurationByKind(reportRows), [reportRows])

  const clockedInShiftMembers = useMemo(
    () =>
      roster
        .filter((m) => openShiftByUser[m.userId])
        .map((m) => ({ member: m, at: openShiftByUser[m.userId]! }))
        .sort((a, b) => rosterLabel(a.member.userId).localeCompare(rosterLabel(b.member.userId))),
    [openShiftByUser, roster, rosterLabel],
  )

  const clockedInJobMembers = useMemo(
    () =>
      roster
        .filter((m) => openJobByUser[m.userId])
        .map((m) => ({ member: m, job: openJobByUser[m.userId]! }))
        .sort((a, b) => rosterLabel(a.member.userId).localeCompare(rosterLabel(b.member.userId))),
    [openJobByUser, roster, rosterLabel],
  )

  const panelStyle: CSSProperties = {
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: "#f8fafc",
    padding: variant === "time_clock_only" ? "16px 18px" : "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  }

  const colStyle: CSSProperties = {
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    padding: "10px 12px",
    minHeight: 88,
    maxHeight: variant === "time_clock_only" ? 360 : 240,
    overflow: "auto",
    fontSize: 12,
    color: "#334155",
  }

  const tabBtn = (id: PortalTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: tab === id ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
        background: tab === id ? "#eff6ff" : "#fff",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: tab === id ? 800 : 600,
        color: theme.text,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Time tracking</span>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Shift punches, job time, weekly hours, and exportable reports.
          </p>
        </div>
        {clockLoading ? <span style={{ fontSize: 11, color: "#64748b" }}>Refreshing…</span> : null}
      </div>

      {legacySchema ? (
        <p style={{ margin: 0, fontSize: 11, color: "#b45309", lineHeight: 1.45 }}>
          Run <code style={{ fontSize: 10 }}>supabase/user-time-clock-sessions-v2.sql</code> for job clocks, notes, and full reports.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {tabBtn("shift", "Shift clock")}
        {tabBtn("job", "Job clock")}
        {tabBtn("hours", "Hours")}
        {tabBtn("reports", "Reports")}
        {!timeClockWorkspacePage && onOpenTimeClockWorkspace ? (
          <button
            type="button"
            onClick={() => onOpenTimeClockWorkspace()}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Full workspace
          </button>
        ) : null}
      </div>

      {clockError ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{clockError}</p> : null}

      {tab === "shift" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
            <div style={colStyle}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#059669", textTransform: "uppercase", marginBottom: 8 }}>Shift — clocked in</div>
              {clockedInShiftMembers.length === 0 ? (
                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Nobody on shift clock.</span>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
                  {clockedInShiftMembers.map(({ member: m, at }) => (
                    <li key={m.userId} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700 }}>{rosterLabel(m.userId)}</span>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Since {new Date(at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={colStyle}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>Shift — not in</div>
              <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
                {roster
                  .filter((m) => !openShiftByUser[m.userId])
                  .map((m) => (
                    <li key={m.userId} style={{ marginBottom: 4 }}>
                      {rosterLabel(m.userId)}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          {viewerOnRoster ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Your shift</span>
              {myOpenShift ? (
                <>
                  <span style={{ fontSize: 12, color: "#475569" }}>In since {new Date(myOpenShift).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                  <button type="button" disabled={clockActionBusy} onClick={() => void handleShiftClockOut()} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: "#334155", color: "#fff", cursor: clockActionBusy ? "wait" : "pointer" }}>
                    {clockActionBusy ? "Working…" : "Shift clock out"}
                  </button>
                </>
              ) : (
                <button type="button" disabled={clockActionBusy} onClick={() => void handleShiftClockIn()} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: theme.primary, color: "#fff", cursor: clockActionBusy ? "wait" : "pointer" }}>
                  {clockActionBusy ? "Working…" : "Shift clock in"}
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "job" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
            <div style={colStyle}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#2563eb", textTransform: "uppercase", marginBottom: 8 }}>Job — on site</div>
              {clockedInJobMembers.length === 0 ? (
                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Nobody on a job clock.</span>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
                  {clockedInJobMembers.map(({ member: m, job }) => (
                    <li key={m.userId} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700 }}>{rosterLabel(m.userId)}</span>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{job.title}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={colStyle}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>Today&apos;s jobs</div>
              {todayJobEvents.length === 0 ? (
                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>No open jobs on the calendar for today.</span>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
                  {todayJobEvents.map((ev) => (
                    <li key={ev.id} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{ev.title?.trim() || "Untitled"}</span>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{new Date(ev.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {viewerOnRoster ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
                Job for clock
                <select value={selectedJobEventId} onChange={(e) => setSelectedJobEventId(e.target.value)} style={{ ...theme.formInput, display: "block", marginTop: 6, maxWidth: 420 }}>
                  <option value="">Select a job…</option>
                  {todayJobEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {(ev.title?.trim() || "Untitled") + " — " + new Date(ev.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                {myOpenJob ? (
                  <>
                    <span style={{ fontSize: 12, color: "#475569" }}>
                      On job: <strong>{myOpenJob.title}</strong> since {new Date(myOpenJob.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <button type="button" disabled={clockActionBusy} onClick={() => void handleJobClockOut()} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: "#334155", color: "#fff", cursor: clockActionBusy ? "wait" : "pointer" }}>
                      {clockActionBusy ? "Working…" : "Job clock out"}
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={clockActionBusy || !selectedJobEventId} onClick={() => void handleJobClockIn()} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: clockActionBusy ? "wait" : "pointer", opacity: selectedJobEventId ? 1 : 0.55 }}>
                    {clockActionBusy ? "Working…" : "Job clock in"}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "hours" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            Week of {weekStart.toLocaleDateString(undefined, { dateStyle: "medium" })} — shift + job hours
          </div>
          {roster.map((m) => {
            const rows = weekSessionsByUser[m.userId] ?? []
            const totals = sumDurationByKind(rows)
            return (
              <div key={m.userId} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: "#fff", padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{rosterLabel(m.userId)}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    Shift {formatDurationDecimalHours(totals.shiftMs)}h · Job {formatDurationDecimalHours(totals.jobMs)}h · Total {formatDurationDecimalHours(totals.totalMs)}h
                  </span>
                </div>
                {rows.length === 0 ? (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>No entries this week.</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.45 }}>
                    {rows.slice(0, 30).map((row) => (
                      <li key={row.id ?? `${row.clocked_in_at}-${row.user_id}`}>
                        <strong>{sessionKindLabel(normalizeSessionKind(row.session_kind))}</strong>
                        {eventTitleFromSession(row) ? ` · ${eventTitleFromSession(row)}` : ""} — {new Date(row.clocked_in_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        {" → "}
                        {row.clocked_out_at ? new Date(row.clocked_out_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Active"}
                        {" ("}
                        {formatDurationShort(sessionDurationMs(row))}
                        {")"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {tab === "reports" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <select value={reportRange} onChange={(e) => setReportRange(e.target.value as TimeClockReportRange)} style={{ ...theme.formInput, fontSize: 12 }}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <select value={reportUserId} onChange={(e) => setReportUserId(e.target.value)} style={{ ...theme.formInput, fontSize: 12 }}>
              <option value="all">All team members</option>
              {roster.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {rosterLabel(m.userId)}
                </option>
              ))}
            </select>
            <select value={reportKind} onChange={(e) => setReportKind(e.target.value as "all" | TimeClockSessionKind)} style={{ ...theme.formInput, fontSize: 12 }}>
              <option value="all">Shift + job</option>
              <option value="shift">Shift only</option>
              <option value="job">Job only</option>
            </select>
            <button type="button" onClick={() => void loadReportRows()} style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }}>
              Refresh
            </button>
            <button
              type="button"
              onClick={() => downloadTimeSessionsCsv(`tradesman-time-${reportRange}.csv`, reportRows, rosterLabel)}
              style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }}
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setEntryForm(emptyEntryForm(canManageTeamEntries ? viewerUserId : viewerUserId))}
              style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: theme.primary, color: "#fff", cursor: "pointer" }}
            >
              Add entry
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {reportBusy ? "Loading…" : `${reportRows.length} row(s) · Shift ${formatDurationDecimalHours(reportTotals.shiftMs)}h · Job ${formatDurationDecimalHours(reportTotals.jobMs)}h · Total ${formatDurationDecimalHours(reportTotals.totalMs)}h`}
          </div>
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: "#fff", maxHeight: 320, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: "6px 8px" }}>User</th>
                  <th style={{ padding: "6px 8px" }}>Kind</th>
                  <th style={{ padding: "6px 8px" }}>Job</th>
                  <th style={{ padding: "6px 8px" }}>In</th>
                  <th style={{ padding: "6px 8px" }}>Out</th>
                  <th style={{ padding: "6px 8px" }}>Hrs</th>
                  <th style={{ padding: "6px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {reportRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: "#94a3b8" }}>
                      No submissions in this range.
                    </td>
                  </tr>
                ) : (
                  reportRows.map((row) => (
                    <tr key={row.id ?? `${row.user_id}-${row.clocked_in_at}`} style={{ borderTop: `1px solid #f1f5f9` }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{rosterLabel(row.user_id)}</td>
                      <td style={{ padding: "6px 8px" }}>{sessionKindLabel(normalizeSessionKind(row.session_kind))}</td>
                      <td style={{ padding: "6px 8px", color: "#64748b" }}>{eventTitleFromSession(row) ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{new Date(row.clocked_in_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                      <td style={{ padding: "6px 8px" }}>{row.clocked_out_at ? new Date(row.clocked_out_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "Active"}</td>
                      <td style={{ padding: "6px 8px" }}>{formatDurationDecimalHours(sessionDurationMs(row))}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {canEditUser(row.user_id) && row.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              setEntryForm({
                                id: row.id,
                                userId: row.user_id,
                                sessionKind: normalizeSessionKind(row.session_kind),
                                calendarEventId: row.calendar_event_id ?? "",
                                clockedInLocal: isoToDatetimeLocalInput(row.clocked_in_at),
                                clockedOutLocal: isoToDatetimeLocalInput(row.clocked_out_at),
                                notes: row.notes?.trim() ?? "",
                              })
                            }
                            style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, border: `1px solid ${theme.border}`, background: "#f8fafc", cursor: "pointer" }}
                          >
                            Edit
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {entryForm ? (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{entryForm.id ? "Edit time entry" : "Add time entry"}</div>
          {canManageTeamEntries ? (
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Team member
              <select value={entryForm.userId} onChange={(e) => setEntryForm((f) => (f ? { ...f, userId: e.target.value } : f))} style={{ ...theme.formInput, display: "block", marginTop: 4, maxWidth: 320 }}>
                {roster.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {rosterLabel(m.userId)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Type
            <select value={entryForm.sessionKind} onChange={(e) => setEntryForm((f) => (f ? { ...f, sessionKind: e.target.value as TimeClockSessionKind } : f))} style={{ ...theme.formInput, display: "block", marginTop: 4, maxWidth: 200 }}>
              <option value="shift">Shift</option>
              <option value="job">Job</option>
            </select>
          </label>
          {entryForm.sessionKind === "job" ? (
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Calendar job
              <select value={entryForm.calendarEventId} onChange={(e) => setEntryForm((f) => (f ? { ...f, calendarEventId: e.target.value } : f))} style={{ ...theme.formInput, display: "block", marginTop: 4, maxWidth: 420 }}>
                <option value="">Select job…</option>
                {todayJobEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title?.trim() || "Untitled"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Clock in
              <input type="datetime-local" value={entryForm.clockedInLocal} onChange={(e) => setEntryForm((f) => (f ? { ...f, clockedInLocal: e.target.value } : f))} style={{ ...theme.formInput, display: "block", marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Clock out
              <input type="datetime-local" value={entryForm.clockedOutLocal} onChange={(e) => setEntryForm((f) => (f ? { ...f, clockedOutLocal: e.target.value } : f))} style={{ ...theme.formInput, display: "block", marginTop: 4 }} />
            </label>
          </div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Notes
            <textarea value={entryForm.notes} onChange={(e) => setEntryForm((f) => (f ? { ...f, notes: e.target.value } : f))} rows={2} style={{ ...theme.formInput, display: "block", marginTop: 4, width: "100%", maxWidth: 480, resize: "vertical" }} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={entrySaving} onClick={() => void saveEntryForm()} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: theme.primary, color: "#fff", cursor: entrySaving ? "wait" : "pointer" }}>
              {entrySaving ? "Saving…" : "Save entry"}
            </button>
            <button type="button" onClick={() => setEntryForm(null)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}