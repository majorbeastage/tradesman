import { useEffect, useState, useMemo, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { parseLocalDateTime } from "../../lib/parseLocalDateTime"
import { useOfficeManagerScopeOptional, usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useAuth } from "../../contexts/AuthContext"
import TabNotificationAlertsButton from "../../components/TabNotificationAlertsButton"
import CustomerCallButton from "../../components/CustomerCallButton"
import { theme } from "../../styles/theme"
import PortalSettingsModal from "../../components/PortalSettingsModal"
import PortalSettingItemsForm from "../../components/PortalSettingItemsForm"
import {
  DEFAULT_RECEIPT_TEMPLATE_ITEMS,
  getControlItemsForUser,
  getCustomActionButtonsForUser,
  getOmPageActionVisible,
  getPageActionVisible,
  isPortalSettingDependencyVisible,
  isRemoveRecurrencePortalItem,
} from "../../types/portal-builder"
import {
  resolveRecurrenceFromPortal,
  applyRecurrenceEndLimitsFromPortal,
  computeOccurrenceStarts,
  intervalsOverlap,
  portalHasRecurrenceControls,
} from "../../lib/calendarRecurrence"
import type { PortalSettingItem } from "../../types/portal-builder"
import { useIsMobile } from "../../hooks/useIsMobile"
import { useScopedAiAutomationsEnabled } from "../../hooks/useScopedAiAutomationsEnabled"
import {
  loadEntityAttachmentsForCalendarEvent,
  deleteEntityAttachmentRow,
  type EntityAttachmentRow,
} from "../../lib/communicationAttachments"
import { uploadEntityAttachmentFile } from "../../lib/uploadCommAttachment"
import { buildReceiptPdfBytes, downloadPdfBlob } from "../../lib/documentPdf"
import { buildCalendarReceiptPdfSections } from "../../lib/receiptItemizedLines"
import {
  parseCalendarEventReceiptMeta,
  serializeCalendarReceiptMeta,
  type ReceiptAdditionalLine,
  type ReceiptQuoteOverride,
} from "../../lib/calendarReceiptMetadata"
import {
  type EstimateLinePresetRow,
  formatEstimatePresetCostSummary,
  parseEstimateLinePresetsFromMetadata,
  serializePresetForProfile,
} from "../../lib/estimateLinePresets"
import {
  materialDescriptionsFromQuoteItemRows,
  parseQuoteItemMetadata,
  prependQuoteMaterialsToEventChecklist,
  totalFromQuoteItemRows,
} from "../../lib/quoteItemMath"
import { fetchQuoteLogoForExport } from "../../lib/quoteLogoImage"

type JobType = {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  color_hex: string | null
  materials_list?: string | null
  track_mileage?: boolean | null
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
  materials_list?: string | null
  mileage_miles?: number | null
  metadata?: unknown
  job_types?: JobType | null
  customers?: { display_name: string | null } | null
}

type QuoteItemReceiptRow = {
  id: string
  description: string | null
  quantity: number | string | null
  unit_price: number | string | null
  metadata: unknown
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
    `Scheduled: ${formatEventDurationMinutes(ev.start_at, ev.end_at)}`,
  ]
  if (ev.quote_total != null && ev.quote_total > 0) lines.push(`Total: $${Number(ev.quote_total).toFixed(2)}`)
  if (ev.mileage_miles != null && Number.isFinite(Number(ev.mileage_miles)) && Number(ev.mileage_miles) > 0) {
    lines.push(`Mileage: ${Number(ev.mileage_miles)} mi`)
  }
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

/** Legacy recurring rows (no recurrence_series_id): same owner, title, job, quote, customer — treat as a set for remove-all in the current loaded window. */
function legacyRecurringCohortIds(selected: CalendarEvent, all: CalendarEvent[], scopedUserId: string): string[] | null {
  if (selected.recurrence_series_id) return null
  const owner = selected.user_id ?? scopedUserId
  const mates = all.filter(
    (e) =>
      !e.recurrence_series_id &&
      (e.user_id ?? scopedUserId) === owner &&
      e.title === selected.title &&
      (e.job_type_id ?? null) === (selected.job_type_id ?? null) &&
      (e.quote_id ?? null) === (selected.quote_id ?? null) &&
      (e.customer_id ?? null) === (selected.customer_id ?? null)
  )
  if (mates.length < 2) return null
  return mates.map((m) => m.id)
}

/** PostgREST may return `customers` / `job_types` as one object or a single-element array. */
function normalizeCalendarEventRow(raw: unknown): CalendarEvent {
  const e = raw as CalendarEvent & {
    customers?: CalendarEvent["customers"] | { display_name: string | null }[]
    job_types?: CalendarEvent["job_types"] | JobType[]
  }
  let customers: CalendarEvent["customers"] = e.customers ?? null
  if (Array.isArray(e.customers)) {
    const c0 = e.customers[0]
    customers = c0 ? { display_name: c0.display_name ?? null } : null
  }
  let job_types: CalendarEvent["job_types"] = e.job_types ?? null
  if (Array.isArray(e.job_types)) {
    const j0 = e.job_types[0]
    job_types = j0 ?? null
  }
  return { ...e, customers, job_types }
}

export default function CalendarPage() {
  const { userId: authUserId, user: authUser, role: authRole } = useAuth()
  const isMobile = useIsMobile()
  const scopeCtx = useOfficeManagerScopeOptional()
  const userId = useScopedUserId()
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(userId)
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
  const [showReceiptTemplateModal, setShowReceiptTemplateModal] = useState(false)
  const [showCompletionSettingsModal, setShowCompletionSettingsModal] = useState(false)
  const [showTeamMapModal, setShowTeamMapModal] = useState(false)
  const [receiptTemplateFormValues, setReceiptTemplateFormValues] = useState<Record<string, string>>({})
  const [completionSettingsFormValues, setCompletionSettingsFormValues] = useState<Record<string, string>>({})
  const [calendarCompletionProfile, setCalendarCompletionProfile] = useState<Record<string, string>>({})
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
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
  const [jtMaterials, setJtMaterials] = useState("")
  const [estimateLinePresetsCal, setEstimateLinePresetsCal] = useState<EstimateLinePresetRow[]>([])
  const [jtModalPresetChecksCal, setJtModalPresetChecksCal] = useState<Record<string, boolean>>({})
  const [eventMaterialsDraft, setEventMaterialsDraft] = useState("")
  const [eventMaterialsSaving, setEventMaterialsSaving] = useState(false)
  const [eventMileageDraft, setEventMileageDraft] = useState("")
  const [eventMileageSaving, setEventMileageSaving] = useState(false)
  const [addMileage, setAddMileage] = useState("")
  const [jtTrackMileage, setJtTrackMileage] = useState(false)
  const [quoteItemsForReceipt, setQuoteItemsForReceipt] = useState<QuoteItemReceiptRow[]>([])
  const [receiptOverridesDraft, setReceiptOverridesDraft] = useState<Record<string, ReceiptQuoteOverride>>({})
  const [receiptAdditionalDraft, setReceiptAdditionalDraft] = useState<ReceiptAdditionalLine[]>([])
  const [receiptLinesSaving, setReceiptLinesSaving] = useState(false)
  const [receiptNewDesc, setReceiptNewDesc] = useState("")
  const [receiptNewQty, setReceiptNewQty] = useState("1")
  const [receiptNewUnit, setReceiptNewUnit] = useState("0")
  const [receiptNewKind, setReceiptNewKind] = useState("misc")

  const linkedQuoteLiveTotal = useMemo(() => {
    if (!selectedEvent?.quote_id) return null
    const t = totalFromQuoteItemRows(quoteItemsForReceipt)
    return t > 0 ? t : null
  }, [selectedEvent?.quote_id, quoteItemsForReceipt])

  const calendarSettingsItems = useMemo(
    () => getControlItemsForUser(portalConfig, "calendar", "working_hours", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const addItemPortalItems = useMemo(() => {
    const all = getControlItemsForUser(portalConfig, "calendar", "add_item_to_calendar", { aiAutomationsEnabled })
    return all.filter((i) => !isRemoveRecurrencePortalItem(i))
  }, [portalConfig, aiAutomationsEnabled])
  const calendarAutoResponseItems = useMemo(
    () => getControlItemsForUser(portalConfig, "calendar", "auto_response_options", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const jobTypesPortalItems = useMemo(
    () => getControlItemsForUser(portalConfig, "calendar", "job_types", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const receiptTemplateItems = useMemo(() => {
    const got = getControlItemsForUser(portalConfig, "calendar", "receipt_template", { aiAutomationsEnabled })
    if (got.length > 0) return got
    const fallback = getControlItemsForUser(null, "calendar", "receipt_template", { aiAutomationsEnabled })
    if (fallback.length > 0) return fallback
    return [...DEFAULT_RECEIPT_TEMPLATE_ITEMS]
  }, [portalConfig, aiAutomationsEnabled])
  const completionSettingsItems = useMemo(
    () => getControlItemsForUser(portalConfig, "calendar", "completion_settings", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
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

  const selectedLegacyRecurringIds = useMemo(() => {
    if (!selectedEvent) return null
    return legacyRecurringCohortIds(selectedEvent, events, userId)
  }, [selectedEvent, events, userId])

  const showRecurringRemoveChoices =
    !!selectedEvent && (!!selectedEvent.recurrence_series_id || (selectedLegacyRecurringIds && selectedLegacyRecurringIds.length >= 2))
  const showCalAddItem = getPageActionVisible(portalConfig, "calendar", "add_item_to_calendar") && getOmPageActionVisible(portalConfig, "calendar", "add_item")
  const showCalAutoResponse = getOmPageActionVisible(portalConfig, "calendar", "auto_response")
  const showCalJobTypes = getOmPageActionVisible(portalConfig, "calendar", "job_types")
  const showCalSettings = getOmPageActionVisible(portalConfig, "calendar", "settings")
  const showCalCustomizeUser = getOmPageActionVisible(portalConfig, "calendar", "customize_user")
  const showCalReceiptTemplate =
    getPageActionVisible(portalConfig, "calendar", "receipt_template") && getOmPageActionVisible(portalConfig, "calendar", "receipt_template")
  const showCalCompletionSettings =
    getPageActionVisible(portalConfig, "calendar", "completion_settings") &&
    getOmPageActionVisible(portalConfig, "calendar", "completion_settings")
  const receiptTemplateButtonLabel = portalConfig?.controlLabels?.receipt_template ?? "Receipt template"
  const completionSettingsButtonLabel = portalConfig?.controlLabels?.completion_settings ?? "Job completion"

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
    return isPortalSettingDependencyVisible(item, calendarSettingsItems, settingsFormValues)
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
    return isPortalSettingDependencyVisible(item, items, formValues)
  }

  function isPortalItemVisible(items: PortalSettingItem[], formValues: Record<string, string>, item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, items, formValues)
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
  const [completeCompletionNote, setCompleteCompletionNote] = useState("")
  const [calendarEventEntityRows, setCalendarEventEntityRows] = useState<EntityAttachmentRow[]>([])
  const [calendarEventEntityUploadBusy, setCalendarEventEntityUploadBusy] = useState(false)
  const [calendarReceiptTemplate, setCalendarReceiptTemplate] = useState<string | null>(null)
  const [calendarProfileDisplayName, setCalendarProfileDisplayName] = useState("")
  const [receiptPdfBusy, setReceiptPdfBusy] = useState(false)
  const [addItemPortalValues, setAddItemPortalValues] = useState<Record<string, string>>({})
  const [autoResponsePortalValues, setAutoResponsePortalValues] = useState<Record<string, string>>({})
  const [jobTypesPortalValues, setJobTypesPortalValues] = useState<Record<string, string>>({})

  function isReceiptTemplateItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, receiptTemplateItems, receiptTemplateFormValues)
  }

  function isCompletionSettingsItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, completionSettingsItems, completionSettingsFormValues)
  }

  useEffect(() => {
    if (!supabase || !userId) return
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const meta =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        const raw = meta.calendarCompletionValues
        const saved =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? Object.fromEntries(
                Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]),
              )
            : {}
        setCalendarCompletionProfile(saved)
      })
  }, [supabase, userId])

  useEffect(() => {
    if (!showCompletionSettingsModal || completionSettingsItems.length === 0) return
    const next: Record<string, string> = {}
    for (const item of completionSettingsItems) {
      const saved = calendarCompletionProfile[item.id]
      if (item.type === "checkbox") {
        next[item.id] = saved === "checked" || saved === "unchecked" ? saved : item.defaultChecked ? "checked" : "unchecked"
      } else if (item.type === "dropdown" && item.options?.length) {
        next[item.id] = saved && item.options.includes(saved) ? saved : item.options[0]
      } else {
        next[item.id] = saved ?? ""
      }
    }
    setCompletionSettingsFormValues(next)
  }, [showCompletionSettingsModal, completionSettingsItems, calendarCompletionProfile])

  async function closeCompletionSettingsModal() {
    if (!supabase || !userId) {
      setShowCompletionSettingsModal(false)
      return
    }
    const { data: row, error: loadErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    if (loadErr) {
      alert(loadErr.message)
      return
    }
    const prevMeta =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    prevMeta.calendarCompletionValues = { ...completionSettingsFormValues }
    const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    setCalendarCompletionProfile({ ...completionSettingsFormValues })
    setShowCompletionSettingsModal(false)
  }

  useEffect(() => {
    if (!showReceiptTemplateModal || !supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from("profiles").select("document_template_receipt, metadata").eq("id", userId).maybeSingle()
      if (cancelled) return
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const useAi = meta.receipt_template_use_ai === true
      const itemize = meta.receipt_template_itemize === true
      const rateRaw = meta.receipt_mileage_rate_per_mile
      const rateStr =
        typeof rateRaw === "number" && Number.isFinite(rateRaw)
          ? String(rateRaw)
          : typeof rateRaw === "string"
            ? rateRaw
            : ""
      const notes = String((data as { document_template_receipt?: string | null })?.document_template_receipt ?? "")
      const intro = typeof meta.receipt_template_intro === "string" ? meta.receipt_template_intro : ""
      const showRecLogo = meta.receipt_template_show_logo === true
      const recLogoUrl = typeof meta.receipt_template_logo_url === "string" ? meta.receipt_template_logo_url : ""
      const carryEst = meta.receipt_template_carry_from_estimate === true
      const next: Record<string, string> = {}
      const items = receiptTemplateItems.length > 0 ? receiptTemplateItems : [...DEFAULT_RECEIPT_TEMPLATE_ITEMS]
      for (const item of items) {
        if (item.id === "receipt_template_notes") next[item.id] = notes
        else if (item.id === "receipt_template_use_ai") next[item.id] = useAi ? "checked" : "unchecked"
        else if (item.id === "receipt_template_itemize") next[item.id] = itemize ? "checked" : "unchecked"
        else if (item.id === "receipt_template_mileage_rate") next[item.id] = rateStr
        else if (item.id === "receipt_template_intro") next[item.id] = intro
        else if (item.id === "receipt_template_show_logo") next[item.id] = showRecLogo ? "checked" : "unchecked"
        else if (item.id === "receipt_template_logo_url") next[item.id] = recLogoUrl
        else if (item.id === "receipt_template_carry_from_estimate") next[item.id] = carryEst ? "checked" : "unchecked"
        else if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
        else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
        else next[item.id] = ""
      }
      setReceiptTemplateFormValues(next)
    })()
    return () => {
      cancelled = true
    }
  }, [showReceiptTemplateModal, userId, receiptTemplateItems])

  async function closeReceiptTemplateModal() {
    if (!supabase || !userId) {
      setShowReceiptTemplateModal(false)
      return
    }
    const notes = (receiptTemplateFormValues.receipt_template_notes ?? "").trim()
    const useAi = receiptTemplateFormValues.receipt_template_use_ai === "checked"
    const itemize = receiptTemplateFormValues.receipt_template_itemize === "checked"
    const rateField = (receiptTemplateFormValues.receipt_template_mileage_rate ?? "").trim().replace(/[^0-9.]/g, "")
    const rateNum = rateField ? Number.parseFloat(rateField) : Number.NaN
    const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    if (fetchErr) {
      alert(fetchErr.message)
      return
    }
    const prevMeta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? { ...(data.metadata as Record<string, unknown>) }
        : {}
    prevMeta.receipt_template_use_ai = useAi
    prevMeta.receipt_template_itemize = itemize
    if (Number.isFinite(rateNum) && rateNum >= 0) prevMeta.receipt_mileage_rate_per_mile = rateNum
    else delete prevMeta.receipt_mileage_rate_per_mile
    const carry = receiptTemplateFormValues.receipt_template_carry_from_estimate === "checked"
    prevMeta.receipt_template_carry_from_estimate = carry
    if (carry) {
      if (prevMeta.estimate_template_show_logo === true) prevMeta.receipt_template_show_logo = true
      const estUrl = typeof prevMeta.estimate_template_logo_url === "string" ? prevMeta.estimate_template_logo_url.trim() : ""
      if (estUrl) prevMeta.receipt_template_logo_url = estUrl
    }
    const introTrim = (receiptTemplateFormValues.receipt_template_intro ?? "").trim()
    if (introTrim) prevMeta.receipt_template_intro = introTrim
    else delete prevMeta.receipt_template_intro
    prevMeta.receipt_template_show_logo = receiptTemplateFormValues.receipt_template_show_logo === "checked"
    const logoTrim = (receiptTemplateFormValues.receipt_template_logo_url ?? "").trim()
    if (logoTrim) prevMeta.receipt_template_logo_url = logoTrim
    else delete prevMeta.receipt_template_logo_url
    const { error } = await supabase
      .from("profiles")
      .update({
        document_template_receipt: notes || null,
        metadata: prevMeta,
      })
      .eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    setCalendarReceiptTemplate(notes || null)
    setShowReceiptTemplateModal(false)
  }

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
    const baseQuery = (selectStr: string) =>
      client
        .from("calendar_events")
        .select(selectStr)
        .is("removed_at", null)
        .lte("start_at", end.toISOString())
        .gte("end_at", start.toISOString())
    const scopedQuery = (selectStr: string) =>
      canViewOrgEvents ? baseQuery(selectStr).in("user_id", orgUserIds) : baseQuery(selectStr).eq("user_id", userId)

    const selectTiers = [
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, materials_list, mileage_miles, metadata, customers ( display_name ), job_types ( id, name, materials_list, color_hex, duration_minutes, description, track_mileage )",
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, materials_list, mileage_miles, customers ( display_name ), job_types ( id, name, materials_list, color_hex, duration_minutes, description, track_mileage )",
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, materials_list, customers ( display_name ), job_types ( id, name, materials_list, color_hex, duration_minutes, description, track_mileage )",
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, mileage_miles, customers ( display_name ), job_types ( id, name, materials_list, color_hex, duration_minutes, description )",
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, customers ( display_name ), job_types ( id, name, materials_list, color_hex, duration_minutes, description )",
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, materials_list, customers ( display_name ), job_types ( id, name, color_hex, duration_minutes, description )",
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, customers ( display_name ), job_types ( id, name, color_hex, duration_minutes, description )",
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, customers ( display_name )",
    ]

    const runOnce = async (sel: string, filterCompleted: boolean) => {
      let q = scopedQuery(sel).order("start_at")
      if (filterCompleted) q = q.is("completed_at", null)
      return q
    }

    let filterCompleted = hasCompletedAtColumn
    let lastErr: Error | null = null

    for (const sel of selectTiers) {
      let { data, error } = await runOnce(sel, filterCompleted)
      if (error?.message?.includes("completed_at")) {
        setHasCompletedAtColumn(false)
        filterCompleted = false
        const r = await runOnce(sel, false)
        data = r.data
        error = r.error
      }
      if (!error) {
        setEvents((data || []).map(normalizeCalendarEventRow))
        return
      }
      lastErr = error
      const em = (error.message ?? "").toLowerCase()
      const retry =
        em.includes("materials_list") ||
        em.includes("mileage_miles") ||
        em.includes("metadata") ||
        em.includes("track_mileage") ||
        em.includes("job_types") ||
        (em.includes("column") && em.includes("does not exist"))
      if (!retry) {
        setLoadError(error.message)
        setEvents([])
        return
      }
    }

    setLoadError(lastErr?.message ?? "Could not load calendar events.")
    setEvents([])
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
    const ownerUserId = completeFlowEvent.user_id ?? userId
    const bodyBase = buildCalendarReceiptBody(completeFlowEvent)
    const note = completeCompletionNote.trim()
    const body = note ? `${bodyBase}\n\nCompletion note:\n${note}` : bodyBase

    const actingId = authUserId || userId
    const isAssignedUserCompleting = actingId === ownerUserId
    const workerMay = calendarCompletionProfile.calendar_completion_worker_may_message_customer === "checked"
    if (isAssignedUserCompleting && !workerMay && (receiptEmailCustomer || receiptSmsCustomer)) {
      alert(
        "Your office has not allowed assigned users to send receipts directly to customers. Ask your office manager to enable it under Calendar → Job completion, or complete without customer email/SMS.",
      )
      return
    }

    setCompleteBusy(true)
    const prevEvMeta =
      completeFlowEvent.metadata && typeof completeFlowEvent.metadata === "object" && !Array.isArray(completeFlowEvent.metadata)
        ? { ...(completeFlowEvent.metadata as Record<string, unknown>) }
        : {}
    if (note) prevEvMeta.completion_note = note
    else delete prevEvMeta.completion_note

    const { error } = await supabase
      .from("calendar_events")
      .update({ completed_at: new Date().toISOString(), metadata: prevEvMeta })
      .eq("id", completeFlowEvent.id)
    if (error) {
      setCompleteBusy(false)
      alert(error.message)
      return
    }

    const sendErrs: string[] = []
    try {
      if (receiptEmailCustomer) {
        if (!completeCustomerEmail) {
          sendErrs.push("No customer email on file.")
        } else {
          const res = await fetch("/api/outbound-messages?__channel=email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: ownerUserId,
              customerId: completeFlowEvent.customer_id ?? undefined,
              to: completeCustomerEmail,
              subject: `Receipt: ${completeFlowEvent.title}`,
              body,
            }),
          })
          const raw = await res.text()
          if (!res.ok) sendErrs.push(raw.slice(0, 500))
        }
      }
      if (receiptSmsCustomer) {
        if (!completeCustomerPhone?.trim()) {
          sendErrs.push("No customer phone on file.")
        } else {
          const res = await fetch("/api/outbound-messages?__channel=sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: ownerUserId,
              customerId: completeFlowEvent.customer_id ?? undefined,
              to: completeCustomerPhone.trim(),
              body,
            }),
          })
          const raw = await res.text()
          if (!res.ok) sendErrs.push(raw.slice(0, 500))
        }
      }
      if (receiptEmailSelf) {
        const selfEmail = authUser?.email
        if (!selfEmail) sendErrs.push("Your account has no email for “send receipt to myself”.")
        else {
          const res = await fetch("/api/outbound-messages?__channel=email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: ownerUserId,
              to: selfEmail,
              subject: `Receipt copy: ${completeFlowEvent.title}`,
              body,
            }),
          })
          const raw = await res.text()
          if (!res.ok) sendErrs.push(raw.slice(0, 500))
        }
      }
    } catch (e) {
      sendErrs.push(e instanceof Error ? e.message : String(e))
    }

    setCompleteBusy(false)
    if (sendErrs.length) alert(`Job marked complete. Sending notes:\n${sendErrs.join("\n")}`)
    setCompleteFlowEvent(null)
    setSelectedEvent(null)
    setCompleteCompletionNote("")
    loadEvents()
  }

  async function downloadReceiptPdfForEvent(ev: CalendarEvent) {
    if (!supabase) return
    setReceiptPdfBusy(true)
    try {
      const profileUserId = ev.user_id ?? userId
      let itemize = false
      let mileageRatePerMile = 0
      let templateHeader: string | null = null
      let logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>> = null
      if (profileUserId) {
        const { data: prof } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
        const meta =
          prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
            ? (prof.metadata as Record<string, unknown>)
            : {}
        itemize = meta.receipt_template_itemize === true
        const rr = meta.receipt_mileage_rate_per_mile
        if (typeof rr === "number" && Number.isFinite(rr) && rr >= 0) mileageRatePerMile = rr
        else if (typeof rr === "string") {
          const p = Number.parseFloat(rr.replace(/[^0-9.]/g, ""))
          if (Number.isFinite(p) && p >= 0) mileageRatePerMile = p
        }
        const introRaw = meta.receipt_template_intro
        templateHeader = typeof introRaw === "string" && introRaw.trim() ? introRaw.trim() : null
        if (meta.receipt_template_show_logo === true) {
          const u = typeof meta.receipt_template_logo_url === "string" ? meta.receipt_template_logo_url.trim() : ""
          if (u) logo = await fetchQuoteLogoForExport(u)
        }
      }
      const receiptMeta = parseCalendarEventReceiptMeta(ev.metadata)
      const miles =
        ev.mileage_miles != null && Number.isFinite(Number(ev.mileage_miles)) && Number(ev.mileage_miles) > 0
          ? Number(ev.mileage_miles)
          : 0
      const sections = await buildCalendarReceiptPdfSections(supabase, {
        quote_id: ev.quote_id,
        materials_list: ev.materials_list,
        job_types: ev.job_types ?? null,
        start_at: ev.start_at,
        end_at: ev.end_at,
        receiptMeta,
        itemizeMaterials: itemize,
        mileageMiles: miles > 0 ? miles : null,
        mileageRatePerMile: itemize && mileageRatePerMile > 0 ? mileageRatePerMile : null,
      })
      const mileageCostInItemized = itemize && miles > 0 && mileageRatePerMile > 0
      const mileageLabel =
        miles > 0 && !mileageCostInItemized ? `Mileage: ${miles} mi` : null
      const customerName = ev.customers?.display_name ?? "Customer"
      const amount =
        ev.quote_total != null && ev.quote_total > 0 ? `Quote total: $${Number(ev.quote_total).toFixed(2)}` : null
      const bytes = await buildReceiptPdfBytes({
        businessLabel: calendarProfileDisplayName || "Receipt",
        customerName,
        jobTitle: ev.title,
        completedAtLabel: new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
        amountLabel: amount,
        templateHeader,
        logo,
        templateFooter: calendarReceiptTemplate,
        scheduledDurationLabel: sections.scheduledDurationLabel,
        quoteLineItems: sections.quoteLines,
        includeMaterialsChecklist: itemize,
        materialsChecklistLines: sections.materialsChecklistLines,
        lineSubtotalLabel:
          sections.lineSubtotal != null
            ? itemize
              ? `Itemized subtotal: $${sections.lineSubtotal.toFixed(2)}`
              : `Line items subtotal: $${sections.lineSubtotal.toFixed(2)}`
            : null,
        mileageLabel,
        receiptItemizeMode: itemize,
      })
      downloadPdfBlob(bytes, `receipt-${ev.id.slice(0, 8)}.pdf`)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setReceiptPdfBusy(false)
    }
  }

  async function saveEventMaterialsList() {
    if (!supabase || !selectedEvent?.id) return
    setEventMaterialsSaving(true)
    const v = eventMaterialsDraft.trim() || null
    const { error } = await supabase.from("calendar_events").update({ materials_list: v }).eq("id", selectedEvent.id)
    setEventMaterialsSaving(false)
    if (error) {
      const msg = error.message ?? String(error)
      if (msg.toLowerCase().includes("materials_list")) {
        alert(
          "Could not save materials: the calendar_events table needs a materials_list column. Run tradesman/supabase/job-type-materials-list.sql in Supabase SQL Editor.",
        )
      } else {
        alert(msg)
      }
      return
    }
    setSelectedEvent((prev) => (prev && prev.id === selectedEvent.id ? { ...prev, materials_list: v } : prev))
    loadEvents()
  }

  async function saveEventMileage() {
    if (!supabase || !selectedEvent?.id) return
    setEventMileageSaving(true)
    const raw = eventMileageDraft.trim().replace(/[^0-9.]/g, "")
    const n = raw ? Number.parseFloat(raw) : Number.NaN
    const v = Number.isFinite(n) && n >= 0 ? n : null
    const { error } = await supabase.from("calendar_events").update({ mileage_miles: v }).eq("id", selectedEvent.id)
    setEventMileageSaving(false)
    if (error) {
      const msg = error.message ?? String(error)
      if (msg.toLowerCase().includes("mileage_miles")) {
        alert(
          "Could not save mileage: add column mileage_miles to calendar_events. Run tradesman/supabase/receipt-mileage-job-type.sql in Supabase SQL Editor.",
        )
      } else {
        alert(msg)
      }
      return
    }
    setSelectedEvent((prev) => (prev && prev.id === selectedEvent.id ? { ...prev, mileage_miles: v } : prev))
    loadEvents()
  }

  async function saveEventReceiptLines() {
    if (!supabase || !selectedEvent?.id) return
    setReceiptLinesSaving(true)
    const nextMeta = serializeCalendarReceiptMeta(selectedEvent.metadata, {
      receipt_quote_overrides: receiptOverridesDraft,
      receipt_additional_lines: receiptAdditionalDraft,
    })
    const { error } = await supabase.from("calendar_events").update({ metadata: nextMeta }).eq("id", selectedEvent.id)
    setReceiptLinesSaving(false)
    if (error) {
      const msg = error.message ?? String(error)
      if (msg.toLowerCase().includes("metadata")) {
        alert(
          "Could not save receipt lines: calendar_events needs a metadata column. Run tradesman/supabase/calendar-events-metadata.sql in Supabase SQL Editor.",
        )
      } else {
        alert(msg)
      }
      return
    }
    setSelectedEvent((prev) => (prev && prev.id === selectedEvent.id ? { ...prev, metadata: nextMeta } : prev))
    loadEvents()
  }

  async function handleCalendarEntityFileChange(files: FileList | null) {
    if (!files?.length || !supabase || !selectedEvent?.id) return
    const owner = selectedEvent.user_id ?? userId
    if (!owner) return
    const file = files[0]
    setCalendarEventEntityUploadBusy(true)
    try {
      const up = await uploadEntityAttachmentFile({ userId: owner, calendarEventId: selectedEvent.id, file })
      if (!up) throw new Error("Upload failed")
      const { error } = await supabase.from("entity_attachments").insert({
        user_id: owner,
        calendar_event_id: selectedEvent.id,
        storage_path: up.storage_path,
        public_url: up.public_url,
        content_type: file.type || null,
        file_name: file.name || null,
      })
      if (error) throw error
      setCalendarEventEntityRows(await loadEntityAttachmentsForCalendarEvent(selectedEvent.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setCalendarEventEntityUploadBusy(false)
    }
  }

  async function removeCalendarEntityRowLocal(row: EntityAttachmentRow) {
    if (!confirm("Remove this file from the event?")) return
    const ok = await deleteEntityAttachmentRow(row)
    if (!ok) {
      alert("Could not remove attachment.")
      return
    }
    if (selectedEvent?.id) setCalendarEventEntityRows(await loadEntityAttachmentsForCalendarEvent(selectedEvent.id))
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
    let q = await supabase
      .from("job_types")
      .select("id, name, description, duration_minutes, color_hex, materials_list, track_mileage")
      .eq("user_id", userId)
      .order("name")
    let rows: JobType[] = (q.data ?? []) as JobType[]
    let error = q.error
    const em = (e: typeof error) => (e?.message ?? "").toLowerCase()
    if (error && (em(error).includes("track_mileage") || em(error).includes("materials_list"))) {
      const q2 = await supabase
        .from("job_types")
        .select("id, name, description, duration_minutes, color_hex, materials_list")
        .eq("user_id", userId)
        .order("name")
      rows = (q2.data ?? []) as JobType[]
      error = q2.error
    }
    if (error?.message?.toLowerCase().includes("materials_list")) {
      const q3 = await supabase
        .from("job_types")
        .select("id, name, description, duration_minutes, color_hex")
        .eq("user_id", userId)
        .order("name")
      rows = (q3.data ?? []) as JobType[]
      error = q3.error
    }
    if (error) {
      setJobTypesLoadError(error.message)
      setJobTypes([])
      return
    }
    setJobTypes(rows)
  }

  async function persistEstimatePresetsCal(next: EstimateLinePresetRow[]) {
    if (!supabase || !userId) return
    const trimmed = next.filter((p) => p.description.trim())
    const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    if (fetchErr) {
      alert(fetchErr.message)
      return
    }
    const prevMeta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? { ...(data.metadata as Record<string, unknown>) }
        : {}
    prevMeta.estimate_line_presets = trimmed.map(serializePresetForProfile)
    const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    setEstimateLinePresetsCal(trimmed)
  }

  async function mergePresetLinksForJobTypeCal(jobTypeId: string, checks: Record<string, boolean>) {
    const merged = estimateLinePresetsCal.map((p) => {
      const want = checks[p.id] === true
      const set = new Set(p.linked_job_type_ids ?? [])
      if (want) set.add(jobTypeId)
      else set.delete(jobTypeId)
      return { ...p, linked_job_type_ids: Array.from(set) }
    })
    await persistEstimatePresetsCal(merged)
  }

  useEffect(() => {
    if (!showJobTypes || !supabase || !userId) return
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const meta =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        setEstimateLinePresetsCal(parseEstimateLinePresetsFromMetadata(meta))
      })
    return () => {
      cancelled = true
    }
  }, [showJobTypes, supabase, userId])

  useEffect(() => {
    if (!editingJobTypeId) return
    const next: Record<string, boolean> = {}
    for (const p of estimateLinePresetsCal) {
      next[p.id] = (p.linked_job_type_ids ?? []).includes(editingJobTypeId)
    }
    setJtModalPresetChecksCal(next)
  }, [editingJobTypeId, estimateLinePresetsCal])

  useEffect(() => {
    if (!selectedEvent) {
      setEventMaterialsDraft("")
      return
    }
    const jt =
      (selectedEvent.job_types && !Array.isArray(selectedEvent.job_types) ? selectedEvent.job_types : null) ??
      jobTypes.find((j) => j.id === selectedEvent.job_type_id)
    const evText = typeof selectedEvent.materials_list === "string" ? selectedEvent.materials_list : ""
    const fallback = typeof jt?.materials_list === "string" ? jt.materials_list : ""
    const trimmedEv = evText.trim()
    setEventMaterialsDraft(trimmedEv !== "" ? evText : fallback)
  }, [selectedEvent?.id, selectedEvent?.materials_list, selectedEvent?.job_type_id, selectedEvent?.job_types, jobTypes])

  useEffect(() => {
    if (!selectedEvent) {
      setEventMileageDraft("")
      return
    }
    const m = selectedEvent.mileage_miles
    if (m != null && Number.isFinite(Number(m))) setEventMileageDraft(String(Number(m)))
    else setEventMileageDraft("")
  }, [selectedEvent?.id, selectedEvent?.mileage_miles])

  useEffect(() => {
    if (!selectedEvent) {
      setQuoteItemsForReceipt([])
      setReceiptOverridesDraft({})
      setReceiptAdditionalDraft([])
      setReceiptNewDesc("")
      setReceiptNewQty("1")
      setReceiptNewUnit("0")
      return
    }
    const p = parseCalendarEventReceiptMeta(selectedEvent.metadata)
    setReceiptOverridesDraft(p.receipt_quote_overrides)
    setReceiptAdditionalDraft(p.receipt_additional_lines)
  }, [selectedEvent?.id, selectedEvent?.metadata])

  useEffect(() => {
    if (!supabase || !selectedEvent?.quote_id) {
      setQuoteItemsForReceipt([])
      return
    }
    let cancelled = false
    void supabase
      .from("quote_items")
      .select("id, description, quantity, unit_price, metadata")
      .eq("quote_id", selectedEvent.quote_id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setQuoteItemsForReceipt([])
          return
        }
        setQuoteItemsForReceipt((data ?? []) as QuoteItemReceiptRow[])
      })
    return () => {
      cancelled = true
    }
  }, [selectedEvent?.quote_id, supabase])

  /** Keep calendar row in sync when the linked quote’s lines or totals change (open event). */
  useEffect(() => {
    if (!supabase || !selectedEvent?.quote_id || !selectedEvent.id) return
    const liveTotal = totalFromQuoteItemRows(quoteItemsForReceipt)
    const quoteMat = materialDescriptionsFromQuoteItemRows(quoteItemsForReceipt)
    const curMat = (selectedEvent.materials_list ?? "").trim()
    const patch: Record<string, unknown> = {}
    if (liveTotal > 0 && Math.abs((selectedEvent.quote_total ?? 0) - liveTotal) > 0.009) {
      patch.quote_total = liveTotal
    }
    if (quoteMat.trim()) {
      const nextMat = prependQuoteMaterialsToEventChecklist(quoteMat, selectedEvent.materials_list) ?? ""
      if (nextMat.trim() && nextMat.trim() !== curMat) {
        patch.materials_list = nextMat.trim() || null
      }
    }
    if (Object.keys(patch).length === 0) return
    let cancelled = false
    void supabase
      .from("calendar_events")
      .update(patch)
      .eq("id", selectedEvent.id)
      .then(({ error }) => {
        if (cancelled || error) return
        setSelectedEvent((prev) => (prev && prev.id === selectedEvent.id ? { ...prev, ...patch } : prev))
      })
    return () => {
      cancelled = true
    }
  }, [
    supabase,
    selectedEvent?.id,
    selectedEvent?.quote_id,
    selectedEvent?.quote_total,
    selectedEvent?.materials_list,
    selectedEvent?.job_types,
    quoteItemsForReceipt,
  ])

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
    if (!supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("document_template_receipt, display_name")
        .eq("id", userId)
        .maybeSingle()
      if (cancelled || error || !data) return
      const row = data as { document_template_receipt?: string | null; display_name?: string | null }
      setCalendarReceiptTemplate(
        typeof row.document_template_receipt === "string" && row.document_template_receipt.trim()
          ? row.document_template_receipt
          : null,
      )
      setCalendarProfileDisplayName(typeof row.display_name === "string" ? row.display_name.trim() : "")
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!supabase || !selectedEvent?.id) {
      setCalendarEventEntityRows([])
      return
    }
    void loadEntityAttachmentsForCalendarEvent(selectedEvent.id).then(setCalendarEventEntityRows)
  }, [selectedEvent?.id, supabase])

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
    /** Prefer recurrence from this modal so job type + recurring still work (Job Types modal is optional). */
    const recurrenceFromAddItem = resolveRecurrenceFromPortal(addItemPortalItems, addItemPortalValues)
    const recurrenceFromJobTypes =
      addJobTypeId && jobTypesPortalItems.length > 0
        ? resolveRecurrenceFromPortal(jobTypesPortalItems, jobTypesPortalValues)
        : null
    let series = recurrenceFromAddItem ?? recurrenceFromJobTypes
    if (series) {
      const endFromAddModal = recurrenceFromAddItem != null
      const endItems = endFromAddModal ? addItemPortalItems : jobTypesPortalItems
      const endVals = endFromAddModal ? addItemPortalValues : jobTypesPortalValues
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
    const jtForMaterials = addJobTypeId ? jobTypes.find((j) => j.id === addJobTypeId) : undefined
    const materialsFromJobType =
      jtForMaterials && typeof jtForMaterials.materials_list === "string" && jtForMaterials.materials_list.trim()
        ? jtForMaterials.materials_list.trim()
        : null
    const milesRaw = addMileage.trim().replace(/[^0-9.]/g, "")
    const milesParsed = milesRaw ? Number.parseFloat(milesRaw) : Number.NaN
    const mileageMiles =
      jtForMaterials?.track_mileage === true && Number.isFinite(milesParsed) && milesParsed >= 0 ? milesParsed : null
    const rowBase = {
      user_id: eventOwnerUserId,
      title: addTitle.trim(),
      start_at: "" as string,
      end_at: "" as string,
      job_type_id: addJobTypeId || null,
      quote_id: addQuoteId || null,
      customer_id: addCustomerId || null,
      notes: addNotes.trim() || null,
      ...(recurrenceSeriesId ? { recurrence_series_id: recurrenceSeriesId } : {}),
    }
    const buildRows = (includeMat: boolean, includeMile: boolean) =>
      newRanges.map(({ s, e }) => {
        const row: Record<string, unknown> = {
          ...rowBase,
          start_at: s.toISOString(),
          end_at: e.toISOString(),
        }
        if (includeMat && materialsFromJobType) row.materials_list = materialsFromJobType
        if (includeMile && mileageMiles != null) row.mileage_miles = mileageMiles
        return row
      })
    const attempts: [boolean, boolean][] = [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ]
    let error: { message: string } | null = null
    for (const [incMat, incMile] of attempts) {
      const r = await supabase.from("calendar_events").insert(buildRows(incMat, incMile))
      if (!r.error) {
        error = null
        break
      }
      error = r.error
      const em = (r.error.message ?? "").toLowerCase()
      if (!em.includes("materials_list") && !em.includes("mileage_miles")) break
    }
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
    setAddMileage("")
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
    const sb = supabase
    setJtSaving(true)
    const basePayload = {
      name: jtName.trim(),
      description: jtDescription.trim() || null,
      duration_minutes: jtDuration,
      color_hex: jtColor,
    }
    let patch: Record<string, unknown> = {
      ...basePayload,
      materials_list: jtMaterials.trim() || null,
      track_mileage: jtTrackMileage,
    }

    let jobTypeIdForPresets: string | null = editingJobTypeId
    let error: { message: string } | null = null

    const runUpdate = async () => sb.from("job_types").update(patch).eq("id", editingJobTypeId!).eq("user_id", userId)
    const runInsert = async () => sb.from("job_types").insert({ user_id: userId, ...patch }).select("id").single()

    if (editingJobTypeId) {
      let r = await runUpdate()
      const lower = (m: string) => m.toLowerCase()
      if (r.error && lower(r.error.message).includes("track_mileage")) {
        const { track_mileage: _t, ...rest } = patch
        patch = rest
        r = await runUpdate()
      }
      if (r.error && lower(r.error.message).includes("materials_list")) {
        const { materials_list: _m, ...rest } = patch
        patch = { ...rest }
        r = await runUpdate()
      }
      error = r.error
    } else {
      let r = await runInsert()
      const lower = (m: string) => m.toLowerCase()
      if (r.error && lower(r.error.message).includes("track_mileage")) {
        const { track_mileage: _t, ...rest } = patch
        patch = rest
        r = await runInsert()
      }
      if (r.error && lower(r.error.message).includes("materials_list")) {
        const { materials_list: _m, ...rest } = patch
        patch = { ...rest }
        r = await runInsert()
      }
      error = r.error
      const inserted = r.data as { id?: string } | null
      if (!error && inserted?.id) jobTypeIdForPresets = inserted.id
    }

    setJtSaving(false)
    if (error) {
      const msg = error.message || String(error)
      console.error("[Job type save failed]", { error, userId, patch })
      const hint = (msg.includes("policy") || msg.includes("RLS") || msg.includes("row-level") || msg.includes("permission") || msg.includes("does not exist"))
        ? "\n\nFix: In Supabase Dashboard → SQL Editor, run the full script in tradesman/supabase-job-types-setup.sql (creates job_types table + RLS policies), then try again."
        : ""
      alert("Could not save job type: " + msg + hint)
      return
    }
    if (jobTypeIdForPresets) await mergePresetLinksForJobTypeCal(jobTypeIdForPresets, jtModalPresetChecksCal)
    setJtName("")
    setJtDescription("")
    setJtDuration(60)
    setJtColor("#F97316")
    setJtMaterials("")
    setJtTrackMileage(false)
    setJtModalPresetChecksCal({})
    setEditingJobTypeId(null)
    loadJobTypes()
  }

  function startEditJobType(jt: JobType) {
    setJtName(jt.name)
    setJtDescription(jt.description ?? "")
    setJtDuration(jt.duration_minutes)
    setJtColor(jt.color_hex ?? "#F97316")
    setJtMaterials(typeof jt.materials_list === "string" ? jt.materials_list : "")
    setJtTrackMileage(jt.track_mileage === true)
    setEditingJobTypeId(jt.id)
  }

  function cancelEditJobType() {
    setJtName("")
    setJtDescription("")
    setJtDuration(60)
    setJtColor("#F97316")
    setJtMaterials("")
    setJtTrackMileage(false)
    setEditingJobTypeId(null)
    setJtModalPresetChecksCal({})
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
    const stripped = estimateLinePresetsCal.map((p) => ({
      ...p,
      linked_job_type_ids: (p.linked_job_type_ids ?? []).filter((id) => id !== jt.id),
    }))
    await persistEstimatePresetsCal(stripped)
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
      <h1 style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
        {showCalCompletionSettings && (
          <button
            type="button"
            onClick={() => setShowCompletionSettingsModal(true)}
            style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
          >
            {completionSettingsButtonLabel}
          </button>
        )}
        {showCalReceiptTemplate && (
          <button
            type="button"
            onClick={() => setShowReceiptTemplateModal(true)}
            style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
          >
            {receiptTemplateButtonLabel}
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
        {userId ? <TabNotificationAlertsButton tab="calendar" profileUserId={userId} /> : null}
        {(authRole === "office_manager" || authRole === "admin") && (
          <button
            type="button"
            onClick={() => setShowTeamMapModal(true)}
            style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "#f0fdf4", cursor: "pointer", color: theme.text, fontWeight: 600 }}
          >
            Team map (beta)
          </button>
        )}
      </div>

      {/* Calendar area: view switcher + expand + job types */}
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: "8px", padding: isMobile ? "12px" : "16px", background: "white" }}>
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
          <span style={{ fontWeight: 600, color: theme.text, marginLeft: isMobile ? "0" : "8px", flex: isMobile ? "1 1 100%" : undefined }}>
            {view === "month" && `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
            {view === "week" && `Week of ${weekStart.toLocaleDateString()}`}
            {view === "day" && currentDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ marginLeft: isMobile ? 0 : "auto", padding: "6px 12px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}
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
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: isMobile ? "720px" : "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
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
            </div>
          ) : view === "week" ? (
            <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${theme.border}`, overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", borderBottom: `1px solid ${theme.border}`, minWidth: isMobile ? "840px" : undefined }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", overflow: "hidden", minWidth: isMobile ? "840px" : undefined }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "0", border: `1px solid ${theme.border}`, overflowX: "auto" }}>
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
                      if (!jt.track_mileage) setAddMileage("")
                    } else {
                      setAddMileage("")
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
              {addJobTypeId && jobTypes.find((j) => j.id === addJobTypeId)?.track_mileage ? (
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Mileage (miles)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={addMileage}
                    onChange={(e) => setAddMileage(e.target.value)}
                    placeholder="e.g. 42"
                    style={addInputStyle}
                  />
                </div>
              ) : null}
              {addJobTypeId && portalHasRecurrenceControls(addItemPortalItems) ? (
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                  Recurrence options below apply even when a job type is selected. You can also set defaults under{" "}
                  <strong>Job Types</strong> when the add form has no recurrence controls.
                </p>
              ) : null}
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
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "520px", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
            <h3 style={{ margin: "0 0 16px", color: theme.text }}>Job Types</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: theme.text, lineHeight: 1.5, opacity: 0.9 }}>
              Same job types as <strong>Quotes</strong> (materials + line templates). Recurrence options below apply when you add items from the calendar.
            </p>
            {jobTypesPortalItems.length > 0 && (
              <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${theme.border}` }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>
                  Options (from your portal setup)
                </p>
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
            <p style={{ fontSize: "14px", color: theme.text, marginBottom: "12px" }}>Create job types with description, time required, color, optional materials checklist, and links to saved quote line templates.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              <input placeholder="Name" value={jtName} onChange={(e) => setJtName(e.target.value)} style={{ ...theme.formInput }} />
              <input placeholder="Description (optional)" value={jtDescription} onChange={(e) => setJtDescription(e.target.value)} style={{ ...theme.formInput }} />
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="number" min={15} step={15} placeholder="Duration (min)" value={jtDuration} onChange={(e) => setJtDuration(parseInt(e.target.value, 10) || 60)} style={{ ...theme.formInput, width: "120px" }} />
                <input type="color" value={jtColor} onChange={(e) => setJtColor(e.target.value)} style={{ width: "40px", height: "36px", border: `1px solid ${theme.border}`, borderRadius: "6px", cursor: "pointer" }} />
                <span style={{ fontSize: "14px", color: theme.text }}>{jtColor}</span>
              </div>
              <label style={{ display: "grid", gap: 6, fontSize: 12, color: theme.text }}>
                Materials checklist (optional, one line per item — copied to new events; editable per event)
                <textarea
                  value={jtMaterials}
                  onChange={(e) => setJtMaterials(e.target.value)}
                  rows={4}
                  placeholder={"e.g. Shingles — 10 bundles\nUnderlayment roll\nDrip edge 40 ft"}
                  style={{ ...theme.formInput, resize: "vertical", fontFamily: "inherit" }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input type="checkbox" checked={jtTrackMileage} onChange={(e) => setJtTrackMileage(e.target.checked)} />
                Track mileage on calendar events (mileage field when this job type is selected)
              </label>
              <details
                style={{
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  padding: "8px 10px",
                }}
              >
                <summary
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#111827",
                    cursor: "pointer",
                    listStyle: "none",
                  }}
                >
                  Saved line templates
                  {estimateLinePresetsCal.length > 0 ? (
                    <span style={{ fontWeight: 600, color: "#374151", marginLeft: 6 }}>({estimateLinePresetsCal.length})</span>
                  ) : null}
                </summary>
                <p style={{ margin: "10px 0 10px", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                  Check lines to link them to this job type. Manage the full list under <strong style={{ color: "#111827" }}>Quotes → Saved line templates</strong>.
                </p>
                {estimateLinePresetsCal.length === 0 ? (
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "#4b5563" }}>No saved line templates yet.</p>
                ) : (
                  <div
                    style={{
                      maxHeight: 220,
                      overflow: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: 8,
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#f9fafb",
                    }}
                  >
                    {estimateLinePresetsCal.map((p) => {
                      const costLine = formatEstimatePresetCostSummary(p)
                      return (
                        <label
                          key={p.id}
                          style={{ fontSize: 13, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            style={{ marginTop: 4, flexShrink: 0 }}
                            checked={jtModalPresetChecksCal[p.id] === true}
                            onChange={(e) =>
                              setJtModalPresetChecksCal((prev) => ({ ...prev, [p.id]: e.target.checked }))
                            }
                          />
                          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                            <span style={{ color: "#111827", fontWeight: 600, lineHeight: 1.35 }}>{p.description.trim() || "Line"}</span>
                            {costLine ? <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 500 }}>{costLine}</span> : null}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </details>
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
      {showReceiptTemplateModal && (
        <PortalSettingsModal
          title={receiptTemplateButtonLabel}
          items={receiptTemplateItems.length > 0 ? receiptTemplateItems : [...DEFAULT_RECEIPT_TEMPLATE_ITEMS]}
          formValues={receiptTemplateFormValues}
          setFormValue={(id, value) => setReceiptTemplateFormValues((prev) => ({ ...prev, [id]: value }))}
          isItemVisible={isReceiptTemplateItemVisible}
          onClose={() => void closeReceiptTemplateModal()}
          maxWidthPx={520}
        />
      )}
      {showCompletionSettingsModal && (
        <PortalSettingsModal
          title={completionSettingsButtonLabel}
          items={completionSettingsItems}
          formValues={completionSettingsFormValues}
          setFormValue={(id, value) => setCompletionSettingsFormValues((prev) => ({ ...prev, [id]: value }))}
          isItemVisible={isCompletionSettingsItemVisible}
          onClose={() => void closeCompletionSettingsModal()}
          maxWidthPx={520}
          intro={
            <p style={{ margin: 0, fontSize: 13, color: theme.text, opacity: 0.85, lineHeight: 1.5 }}>
              Controls who may message the customer when a job is completed and optional office-manager notifications. Values are stored on your profile.
            </p>
          }
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
              Mark <strong>{completeFlowEvent.title}</strong> complete. Receipt email/SMS uses your Tradesman communications channels (same as Conversations/Quotes), not your device mail app.
            </p>
            <label style={{ display: "block", marginBottom: 10, fontSize: 13, color: theme.text }}>
              <span style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Completion note (optional)</span>
              <textarea
                value={completeCompletionNote}
                onChange={(e) => setCompleteCompletionNote(e.target.value)}
                rows={3}
                placeholder="Visible on the event and included in receipt messages when you send them."
                style={{ width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 6, border: `1px solid ${theme.border}`, fontFamily: "inherit", fontSize: 13 }}
              />
            </label>
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
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", flexWrap: "wrap" }}>
                <input type="checkbox" checked={receiptSmsCustomer} onChange={(e) => setReceiptSmsCustomer(e.target.checked)} />
                Send receipt to customer SMS
                {completeCustomerPhone ? (
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>({completeCustomerPhone})</span>
                ) : (
                  <span style={{ fontSize: "12px", color: "#b45309" }}>— none on file</span>
                )}
                {completeCustomerPhone?.trim() ? <CustomerCallButton phone={completeCustomerPhone} compact /> : null}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={receiptEmailSelf} onChange={(e) => setReceiptEmailSelf(e.target.checked)} />
                Send receipt to myself (email)
              </label>
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                disabled={receiptPdfBusy}
                onClick={() => completeFlowEvent && void downloadReceiptPdfForEvent(completeFlowEvent)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  color: theme.text,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: receiptPdfBusy ? "wait" : "pointer",
                }}
              >
                {receiptPdfBusy ? "PDF…" : "Download receipt PDF"}
              </button>
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

      {showTeamMapModal && (
        <>
          <div
            role="presentation"
            onClick={() => setShowTeamMapModal(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(480px, 92vw)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 10,
              padding: 20,
              zIndex: 10001,
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ margin: "0 0 10px", color: theme.text }}>Team map</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              Live technician locations are planned here: last-known GPS from users who opt in under <strong>Account → Mobile app</strong>, plus optional fleet integrations (Samsara, Geotab, etc.) configured later in admin.
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>
              Map tiles and background tracking are not enabled in this build. Office managers can still use calendar completion controls and receipt policies from <strong>Calendar → Job completion</strong> settings.
            </p>
            <button
              type="button"
              onClick={() => setShowTeamMapModal(false)}
              style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: theme.primary, color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              Close
            </button>
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
                <div style={{ margin: 0 }}>
                  <p style={{ margin: 0 }}>
                    <strong>Quote:</strong> linked
                  </p>
                  {linkedQuoteLiveTotal != null ? (
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#0f766e", fontWeight: 600 }}>
                      Quote total (from line items now): ${linkedQuoteLiveTotal.toFixed(2)}
                    </p>
                  ) : quoteItemsForReceipt.length === 0 ? (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>Loading quote lines…</p>
                  ) : null}
                </div>
              )}
              {selectedEvent.user_id && selectedEvent.user_id !== userId && (
                <p style={{ margin: 0 }}>
                  <strong>Calendar owner:</strong>{" "}
                  {selectableUsers.find((u) => u.userId === selectedEvent.user_id)?.label ?? selectedEvent.user_id.slice(0, 8)}
                </p>
              )}
              {(selectedEvent.recurrence_series_id || (selectedLegacyRecurringIds && selectedLegacyRecurringIds.length >= 2)) && (
                <p style={{ margin: 0, color: "#2563eb" }}>
                  <strong>Recurrence:</strong>{" "}
                  {selectedEvent.recurrence_series_id
                    ? selectedSeriesSiblingCount > 1
                      ? `${selectedSeriesSiblingCount} scheduled dates in this series`
                      : "Recurring series"
                    : `${selectedLegacyRecurringIds!.length} matching dates in view (legacy series)`}
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
            <div style={{ marginBottom: 14 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700, color: theme.text, fontSize: 13 }}>Materials</p>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                Filled from the job type and linked quote material lines when you add to calendar or open this event. Edit below for this date only.
              </p>
              <textarea
                value={eventMaterialsDraft}
                onChange={(e) => setEventMaterialsDraft(e.target.value)}
                rows={5}
                placeholder="One line per item"
                style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
              />
              <button
                type="button"
                disabled={eventMaterialsSaving || !supabase}
                onClick={() => void saveEventMaterialsList()}
                style={{
                  marginTop: 8,
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: theme.primary,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: eventMaterialsSaving ? "wait" : "pointer",
                  fontSize: 13,
                }}
              >
                {eventMaterialsSaving ? "Saving…" : "Save materials"}
              </button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700, color: theme.text, fontSize: 13 }}>Receipt line items</p>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                Edit how quote lines appear on the PDF, hide a line, or add extra charges for this visit. Receipt template →{" "}
                <strong>Itemize receipt</strong> adds the materials checklist block (event / job type / quote materials).
              </p>
              <div
                style={{
                  maxHeight: 240,
                  overflowY: "auto",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 10,
                  background: "#fafafa",
                }}
              >
                {quoteItemsForReceipt.length === 0 && receiptAdditionalDraft.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                    {selectedEvent.quote_id ? "Loading quote lines…" : "No linked quote — add lines below for this job only."}
                  </p>
                ) : null}
                {quoteItemsForReceipt.map((row) => {
                  const ov = receiptOverridesDraft[row.id] ?? {}
                  const meta = parseQuoteItemMetadata(row.metadata)
                  const baseQ = typeof row.quantity === "number" ? row.quantity : Number.parseFloat(String(row.quantity ?? 0)) || 0
                  const baseU = typeof row.unit_price === "number" ? row.unit_price : Number.parseFloat(String(row.unit_price ?? 0)) || 0
                  const qStr = String(ov.quantity !== undefined && Number.isFinite(ov.quantity) ? ov.quantity : baseQ)
                  const uStr = String(ov.unit_price !== undefined && Number.isFinite(ov.unit_price) ? ov.unit_price : baseU)
                  const desc = ov.description !== undefined ? ov.description : String(row.description ?? "")
                  const kind = meta.line_kind?.trim() || "line"
                  return (
                    <div
                      key={row.id}
                      style={{
                        display: "grid",
                        gap: 6,
                        marginBottom: 10,
                        paddingBottom: 10,
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "capitalize" }}>From quote · {kind}</div>
                      <input
                        value={desc}
                        onChange={(e) =>
                          setReceiptOverridesDraft((p) => ({
                            ...p,
                            [row.id]: { ...p[row.id], description: e.target.value },
                          }))
                        }
                        placeholder="Description"
                        style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", fontSize: 13 }}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <label style={{ fontSize: 11, color: theme.text, display: "flex", alignItems: "center", gap: 4 }}>
                          Qty
                          <input
                            value={qStr}
                            onChange={(e) => {
                              const n = Number.parseFloat(e.target.value)
                              setReceiptOverridesDraft((p) => ({
                                ...p,
                                [row.id]: { ...p[row.id], quantity: Number.isFinite(n) ? n : 0 },
                              }))
                            }}
                            type="number"
                            step="any"
                            style={{ ...theme.formInput, width: 72, fontSize: 13 }}
                          />
                        </label>
                        <label style={{ fontSize: 11, color: theme.text, display: "flex", alignItems: "center", gap: 4 }}>
                          Unit $
                          <input
                            value={uStr}
                            onChange={(e) => {
                              const n = Number.parseFloat(e.target.value)
                              setReceiptOverridesDraft((p) => ({
                                ...p,
                                [row.id]: { ...p[row.id], unit_price: Number.isFinite(n) ? n : 0 },
                              }))
                            }}
                            type="number"
                            step="any"
                            style={{ ...theme.formInput, width: 88, fontSize: 13 }}
                          />
                        </label>
                        <label style={{ fontSize: 11, color: theme.text, display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={ov.hidden === true}
                            onChange={(e) =>
                              setReceiptOverridesDraft((p) => ({
                                ...p,
                                [row.id]: { ...p[row.id], hidden: e.target.checked },
                              }))
                            }
                          />
                          Hide on receipt
                        </label>
                      </div>
                    </div>
                  )
                })}
                {receiptAdditionalDraft.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gap: 6,
                      marginBottom: 10,
                      paddingBottom: 10,
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Added for this event</div>
                    <input
                      value={row.description}
                      onChange={(e) =>
                        setReceiptAdditionalDraft((p) =>
                          p.map((x) => (x.id === row.id ? { ...x, description: e.target.value } : x)),
                        )
                      }
                      style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", fontSize: 13 }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        type="number"
                        step="any"
                        value={row.quantity}
                        onChange={(e) => {
                          const n = Number.parseFloat(e.target.value)
                          setReceiptAdditionalDraft((p) =>
                            p.map((x) => (x.id === row.id ? { ...x, quantity: Number.isFinite(n) ? n : 0 } : x)),
                          )
                        }}
                        style={{ ...theme.formInput, width: 72, fontSize: 13 }}
                      />
                      <input
                        type="number"
                        step="any"
                        value={row.unit_price}
                        onChange={(e) => {
                          const n = Number.parseFloat(e.target.value)
                          setReceiptAdditionalDraft((p) =>
                            p.map((x) => (x.id === row.id ? { ...x, unit_price: Number.isFinite(n) ? n : 0 } : x)),
                          )
                        }}
                        style={{ ...theme.formInput, width: 88, fontSize: 13 }}
                      />
                      <select
                        value={row.line_kind ?? "misc"}
                        onChange={(e) =>
                          setReceiptAdditionalDraft((p) =>
                            p.map((x) => (x.id === row.id ? { ...x, line_kind: e.target.value } : x)),
                          )
                        }
                        style={{ ...theme.formInput, fontSize: 13 }}
                      >
                        <option value="labor">Labor</option>
                        <option value="material">Material</option>
                        <option value="misc">Misc</option>
                        <option value="fee">Fee</option>
                        <option value="other">Other</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setReceiptAdditionalDraft((p) => p.filter((x) => x.id !== row.id))}
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          border: "none",
                          background: "transparent",
                          color: "#b91c1c",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 12, color: theme.text }}>Add line to receipt</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                <input
                  value={receiptNewDesc}
                  onChange={(e) => setReceiptNewDesc(e.target.value)}
                  placeholder="Description"
                  style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", fontSize: 13 }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={receiptNewQty}
                    onChange={(e) => setReceiptNewQty(e.target.value)}
                    placeholder="Qty"
                    type="number"
                    step="any"
                    style={{ ...theme.formInput, width: 72, fontSize: 13 }}
                  />
                  <input
                    value={receiptNewUnit}
                    onChange={(e) => setReceiptNewUnit(e.target.value)}
                    placeholder="Unit $"
                    type="number"
                    step="any"
                    style={{ ...theme.formInput, width: 88, fontSize: 13 }}
                  />
                  <select
                    value={receiptNewKind}
                    onChange={(e) => setReceiptNewKind(e.target.value)}
                    style={{ ...theme.formInput, fontSize: 13 }}
                  >
                    <option value="labor">Labor</option>
                    <option value="material">Material</option>
                    <option value="misc">Misc</option>
                    <option value="fee">Fee</option>
                    <option value="other">Other</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const q = Number.parseFloat(receiptNewQty) || 0
                      const u = Number.parseFloat(receiptNewUnit) || 0
                      const id = `r_add_${crypto.randomUUID()}`
                      setReceiptAdditionalDraft((p) => [
                        ...p,
                        {
                          id,
                          description: receiptNewDesc.trim() || "Item",
                          quantity: q,
                          unit_price: u,
                          line_kind: receiptNewKind,
                        },
                      ])
                      setReceiptNewDesc("")
                      setReceiptNewQty("1")
                      setReceiptNewUnit("0")
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "white",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      color: theme.text,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={receiptLinesSaving || !supabase}
                onClick={() => void saveEventReceiptLines()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: theme.primary,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: receiptLinesSaving ? "wait" : "pointer",
                  fontSize: 13,
                }}
              >
                {receiptLinesSaving ? "Saving…" : "Save receipt lines"}
              </button>
            </div>
            {(() => {
              const jt =
                selectedEvent.job_types && !Array.isArray(selectedEvent.job_types) ? selectedEvent.job_types : null
              const jtResolved = jt ?? jobTypes.find((j) => j.id === selectedEvent.job_type_id)
              if (!jtResolved?.track_mileage) return null
              return (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 700, color: theme.text, fontSize: 13 }}>Mileage</p>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                    This job type tracks mileage. Enter miles for this visit (optional until you have them).
                  </p>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={eventMileageDraft}
                    onChange={(e) => setEventMileageDraft(e.target.value)}
                    placeholder="Miles"
                    style={{ ...theme.formInput, width: "100%", maxWidth: 200, boxSizing: "border-box", fontSize: 13 }}
                  />
                  <button
                    type="button"
                    disabled={eventMileageSaving || !supabase}
                    onClick={() => void saveEventMileage()}
                    style={{
                      marginTop: 8,
                      display: "block",
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: theme.primary,
                      color: "#fff",
                      fontWeight: 600,
                      cursor: eventMileageSaving ? "wait" : "pointer",
                      fontSize: 13,
                    }}
                  >
                    {eventMileageSaving ? "Saving…" : "Save mileage"}
                  </button>
                </div>
              )
            })()}
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700, color: theme.text, fontSize: 13 }}>Event files</p>
              <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>
                Upload
                <input
                  type="file"
                  disabled={calendarEventEntityUploadBusy}
                  onChange={(e) => void handleCalendarEntityFileChange(e.target.files)}
                  style={{ display: "block", marginTop: 6, fontSize: 12 }}
                />
              </label>
              {calendarEventEntityUploadBusy ? (
                <span style={{ fontSize: 11, color: "#6b7280", display: "block", marginTop: 4 }}>Uploading…</span>
              ) : null}
              {calendarEventEntityRows.length > 0 ? (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: theme.text }}>
                  {calendarEventEntityRows.map((row) => (
                    <li key={row.id} style={{ marginBottom: 4 }}>
                      <a href={row.public_url} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 600 }}>
                        {row.file_name || "File"}
                      </a>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => void removeCalendarEntityRowLocal(row)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#b91c1c",
                          cursor: "pointer",
                          textDecoration: "underline",
                          padding: 0,
                          fontSize: 12,
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>No files attached to this event yet.</p>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                disabled={receiptPdfBusy}
                onClick={() => void downloadReceiptPdfForEvent(selectedEvent)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: theme.primary,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: receiptPdfBusy ? "wait" : "pointer",
                  fontSize: 13,
                }}
              >
                {receiptPdfBusy ? "PDF…" : "Download receipt PDF"}
              </button>
            </div>
            {showRecurringRemoveChoices && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f9fafb",
                }}
              >
                <p style={{ margin: "0 0 6px", fontWeight: 700, color: theme.text, fontSize: 13 }}>Recurring event</p>
                <p style={{ margin: 0, fontSize: 12, color: "#4b5563", lineHeight: 1.45 }}>
                  Use <strong>Remove this occurrence</strong> for only this date, or <strong>Remove entire series</strong> to remove every date in this recurrence
                  {selectedEvent.recurrence_series_id ? "" : " (shown matches in your current calendar view)"}.
                </p>
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
                      setCompleteCompletionNote("")
                      setCompleteFlowEvent(selectedEvent)
                      setSelectedEvent(null)
                    }}
                    style={{ padding: "8px 14px", borderRadius: "6px", background: theme.primary, color: "white", border: "none", cursor: calendarEventActionBusy ? "wait" : "pointer", fontSize: "14px" }}
                  >
                    Complete
                  </button>
                )}
                {showRecurringRemoveChoices ? (
                  <>
                    <button
                      type="button"
                      disabled={calendarEventActionBusy}
                      onClick={async () => {
                        if (!supabase || !selectedEvent.id) return
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
                        background: "white",
                        color: "#b91c1c",
                        border: "2px solid #b91c1c",
                        cursor: calendarEventActionBusy ? "wait" : "pointer",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    >
                      Remove this occurrence
                    </button>
                    <button
                      type="button"
                      disabled={calendarEventActionBusy}
                      onClick={async () => {
                        if (!supabase || !selectedEvent.id) return
                        const owner = selectedEvent.user_id ?? userId
                        const scopeId = selectedEvent.recurrence_series_id
                        const legacyIds = selectedLegacyRecurringIds
                        if (!scopeId && (!legacyIds || legacyIds.length < 2)) return
                        const msg = scopeId
                          ? "Remove the entire series? Every date in this recurrence will be removed. This cannot be undone."
                          : `Remove all ${legacyIds!.length} matching dates currently shown for this recurring set? This cannot be undone.`
                        if (!window.confirm(msg)) return
                        setCalendarEventActionBusy(true)
                        const res = scopeId
                          ? await supabase
                              .from("calendar_events")
                              .update({ removed_at: new Date().toISOString() })
                              .eq("recurrence_series_id", scopeId)
                              .is("removed_at", null)
                          : await supabase
                              .from("calendar_events")
                              .update({ removed_at: new Date().toISOString() })
                              .in("id", legacyIds!)
                              .eq("user_id", owner)
                              .is("removed_at", null)
                        setCalendarEventActionBusy(false)
                        if (res.error) alert(res.error.message)
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
                        fontWeight: 600,
                      }}
                    >
                      Remove entire series
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={calendarEventActionBusy}
                    onClick={async () => {
                      if (!supabase || !selectedEvent.id) return
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
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
