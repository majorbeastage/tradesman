import { useEffect, useState, useMemo, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { parseLocalDateTime } from "../../lib/parseLocalDateTime"
import { useOfficeManagerScopeOptional, usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import PortalSettingsModal from "../../components/PortalSettingsModal"
import PortalSettingItemsForm from "../../components/PortalSettingItemsForm"
import { getControlItemsForUser, getCustomActionButtonsForUser, getOmPageActionVisible, getPageActionVisible } from "../../types/portal-builder"
import {
  resolveRecurrenceFromPortal,
  applyRecurrenceEndLimitsFromPortal,
  computeOccurrenceStarts,
  intervalsOverlap,
} from "../../lib/calendarRecurrence"
import type { PortalSettingItem } from "../../types/portal-builder"

type JobType = {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  color_hex: string | null
}

type CalendarEvent = {
  id: string
  user_id?: string
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
  recurrence_series_id?: string | null
  job_types?: JobType | null
  customers?: { display_name: string | null } | null
}

type UserCalendarPreference = {
  owner_user_id: string
  ribbon_color: string | null
  auto_assign_enabled: boolean | null
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const HOUR_HEIGHT = 48
const DAY_START_HOUR = 6
const DAY_END_HOUR = 20

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

function buildCalendarReceiptBody(ev: CalendarEvent): string {
  const lines = [
    `Job: ${ev.title}`,
    `When: ${new Date(ev.start_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} – ${new Date(ev.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
  ]
  if (ev.quote_total != null && ev.quote_total > 0) lines.push(`Total: $${Number(ev.quote_total).toFixed(2)}`)
  if (ev.notes?.trim()) lines.push(`Notes: ${ev.notes.trim()}`)
  return lines.join("\n")
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

function formatEventDurationMinutes(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

/** PostgREST may return `customers` as one object or a single-element array. */
function normalizeCalendarEventRow(raw: unknown): CalendarEvent {
  const e = raw as CalendarEvent & { customers?: CalendarEvent["customers"] | { display_name: string | null }[] }
  let customers: CalendarEvent["customers"] = e.customers ?? null
  if (Array.isArray(e.customers)) {
    const c0 = e.customers[0]
    customers = c0 ? { display_name: c0.display_name ?? null } : null
  }
  return { ...e, customers }
}

export default function CalendarPage() {
  const { userId: authUserId, user: authUser } = useAuth()
  const scopeCtx = useOfficeManagerScopeOptional()
  const userId = useScopedUserId()
  const portalConfig = usePortalConfigForPage()
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
  const [showCustomizeUser, setShowCustomizeUser] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
  const [showAutoResponse, setShowAutoResponse] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [removeRecurrenceScope, setRemoveRecurrenceScope] = useState<"instance" | "series">("instance")
  const [hasCompletedAtColumn, setHasCompletedAtColumn] = useState(true)
  const [userPref, setUserPref] = useState<UserCalendarPreference | null>(null)
  const [prefRibbonColor, setPrefRibbonColor] = useState("#0ea5e9")
  const [prefAutoAssignEnabled, setPrefAutoAssignEnabled] = useState(true)
  const [prefSaving, setPrefSaving] = useState(false)
  const [prefMessage, setPrefMessage] = useState("")
  const [customizeTargetUserId, setCustomizeTargetUserId] = useState("")
  const [addTargetUserId, setAddTargetUserId] = useState("")
  const [addAssignToSelectedUser, setAddAssignToSelectedUser] = useState(true)
  const [showAllOrgEvents, setShowAllOrgEvents] = useState(() => {
    try { return localStorage.getItem("calendar_showAllOrgEvents") === "true" } catch { return false }
  })
  const [prefByUserId, setPrefByUserId] = useState<Record<string, UserCalendarPreference>>({})

  // Reset removal scope every time user opens a different event.
  useEffect(() => {
    setRemoveRecurrenceScope("instance")
  }, [selectedEvent?.id])

  const selectableUsers = useMemo(() => {
    if (scopeCtx?.clients?.length) return scopeCtx.clients
    return [{ userId, label: "My calendar", email: null, clientId: null, isSelf: true }]
  }, [scopeCtx?.clients, userId])

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

  const calendarSettingsItems = useMemo(() => getControlItemsForUser(portalConfig, "calendar", "working_hours"), [portalConfig])
  const addItemPortalItems = useMemo(() => getControlItemsForUser(portalConfig, "calendar", "add_item_to_calendar"), [portalConfig])
  const calendarAutoResponseItems = useMemo(() => getControlItemsForUser(portalConfig, "calendar", "auto_response_options"), [portalConfig])
  const jobTypesPortalItems = useMemo(() => getControlItemsForUser(portalConfig, "calendar", "job_types"), [portalConfig])
  const calendarSettingsItemsWithOrg = useMemo(() => {
    const orgToggle: PortalSettingItem = {
      id: "__org_all_events",
      label: "Show all scheduled items in my organization",
      type: "checkbox",
      defaultChecked: showAllOrgEvents,
    }
    return [...calendarSettingsItems, orgToggle]
  }, [calendarSettingsItems, showAllOrgEvents])
  const customActionButtons = useMemo(() => getCustomActionButtonsForUser(portalConfig, "calendar"), [portalConfig])
  const selectedSeriesSiblingCount = useMemo(() => {
    if (!selectedEvent?.recurrence_series_id) return 0
    return events.filter((e) => e.recurrence_series_id === selectedEvent.recurrence_series_id).length
  }, [events, selectedEvent?.recurrence_series_id])
  const showCalAddItem = getPageActionVisible(portalConfig, "calendar", "add_item_to_calendar") && getOmPageActionVisible(portalConfig, "calendar", "add_item")
  const showCalAutoResponse = getOmPageActionVisible(portalConfig, "calendar", "auto_response")
  const showCalJobTypes = getOmPageActionVisible(portalConfig, "calendar", "job_types")
  const showCalSettings = getOmPageActionVisible(portalConfig, "calendar", "settings")
  const showCalCustomizeUser = getOmPageActionVisible(portalConfig, "calendar", "customize_user")

  const [arReminderMins, setArReminderMins] = useState(() => {
    try {
      return localStorage.getItem("calendar_arReminderMins") ?? "15"
    } catch {
      return "15"
    }
  })
  const arReminderMinsRef = useRef(arReminderMins)
  arReminderMinsRef.current = arReminderMins

  useEffect(() => {
    if (!showSettings || calendarSettingsItemsWithOrg.length === 0) return
    const next: Record<string, string> = {}
    calendarSettingsItemsWithOrg.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setSettingsFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [showSettings, calendarSettingsItemsWithOrg])

  function isCalendarSettingItemVisible(item: PortalSettingItem): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = calendarSettingsItems.find((i) => i.id === depId)
    let depValue = settingsFormValues[depId] ?? ""
    if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
    return depValue === item.dependency.showWhenValue
  }

  useEffect(() => {
    if (!openCustomButtonId) return
    const btn = customActionButtons.find((b) => b.id === openCustomButtonId)
    if (!btn?.items?.length) return
    const next: Record<string, string> = {}
    btn.items.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setCustomButtonFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [openCustomButtonId, customActionButtons])

  function isCustomButtonItemVisible(item: PortalSettingItem, items: PortalSettingItem[], formValues: Record<string, string>): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = items.find((i) => i.id === depId)
    let depValue = formValues[depId] ?? ""
    if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
    return depValue === item.dependency.showWhenValue
  }

  function isPortalItemVisible(items: PortalSettingItem[], formValues: Record<string, string>, item: PortalSettingItem): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = items.find((i) => i.id === depId)
    let depValue = formValues[depId] ?? ""
    if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
    return depValue === item.dependency.showWhenValue
  }

  useEffect(() => {
    if (!showAddItem) return
    if (addItemPortalItems.length === 0) {
      setAddItemPortalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of addItemPortalItems) {
      try {
        const s = localStorage.getItem(`cal_add_${item.id}`)
        if (item.type === "checkbox") {
          next[item.id] = s === "checked" || s === "unchecked" ? s : item.defaultChecked ? "checked" : "unchecked"
        } else if (item.type === "dropdown" && item.options?.length) {
          next[item.id] = s && item.options.includes(s) ? s : item.options[0]
        } else {
          next[item.id] = s ?? ""
        }
      } catch {
        if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
        else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
        else next[item.id] = ""
      }
    }
    setAddItemPortalValues(next)
  }, [showAddItem, addItemPortalItems])

  useEffect(() => {
    if (!showJobTypes) return
    if (jobTypesPortalItems.length === 0) {
      setJobTypesPortalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of jobTypesPortalItems) {
      try {
        const s = localStorage.getItem(`cal_jt_${item.id}`)
        if (item.type === "checkbox") {
          next[item.id] = s === "checked" || s === "unchecked" ? s : item.defaultChecked ? "checked" : "unchecked"
        } else if (item.type === "dropdown" && item.options?.length) {
          next[item.id] = s && item.options.includes(s) ? s : item.options[0]
        } else {
          next[item.id] = s ?? ""
        }
      } catch {
        if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
        else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
        else next[item.id] = ""
      }
    }
    setJobTypesPortalValues(next)
  }, [showJobTypes, jobTypesPortalItems])

  useEffect(() => {
    if (!showAutoResponse) return
    if (calendarAutoResponseItems.length === 0) {
      setAutoResponsePortalValues({})
      return
    }
    const remind = arReminderMinsRef.current
    const next: Record<string, string> = {}
    for (const item of calendarAutoResponseItems) {
      try {
        if (item.id === "ar_remind_before_mins") {
          next[item.id] = remind
          continue
        }
        const s = localStorage.getItem(`cal_ar_${item.id}`)
        if (item.type === "checkbox") {
          next[item.id] = s === "checked" || s === "unchecked" ? s : item.defaultChecked ? "checked" : "unchecked"
        } else if (item.type === "dropdown" && item.options?.length) {
          next[item.id] = s && item.options.includes(s) ? s : item.options[0]
        } else {
          next[item.id] = s ?? ""
        }
      } catch {
        if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
        else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
        else next[item.id] = ""
      }
    }
    setAutoResponsePortalValues(next)
  }, [showAutoResponse, calendarAutoResponseItems])

  const [timeIncrement, setTimeIncrement] = useState<15 | 60>(() => {
    try { const v = localStorage.getItem("calendar_timeIncrement"); return v === "60" ? 60 : 15 } catch { return 15 }
  })
  const [noDuplicateTimes] = useState(() => {
    try { return localStorage.getItem("calendar_noDuplicateTimes") === "true" } catch { return false }
  })
  const [workingHoursEnabled] = useState(() => {
    try { return localStorage.getItem("calendar_workingHoursEnabled") === "true" } catch { return false }
  })
  const [workingStart] = useState(() => {
    try { return localStorage.getItem("calendar_workingStart") ?? "08:00" } catch { return "08:00" }
  })
  const [workingEnd] = useState(() => {
    try { return localStorage.getItem("calendar_workingEnd") ?? "17:00" } catch { return "17:00" }
  })
  const [addError, setAddError] = useState("")
  const [completeFlowEvent, setCompleteFlowEvent] = useState<CalendarEvent | null>(null)
  const [receiptEmailCustomer, setReceiptEmailCustomer] = useState(false)
  const [receiptSmsCustomer, setReceiptSmsCustomer] = useState(false)
  const [receiptEmailSelf, setReceiptEmailSelf] = useState(false)
  const [completeBusy, setCompleteBusy] = useState(false)
  const [calendarEventActionBusy, setCalendarEventActionBusy] = useState(false)
  const [completeCustomerEmail, setCompleteCustomerEmail] = useState<string | null>(null)
  const [completeCustomerPhone, setCompleteCustomerPhone] = useState<string | null>(null)
  const [addItemPortalValues, setAddItemPortalValues] = useState<Record<string, string>>({})
  const [autoResponsePortalValues, setAutoResponsePortalValues] = useState<Record<string, string>>({})
  const [jobTypesPortalValues, setJobTypesPortalValues] = useState<Record<string, string>>({})

  async function loadEvents() {
    if (!userId || !supabase) return
    const client = supabase
    const orgUserIds = Array.from(new Set((scopeCtx?.clients ?? []).map((c) => c.userId).filter(Boolean)))
    const canViewOrgEvents = showAllOrgEvents && orgUserIds.length > 0
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
        .select(
          "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, customers ( display_name )"
        )
        .is("removed_at", null)
        .lte("start_at", end.toISOString())
        .gte("end_at", start.toISOString())
    const scopedQuery = () => (canViewOrgEvents ? baseQuery().in("user_id", orgUserIds) : baseQuery().eq("user_id", userId))
    const { data, error } = await scopedQuery().order("start_at").is("completed_at", null)
    if (error && error.message?.includes("completed_at")) {
      setHasCompletedAtColumn(false)
      const { data: data2, error: error2 } = await scopedQuery().order("start_at")
      if (error2) {
        setLoadError(error2.message)
        setEvents([])
        return
      }
      setEvents((data2 || []).map(normalizeCalendarEventRow))
      return
    }
    if (error) {
      setLoadError(error.message)
      setEvents([])
      return
    }
    setEvents((data || []).map(normalizeCalendarEventRow))
  }

  useEffect(() => {
    const ev = completeFlowEvent
    if (!ev?.customer_id || !supabase) {
      setCompleteCustomerEmail(null)
      setCompleteCustomerPhone(null)
      return
    }
    const owner = ev.user_id ?? userId
    void supabase
      .from("customer_identifiers")
      .select("type, value")
      .eq("customer_id", ev.customer_id)
      .eq("user_id", owner)
      .then(({ data }) => {
        const rows = (data ?? []) as { type: string; value: string }[]
        setCompleteCustomerEmail(rows.find((r) => r.type === "email")?.value ?? null)
        setCompleteCustomerPhone(rows.find((r) => r.type === "phone")?.value ?? null)
      })
  }, [completeFlowEvent?.id, completeFlowEvent?.customer_id, completeFlowEvent?.user_id, userId])

  async function confirmCompleteCalendarEvent() {
    if (!supabase || !completeFlowEvent?.id) return
    setCompleteBusy(true)
    const { error } = await supabase
      .from("calendar_events")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", completeFlowEvent.id)
    setCompleteBusy(false)
    if (error) {
      alert(error.message)
      return
    }
    const body = buildCalendarReceiptBody(completeFlowEvent)
    const subject = encodeURIComponent(`Receipt: ${completeFlowEvent.title}`)
    const bodyEnc = encodeURIComponent(body)
    const openMail = (email: string) => {
      window.open(`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${bodyEnc}`, "_blank", "noopener,noreferrer")
    }
    if (receiptEmailCustomer) {
      if (completeCustomerEmail) openMail(completeCustomerEmail)
      else alert("No customer email on file. Add an email identifier for this customer to send a receipt by email.")
    }
    if (receiptSmsCustomer) {
      const digits = (completeCustomerPhone ?? "").replace(/\D/g, "")
      if (digits) window.open(`sms:${digits}?&body=${bodyEnc}`, "_blank", "noopener,noreferrer")
      else alert("No customer phone on file. Add a phone identifier for this customer to send a receipt by SMS.")
    }
    if (receiptEmailSelf) {
      const selfEmail = authUser?.email
      if (selfEmail) openMail(selfEmail)
      else alert("Your account has no email address for “send receipt to myself”.")
    }
    setCompleteFlowEvent(null)
    setSelectedEvent(null)
    loadEvents()
  }

  function getEventColor(ev: CalendarEvent): string {
    const jt = ev.job_types ?? jobTypes.find((j) => j.id === ev.job_type_id)
    return (jt as JobType)?.color_hex ?? theme.primary
  }

  function getEventRibbonColor(): string {
    return userPref?.ribbon_color?.trim() || "#0ea5e9"
  }

  function getEventRibbonColorForEvent(ev: CalendarEvent): string {
    const uid = ev.user_id
    if (uid && prefByUserId[uid]?.ribbon_color?.trim()) return prefByUserId[uid].ribbon_color!.trim()
    return getEventRibbonColor()
  }

  async function loadUserPreference(ownerUserId: string): Promise<UserCalendarPreference | null> {
    if (!ownerUserId || !supabase) return null
    const { data, error } = await supabase
      .from("user_calendar_preferences")
      .select("owner_user_id, ribbon_color, auto_assign_enabled")
      .eq("owner_user_id", ownerUserId)
      .maybeSingle()
    if (error) {
      setPrefMessage(error.message)
      return null
    }
    const row = (data as UserCalendarPreference | null) ?? null
    return row
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
  }, [userId, currentDate, view, jobTypes.length, showAllOrgEvents, scopeCtx?.clients])

  useEffect(() => {
    if (!userId) return
    loadJobTypes()
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void loadUserPreference(userId).then((row) => {
      setUserPref(row)
      setPrefRibbonColor(row?.ribbon_color?.trim() || "#0ea5e9")
      setPrefAutoAssignEnabled(row?.auto_assign_enabled !== false)
      setCustomizeTargetUserId(userId)
      setAddTargetUserId(userId)
    })
  }, [userId])

  useEffect(() => {
    if (!showCustomizeUser || !customizeTargetUserId) return
    setPrefMessage("")
    void loadUserPreference(customizeTargetUserId).then((row) => {
      setPrefRibbonColor(row?.ribbon_color?.trim() || "#0ea5e9")
      setPrefAutoAssignEnabled(row?.auto_assign_enabled !== false)
    })
  }, [showCustomizeUser, customizeTargetUserId])

  useEffect(() => {
    if (!showAddItem || !addTargetUserId) return
    void loadUserPreference(addTargetUserId).then((row) => {
      if (authUserId && addTargetUserId !== authUserId) {
        setAddAssignToSelectedUser(true)
      } else {
        setAddAssignToSelectedUser(row?.auto_assign_enabled !== false)
      }
    })
  }, [showAddItem, addTargetUserId, authUserId])

  useEffect(() => {
    const ids = Array.from(new Set((scopeCtx?.clients ?? []).map((c) => c.userId).filter(Boolean)))
    if (!supabase || ids.length === 0) {
      setPrefByUserId({})
      return
    }
    void supabase
      .from("user_calendar_preferences")
      .select("owner_user_id, ribbon_color, auto_assign_enabled")
      .in("owner_user_id", ids)
      .then(({ data, error }) => {
        if (error || !data) return
        const next: Record<string, UserCalendarPreference> = {}
        for (const row of data as UserCalendarPreference[]) next[row.owner_user_id] = row
        setPrefByUserId(next)
      })
  }, [scopeCtx?.clients])

  async function saveEvent() {
    if (!supabase || !userId || !addTitle.trim()) return
    const selectedTarget = addTargetUserId || userId
    setAddError("")
    const start = parseLocalDateTime(addStartDate, addStartTime)
    if (Number.isNaN(start.getTime())) {
      setAddError("Invalid start date or time.")
      return
    }
    const durationMs = addDuration * 60 * 1000
    const recurrenceFromJobTypes =
      addJobTypeId && jobTypesPortalItems.length > 0
        ? resolveRecurrenceFromPortal(jobTypesPortalItems, jobTypesPortalValues)
        : null
    const recurrenceFromAddItem = resolveRecurrenceFromPortal(addItemPortalItems, addItemPortalValues)
    let series = recurrenceFromJobTypes ?? recurrenceFromAddItem
    if (series) {
      const endItems = addJobTypeId && jobTypesPortalItems.length > 0 ? jobTypesPortalItems : addItemPortalItems
      const endVals = addJobTypeId && jobTypesPortalItems.length > 0 ? jobTypesPortalValues : addItemPortalValues
      series = applyRecurrenceEndLimitsFromPortal(endItems, endVals, series)
    }
    const starts = series ? computeOccurrenceStarts(start, series) : [start]
    const newRanges = starts.map((s) => ({ s, e: new Date(s.getTime() + durationMs) }))

    if (noDuplicateTimes && newRanges.length > 0) {
      const windowStart = newRanges[0].s
      const windowEnd = newRanges[newRanges.length - 1].e
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id, start_at, end_at")
        .eq("user_id", selectedTarget)
        .is("removed_at", null)
        .lt("start_at", windowEnd.toISOString())
        .gt("end_at", windowStart.toISOString())
      const exRows = (existing ?? []) as { start_at: string; end_at: string }[]
      for (const nr of newRanges) {
        for (const ex of exRows) {
          if (intervalsOverlap(nr.s, nr.e, new Date(ex.start_at), new Date(ex.end_at))) {
            setAddError(
              "One or more recurring times overlap an existing event. Change the start time, recurrence, or turn off \"Do not allow duplicate times\" in Settings."
            )
            return
          }
        }
      }
      for (let i = 0; i < newRanges.length; i++) {
        for (let j = i + 1; j < newRanges.length; j++) {
          if (intervalsOverlap(newRanges[i].s, newRanges[i].e, newRanges[j].s, newRanges[j].e)) {
            setAddError("Recurring instances overlap each other. Try a longer duration, different frequency, or fewer occurrences.")
            return
          }
        }
      }
    }

    setAddSaving(true)
    const eventOwnerUserId = addAssignToSelectedUser ? selectedTarget : (authUserId || selectedTarget)
    const recurrenceSeriesId = starts.length > 1 ? crypto.randomUUID() : null
    const rows = newRanges.map(({ s, e }) => ({
      user_id: eventOwnerUserId,
      title: addTitle.trim(),
      start_at: s.toISOString(),
      end_at: e.toISOString(),
      job_type_id: addJobTypeId || null,
      quote_id: addQuoteId || null,
      customer_id: addCustomerId || null,
      notes: addNotes.trim() || null,
      ...(recurrenceSeriesId ? { recurrence_series_id: recurrenceSeriesId } : {}),
    }))
    const { error } = await supabase.from("calendar_events").insert(rows)
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
      const end = new Date(e.end_at)
      return start <= dayEnd && end >= dayStart
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-calendar-app="tradesman">
      <h1 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        Calendar
        <span style={{ fontSize: "12px", fontWeight: 400, color: "#9ca3af" }}>(tradesman)</span>
      </h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
        {showCalAddItem && (
          <button
            onClick={() => { setShowAddItem(true); resetAddForm(); setAddTargetUserId(userId) }}
            style={{ background: theme.primary, color: "white", padding: "8px 14px", borderRadius: "6px", border: "none", cursor: "pointer" }}
          >
            Add item to calendar
          </button>
        )}
        {showCalAutoResponse && (
          <button
            onClick={() => setShowAutoResponse(true)}
            style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
          >
            Auto Response Options
          </button>
        )}
        {showCalJobTypes && (
          <button
            onClick={() => setShowJobTypes(true)}
            style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
          >
            Job Types
          </button>
        )}
        {showCalSettings && (
          <button
            onClick={() => setShowSettings(true)}
            style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
          >
            Settings
          </button>
        )}
        {showCalCustomizeUser && (
          <button
            onClick={() => { setPrefMessage(""); setShowCustomizeUser(true) }}
            style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
          >
            Customize user
          </button>
        )}
        {customActionButtons.map((btn) => (
          <button key={btn.id} onClick={() => setOpenCustomButtonId(btn.id)} style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}>{btn.label}</button>
        ))}
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
                                boxShadow: `inset 4px 0 0 ${getEventRibbonColorForEvent(ev)}`,
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
                  const calDayStart = new Date(dayStart)
                  calDayStart.setHours(0, 0, 0, 0)
                  const calDayEnd = new Date(dayStart)
                  calDayEnd.setHours(23, 59, 59, 999)
                  const dayEvents = events.filter((e) => {
                    const s = new Date(e.start_at)
                    const en = new Date(e.end_at)
                    if (!(s <= calDayEnd && en >= calDayStart)) return false
                    return s < dayEnd && en > dayStart
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
                              boxShadow: `inset 4px 0 0 ${getEventRibbonColorForEvent(ev)}`,
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
                  const cal0 = new Date(currentDate)
                  cal0.setHours(0, 0, 0, 0)
                  const cal1 = new Date(currentDate)
                  cal1.setHours(23, 59, 59, 999)
                  return events
                    .filter((e) => {
                      const s = new Date(e.start_at)
                      const en = new Date(e.end_at)
                      if (!(s <= cal1 && en >= cal0)) return false
                      return s < dayEnd && en > dayStart
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
                            boxShadow: `inset 4px 0 0 ${getEventRibbonColorForEvent(ev)}`,
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
              <div>
                <label style={{ fontSize: "12px", color: theme.text }}>Select user</label>
                <select value={addTargetUserId} onChange={(e) => setAddTargetUserId(e.target.value)} style={addInputStyle}>
                  {selectableUsers.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.label}{u.email ? ` (${u.email})` : ""}
                    </option>
                  ))}
                </select>
              </div>
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
              {addItemPortalItems.length > 0 && (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>Options (from portal config)</p>
                  <PortalSettingItemsForm
                    items={addItemPortalItems}
                    formValues={addItemPortalValues}
                    setFormValue={(id, v) => {
                      setAddItemPortalValues((prev) => ({ ...prev, [id]: v }))
                      try {
                        localStorage.setItem(`cal_add_${id}`, v)
                      } catch {
                        /* ignore */
                      }
                    }}
                    isItemVisible={(item) => isPortalItemVisible(addItemPortalItems, addItemPortalValues, item)}
                  />
                </div>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: theme.text }}>
                <input type="checkbox" checked={addAssignToSelectedUser} onChange={(e) => setAddAssignToSelectedUser(e.target.checked)} />
                Assign to selected user calendar automatically
              </label>
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
            {jobTypesPortalItems.length > 0 && (
              <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${theme.border}` }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>Portal options</p>
                <PortalSettingItemsForm
                  items={jobTypesPortalItems}
                  formValues={jobTypesPortalValues}
                  setFormValue={(id, v) => {
                    setJobTypesPortalValues((prev) => ({ ...prev, [id]: v }))
                    try {
                      localStorage.setItem(`cal_jt_${id}`, v)
                    } catch {
                      /* ignore */
                    }
                  }}
                  isItemVisible={(item) => isPortalItemVisible(jobTypesPortalItems, jobTypesPortalValues, item)}
                />
              </div>
            )}
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
            <button onClick={() => setShowJobTypes(false)} style={{ marginTop: "16px", padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, cursor: "pointer", color: theme.text }}>Done</button>
          </div>
        </>
      )}

      {showSettings && (
        <PortalSettingsModal
          title="Calendar Settings"
          items={calendarSettingsItemsWithOrg}
          formValues={settingsFormValues}
          setFormValue={(id, value) => {
            setSettingsFormValues((prev) => ({ ...prev, [id]: value }))
            if (id === "__org_all_events") {
              const next = value === "checked"
              setShowAllOrgEvents(next)
              try { localStorage.setItem("calendar_showAllOrgEvents", String(next)) } catch { /* ignore */ }
            }
          }}
          isItemVisible={isCalendarSettingItemVisible}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showCustomizeUser && (
        <>
          <div onClick={() => setShowCustomizeUser(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "440px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 12px", color: theme.text }}>Customize user calendar</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: theme.text, opacity: 0.85 }}>
              {scopeCtx?.clients.find((c) => c.userId === customizeTargetUserId)?.isSelf ? "You are customizing your own calendar." : "This applies to the selected user."}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, color: theme.text, fontSize: 14 }}>
                Select user
                <select
                  value={customizeTargetUserId}
                  onChange={(e) => setCustomizeTargetUserId(e.target.value)}
                  style={{ ...addInputStyle, maxWidth: "100%" }}
                >
                  {selectableUsers.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.label}{u.email ? ` (${u.email})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, color: theme.text, fontSize: 14 }}>
                Ribbon color
                <input type="color" value={prefRibbonColor} onChange={(e) => setPrefRibbonColor(e.target.value)} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: theme.text, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={prefAutoAssignEnabled}
                  onChange={(e) => setPrefAutoAssignEnabled(e.target.checked)}
                />
                Auto-assign new calendar items to selected user
              </label>
              <button
                type="button"
                disabled={prefSaving || !customizeTargetUserId || !supabase}
                onClick={async () => {
                  if (!customizeTargetUserId || !supabase) return
                  setPrefSaving(true)
                  setPrefMessage("")
                  const payload = {
                    owner_user_id: customizeTargetUserId,
                    ribbon_color: prefRibbonColor,
                    auto_assign_enabled: prefAutoAssignEnabled,
                    updated_at: new Date().toISOString(),
                  }
                  const { error } = await supabase.from("user_calendar_preferences").upsert(payload, { onConflict: "owner_user_id" })
                  setPrefSaving(false)
                  if (error) {
                    setPrefMessage(error.message)
                    return
                  }
                  if (customizeTargetUserId === userId) {
                    setUserPref({
                      owner_user_id: userId,
                      ribbon_color: prefRibbonColor,
                      auto_assign_enabled: prefAutoAssignEnabled,
                    })
                  }
                  setPrefMessage("Saved.")
                }}
                style={{ padding: "9px 14px", background: theme.primary, color: "white", border: "none", borderRadius: 6, cursor: prefSaving ? "wait" : "pointer", fontWeight: 600 }}
              >
                {prefSaving ? "Saving..." : "Save customization"}
              </button>
              {prefMessage && <p style={{ margin: 0, fontSize: 12, color: prefMessage === "Saved." ? "#059669" : "#b91c1c" }}>{prefMessage}</p>}
              <button onClick={() => setShowCustomizeUser(false)} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${theme.border}`, background: "white", color: theme.text, cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {openCustomButtonId && (() => {
        const btn = customActionButtons.find((b) => b.id === openCustomButtonId)
        if (!btn) return null
        const items = btn.items ?? []
        const formValues = customButtonFormValues
        const setFormValue = (itemId: string, value: string) => setCustomButtonFormValues((prev) => ({ ...prev, [itemId]: value }))
        return (
          <>
            <div onClick={() => setOpenCustomButtonId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>{btn.label}</h3>
                <button onClick={() => setOpenCustomButtonId(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: theme.text }}>
                {items.length === 0 && <p style={{ fontSize: "14px", opacity: 0.8 }}>No options configured.</p>}
                {items.map((item) => {
                  if (!isCustomButtonItemVisible(item, items, formValues)) return null
                  if (item.type === "checkbox") return (
                    <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                      <input type="checkbox" checked={formValues[item.id] === "checked"} onChange={(e) => setFormValue(item.id, e.target.checked ? "checked" : "unchecked")} />
                      <span>{item.label}</span>
                    </label>
                  )
                  if (item.type === "dropdown" && item.options?.length) return (
                    <div key={item.id}>
                      <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                      <select value={formValues[item.id] ?? item.options[0]} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }}>{item.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select>
                    </div>
                  )
                  if (item.type === "custom_field") {
                    const value = formValues[item.id] ?? ""
                    return (
                      <div key={item.id}>
                        <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                        {item.customFieldSubtype === "textarea" ? <textarea value={value} onChange={(e) => setFormValue(item.id, e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} /> : <input value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }} />}
                      </div>
                    )
                  }
                  return null
                })}
              </div>
              <button onClick={() => setOpenCustomButtonId(null)} style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer", fontWeight: 600 }}>Done</button>
            </div>
          </>
        )
      })()}

      {/* Auto Response Options modal */}
      {showAutoResponse && (
        <>
          <div onClick={() => setShowAutoResponse(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "440px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 16px", color: theme.text }}>Calendar Auto Response Options</h3>
            {calendarAutoResponseItems.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text }}>Remind before event (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    value={arReminderMins}
                    onChange={(e) => {
                      setArReminderMins(e.target.value)
                      try {
                        localStorage.setItem("calendar_arReminderMins", e.target.value)
                      } catch {
                        /* ignore */
                      }
                    }}
                    style={{ ...theme.formInput }}
                  />
                </div>
              </div>
            ) : (
              <PortalSettingItemsForm
                items={calendarAutoResponseItems}
                formValues={autoResponsePortalValues}
                setFormValue={(id, v) => {
                  setAutoResponsePortalValues((prev) => ({ ...prev, [id]: v }))
                  try {
                    localStorage.setItem(`cal_ar_${id}`, v)
                  } catch {
                    /* ignore */
                  }
                  if (id === "ar_remind_before_mins") {
                    setArReminderMins(v)
                    try {
                      localStorage.setItem("calendar_arReminderMins", v)
                    } catch {
                      /* ignore */
                    }
                  }
                }}
                isItemVisible={(item) => isPortalItemVisible(calendarAutoResponseItems, autoResponsePortalValues, item)}
              />
            )}
            <button onClick={() => setShowAutoResponse(false)} style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer" }}>Done</button>
          </div>
        </>
      )}

      {/* Selected event popover */}
      {completeFlowEvent && (
        <>
          <div
            onClick={() => !completeBusy && setCompleteFlowEvent(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 10000 }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: "400px",
              background: "white",
              borderRadius: "8px",
              padding: "20px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              zIndex: 10001,
            }}
          >
            <h3 style={{ margin: "0 0 8px", color: theme.text }}>Complete job</h3>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#6b7280" }}>
              Mark <strong>{completeFlowEvent.title}</strong> complete. Optionally open your email or SMS app with a receipt message (you send it from your device).
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px", color: theme.text }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={receiptEmailCustomer} onChange={(e) => setReceiptEmailCustomer(e.target.checked)} />
                Send receipt to customer email
                {completeCustomerEmail ? (
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>({completeCustomerEmail})</span>
                ) : (
                  <span style={{ fontSize: "12px", color: "#b45309" }}>— none on file</span>
                )}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={receiptSmsCustomer} onChange={(e) => setReceiptSmsCustomer(e.target.checked)} />
                Send receipt to customer SMS
                {completeCustomerPhone ? (
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>({completeCustomerPhone})</span>
                ) : (
                  <span style={{ fontSize: "12px", color: "#b45309" }}>— none on file</span>
                )}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={receiptEmailSelf} onChange={(e) => setReceiptEmailSelf(e.target.checked)} />
                Send receipt to myself (email)
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={completeBusy}
                onClick={() => setCompleteFlowEvent(null)}
                style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: completeBusy ? "wait" : "pointer", color: theme.text }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={completeBusy}
                onClick={() => void confirmCompleteCalendarEvent()}
                style={{ padding: "8px 14px", borderRadius: "6px", background: theme.primary, color: "white", border: "none", cursor: completeBusy ? "wait" : "pointer", fontSize: "14px" }}
              >
                {completeBusy ? "Saving…" : "Confirm complete"}
              </button>
            </div>
          </div>
        </>
      )}

      {selectedEvent && (
        <>
          <div
            onClick={() => {
              if (!calendarEventActionBusy) setSelectedEvent(null)
            }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 9998 }}
          />
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: "440px",
              maxHeight: "90vh",
              overflow: "auto",
              background: "white",
              borderRadius: "8px",
              padding: "20px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              zIndex: 9999,
            }}
          >
            <h3 style={{ margin: "0 0 12px", color: theme.text }}>{selectedEvent.title}</h3>
            <div style={{ fontSize: "13px", color: "#4b5563", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
              <p style={{ margin: 0, color: theme.text, fontSize: "14px" }}>
                <strong>When:</strong>{" "}
                {new Date(selectedEvent.start_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} –{" "}
                {new Date(selectedEvent.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Duration:</strong> {formatEventDurationMinutes(selectedEvent.start_at, selectedEvent.end_at)}
              </p>
              {(() => {
                const jt = selectedEvent.job_types ?? jobTypes.find((j) => j.id === selectedEvent.job_type_id)
                if (!jt?.name) return null
                return (
                  <p style={{ margin: 0 }}>
                    <strong>Job type:</strong> {jt.name}
                  </p>
                )
              })()}
              {selectedEvent.customers?.display_name && (
                <p style={{ margin: 0 }}>
                  <strong>Customer:</strong> {selectedEvent.customers.display_name}
                </p>
              )}
              {selectedEvent.quote_id && (
                <p style={{ margin: 0 }}>
                  <strong>Quote:</strong> linked
                </p>
              )}
              {selectedEvent.user_id && selectedEvent.user_id !== userId && (
                <p style={{ margin: 0 }}>
                  <strong>Calendar owner:</strong>{" "}
                  {selectableUsers.find((u) => u.userId === selectedEvent.user_id)?.label ?? selectedEvent.user_id.slice(0, 8)}
                </p>
              )}
              {selectedEvent.recurrence_series_id && (
                <p style={{ margin: 0, color: "#2563eb" }}>
                  <strong>Recurrence:</strong>{" "}
                  {selectedSeriesSiblingCount > 1 ? `${selectedSeriesSiblingCount} scheduled dates in this series` : "Recurring series"}
                </p>
              )}
            </div>
            {selectedEvent.quote_total != null && selectedEvent.quote_total > 0 && (
              <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600, color: theme.text }}>
                Total: ${Number(selectedEvent.quote_total).toFixed(2)}
              </p>
            )}
            {selectedEvent.notes && (
              <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#6b7280", whiteSpace: "pre-wrap" }}>
                <strong style={{ color: theme.text }}>Notes:</strong> {selectedEvent.notes}
              </p>
            )}
            {selectedEvent.recurrence_series_id && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, color: theme.text, fontSize: 13 }}>Remove options</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: theme.text }}>
                    <input
                      type="radio"
                      name="removeRecurrenceScope"
                      checked={removeRecurrenceScope === "instance"}
                      onChange={() => setRemoveRecurrenceScope("instance")}
                    />
                    Remove this date
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: theme.text }}>
                    <input
                      type="radio"
                      name="removeRecurrenceScope"
                      checked={removeRecurrenceScope === "series"}
                      onChange={() => setRemoveRecurrenceScope("series")}
                    />
                    Remove entire recurrence
                  </label>
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={calendarEventActionBusy}
                onClick={() => setSelectedEvent(null)}
                style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: calendarEventActionBusy ? "wait" : "pointer", color: theme.text }}
              >
                Close
              </button>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {hasCompletedAtColumn && (
                  <button
                    type="button"
                    disabled={calendarEventActionBusy}
                    onClick={() => {
                      setReceiptEmailCustomer(false)
                      setReceiptSmsCustomer(false)
                      setReceiptEmailSelf(false)
                      setCompleteFlowEvent(selectedEvent)
                      setSelectedEvent(null)
                    }}
                    style={{ padding: "8px 14px", borderRadius: "6px", background: theme.primary, color: "white", border: "none", cursor: calendarEventActionBusy ? "wait" : "pointer", fontSize: "14px" }}
                  >
                    Complete
                  </button>
                )}
                <button
                  type="button"
                  disabled={calendarEventActionBusy}
                  onClick={async () => {
                    if (!supabase || !selectedEvent.id) return
                    const scopeId = selectedEvent.recurrence_series_id
                    if (removeRecurrenceScope === "series" && scopeId) {
                      const owner = selectedEvent.user_id ?? userId
                      if (!window.confirm("Remove entire recurrence for all dates in this series? This cannot be undone.")) return
                      setCalendarEventActionBusy(true)
                      const { error: err } = await supabase
                        .from("calendar_events")
                        .update({ removed_at: new Date().toISOString() })
                        .eq("recurrence_series_id", scopeId)
                        .eq("user_id", owner)
                        .is("removed_at", null)
                      setCalendarEventActionBusy(false)
                      if (err) alert(err.message)
                      else {
                        setSelectedEvent(null)
                        loadEvents()
                      }
                      return
                    }

                    // Default: remove only this row (single instance)
                    setCalendarEventActionBusy(true)
                    const { error: err } = await supabase
                      .from("calendar_events")
                      .update({ removed_at: new Date().toISOString() })
                      .eq("id", selectedEvent.id)
                    setCalendarEventActionBusy(false)
                    if (err) alert(err.message)
                    else {
                      setSelectedEvent(null)
                      loadEvents()
                    }
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    background: "#b91c1c",
                    color: "white",
                    border: "none",
                    cursor: calendarEventActionBusy ? "wait" : "pointer",
                    fontSize: "14px",
                  }}
                >
                  {selectedEvent.recurrence_series_id ? (removeRecurrenceScope === "series" ? "Remove entire recurrence" : "Remove this date") : "Remove"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
