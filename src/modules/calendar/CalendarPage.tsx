import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect, type MouseEvent as ReactMouseEvent } from "react"
import { supabase } from "../../lib/supabase"
import { outboundMessagesJsonBody } from "../../lib/platformToolsJsonBody"
import { parseLocalDateTime } from "../../lib/parseLocalDateTime"
import {
  formatDurationFieldFromMinutes,
  parseDurationFieldToMinutes,
  snapMinutesToIncrement,
} from "../../lib/numericFormInput"
import { useOfficeManagerScopeOptional, usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { filterRealUserIds, isSandboxDemoUserId, parseSandboxDemoTeam, resolveSandboxDataUserId } from "../../lib/sandboxDemoTeam"
import {
  buildDefaultSandboxDemoLocations,
  parseSandboxDemoLocations,
  SANDBOX_DEMO_LOCATIONS_META_KEY,
} from "../../lib/sandboxDemoLocations"
import {
  calendarAssigneeLabel,
  calendarEventAssigneeUserId,
  calendarEventVisibleToScopedUser,
  mergeCalendarAssigneeMetadata,
  resolveCalendarAssigneeForSave,
} from "../../lib/calendarAssignee"
import {
  formatCalendarEventLabel,
  loadCalendarDisplayPrefs,
  mergeCalendarEventDisplayMeta,
  mergeCalendarCustomerNotifyPrefs,
  readCalendarCustomerNotifyPrefs,
  readCalendarEventDisplayMeta,
  saveCalendarDisplayPrefs,
  calendarChipSurfaceStyle,
  CALENDAR_TITLE_FIELD_OPTIONS,
  CALENDAR_CHIP_STYLE_OPTIONS,
  type CalendarDisplayPrefs,
  type CalendarTitleFieldId,
  type CalendarChipStyleId,
} from "../../lib/calendarEventDisplayPrefs"
import { JOB_TYPE_CALENDAR_COLORS, JOB_TYPE_ICON_OPTIONS, glyphForJobTypeIcon } from "../../lib/jobTypeIcons"
import { sandboxTrainingAlert, shouldSuppressSandboxTrainingError, useSandboxTrainingMode } from "../../lib/sandboxTrainingUi"
import { useAuth } from "../../contexts/AuthContext"
import { isOfficeManagerLikeRole } from "../../lib/profileRoles"
import TabNotificationAlertsButton from "../../components/TabNotificationAlertsButton"
import CustomerCallButton from "../../components/CustomerCallButton"
import CustomReceiptModal from "../../components/CustomReceiptModal"
import SetupWizardLaunchButton from "../../components/SetupWizardLaunchButton"
import TeamLocationsMapModal from "../../components/TeamLocationsMapModal"
import { CalendarEventEmailCompose, calendarEventEmailDetailsStyle } from "../../components/CalendarEventEmailCompose"
import CalendarTeamManagementPanel from "./CalendarTeamManagementPanel"
import { useManagedByOfficeManager } from "../../hooks/useManagedByOfficeManager"
import { parseOmCalendarPolicy } from "../../lib/teamCalendarPolicy"
import { geocodeAddressToLatLng, mergeJobSiteIntoMetadata, parseJobSiteFromEventMetadata } from "../../lib/jobSiteLocation"
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
  validateRecurrenceEndLimitsFromPortal,
} from "../../lib/calendarRecurrence"
import {
  clampAppointmentDurationMinutes,
  durationMinutesFromJobType,
  readCalendarWorkingHoursFromStorage,
} from "../../lib/scheduleDurationDefaults"
import {
  confirmCalendarOverlapSave,
  findCalendarScheduleConflicts,
  readCalendarNoDuplicateTimesSetting,
  writeCalendarNoDuplicateTimesSetting,
} from "../../lib/calendarOverlap"
import {
  dateWithMinutesFromMidnight,
  formatTimeInputFromDate,
  minutesFromColumnY,
} from "../../lib/calendarGridTime"
import { refreshCustomerPipelineOnEngagement } from "../../lib/customerPipelineStatus"
import type { PortalSettingItem } from "../../types/portal-builder"
import { useIsMobile } from "../../hooks/useIsMobile"
import { readContactTargetFromMetadata, resolveCustomerContactByTarget } from "../../lib/customerContactRouting"
import { applyEmailTemplatePlaceholders, findEmailTemplate } from "../../lib/emailTemplates"
import { htmlToPlainText } from "../../lib/emailSignature"
import { useScopedAiAutomationsEnabled } from "../../hooks/useScopedAiAutomationsEnabled"
import { queueCustomerProfile } from "../../lib/customerNavigation"
import { useJobTypesModalOptional } from "../../contexts/JobTypesModalContext"
import {
  consumeCalendarSuiteNavigation,
  consumeCustomReceiptCustomerPrefill,
  consumeOpenCustomReceiptModal,
  consumeSchedulingAddWizardPrefill,
  consumeSchedulingCustomerPrefill,
  consumeSchedulingEventView,
  consumeSchedulingQuotePrefill,
  queueQuotesCreateNewForCustomer,
  notifyCustomersHubRefresh,
  SCHEDULING_ADD_WIZARD_PREFILL_EVENT,
  SCHEDULING_EVENT_VIEW_EVENT,
  type SchedulingAddWizardPrefill,
} from "../../lib/workflowNavigation"
import { resolveDemoTeamPolicyFromOwnerMetadata } from "../../lib/sandboxDemoTeamPolicies"
import { loadCustomersForCustomReceipt, type CustomerReceiptPickerRow } from "../../lib/customReceipt"
import {
  loadEntityAttachmentsForCalendarEvent,
  deleteEntityAttachmentRow,
  isProbablyImageAttachment,
  type EntityAttachmentRow,
} from "../../lib/communicationAttachments"
import { uploadEntityAttachmentFile } from "../../lib/uploadCommAttachment"
import { buildReceiptPdfBytes, downloadPdfBlob, uint8ArrayToBase64 } from "../../lib/documentPdf"
import { buildCalendarReceiptBodyText, buildCalendarReceiptPdfSections } from "../../lib/receiptItemizedLines"
import {
  buildCalendarEventLineItemRows,
  calendarEventLineItemSummary,
} from "../../lib/calendarEventLineItems"
import {
  parseCalendarEventReceiptMeta,
  serializeCalendarReceiptMeta,
  type ReceiptAdditionalLine,
  type ReceiptQuoteOverride,
} from "../../lib/calendarReceiptMetadata"
import { calendarEventEffectiveStatus } from "../../lib/calendarEventStatus"
import { shareCalendarEventsToDevice, type CalendarIcsRow } from "../../lib/shareCalendarIcs"
import { isNativeApp } from "../../lib/capacitorMobile"
import {
  materialDescriptionsFromQuoteItemRows,
  parseQuoteItemMetadata,
  prependQuoteMaterialsToEventChecklist,
  primaryLineItemTitleFromQuoteRows,
  scopeLineItemsTextFromQuoteRows,
  totalFromQuoteItemRows,
} from "../../lib/quoteItemMath"
import { loadCalendarQuotePickerOptions, type CalendarQuotePickerOption } from "../../lib/customerQuotePaymentOptions"
import {
  buildAppointmentCancelSmsInner,
  buildAppointmentConfirmSmsInner,
  buildAppointmentRescheduleSmsInner,
  wrapAppointmentSmsBody,
} from "../../lib/appointmentCustomerNotify"
import { fetchQuoteLogoForExport, resolveReceiptTemplateLogoUrl } from "../../lib/quoteLogoImage"
import { parseCustomerPaymentMetadata, type CustomerPaymentProfileMetadata } from "../../lib/customerPaymentMetadata"
import CustomerPaymentRequestModal from "../../components/CustomerPaymentRequestModal"

type JobType = {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  color_hex: string | null
  materials_list?: string | null
  track_mileage?: boolean | null
}

const JOB_TYPE_CREATE_NEW_VALUE = "__create_new_job_type__"

function formatJobTypeSelectLabel(jt: JobType): string {
  const mins = Math.max(15, jt.duration_minutes)
  if (mins % 60 === 0 && mins >= 60) {
    const hours = mins / 60
    return `${jt.name} · ${hours === 1 ? "1 hr" : `${hours} hr`}`
  }
  return `${jt.name} · ${mins} min`
}

function formatAddCustomerPickerLabel(c: CustomerReceiptPickerRow): string {
  const name = (c.display_name ?? "").trim() || c.id
  const contact = c.phone?.trim() || c.email?.trim() || c.service_address?.trim()
  return contact ? `${name} · ${contact}` : name
}

function isAddRecurrencePortalItem(item: PortalSettingItem): boolean {
  if (item.id === "make_event_recurring" || item.id.startsWith("recurrence_")) return true
  const t = `${item.id} ${item.label}`.toLowerCase()
  return /recurr/.test(t)
}

function formatAddAppointmentDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function formatAddAppointmentTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function sortJobTypesByName(rows: JobType[]): JobType[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}

function calDayIsoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

type GridEventDragState = {
  event: CalendarEvent
  durationMs: number
  pointerId: number
  moved: boolean
  ghostDayIso: string
  ghostMinutes: number
  startX: number
  startY: number
}

type MonthEventDragState = {
  event: CalendarEvent
  durationMs: number
  pointerId: number
  moved: boolean
  ghostDayIso: string
  startX: number
  startY: number
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
  customers?: {
    display_name: string | null
    service_address?: string | null
    service_lat?: number | null
    service_lng?: number | null
  } | null
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

function getTimeOptions(incrementMinutes: 15 | 60): string[] {
  const options: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += incrementMinutes) {
      options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
    }
  }
  return options
}

/** Readable message from /api/outbound-messages JSON error body. */
function formatOutboundError(raw: string): string {
  const t = raw.trim()
  try {
    const j = JSON.parse(t) as { error?: string; hint?: string }
    if (typeof j.error === "string") {
      return typeof j.hint === "string" && j.hint.trim() ? `${j.error} (${j.hint})` : j.error
    }
  } catch {
    /* ignore */
  }
  return t.length > 280 ? `${t.slice(0, 280)}…` : t
}

type CalendarSuiteState =
  | { id: "calendar" }
  | { id: "time_clock" }
  | { id: "team_management"; panel: "team_members" | "job_types" | "team_map" | "scheduling_settings" }
  | { id: "scheduling_tools"; panel: "job_types" | "customer_map" }
  | { id: "managed_job_types" }

function mergeCompletionMetadata(prevMeta: unknown, note: string): Record<string, unknown> {
  const prev =
    prevMeta && typeof prevMeta === "object" && !Array.isArray(prevMeta) ? { ...(prevMeta as Record<string, unknown>) } : {}
  if (note) prev.completion_note = note
  else delete prev.completion_note
  return prev
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

export default function CalendarPage({ setPage }: { setPage?: (page: string) => void }) {
  const { userId: authUserId, user: authUser, role: authRole } = useAuth()
  const isMobile = useIsMobile()
  const scopeCtx = useOfficeManagerScopeOptional()
  const userId = useScopedUserId()
  const calendarDbUserId = useMemo(
    () => resolveSandboxDataUserId(userId, authUserId || userId),
    [userId, authUserId],
  )
  const sandboxTraining = useSandboxTrainingMode()
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(userId)
  const portalConfig = usePortalConfigForPage()
  const jobTypesModal = useJobTypesModalOptional()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [jobTypes, setJobTypes] = useState<JobType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>("")
  const [view, setView] = useState<"day" | "week" | "month">("month")
  const [displayPrefs, setDisplayPrefs] = useState<CalendarDisplayPrefs>(() => loadCalendarDisplayPrefs())
  const [showDisplayPrefs, setShowDisplayPrefs] = useState(false)
  const [eventCtxMenu, setEventCtxMenu] = useState<{ x: number; y: number; event: CalendarEvent } | null>(null)
  const ignoreEventCtxCloseUntilRef = useRef(0)
  const [dragNotifyPrompt, setDragNotifyPrompt] = useState<{
    event: CalendarEvent
    newStart: Date
    durationMs: number
    notifyEmail: boolean
    notifySms: boolean
  } | null>(null)
  const dragNotifyResolverRef = useRef<((choice: "yes" | "no" | "cancel") => void) | null>(null)
  const [jobTypeIconById, setJobTypeIconById] = useState<Record<string, string>>({})
  const [currentDate, setCurrentDate] = useState(new Date())
  const [expanded, setExpanded] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
  const [showAutoResponse, setShowAutoResponse] = useState(false)
  const [showReceiptTemplateModal, setShowReceiptTemplateModal] = useState(false)
  const [showCustomReceiptModal, setShowCustomReceiptModal] = useState(false)
  const [customReceiptPrefillCustomerId, setCustomReceiptPrefillCustomerId] = useState<string | null>(null)
  const [showCompletionSettingsModal, setShowCompletionSettingsModal] = useState(false)
  const [calendarSuite, setCalendarSuite] = useState<CalendarSuiteState>({ id: "calendar" })
  const [sandboxDemoLocations, setSandboxDemoLocations] = useState<ReturnType<typeof parseSandboxDemoLocations>>({})
  const managedByOfficeManager = useManagedByOfficeManager()

  const [managedSelfPolicy, setManagedSelfPolicy] = useState(() => parseOmCalendarPolicy({}))
  const [receiptTemplateFormValues, setReceiptTemplateFormValues] = useState<Record<string, string>>({})
  const [completionSettingsFormValues, setCompletionSettingsFormValues] = useState<Record<string, string>>({})
  const [calendarCompletionProfile, setCalendarCompletionProfile] = useState<Record<string, string>>({})
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [hasCompletedAtColumn, setHasCompletedAtColumn] = useState(true)
  const [userPref, setUserPref] = useState<UserCalendarPreference | null>(null)
  const [addTargetUserId, setAddTargetUserId] = useState("")
  const [addAssignToSelectedUser, setAddAssignToSelectedUser] = useState(true)
  const [eventAssigneePick, setEventAssigneePick] = useState("")
  const [assigneeSaveNote, setAssigneeSaveNote] = useState("")
  const [eventAssigneeSaving, setEventAssigneeSaving] = useState(false)
  const [showAllOrgEvents, setShowAllOrgEvents] = useState(() => {
    try { return localStorage.getItem("calendar_showAllOrgEvents") === "true" } catch { return false }
  })
  const [prefByUserId, setPrefByUserId] = useState<Record<string, UserCalendarPreference>>({})

  const selectableUsers = useMemo(() => {
    if (scopeCtx?.clients?.length) return scopeCtx.clients
    return [{ userId, label: "My calendar", email: null, clientId: null, isSelf: true }]
  }, [scopeCtx?.clients, userId])

  const teamMapUserIds = useMemo(() => {
    if (scopeCtx?.clients?.length) {
      const ids = filterRealUserIds(
        Array.from(new Set(scopeCtx.clients.map((c) => c.userId).filter(Boolean))),
      )
      if (ids.length > 0) return ids
    }
    return calendarDbUserId ? [calendarDbUserId] : []
  }, [scopeCtx?.clients, calendarDbUserId])

  /** Keep unique roster ids for map legend (demo personas stay distinct). */
  const teamMapMembers = useMemo(
    () =>
      selectableUsers.map((u) => ({
        userId: u.userId,
        label: u.label,
        isSelf: u.isSelf,
        isDemo: isSandboxDemoUserId(u.userId),
      })),
    [selectableUsers],
  )

  const calendarVisibleEvents = useMemo(
    () => events.filter((ev) => calendarEventVisibleToScopedUser(ev, userId)),
    [events, userId],
  )

  const orgClientIdsKey = useMemo(
    () =>
      filterRealUserIds((scopeCtx?.clients ?? []).map((c) => c.userId).filter(Boolean))
        .sort()
        .join(","),
    [scopeCtx?.clients],
  )

  // Add item form
  const [addTitle, setAddTitle] = useState("")
  const [addStartDate, setAddStartDate] = useState("")
  const [addStartTime, setAddStartTime] = useState("09:00")
  const [addDurationStr, setAddDurationStr] = useState("60")
  const [addJobTypeId, setAddJobTypeId] = useState<string>("")
  const [addNotes, setAddNotes] = useState("")
  const [addQuoteId, setAddQuoteId] = useState<string | null>(null)
  const [addCustomerId, setAddCustomerId] = useState<string | null>(null)
  const [addCustomerOptions, setAddCustomerOptions] = useState<CustomerReceiptPickerRow[]>([])
  const [addCustomerSearch, setAddCustomerSearch] = useState("")
  const [addNotifyEmail, setAddNotifyEmail] = useState(false)
  const [addNotifySms, setAddNotifySms] = useState(false)
  const [addQuoteOptions, setAddQuoteOptions] = useState<CalendarQuotePickerOption[]>([])
  const [addQuoteOptionsLoading, setAddQuoteOptionsLoading] = useState(false)
  const [ownerBusinessDisplayName, setOwnerBusinessDisplayName] = useState("")
  const [eventNotesDraft, setEventNotesDraft] = useState("")
  const [eventNotesSaving, setEventNotesSaving] = useState(false)
  const [rescheduleNotifyEmail, setRescheduleNotifyEmail] = useState(false)
  const [rescheduleNotifySms, setRescheduleNotifySms] = useState(false)
  const [removeNotifyEmail, setRemoveNotifyEmail] = useState(false)
  const [removeNotifySms, setRemoveNotifySms] = useState(false)
  const [addSaving, setAddSaving] = useState(false)

  // Job type form (managed in shared JobTypesManagerModal)
  const [eventMaterialsDraft, setEventMaterialsDraft] = useState("")
  const [eventMaterialsSaving, setEventMaterialsSaving] = useState(false)
  const [eventMileageDraft, setEventMileageDraft] = useState("")
  const [eventMileageSaving, setEventMileageSaving] = useState(false)
  const [jobSiteDraft, setJobSiteDraft] = useState({ address: "", lat: "", lng: "" })
  const [jobSiteSaving, setJobSiteSaving] = useState(false)
  const [jobGeocodeBusy, setJobGeocodeBusy] = useState(false)
  const [eventEditStartDate, setEventEditStartDate] = useState("")
  const [eventEditStartTime, setEventEditStartTime] = useState("")
  const [eventEditDurationStr, setEventEditDurationStr] = useState("60")
  const [eventEditJobTypeId, setEventEditJobTypeId] = useState("")
  const [eventJobTypeSaving, setEventJobTypeSaving] = useState(false)
  const [eventScheduleSaving, setEventScheduleSaving] = useState(false)
  const [eventScheduleError, setEventScheduleError] = useState("")
  const [addMileage, setAddMileage] = useState("")
  const [quoteItemsForReceipt, setQuoteItemsForReceipt] = useState<QuoteItemReceiptRow[]>([])
  const [receiptOverridesDraft, setReceiptOverridesDraft] = useState<Record<string, ReceiptQuoteOverride>>({})
  const [receiptAdditionalDraft, setReceiptAdditionalDraft] = useState<ReceiptAdditionalLine[]>([])
  const [receiptLinesSaving, setReceiptLinesSaving] = useState(false)
  const [receiptNewDesc, setReceiptNewDesc] = useState("")
  const [receiptNewQty, setReceiptNewQty] = useState("1")
  const [receiptNewUnit, setReceiptNewUnit] = useState("0")
  const [receiptNewKind, setReceiptNewKind] = useState("misc")
  const [customerPaymentProfile, setCustomerPaymentProfile] = useState<CustomerPaymentProfileMetadata>({})
  const [customerPaymentRequestOpen, setCustomerPaymentRequestOpen] = useState(false)

  const sortedJobTypes = useMemo(() => sortJobTypesByName(jobTypes), [jobTypes])

  const linkedQuoteLiveTotal = useMemo(() => {
    if (!selectedEvent?.quote_id) return null
    const t = totalFromQuoteItemRows(quoteItemsForReceipt)
    return t > 0 ? t : null
  }, [selectedEvent?.quote_id, quoteItemsForReceipt])

  const calendarPaymentAmountLabel = useMemo(() => {
    const fromLines = linkedQuoteLiveTotal
    const qTot =
      selectedEvent?.quote_total != null && Number.isFinite(Number(selectedEvent.quote_total))
        ? Number(selectedEvent.quote_total)
        : null
    const v = fromLines ?? qTot
    return v != null && Number.isFinite(v) && v > 0 ? `$${v.toFixed(2)}` : null
  }, [linkedQuoteLiveTotal, selectedEvent?.quote_total])

  const eventLineItemRows = useMemo(() => {
    if (!selectedEvent) return []
    const jt =
      selectedEvent.job_types && !Array.isArray(selectedEvent.job_types)
        ? selectedEvent.job_types
        : jobTypes.find((j) => j.id === selectedEvent.job_type_id)
    return buildCalendarEventLineItemRows({
      jobTypeMaterials: jt?.materials_list,
      eventMaterials: selectedEvent.materials_list,
      quoteItems: quoteItemsForReceipt,
      receiptOverrides: receiptOverridesDraft,
      receiptAdditional: receiptAdditionalDraft,
    })
  }, [selectedEvent, jobTypes, quoteItemsForReceipt, receiptOverridesDraft, receiptAdditionalDraft])

  const eventLineItemSummaryHint = useMemo(() => calendarEventLineItemSummary(eventLineItemRows), [eventLineItemRows])

  useEffect(() => {
    if (!supabase || !userId) {
      setCustomerPaymentProfile({})
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata, display_name")
      .eq("id", calendarDbUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const dn = (data as { display_name?: string | null } | null)?.display_name
        if (typeof dn === "string" && dn.trim()) setOwnerBusinessDisplayName(dn.trim())
        const m =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        setCustomerPaymentProfile(parseCustomerPaymentMetadata(m))
      })
    return () => {
      cancelled = true
    }
  }, [calendarDbUserId])

  const calendarSettingsItems = useMemo(
    () => getControlItemsForUser(portalConfig, "calendar", "working_hours", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const addItemPortalItems = useMemo(() => {
    const all = getControlItemsForUser(portalConfig, "calendar", "add_item_to_calendar", { aiAutomationsEnabled })
    return all.filter((i) => !isRemoveRecurrencePortalItem(i))
  }, [portalConfig, aiAutomationsEnabled])
  const addRecurrencePortalItems = useMemo(
    () => addItemPortalItems.filter(isAddRecurrencePortalItem),
    [addItemPortalItems],
  )
  const addOtherPortalItems = useMemo(
    () => addItemPortalItems.filter((item) => !isAddRecurrencePortalItem(item)),
    [addItemPortalItems],
  )
  const calendarAutoResponseItems = useMemo(
    () => getControlItemsForUser(portalConfig, "calendar", "auto_response_options", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const jobTypesPortalItems = useMemo(
    () =>
      getControlItemsForUser(portalConfig, "calendar", "job_types", { aiAutomationsEnabled }).filter(
        (item) => !item.id.startsWith("recurrence_") && !/recurr/i.test(item.label),
      ),
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
  const showCalAutoResponse = false
  const showCalJobTypes = getOmPageActionVisible(portalConfig, "calendar", "job_types")
  const showCalSettings =
    getPageActionVisible(portalConfig, "calendar", "working_hours") && getOmPageActionVisible(portalConfig, "calendar", "settings")
  const showCalReceiptTemplate =
    getPageActionVisible(portalConfig, "calendar", "receipt_template") && getOmPageActionVisible(portalConfig, "calendar", "receipt_template")
  const showCalCustomReceipt =
    getPageActionVisible(portalConfig, "calendar", "custom_receipt") && getOmPageActionVisible(portalConfig, "calendar", "custom_receipt")
  const showCalCompletionSettings = false
  const receiptTemplateButtonLabel = portalConfig?.controlLabels?.receipt_template ?? "Receipt template"
  const customReceiptButtonLabel = portalConfig?.controlLabels?.custom_receipt ?? "Custom Receipt"
  const completionSettingsButtonLabel = portalConfig?.controlLabels?.completion_settings ?? "Job completion"
  const calendarSettingsButtonLabel = portalConfig?.controlLabels?.working_hours ?? "Settings"
  const showCalendarCustomerPayment =
    getPageActionVisible(portalConfig, "calendar", "customer_payment") &&
    getOmPageActionVisible(portalConfig, "calendar", "customer_payment")

  const [arReminderMins, setArReminderMins] = useState(() => {
    try {
      return localStorage.getItem("calendar_arReminderMins") ?? "15"
    } catch {
      return "15"
    }
  })
  const arReminderMinsRef = useRef(arReminderMins)
  arReminderMinsRef.current = arReminderMins

  const schedulingSettingsPanelOpen =
    calendarSuite.id === "team_management" && calendarSuite.panel === "scheduling_settings"

  useEffect(() => {
    if (!schedulingSettingsPanelOpen || calendarSettingsItemsWithOrg.length === 0) return
    const next: Record<string, string> = {}
    calendarSettingsItemsWithOrg.forEach((item) => {
      if (item.id === "no_duplicate_times") {
        next[item.id] = readCalendarNoDuplicateTimesSetting() ? "checked" : "unchecked"
      } else if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setSettingsFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [schedulingSettingsPanelOpen, calendarSettingsItemsWithOrg])

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
    if (!selectedEvent || !showRecurringRemoveChoices || addItemPortalItems.length === 0) {
      setSeriesRecurrenceValues({})
      return
    }
    const scopeId = selectedEvent.recurrence_series_id
    const existingCount =
      scopeId != null
        ? events.filter((e) => e.recurrence_series_id === scopeId && !e.removed_at && !e.completed_at).length
        : selectedLegacyRecurringIds?.length ?? 1
    const next: Record<string, string> = {}
    for (const item of addItemPortalItems) {
      if (
        item.type === "checkbox" &&
        (item.id === "make_event_recurring" || /recurring/i.test(item.id) || /recurring/i.test(item.label))
      ) {
        next[item.id] = "checked"
      } else if (item.id === "recurrence_end_mode" && item.options?.length) {
        next[item.id] =
          item.options.find((o) => /number of occurrences/i.test(o)) ?? item.options[0]
      } else if (item.id === "recurrence_occurrence_count") {
        next[item.id] = existingCount > 0 ? String(existingCount) : ""
      } else if (item.type === "dropdown" && item.options?.length) {
        next[item.id] = item.options[0]
      } else if (item.type === "checkbox") {
        next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      } else {
        next[item.id] = ""
      }
    }
    setSeriesRecurrenceValues(next)
  }, [selectedEvent?.id, showRecurringRemoveChoices, addItemPortalItems, events, selectedLegacyRecurringIds])

  const isOfficeManagerOrAdmin = isOfficeManagerLikeRole(authRole)
  const canAssignToTeam = selectableUsers.length > 1 || isOfficeManagerOrAdmin
  const showTeamManagementEntry = isOfficeManagerOrAdmin
  const managedSchedulingToolsEnabled =
    managedByOfficeManager && (managedSelfPolicy.advanced_scheduling_tools === true || managedSelfPolicy.scheduling_tools === true)
  const showSchedulingToolsStandalone =
    authRole === "user" && !isOfficeManagerOrAdmin && (!managedByOfficeManager || managedSchedulingToolsEnabled)
  const showAddOnMainCalendar = showCalAddItem && (!managedByOfficeManager || managedSelfPolicy.allow_add_to_calendar !== false)
  const showManagedJobTypesEntry =
    managedByOfficeManager && authRole === "user" && showCalJobTypes && managedSelfPolicy.job_types_access !== "off" && !managedSchedulingToolsEnabled

  const canAccessCustomerMap =
    Boolean(authUserId) &&
    (sandboxTraining ||
      isOfficeManagerOrAdmin ||
      !managedByOfficeManager ||
      managedSelfPolicy.customer_map_access === true)

  const canAccessTeamMap =
    isOfficeManagerOrAdmin && (teamMapUserIds.length > 0 || (sandboxTraining && teamMapMembers.some((m) => m.isDemo)))

  const canOpenUnifiedMap = canAccessCustomerMap || canAccessTeamMap

  useEffect(() => {
    if (!supabase || !calendarDbUserId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", calendarDbUserId).maybeSingle()
      if (cancelled) return
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const raw = meta.job_type_ui_v1
      const map: Record<string, string> = {}
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [jtId, val] of Object.entries(raw as Record<string, unknown>)) {
          if (val && typeof val === "object" && !Array.isArray(val)) {
            const iconId = (val as { iconId?: unknown }).iconId
            if (typeof iconId === "string" && iconId && iconId !== "none") map[jtId] = iconId
          }
        }
      }
      setJobTypeIconById(map)
    })()
    return () => {
      cancelled = true
    }
  }, [calendarDbUserId])

  useEffect(() => {
    if (!eventCtxMenu) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEventCtxMenu(null)
    }
    function onPointer(e: PointerEvent) {
      if (Date.now() < ignoreEventCtxCloseUntilRef.current) return
      if (eventCtxMenuRef.current?.contains(e.target as Node)) return
      setEventCtxMenu(null)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointer, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointer, true)
    }
  }, [eventCtxMenu])

  useLayoutEffect(() => {
    if (!eventCtxMenu) {
      setEventCtxMenuPos(null)
      return
    }
    const pad = 8
    const el = eventCtxMenuRef.current
    const w = el?.offsetWidth || 300
    const h = el?.offsetHeight || 380
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = eventCtxMenu.x
    let top = eventCtxMenu.y
    if (left + w > vw - pad) left = Math.max(pad, vw - w - pad)
    if (top + h > vh - pad) top = Math.max(pad, eventCtxMenu.y - h)
    if (top < pad) top = pad
    if (left < pad) left = pad
    setEventCtxMenuPos({ left, top })
  }, [eventCtxMenu])

  useEffect(() => {
    if (!sandboxTraining || !supabase || !calendarDbUserId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from("profiles").select("metadata").eq("id", calendarDbUserId).maybeSingle()
      if (cancelled) return
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      let locs = parseSandboxDemoLocations(meta[SANDBOX_DEMO_LOCATIONS_META_KEY])
      if (Object.keys(locs).length === 0) {
        locs = buildDefaultSandboxDemoLocations(parseSandboxDemoTeam(meta.sandbox_demo_team))
      }
      setSandboxDemoLocations(locs)
    })()
    return () => {
      cancelled = true
    }
  }, [sandboxTraining, calendarDbUserId])

  const customerMapMembers = useMemo(() => {
    if (isOfficeManagerOrAdmin && teamMapUserIds.length > 0) return teamMapMembers
    const uid = calendarDbUserId || authUserId
    if (!uid) return []
    return [{ userId: uid, label: "My jobs on map" }]
  }, [isOfficeManagerOrAdmin, teamMapUserIds.length, teamMapMembers, calendarDbUserId, authUserId])

  const customerMapJobUserIds = useMemo(() => {
    if (isOfficeManagerOrAdmin && teamMapUserIds.length > 0) return teamMapUserIds
    const uid = calendarDbUserId || authUserId
    return uid ? [uid] : []
  }, [isOfficeManagerOrAdmin, teamMapUserIds, calendarDbUserId, authUserId])

  const unifiedMapMembers = useMemo(() => {
    if (teamMapMembers.length > 0) return teamMapMembers
    return customerMapMembers
  }, [teamMapMembers, customerMapMembers])

  useEffect(() => {
    if (calendarSuite.id !== "scheduling_tools" || !managedByOfficeManager || isOfficeManagerOrAdmin || sandboxTraining) return
    const toolsOn = managedSelfPolicy.advanced_scheduling_tools === true || managedSelfPolicy.scheduling_tools === true
    if (!toolsOn) {
      setCalendarSuite({ id: "calendar" })
      return
    }
    if (calendarSuite.panel === "job_types" && managedSelfPolicy.job_types_access === "off") {
      if (managedSelfPolicy.customer_map_access === true) setCalendarSuite({ id: "scheduling_tools", panel: "customer_map" })
      else setCalendarSuite({ id: "calendar" })
      return
    }
    if (calendarSuite.panel === "customer_map" && managedSelfPolicy.customer_map_access !== true) {
      setCalendarSuite({ id: "calendar" })
    }
  }, [calendarSuite, managedByOfficeManager, managedSelfPolicy, isOfficeManagerOrAdmin, sandboxTraining])

  useEffect(() => {
    if (!managedByOfficeManager || !supabase || !authUserId) return
    const viewAsDemoId =
      scopeCtx?.selectedUserId && isSandboxDemoUserId(scopeCtx.selectedUserId) ? scopeCtx.selectedUserId : null
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", authUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (viewAsDemoId) {
          setManagedSelfPolicy(resolveDemoTeamPolicyFromOwnerMetadata(data?.metadata, viewAsDemoId))
          return
        }
        setManagedSelfPolicy(parseOmCalendarPolicy(data?.metadata))
      })
    return () => {
      cancelled = true
    }
  }, [managedByOfficeManager, supabase, authUserId, scopeCtx?.selectedUserId])

  useEffect(() => {
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
  }, [jobTypesPortalItems])

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
  const [gridEventDrag, setGridEventDrag] = useState<GridEventDragState | null>(null)
  const [monthEventDrag, setMonthEventDrag] = useState<MonthEventDragState | null>(null)
  const eventCtxMenuRef = useRef<HTMLDivElement | null>(null)
  const [eventCtxMenuPos, setEventCtxMenuPos] = useState<{ left: number; top: number } | null>(null)
  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const skipNextColumnClickRef = useRef(false)
  const gridTimeParamsRef = useRef({ dayViewStartHour: DAY_START_HOUR, timeIncrement: 15 as 15 | 60 })
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
  const completeFlowLegacyIds = useMemo(() => {
    if (!completeFlowEvent) return null
    return legacyRecurringCohortIds(completeFlowEvent, events, userId)
  }, [completeFlowEvent, events, userId])
  const completeFlowSeriesCount = useMemo(() => {
    if (!completeFlowEvent) return 0
    if (completeFlowEvent.recurrence_series_id) {
      return events.filter((e) => e.recurrence_series_id === completeFlowEvent.recurrence_series_id && !e.removed_at).length
    }
    return completeFlowLegacyIds && completeFlowLegacyIds.length >= 2 ? completeFlowLegacyIds.length : 0
  }, [completeFlowEvent, events, completeFlowLegacyIds])
  const [receiptEmailCustomer, setReceiptEmailCustomer] = useState(false)
  const [receiptSmsCustomer, setReceiptSmsCustomer] = useState(false)
  const [receiptEmailSelf, setReceiptEmailSelf] = useState(false)
  const [completeBusy, setCompleteBusy] = useState(false)
  const [calendarEventActionBusy, setCalendarEventActionBusy] = useState(false)
  const [calendarShareBusy, setCalendarShareBusy] = useState(false)
  const [calendarShareMsg, setCalendarShareMsg] = useState<string | null>(null)
  const [completeCustomerEmail, setCompleteCustomerEmail] = useState<string | null>(null)
  const [completeCustomerPhone, setCompleteCustomerPhone] = useState<string | null>(null)
  const [completeCompletionNote, setCompleteCompletionNote] = useState("")
  /** When true, mark every occurrence in the recurrence (same series id or legacy cohort) complete. */
  const [completeEntireSeries, setCompleteEntireSeries] = useState(false)
  const [calendarEventEntityRows, setCalendarEventEntityRows] = useState<EntityAttachmentRow[]>([])
  const [calendarEventEntityUploadBusy, setCalendarEventEntityUploadBusy] = useState(false)
  const [receiptPdfBusy, setReceiptPdfBusy] = useState(false)
  const [addItemPortalValues, setAddItemPortalValues] = useState<Record<string, string>>({})
  const [seriesRecurrenceValues, setSeriesRecurrenceValues] = useState<Record<string, string>>({})
  const [seriesRecurrenceSaving, setSeriesRecurrenceSaving] = useState(false)
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
      .eq("id", calendarDbUserId)
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
    const { data: row, error: loadErr } = await supabase.from("profiles").select("metadata").eq("id", calendarDbUserId).maybeSingle()
    if (loadErr) {
      alert(loadErr.message)
      return
    }
    const prevMeta =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    prevMeta.calendarCompletionValues = { ...completionSettingsFormValues }
    const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", calendarDbUserId)
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
      const { data } = await supabase.from("profiles").select("document_template_receipt, metadata").eq("id", calendarDbUserId).maybeSingle()
      if (cancelled) return
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const itemize = meta.receipt_template_itemize === true
      const rateRaw = meta.receipt_mileage_rate_per_mile
      const rateStr =
        typeof rateRaw === "number" && Number.isFinite(rateRaw)
          ? String(rateRaw)
          : typeof rateRaw === "string"
            ? rateRaw
            : ""
      const rateNum = rateStr ? Number.parseFloat(rateStr.replace(/[^0-9.]/g, "")) : Number.NaN
      const includeMileageExplicit = meta.receipt_template_include_mileage
      const includeMileage =
        includeMileageExplicit === true ||
        (includeMileageExplicit !== false && itemize && Number.isFinite(rateNum) && rateNum > 0)
      const notes = String((data as { document_template_receipt?: string | null })?.document_template_receipt ?? "")
      const intro = typeof meta.receipt_template_intro === "string" ? meta.receipt_template_intro : ""
      const showRecLogo = meta.receipt_template_show_logo === true
      const recLogoUrl = typeof meta.receipt_template_logo_url === "string" ? meta.receipt_template_logo_url : ""
      const estLogoUrl = typeof meta.estimate_template_logo_url === "string" ? meta.estimate_template_logo_url : ""
      const receiptLogoFieldUrl = (recLogoUrl.trim() || estLogoUrl.trim()).trim()
      const carryEst = meta.receipt_template_carry_from_estimate === true
      const next: Record<string, string> = {}
      const items = receiptTemplateItems.length > 0 ? receiptTemplateItems : [...DEFAULT_RECEIPT_TEMPLATE_ITEMS]
      for (const item of items) {
        if (item.id === "receipt_template_notes") next[item.id] = notes
        else if (item.id === "receipt_template_itemize") next[item.id] = itemize ? "checked" : "unchecked"
        else if (item.id === "receipt_template_include_mileage") next[item.id] = includeMileage ? "checked" : "unchecked"
        else if (item.id === "receipt_template_mileage_rate") next[item.id] = rateStr
        else if (item.id === "receipt_template_intro") next[item.id] = intro
        else if (item.id === "receipt_template_show_logo") next[item.id] = showRecLogo ? "checked" : "unchecked"
        else if (item.id === "receipt_template_logo_url") next[item.id] = receiptLogoFieldUrl
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
    const itemize = receiptTemplateFormValues.receipt_template_itemize === "checked"
    const includeMileage = receiptTemplateFormValues.receipt_template_include_mileage === "checked"
    const rateField = (receiptTemplateFormValues.receipt_template_mileage_rate ?? "").trim().replace(/[^0-9.]/g, "")
    const rateNum = rateField ? Number.parseFloat(rateField) : Number.NaN
    const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", calendarDbUserId).maybeSingle()
    if (fetchErr) {
      alert(fetchErr.message)
      return
    }
    const prevMeta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? { ...(data.metadata as Record<string, unknown>) }
        : {}
    prevMeta.receipt_template_itemize = itemize
    prevMeta.receipt_template_include_mileage = includeMileage
    if (includeMileage && Number.isFinite(rateNum) && rateNum >= 0) prevMeta.receipt_mileage_rate_per_mile = rateNum
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
    const estUrlForLogo =
      typeof prevMeta.estimate_template_logo_url === "string" ? prevMeta.estimate_template_logo_url.trim() : ""
    if (logoTrim && logoTrim !== estUrlForLogo) prevMeta.receipt_template_logo_url = logoTrim
    else delete prevMeta.receipt_template_logo_url
    const { error } = await supabase
      .from("profiles")
      .update({
        document_template_receipt: notes || null,
        metadata: prevMeta,
      })
      .eq("id", calendarDbUserId)
    if (error) {
      alert(error.message)
      return
    }
    setShowReceiptTemplateModal(false)
  }

  async function loadEvents() {
    if (!userId || !supabase) return
    const client = supabase
    const orgUserIds = filterRealUserIds(
      Array.from(new Set((scopeCtx?.clients ?? []).map((c) => c.userId).filter(Boolean))),
    )
    const canViewOrgEvents = showAllOrgEvents && orgUserIds.length > 0
    const scopedCalendarUserIds =
      orgUserIds.length > 0 ? orgUserIds : calendarDbUserId ? [calendarDbUserId] : []
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
      canViewOrgEvents
        ? baseQuery(selectStr).in("user_id", scopedCalendarUserIds)
        : baseQuery(selectStr).eq("user_id", calendarDbUserId)

    const selectTiers = [
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, materials_list, mileage_miles, metadata, customers ( display_name, service_address, service_lat, service_lng ), job_types ( id, name, materials_list, color_hex, duration_minutes, description, track_mileage )",
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
        em.includes("service_address") ||
        em.includes("service_lat") ||
        em.includes("service_lng") ||
        (em.includes("column") && em.includes("does not exist"))
      if (!retry) {
        if (!shouldSuppressSandboxTrainingError(sandboxTraining, error.message, "calendar_load")) {
          setLoadError(error.message)
        } else {
          console.info("[sandbox-training] calendar load:", error.message)
        }
        setEvents([])
        return
      }
    }

    const fallbackMsg = lastErr?.message ?? "Could not load calendar events."
    if (!shouldSuppressSandboxTrainingError(sandboxTraining, fallbackMsg, "calendar_load")) {
      setLoadError(fallbackMsg)
    } else {
      console.info("[sandbox-training] calendar load:", fallbackMsg)
    }
    setEvents([])
  }

  async function invokeNotifyCalendarStatus(calendarEventIds: string[], previousStatus: string, newStatus: string) {
    if (!supabase || calendarEventIds.length === 0) return
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    const { error } = await supabase.functions.invoke("notify-calendar-status", {
      body: { calendarEventIds, previousStatus, newStatus },
    })
    if (error) console.warn("notify-calendar-status:", error.message)
  }

  /** Loads upcoming jobs for the next 60 days — not limited to the current calendar grid view. */
  async function fetchUpcomingJobsForPhoneCalendar(): Promise<
    { ok: true; rows: CalendarIcsRow[] } | { ok: false; error: string }
  > {
    if (!supabase || !userId) return { ok: true, rows: [] }
    const client = supabase
    const now = new Date()
    const horizon = new Date(now.getTime() + 60 * 86400000)

    const buildQuery = (select: string, filterCompleted: boolean) => {
      let q = client
        .from("calendar_events")
        .select(select)
        .eq("user_id", calendarDbUserId)
        .is("removed_at", null)
        .gte("start_at", now.toISOString())
        .lte("start_at", horizon.toISOString())
        .order("start_at")
        .limit(120)
      if (filterCompleted) q = q.is("completed_at", null)
      return q
    }

    let select = "id, title, start_at, end_at, notes, completed_at"
    let { data, error } = await buildQuery(select, hasCompletedAtColumn)

    const errMsg = (error?.message ?? "").toLowerCase()
    if (error && (errMsg.includes("completed_at") || (errMsg.includes("column") && errMsg.includes("does not exist")))) {
      select = "id, title, start_at, end_at, notes"
      const r = await buildQuery(select, false)
      data = r.data
      error = r.error
    }

    if (error) {
      console.warn("Phone calendar export query:", error.message)
      return { ok: false, error: error.message }
    }

    const raw = data ?? []
    const rows = (Array.isArray(raw) ? raw : []) as unknown as Array<{
      id: string
      title: string
      start_at: string
      end_at: string
      notes?: string | null
      completed_at?: string | null
    }>

    return {
      ok: true,
      rows: rows
        .filter((e) => !e.completed_at)
        .map((e) => ({
          id: e.id,
          title: e.title,
          start_at: e.start_at,
          end_at: e.end_at,
          notes: e.notes ?? null,
        })),
    }
  }

  async function shareActiveJobsToDeviceCalendar() {
    if (!userId || !supabase) return
    setCalendarShareMsg(null)
    setCalendarShareBusy(true)
    try {
      const fetched = await fetchUpcomingJobsForPhoneCalendar()
      if (!fetched.ok) {
        setCalendarShareMsg(`Could not load jobs: ${fetched.error}`)
        return
      }
      if (fetched.rows.length === 0) {
        setCalendarShareMsg("No active upcoming jobs in the next 60 days to export.")
        return
      }
      const r = await shareCalendarEventsToDevice(fetched.rows)
      setCalendarShareMsg(r.message || (r.ok ? "Done." : "Could not export."))
      if (!r.ok) alert(r.message || "Could not export calendar.")
    } finally {
      setCalendarShareBusy(false)
    }
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
        const target = readContactTargetFromMetadata(ev.metadata)
        const picked = resolveCustomerContactByTarget(rows, target)
        setCompleteCustomerEmail(picked.email || null)
        setCompleteCustomerPhone(picked.phone || null)
      })
  }, [completeFlowEvent?.id, completeFlowEvent?.customer_id, completeFlowEvent?.user_id, userId])

  async function confirmCompleteCalendarEvent() {
    if (!supabase || !completeFlowEvent?.id) return
    const sb = supabase
    const ownerUserId = completeFlowEvent.user_id ?? userId
    let itemize = false
    let includeMileage = false
    let mileageRatePerMile = 0
    if (ownerUserId) {
      const { data: prof } = await sb
        .from("profiles")
        .select("metadata")
        .eq("id", ownerUserId)
        .maybeSingle()
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
      const includeMileageExplicit = meta.receipt_template_include_mileage
      includeMileage =
        includeMileageExplicit === true ||
        (includeMileageExplicit !== false && itemize && mileageRatePerMile > 0)
    }
    const bodyBase = await buildCalendarReceiptBodyText(sb, completeFlowEvent, {
      itemizeMaterials: itemize,
      mileageRatePerMile: includeMileage && mileageRatePerMile > 0 ? mileageRatePerMile : null,
    })
    const note = completeCompletionNote.trim()
    const body = note ? `${bodyBase}\n\nCompletion note:\n${note}` : bodyBase
    let receiptPdfInline: { filename: string; content: string } | undefined
    try {
      setReceiptPdfBusy(true)
      const prior = completeFlowEvent
      const evForPdf = prior
      const profileUserId = evForPdf.user_id ?? userId
      let templateHeader: string | null = null
      let templateFooter: string | null = null
      let receiptBusinessLabel = "Receipt"
      let logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>> = null
      if (profileUserId) {
        const { data: prof } = await sb
          .from("profiles")
          .select("metadata, document_template_receipt, display_name")
          .eq("id", profileUserId)
          .maybeSingle()
        const foot = (prof as { document_template_receipt?: string | null } | null)?.document_template_receipt
        templateFooter = typeof foot === "string" && foot.trim() ? foot.trim() : null
        const dn = (prof as { display_name?: string | null } | null)?.display_name
        if (typeof dn === "string" && dn.trim()) receiptBusinessLabel = dn.trim()
        const meta =
          prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
            ? (prof.metadata as Record<string, unknown>)
            : {}
        const introRaw = meta.receipt_template_intro
        templateHeader = typeof introRaw === "string" && introRaw.trim() ? introRaw.trim() : null
        if (meta.receipt_template_show_logo === true) {
          const u = resolveReceiptTemplateLogoUrl(meta)
          if (u) logo = await fetchQuoteLogoForExport(u)
        }
      }
      const receiptMeta = parseCalendarEventReceiptMeta(evForPdf.metadata)
      const miles =
        evForPdf.mileage_miles != null && Number.isFinite(Number(evForPdf.mileage_miles)) && Number(evForPdf.mileage_miles) > 0
          ? Number(evForPdf.mileage_miles)
          : 0
      const sections = await buildCalendarReceiptPdfSections(sb, {
        quote_id: evForPdf.quote_id,
        materials_list: evForPdf.materials_list,
        job_types: evForPdf.job_types ?? null,
        start_at: evForPdf.start_at,
        end_at: evForPdf.end_at,
        receiptMeta,
        itemizeMaterials: itemize,
        mileageMiles: miles > 0 ? miles : null,
        mileageRatePerMile: includeMileage && mileageRatePerMile > 0 ? mileageRatePerMile : null,
      })
      const mileageCostInItemized = includeMileage && miles > 0 && mileageRatePerMile > 0
      const mileageLabel = miles > 0 && !mileageCostInItemized ? `Mileage: ${miles} mi` : null
      const amount =
        sections.lineSubtotal != null
          ? `Total: $${sections.lineSubtotal.toFixed(2)}`
          : evForPdf.quote_total != null && evForPdf.quote_total > 0
            ? `Quote total: $${Number(evForPdf.quote_total).toFixed(2)}`
            : null
      const pdfBytes = await buildReceiptPdfBytes({
        businessLabel: receiptBusinessLabel,
        customerName: evForPdf.customers?.display_name ?? "Customer",
        jobTitle: evForPdf.title,
        completedAtLabel: new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
        amountLabel: amount,
        templateHeader,
        logo,
        templateFooter,
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
        sandboxWatermark: sandboxTraining,
      })
      if (pdfBytes.length > 0 && pdfBytes.length <= 2_500_000) {
        receiptPdfInline = {
          filename: `receipt-${evForPdf.id.slice(0, 8)}.pdf`,
          content: uint8ArrayToBase64(pdfBytes),
        }
      }
    } catch {
      receiptPdfInline = undefined
    } finally {
      setReceiptPdfBusy(false)
    }

    const actingId = authUserId || userId
    const isAssignedUserCompleting = actingId === ownerUserId
    const workerMay = calendarCompletionProfile.calendar_completion_worker_may_message_customer === "checked"
    if (isAssignedUserCompleting && !workerMay && (receiptEmailCustomer || receiptSmsCustomer)) {
      alert(
        "Your office has not allowed assigned users to send receipts directly to customers. Ask your office manager to enable it under Scheduling -> Job completion, or complete without customer email/SMS.",
      )
      return
    }

    setCompleteBusy(true)
    const completedIso = new Date().toISOString()

    const seriesIds: string[] = (() => {
      if (!completeEntireSeries) return [completeFlowEvent.id]
      if (completeFlowEvent.recurrence_series_id) {
        return events
          .filter((e) => e.recurrence_series_id === completeFlowEvent.recurrence_series_id && !e.removed_at)
          .map((e) => e.id)
      }
      const leg = completeFlowLegacyIds
      return leg && leg.length >= 2 ? [...leg] : [completeFlowEvent.id]
    })()

    const { data: metaRows, error: metaSelErr } = await sb.from("calendar_events").select("id, metadata").in("id", seriesIds)
    if (metaSelErr) {
      setCompleteBusy(false)
      alert(metaSelErr.message)
      return
    }
    if ((metaRows?.length ?? 0) !== seriesIds.length) {
      setCompleteBusy(false)
      alert(
        "Could not load every occurrence in this series to mark complete (permissions or calendar range). Complete one occurrence at a time, or widen the calendar view and try again.",
      )
      return
    }
    for (const row of metaRows ?? []) {
      const nextMeta = mergeCompletionMetadata((row as { metadata?: unknown }).metadata, note)
      const { error: upErr } = await sb.from("calendar_events").update({ completed_at: completedIso, metadata: nextMeta }).eq("id", (row as { id: string }).id)
      if (upErr) {
        setCompleteBusy(false)
        alert(upErr.message)
        return
      }
    }

    const prevCalStatus = calendarEventEffectiveStatus(completeFlowEvent)
    void invokeNotifyCalendarStatus(seriesIds, prevCalStatus, "Completed")

    const sendErrs: string[] = []
    const postOutbound = async (channel: "email" | "sms", payload: Record<string, unknown>) => {
      const { data: sessionData } = await sb.auth.getSession()
      const token = sessionData.session?.access_token
      return fetch(`/api/outbound-messages?__channel=${channel}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: outboundMessagesJsonBody(payload),
      })
    }
    try {
      if (receiptEmailCustomer) {
        if (!completeCustomerEmail) {
          sendErrs.push("No customer email on file.")
        } else {
          const res = await postOutbound("email", {
            userId: ownerUserId,
            customerId: completeFlowEvent.customer_id ?? undefined,
            to: completeCustomerEmail,
            subject: `Receipt: ${completeFlowEvent.title}`,
            body,
            ...(receiptPdfInline ? { attachments: [receiptPdfInline], requireAttachments: true } : {}),
          })
          const raw = await res.text()
          if (!res.ok) sendErrs.push(formatOutboundError(raw))
        }
      }
      if (receiptSmsCustomer) {
        if (!completeCustomerPhone?.trim()) {
          sendErrs.push("No customer phone on file.")
        } else {
          const res = await postOutbound("sms", {
            userId: ownerUserId,
            customerId: completeFlowEvent.customer_id ?? undefined,
            to: completeCustomerPhone.trim(),
            body,
          })
          const raw = await res.text()
          if (!res.ok) sendErrs.push(formatOutboundError(raw))
        }
      }
      if (receiptEmailSelf) {
        const selfEmail = authUser?.email
        if (!selfEmail) sendErrs.push("Your account has no email for “send receipt to myself”.")
        else {
          const res = await postOutbound("email", {
            userId: ownerUserId,
            to: selfEmail,
            subject: `Receipt copy: ${completeFlowEvent.title}`,
            body,
            ...(receiptPdfInline ? { attachments: [receiptPdfInline], requireAttachments: true } : {}),
          })
          const raw = await res.text()
          if (!res.ok) sendErrs.push(formatOutboundError(raw))
        }
      }
    } catch (e) {
      sendErrs.push(e instanceof Error ? e.message : String(e))
    }

    setCompleteBusy(false)
    if (sendErrs.length) {
      sandboxTrainingAlert(
        sandboxTraining,
        `Job marked complete${completeEntireSeries ? " (entire series)" : ""}. Sending notes:\n${sendErrs.join("\n")}\n\n` +
          "To send email from Tradesman, set RESEND_API_KEY and RESEND_FROM_EMAIL on your Vercel project (Environment Variables).",
        "communication",
      )
    }
    setCompleteEntireSeries(false)
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
      let includeMileage = false
      let mileageRatePerMile = 0
      let templateHeader: string | null = null
      let templateFooter: string | null = null
      let receiptBusinessLabel = "Receipt"
      let logo: Awaited<ReturnType<typeof fetchQuoteLogoForExport>> = null
      if (profileUserId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("metadata, document_template_receipt, display_name")
          .eq("id", profileUserId)
          .maybeSingle()
        const foot = (prof as { document_template_receipt?: string | null } | null)?.document_template_receipt
        templateFooter = typeof foot === "string" && foot.trim() ? foot.trim() : null
        const dn = (prof as { display_name?: string | null } | null)?.display_name
        if (typeof dn === "string" && dn.trim()) receiptBusinessLabel = dn.trim()
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
        const includeMileageExplicit = meta.receipt_template_include_mileage
        includeMileage =
          includeMileageExplicit === true ||
          (includeMileageExplicit !== false && itemize && mileageRatePerMile > 0)
        const introRaw = meta.receipt_template_intro
        templateHeader = typeof introRaw === "string" && introRaw.trim() ? introRaw.trim() : null
        if (meta.receipt_template_show_logo === true) {
          const u = resolveReceiptTemplateLogoUrl(meta)
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
        mileageRatePerMile: includeMileage && mileageRatePerMile > 0 ? mileageRatePerMile : null,
      })
      const mileageCostInItemized = includeMileage && miles > 0 && mileageRatePerMile > 0
      const mileageLabel =
        miles > 0 && !mileageCostInItemized ? `Mileage: ${miles} mi` : null
      const customerName = ev.customers?.display_name ?? "Customer"
      const amount =
        sections.lineSubtotal != null
          ? `Total: $${sections.lineSubtotal.toFixed(2)}`
          : ev.quote_total != null && ev.quote_total > 0
            ? `Quote total: $${Number(ev.quote_total).toFixed(2)}`
            : null
      const bytes = await buildReceiptPdfBytes({
        businessLabel: receiptBusinessLabel,
        customerName,
        jobTitle: ev.title,
        completedAtLabel: new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
        amountLabel: amount,
        templateHeader,
        logo,
        templateFooter,
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
        sandboxWatermark: sandboxTraining,
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

  function applyJobTypeToAddForm(jobTypeId: string) {
    const jt = jobTypes.find((j) => j.id === jobTypeId)
    if (!jt) {
      setAddMileage("")
      return
    }
    const start = parseLocalDateTime(addStartDate, addStartTime)
    const working = readCalendarWorkingHoursFromStorage()
    const mins = durationMinutesFromJobType(jt.duration_minutes, timeIncrement, {
      start: Number.isNaN(start.getTime()) ? undefined : start,
      workingStart: working.enabled ? working.start : undefined,
      workingEnd: working.enabled ? working.end : undefined,
    })
    setAddDurationStr(formatDurationFieldFromMinutes(mins, timeIncrement))
    if (!jt.track_mileage) setAddMileage("")
  }

  async function saveEventJobType(jobTypeId: string | null, jtOverride?: JobType | null) {
    if (!supabase || !selectedEvent?.id) return
    setEventJobTypeSaving(true)
    const jt =
      jtOverride !== undefined
        ? jtOverride
        : jobTypeId
          ? (jobTypes.find((j) => j.id === jobTypeId) ?? null)
          : null
    const { error } = await supabase
      .from("calendar_events")
      .update({ job_type_id: jobTypeId })
      .eq("id", selectedEvent.id)
    setEventJobTypeSaving(false)
    if (error) {
      alert(error.message ?? String(error))
      return
    }
    setSelectedEvent((prev) =>
      prev && prev.id === selectedEvent.id ? { ...prev, job_type_id: jobTypeId, job_types: jt } : prev,
    )
    loadEvents()
  }

  async function saveEventSchedule() {
    if (!supabase || !selectedEvent?.id) return
    setEventScheduleError("")
    const start = parseLocalDateTime(eventEditStartDate, eventEditStartTime)
    if (Number.isNaN(start.getTime())) {
      setEventScheduleError("Enter a valid date and time.")
      return
    }
    const addMinRaw = parseDurationFieldToMinutes(eventEditDurationStr, timeIncrement)
    if (addMinRaw == null) {
      setEventScheduleError("Enter a valid duration.")
      return
    }
    const working = readCalendarWorkingHoursFromStorage()
    const addMin = clampAppointmentDurationMinutes(addMinRaw, {
      start,
      workingStart: working.enabled ? working.start : undefined,
      workingEnd: working.enabled ? working.end : undefined,
    })
    const end = new Date(start.getTime() + addMin * 60 * 1000)
    const eventOwnerUserId = resolveSandboxDataUserId(selectedEvent.user_id ?? userId, authUserId || userId)
    if (!eventOwnerUserId) return

    if (readCalendarNoDuplicateTimesSetting()) {
      try {
        const conflicts = await findCalendarScheduleConflicts(supabase, {
          userId: eventOwnerUserId,
          ranges: [{ s: start, e: end }],
          excludeEventIds: [selectedEvent.id],
        })
        if (conflicts.length > 0 && !confirmCalendarOverlapSave(conflicts)) {
          setEventScheduleError(
            "This time overlaps another appointment. Choose a different slot or confirm save anyway when prompted.",
          )
          return
        }
      } catch (e) {
        setEventScheduleError(e instanceof Error ? e.message : String(e))
        return
      }
    }

    setEventScheduleSaving(true)
    const startIso = start.toISOString()
    const endIso = end.toISOString()
    const { data, error } = await supabase
      .from("calendar_events")
      .update({ start_at: startIso, end_at: endIso })
      .eq("id", selectedEvent.id)
      .select("id")
    setEventScheduleSaving(false)
    if (error) {
      setEventScheduleError(error.message ?? String(error))
      return
    }
    if (!data?.length) {
      setEventScheduleError("Could not save — this event may no longer be editable.")
      return
    }
    setSelectedEvent((prev) =>
      prev && prev.id === selectedEvent.id ? { ...prev, start_at: startIso, end_at: endIso } : prev,
    )
    if (eventScheduleDirty && selectedEvent.customer_id && (rescheduleNotifyEmail || rescheduleNotifySms)) {
      const ownerUserId = resolveSandboxDataUserId(selectedEvent.user_id ?? userId, authUserId || userId)
      const notifyErrs = await sendCustomerAppointmentNotify({
        customerId: selectedEvent.customer_id,
        eventId: selectedEvent.id,
        notifyEmail: rescheduleNotifyEmail,
        notifySms: rescheduleNotifySms,
        kind: "reschedule",
        title: selectedEvent.title?.trim() || "Your appointment",
        startIso,
        ownerUserId: ownerUserId || userId,
      })
      if (notifyErrs.length > 0) {
        alert(`Schedule saved, but could not notify the customer:\n${notifyErrs.join("\n")}`)
      }
      setRescheduleNotifyEmail(false)
      setRescheduleNotifySms(false)
    }
    loadEvents()
  }

  async function saveEventNotes() {
    if (!supabase || !selectedEvent?.id) return
    setEventNotesSaving(true)
    const notes = eventNotesDraft.trim() || null
    const { data, error } = await supabase
      .from("calendar_events")
      .update({ notes })
      .eq("id", selectedEvent.id)
      .select("id")
    setEventNotesSaving(false)
    if (error) {
      alert(error.message ?? String(error))
      return
    }
    if (!data?.length) {
      alert("Could not save notes — this event may no longer be editable.")
      return
    }
    setSelectedEvent((prev) => (prev && prev.id === selectedEvent.id ? { ...prev, notes } : prev))
    loadEvents()
  }

  async function removeCalendarEventWithOptionalNotify(event: CalendarEvent, removeFn: () => Promise<void>) {
    if (event.customer_id && (removeNotifyEmail || removeNotifySms)) {
      const ownerUserId = resolveSandboxDataUserId(event.user_id ?? userId, authUserId || userId)
      const notifyErrs = await sendCustomerAppointmentNotify({
        customerId: event.customer_id,
        eventId: event.id,
        notifyEmail: removeNotifyEmail,
        notifySms: removeNotifySms,
        kind: "cancel",
        title: event.title?.trim() || "Your appointment",
        startIso: event.start_at,
        ownerUserId: ownerUserId || userId,
      })
      if (notifyErrs.length > 0) {
        const proceed = window.confirm(
          `Could not verify customer contact for cancellation notice:\n${notifyErrs.join("\n")}\n\nRemove the event anyway?`,
        )
        if (!proceed) return
      }
    }
    await removeFn()
    setRemoveNotifyEmail(false)
    setRemoveNotifySms(false)
  }

  async function commitEventTimeChange(ev: CalendarEvent, newStart: Date, durationMs: number): Promise<boolean> {
    if (!supabase) return false
    const working = readCalendarWorkingHoursFromStorage()
    const addMin = clampAppointmentDurationMinutes(Math.max(15, Math.round(durationMs / 60000)), {
      start: newStart,
      workingStart: working.enabled ? working.start : undefined,
      workingEnd: working.enabled ? working.end : undefined,
    })
    const end = new Date(newStart.getTime() + addMin * 60 * 1000)
    const eventOwnerUserId = resolveSandboxDataUserId(ev.user_id ?? userId, authUserId || userId)
    if (!eventOwnerUserId) return false

    if (readCalendarNoDuplicateTimesSetting()) {
      try {
        const conflicts = await findCalendarScheduleConflicts(supabase, {
          userId: eventOwnerUserId,
          ranges: [{ s: newStart, e: end }],
          excludeEventIds: [ev.id],
        })
        if (conflicts.length > 0 && !confirmCalendarOverlapSave(conflicts)) return false
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
        return false
      }
    }

    const notifyPrefs = readCalendarCustomerNotifyPrefs(ev.metadata)
    let shouldNotifyEmail = false
    let shouldNotifySms = false
    if (ev.customer_id && notifyPrefs) {
      const choice = await new Promise<"yes" | "no" | "cancel">((resolve) => {
        dragNotifyResolverRef.current = resolve
        setDragNotifyPrompt({
          event: ev,
          newStart,
          durationMs,
          notifyEmail: notifyPrefs.email,
          notifySms: notifyPrefs.sms,
        })
      })
      setDragNotifyPrompt(null)
      dragNotifyResolverRef.current = null
      if (choice === "cancel") {
        return false
      }
      if (choice === "yes") {
        shouldNotifyEmail = notifyPrefs.email
        shouldNotifySms = notifyPrefs.sms
      }
    }

    const startIso = newStart.toISOString()
    const endIso = end.toISOString()
    const { data, error } = await supabase
      .from("calendar_events")
      .update({ start_at: startIso, end_at: endIso })
      .eq("id", ev.id)
      .select("id")
    if (error) {
      alert(error.message ?? String(error))
      return false
    }
    if (!data?.length) {
      alert("Could not move this event — it may no longer be editable.")
      return false
    }
    if (selectedEvent?.id === ev.id) {
      setSelectedEvent((prev) => (prev && prev.id === ev.id ? { ...prev, start_at: startIso, end_at: endIso } : prev))
    }
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, start_at: startIso, end_at: endIso } : e)))

    if (ev.customer_id && (shouldNotifyEmail || shouldNotifySms)) {
      const notifyErrs = await sendCustomerAppointmentNotify({
        customerId: ev.customer_id,
        eventId: ev.id,
        notifyEmail: shouldNotifyEmail,
        notifySms: shouldNotifySms,
        kind: "reschedule",
        title: ev.title?.trim() || "Your appointment",
        startIso,
        ownerUserId: eventOwnerUserId,
      })
      if (notifyErrs.length > 0) {
        alert(`Schedule saved, but could not notify the customer:\n${notifyErrs.join("\n")}`)
      }
    }

    loadEvents()
    return true
  }

  async function updateSeriesRecurrence() {
    if (!supabase || !selectedEvent?.id) return
    let series = resolveRecurrenceFromPortal(addItemPortalItems, seriesRecurrenceValues)
    if (!series) {
      alert("Turn on recurring and choose a frequency to update this series.")
      return
    }
    const recurrenceErr = validateRecurrenceEndLimitsFromPortal(addItemPortalItems, seriesRecurrenceValues)
    if (recurrenceErr) {
      alert(recurrenceErr)
      return
    }
    series = applyRecurrenceEndLimitsFromPortal(addItemPortalItems, seriesRecurrenceValues, series)
    const start = parseLocalDateTime(eventEditStartDate, eventEditStartTime)
    if (Number.isNaN(start.getTime())) {
      alert("Enter a valid date and time for the series anchor.")
      return
    }
    const addMinRaw = parseDurationFieldToMinutes(eventEditDurationStr, timeIncrement)
    if (addMinRaw == null) {
      alert("Enter a valid duration.")
      return
    }
    const working = readCalendarWorkingHoursFromStorage()
    const addMin = clampAppointmentDurationMinutes(addMinRaw, {
      start,
      workingStart: working.enabled ? working.start : undefined,
      workingEnd: working.enabled ? working.end : undefined,
    })
    const durationMs = addMin * 60 * 1000
    const starts = computeOccurrenceStarts(start, series)
    const newRanges = starts.map((s) => ({ s, e: new Date(s.getTime() + durationMs) }))
    const owner = resolveSandboxDataUserId(selectedEvent.user_id ?? userId, authUserId || userId)
    const scopeId = selectedEvent.recurrence_series_id
    const legacyIds = selectedLegacyRecurringIds
    const replaceIds = scopeId
      ? events.filter((e) => e.recurrence_series_id === scopeId && !e.removed_at && !e.completed_at).map((e) => e.id)
      : legacyIds && legacyIds.length >= 2
        ? legacyIds.filter((id) => {
            const row = events.find((e) => e.id === id)
            return row && !row.completed_at && !row.removed_at
          })
        : [selectedEvent.id]
    if (!window.confirm(`Replace ${replaceIds.length} upcoming occurrence(s) with ${newRanges.length} new date(s) using the recurrence settings below?`)) {
      return
    }
    if (readCalendarNoDuplicateTimesSetting()) {
      try {
        const conflicts = await findCalendarScheduleConflicts(supabase, {
          userId: owner,
          ranges: newRanges,
          excludeEventIds: replaceIds,
        })
        if (conflicts.length > 0 && !confirmCalendarOverlapSave(conflicts)) {
          alert("Series update cancelled — one or more new times overlap existing appointments.")
          return
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
        return
      }
    }
    setSeriesRecurrenceSaving(true)
    try {
      const nowIso = new Date().toISOString()
      if (replaceIds.length > 0) {
        const { error: rmErr } = await supabase
          .from("calendar_events")
          .update({ removed_at: nowIso })
          .in("id", replaceIds)
          .is("removed_at", null)
        if (rmErr) throw new Error(rmErr.message)
      }
      const recurrenceSeriesId = newRanges.length > 1 ? crypto.randomUUID() : null
      const rowBase = {
        user_id: owner,
        title: selectedEvent.title,
        job_type_id: selectedEvent.job_type_id || null,
        quote_id: selectedEvent.quote_id || null,
        customer_id: selectedEvent.customer_id || null,
        notes: selectedEvent.notes?.trim() || null,
        materials_list: selectedEvent.materials_list?.trim() || null,
        mileage_miles: selectedEvent.mileage_miles ?? null,
        quote_total: selectedEvent.quote_total ?? null,
        metadata: selectedEvent.metadata ?? null,
        ...(recurrenceSeriesId ? { recurrence_series_id: recurrenceSeriesId } : {}),
      }
      const rows = newRanges.map(({ s, e }) => ({
        ...rowBase,
        start_at: s.toISOString(),
        end_at: e.toISOString(),
      }))
      const { error: insErr } = await supabase.from("calendar_events").insert(rows)
      if (insErr) throw new Error(insErr.message)
      setSelectedEvent(null)
      loadEvents()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSeriesRecurrenceSaving(false)
    }
  }

  async function saveEventJobSite() {
    if (!supabase || !selectedEvent?.id) return
    setJobSiteSaving(true)
    try {
      const prevMeta = selectedEvent.metadata
      const nextMeta = mergeJobSiteIntoMetadata(prevMeta, {
        job_site_address: jobSiteDraft.address,
        job_site_lat: jobSiteDraft.lat,
        job_site_lng: jobSiteDraft.lng,
      })
      const { error } = await supabase.from("calendar_events").update({ metadata: nextMeta }).eq("id", selectedEvent.id)
      if (error) throw new Error(error.message)
      setSelectedEvent((prev) => (prev && prev.id === selectedEvent.id ? { ...prev, metadata: nextMeta } : prev))
      await loadEvents()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setJobSiteSaving(false)
    }
  }

  async function geocodeJobSiteDraft() {
    const q = jobSiteDraft.address.trim()
    if (!q) {
      alert("Enter a job site address to look up coordinates.")
      return
    }
    setJobGeocodeBusy(true)
    try {
      const coords = await geocodeAddressToLatLng(q)
      if (!coords) {
        alert("Could not find coordinates for that address. Try a fuller street + city + state.")
        return
      }
      setJobSiteDraft((d) => ({ ...d, lat: String(coords.lat), lng: String(coords.lng) }))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setJobGeocodeBusy(false)
    }
  }

  async function saveEventReceiptLines() {
    if (!supabase || !selectedEvent?.id) return
    setReceiptLinesSaving(true)
    const nextMeta = serializeCalendarReceiptMeta(selectedEvent.metadata, {
      receipt_quote_overrides: receiptOverridesDraft,
      receipt_additional_lines: receiptAdditionalDraft,
      receipt_wants_line_items: true,
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
    const offerNewEstimate =
      calendarCompletionProfile.calendar_completion_offer_new_estimate_on_additional_items === "checked" &&
      receiptAdditionalDraft.some((row) => String(row.description ?? "").trim())
    if (offerNewEstimate && selectedEvent.customer_id && setPage && window.confirm(
      "Additional receipt line items were saved. Create a new estimate from these items and send it to the customer?",
    )) {
      queueQuotesCreateNewForCustomer(selectedEvent.customer_id)
      setPage("quotes")
    }
  }

  async function handleCalendarEntityFileChange(files: FileList | null) {
    if (!files?.length || !supabase || !selectedEvent?.id) return
    const owner = resolveSandboxDataUserId(selectedEvent.user_id ?? userId, authUserId || userId)
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
    const override = readCalendarEventDisplayMeta(ev.metadata).color_hex?.trim()
    if (override) return override
    const jt = ev.job_types ?? jobTypes.find((j) => j.id === ev.job_type_id)
    return (jt as JobType)?.color_hex ?? theme.primary
  }

  function getEventIconGlyph(ev: CalendarEvent): string {
    const metaIcon = readCalendarEventDisplayMeta(ev.metadata).icon_id
    if (metaIcon) return glyphForJobTypeIcon(metaIcon)
    const jtId = ev.job_type_id
    if (jtId && jobTypeIconById[jtId]) return glyphForJobTypeIcon(jobTypeIconById[jtId])
    return ""
  }

  function formatEventChipLabel(ev: CalendarEvent): string {
    const jt = (ev.job_types as JobType | null | undefined) ?? jobTypes.find((j) => j.id === ev.job_type_id)
    return formatCalendarEventLabel(
      {
        title: ev.title,
        startAt: ev.start_at,
        customerName: ev.customers?.display_name,
        jobTypeName: jt?.name,
        assigneeLabel: calendarAssigneeLabel(ev, selectableUsers),
        iconGlyph: getEventIconGlyph(ev),
      },
      displayPrefs,
    )
  }

  async function persistEventDisplayPatch(ev: CalendarEvent, patch: { color_hex?: string; icon_id?: string }) {
    if (!supabase) return
    const nextMeta = mergeCalendarEventDisplayMeta(
      ev.metadata && typeof ev.metadata === "object" && !Array.isArray(ev.metadata)
        ? (ev.metadata as Record<string, unknown>)
        : {},
      patch,
    )
    const { error } = await supabase.from("calendar_events").update({ metadata: nextMeta }).eq("id", ev.id)
    if (error) {
      alert(error.message || "Could not update event display.")
      return
    }
    const patched = { ...ev, metadata: nextMeta }
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? patched : e)))
    setSelectedEvent((prev) => (prev && prev.id === ev.id ? patched : prev))
    setEventCtxMenu((prev) => (prev && prev.event.id === ev.id ? { ...prev, event: patched } : prev))
  }

  function updateDisplayPrefs(next: CalendarDisplayPrefs) {
    setDisplayPrefs(next)
    saveCalendarDisplayPrefs(next)
  }

  function toggleTitleField(id: CalendarTitleFieldId) {
    const has = displayPrefs.titleFields.includes(id)
    const nextFields = has
      ? displayPrefs.titleFields.filter((f) => f !== id)
      : [...displayPrefs.titleFields, id]
    updateDisplayPrefs({ ...displayPrefs, titleFields: nextFields.length ? nextFields : ["title"] })
  }

  function setChipStyle(chipStyle: CalendarChipStyleId) {
    updateDisplayPrefs({ ...displayPrefs, chipStyle })
  }

  function eventChipStyle(ev: CalendarEvent): React.CSSProperties {
    return calendarChipSurfaceStyle(getEventColor(ev), getEventRibbonColorForEvent(ev), displayPrefs.chipStyle)
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
    if (isSandboxDemoUserId(ownerUserId)) return null
    const resolved = resolveSandboxDataUserId(ownerUserId, authUserId || userId)
    const { data, error } = await supabase
      .from("user_calendar_preferences")
      .select("owner_user_id, ribbon_color, auto_assign_enabled")
      .eq("owner_user_id", resolved)
      .maybeSingle()
    if (error) {
      return null
    }
    const row = (data as UserCalendarPreference | null) ?? null
    return row
  }

  async function loadJobTypes() {
    if (!calendarDbUserId || !supabase) return
    let q = await supabase
      .from("job_types")
      .select("id, name, description, duration_minutes, color_hex, materials_list, track_mileage")
      .eq("user_id", calendarDbUserId)
      .order("name")
    let rows: JobType[] = (q.data ?? []) as JobType[]
    let error = q.error
    const em = (e: typeof error) => (e?.message ?? "").toLowerCase()
    if (error && (em(error).includes("track_mileage") || em(error).includes("materials_list"))) {
      const q2 = await supabase
        .from("job_types")
        .select("id, name, description, duration_minutes, color_hex, materials_list")
        .eq("user_id", calendarDbUserId)
        .order("name")
      rows = (q2.data ?? []) as JobType[]
      error = q2.error
    }
    if (error?.message?.toLowerCase().includes("materials_list")) {
      const q3 = await supabase
        .from("job_types")
        .select("id, name, description, duration_minutes, color_hex")
        .eq("user_id", calendarDbUserId)
        .order("name")
      rows = (q3.data ?? []) as JobType[]
      error = q3.error
    }
    if (error) {
      setJobTypes([])
      return
    }
    setJobTypes(rows)
  }

  const openJobTypesFromCalendar = useCallback(() => {
    jobTypesModal?.openJobTypesModal({ onChanged: () => void loadJobTypes() })
  }, [jobTypesModal])

  useEffect(() => {
    const next = consumeCalendarSuiteNavigation()
    if (!next) return
    if (
      next.id === "managed_job_types" ||
      (next.id === "team_management" && next.panel === "job_types") ||
      (next.id === "scheduling_tools" && next.panel === "job_types")
    ) {
      setCalendarSuite({ id: "calendar" })
      openJobTypesFromCalendar()
      return
    }
    setCalendarSuite(next)
  }, [openJobTypesFromCalendar])

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
      setEventEditStartDate("")
      setEventEditStartTime("")
      setEventEditDurationStr("60")
      setEventEditJobTypeId("")
      setEventScheduleError("")
      return
    }
    const start = new Date(selectedEvent.start_at)
    if (Number.isNaN(start.getTime())) return
    const y = start.getFullYear()
    const mo = String(start.getMonth() + 1).padStart(2, "0")
    const d = String(start.getDate()).padStart(2, "0")
    setEventEditStartDate(`${y}-${mo}-${d}`)
    const snapped = snapMinutesToIncrement(start.getHours() * 60 + start.getMinutes(), timeIncrement)
    const sh = Math.floor(snapped / 60) % 24
    const sm = snapped % 60
    setEventEditStartTime(`${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`)
    const end = new Date(selectedEvent.end_at)
    const durMs = end.getTime() - start.getTime()
    const mins = Math.max(timeIncrement, Math.round(durMs / 60000))
    setEventEditDurationStr(formatDurationFieldFromMinutes(snapMinutesToIncrement(mins, timeIncrement), timeIncrement))
    setEventEditJobTypeId(selectedEvent.job_type_id ?? "")
    setEventNotesDraft(selectedEvent.notes?.trim() || "")
    setRescheduleNotifyEmail(false)
    setRescheduleNotifySms(false)
  }, [selectedEvent?.id, selectedEvent?.start_at, selectedEvent?.end_at, selectedEvent?.job_type_id, selectedEvent?.notes, timeIncrement])

  useEffect(() => {
    if (!selectedEvent) {
      setJobSiteDraft({ address: "", lat: "", lng: "" })
      return
    }
    const jp = parseJobSiteFromEventMetadata(selectedEvent.metadata)
    const cust = selectedEvent.customers
    const custAddr = typeof cust?.service_address === "string" ? cust.service_address.trim() : ""
    const custLat = cust?.service_lat != null && Number.isFinite(Number(cust.service_lat)) ? String(cust.service_lat) : ""
    const custLng = cust?.service_lng != null && Number.isFinite(Number(cust.service_lng)) ? String(cust.service_lng) : ""
    setJobSiteDraft({
      address: jp.address || custAddr,
      lat: jp.lat != null ? String(jp.lat) : custLat,
      lng: jp.lng != null ? String(jp.lng) : custLng,
    })
  }, [
    selectedEvent?.id,
    selectedEvent?.customer_id,
    selectedEvent?.metadata == null ? "" : JSON.stringify(selectedEvent.metadata),
    selectedEvent?.customers?.service_address,
    selectedEvent?.customers?.service_lat,
    selectedEvent?.customers?.service_lng,
  ])

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
  }, [selectedEvent?.id, selectedEvent?.metadata, selectedEvent?.quote_id])

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
  }, [userId, calendarDbUserId, currentDate, view, jobTypes.length, showAllOrgEvents, orgClientIdsKey])

  useEffect(() => {
    if (!userId) return
    loadJobTypes()
  }, [calendarDbUserId])

  useEffect(() => {
    if (!userId) return
    void loadUserPreference(userId).then((row) => {
      setUserPref(row)
      setAddTargetUserId(userId)
    })
  }, [calendarDbUserId])

  useEffect(() => {
    if (!supabase || !selectedEvent?.id) {
      setCalendarEventEntityRows([])
      return
    }
    void loadEntityAttachmentsForCalendarEvent(selectedEvent.id).then(setCalendarEventEntityRows)
  }, [selectedEvent?.id, supabase])

  useEffect(() => {
    if (!selectedEvent) {
      setEventAssigneePick("")
      return
    }
    setEventAssigneePick(calendarEventAssigneeUserId(selectedEvent) || userId)
  }, [selectedEvent?.id, selectedEvent?.user_id, selectedEvent?.metadata, userId])

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
    const ids = filterRealUserIds(
      Array.from(new Set((scopeCtx?.clients ?? []).map((c) => c.userId).filter(Boolean))),
    )
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
  }, [orgClientIdsKey, supabase])

  async function openCalendarEventById(eventId: string) {
    if (!supabase || !eventId.trim()) return
    setShowAddItem(false)
    const select =
      "id, user_id, title, start_at, end_at, job_type_id, quote_id, customer_id, notes, quote_total, recurrence_series_id, materials_list, mileage_miles, metadata, completed_at, removed_at, customers ( display_name, service_address, service_lat, service_lng ), job_types ( id, name, materials_list, color_hex, duration_minutes, description, track_mileage )"
    const { data, error } = await supabase.from("calendar_events").select(select).eq("id", eventId.trim()).maybeSingle()
    if (error || !data) {
      sandboxTrainingAlert(sandboxTraining, error?.message || "Could not load this calendar event.")
      return
    }
    const row = normalizeCalendarEventRow(data)
    setSelectedEvent(row)
    const start = new Date(row.start_at)
    if (!Number.isNaN(start.getTime())) setCurrentDate(start)
  }

  async function saveEventAssignee() {
    if (!supabase || !selectedEvent?.id || !eventAssigneePick.trim()) return
    setEventAssigneeSaving(true)
    setAssigneeSaveNote("")
    try {
      const assignee = resolveCalendarAssigneeForSave(
        eventAssigneePick,
        authUserId || userId,
        selectedEvent.user_id ?? (authUserId || userId),
      )
      const nextMeta = mergeCalendarAssigneeMetadata(selectedEvent.metadata, assignee)
      const ownerId = selectedEvent.user_id ?? calendarDbUserId
      let { data: updated, error } = await supabase
        .from("calendar_events")
        .update({ metadata: nextMeta })
        .eq("id", selectedEvent.id)
        .eq("user_id", ownerId)
        .select("id, user_id, metadata")
        .maybeSingle()
      if (error?.message?.toLowerCase().includes("metadata")) {
        sandboxTrainingAlert(
          sandboxTraining,
          "Calendar assignee storage is not available yet. Run supabase/calendar-events-metadata.sql in Supabase.",
        )
        return
      }
      if (error) {
        sandboxTrainingAlert(sandboxTraining, error.message)
        return
      }
      let savedMeta = nextMeta
      if (updated) {
        if (updated.metadata && typeof updated.metadata === "object") {
          savedMeta = updated.metadata as Record<string, unknown>
        }
      } else {
        const { data: verify } = await supabase
          .from("calendar_events")
          .select("id, metadata")
          .eq("id", selectedEvent.id)
          .maybeSingle()
        if (!verify || JSON.stringify(verify.metadata) !== JSON.stringify(nextMeta)) {
          sandboxTrainingAlert(sandboxTraining, "Assignee was not saved. Check that you can edit this event.")
          return
        }
        if (verify.metadata && typeof verify.metadata === "object") {
          savedMeta = verify.metadata as Record<string, unknown>
        }
      }
      const patched = { ...selectedEvent, metadata: savedMeta }
      setSelectedEvent(patched)
      setEvents((prev) => prev.map((e) => (e.id === selectedEvent.id ? patched : e)))
      setEventAssigneePick(calendarEventAssigneeUserId(patched) || userId)
      setAssigneeSaveNote("Assignee saved.")
    } finally {
      setEventAssigneeSaving(false)
    }
  }

  async function saveEvent() {
    if (!supabase || !userId || !addTitle.trim()) return
    const assigneePick = addAssignToSelectedUser ? addTargetUserId || userId : authUserId || userId
    const eventOwnerUserId = resolveSandboxDataUserId(authUserId || userId, authUserId || userId)
    const assignee = resolveCalendarAssigneeForSave(assigneePick, authUserId || userId, eventOwnerUserId)
    setAddError("")
    const start = parseLocalDateTime(addStartDate, addStartTime)
    if (Number.isNaN(start.getTime())) {
      setAddError("Invalid start date or time.")
      return
    }
    const addMinRaw = parseDurationFieldToMinutes(addDurationStr, timeIncrement)
    if (addMinRaw == null) {
      setAddError("Enter a valid duration (at least 15 minutes).")
      return
    }
    const working = readCalendarWorkingHoursFromStorage()
    const addMin = clampAppointmentDurationMinutes(addMinRaw, {
      start,
      workingStart: working.enabled ? working.start : undefined,
      workingEnd: working.enabled ? working.end : undefined,
    })
    const durationMs = addMin * 60 * 1000
    /** Prefer recurrence from this modal; job-type defaults apply only when this form has no recurrence controls. */
    const recurrenceFromAddItem = resolveRecurrenceFromPortal(addItemPortalItems, addItemPortalValues)
    const recurrenceFromJobTypes =
      !recurrenceFromAddItem &&
      addJobTypeId &&
      jobTypesPortalItems.length > 0 &&
      !portalHasRecurrenceControls(addItemPortalItems)
        ? resolveRecurrenceFromPortal(jobTypesPortalItems, jobTypesPortalValues)
        : null
    let series = recurrenceFromAddItem ?? recurrenceFromJobTypes
    if (series) {
      const endFromAddModal = recurrenceFromAddItem != null
      const endItems = endFromAddModal ? addItemPortalItems : jobTypesPortalItems
      const endVals = endFromAddModal ? addItemPortalValues : jobTypesPortalValues
      const recurrenceErr = validateRecurrenceEndLimitsFromPortal(endItems, endVals)
      if (recurrenceErr) {
        setAddError(recurrenceErr)
        return
      }
      series = applyRecurrenceEndLimitsFromPortal(endItems, endVals, series)
    }
    const starts = series ? computeOccurrenceStarts(start, series) : [start]
    const newRanges = starts.map((s) => ({ s, e: new Date(s.getTime() + durationMs) }))

    if (readCalendarNoDuplicateTimesSetting() && newRanges.length > 0) {
      try {
        const conflicts = await findCalendarScheduleConflicts(supabase, {
          userId: eventOwnerUserId,
          ranges: newRanges,
        })
        if (conflicts.length > 0) {
          setAddError(
            `One or more times overlap "${conflicts[0].title?.trim() || "another event"}". Change the start time, recurrence, or turn off "Do not allow duplicate times" under Team management → Settings.`,
          )
          return
        }
      } catch (e) {
        setAddError(e instanceof Error ? e.message : String(e))
        return
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
        let meta: Record<string, unknown> = {}
        if (addAssignToSelectedUser && (assignee.assignedDemoUserId || assignee.assignedUserId)) {
          meta = mergeCalendarAssigneeMetadata(null, assignee) as Record<string, unknown>
        }
        if (addNotifyEmail || addNotifySms) {
          meta = mergeCalendarCustomerNotifyPrefs(meta, {
            email: addNotifyEmail,
            sms: addNotifySms,
          })
        }
        if (Object.keys(meta).length > 0) row.metadata = meta
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
    let insertedEventIds: string[] = []
    for (const [incMat, incMile] of attempts) {
      const r = await supabase.from("calendar_events").insert(buildRows(incMat, incMile)).select("id")
      if (!r.error && r.data) {
        error = null
        insertedEventIds = (r.data as { id: string }[]).map((row) => row.id)
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
    if (insertedEventIds.length > 0) void invokeNotifyCalendarStatus(insertedEventIds, "", "Scheduled")
    if (addCustomerId) {
      await refreshCustomerPipelineOnEngagement(supabase, addCustomerId, "scheduled")
    }

    const sendErrs: string[] = []
    if ((addNotifyEmail || addNotifySms) && addCustomerId) {
      const notifyErrs = await sendCustomerAppointmentNotify({
        customerId: addCustomerId,
        eventId: insertedEventIds[0],
        notifyEmail: addNotifyEmail,
        notifySms: addNotifySms,
        kind: "confirm",
        title: addTitle.trim(),
        startIso: newRanges[0].s.toISOString(),
        ownerUserId: eventOwnerUserId,
      })
      sendErrs.push(...notifyErrs)
    }
    if (sendErrs.length > 0) {
      alert(`Saved to calendar, but could not notify the customer:\n${sendErrs.join("\n")}`)
    }

    setShowAddItem(false)
    resetAddForm()
    loadEvents()
    notifyCustomersHubRefresh()
  }

  function resetAddForm() {
    setAddTitle("")
    const today = new Date().toISOString().slice(0, 10)
    setAddStartDate(today)
    setAddStartTime("09:00")
    setAddDurationStr(formatDurationFieldFromMinutes(60, timeIncrement))
    setAddJobTypeId("")
    setAddNotes("")
    setAddQuoteId(null)
    setAddCustomerId(null)
    setAddCustomerSearch("")
    setAddMileage("")
    setAddNotifyEmail(false)
    setAddNotifySms(false)
  }

  const pendingAddJobTypeRef = useRef<string | null>(null)

  const applySchedulingAddWizardPrefill = useCallback(
    (prefill: SchedulingAddWizardPrefill) => {
      resetAddForm()
      if (prefill.title) setAddTitle(prefill.title)
      if (prefill.startDate) setAddStartDate(prefill.startDate)
      if (prefill.startTime) setAddStartTime(prefill.startTime)
      if (prefill.durationMinutes != null) {
        setAddDurationStr(formatDurationFieldFromMinutes(prefill.durationMinutes, timeIncrement))
      }
      if (prefill.jobTypeId) {
        setAddJobTypeId(prefill.jobTypeId)
        const jt = jobTypes.find((j) => j.id === prefill.jobTypeId)
        if (jt) {
          applyJobTypeToAddForm(prefill.jobTypeId)
          if (!prefill.title) setAddTitle(jt.name)
        } else {
          pendingAddJobTypeRef.current = prefill.jobTypeId
        }
      }
      if (prefill.customerId) setAddCustomerId(prefill.customerId)
      if (prefill.notes) setAddNotes(prefill.notes)
      setShowAddItem(true)
      if (userId) setAddTargetUserId(userId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jobTypes resolved via pending ref when still loading
    [timeIncrement, userId, jobTypes],
  )

  useEffect(() => {
    const jtId = pendingAddJobTypeRef.current
    if (!jtId) return
    if (!jobTypes.some((j) => j.id === jtId)) return
    pendingAddJobTypeRef.current = null
    applyJobTypeToAddForm(jtId)
    const jt = jobTypes.find((j) => j.id === jtId)
    if (jt) setAddTitle((prev) => prev.trim() || jt.name)
  }, [jobTypes])

  function onAddCustomerPick(customerId: string) {
    if (!customerId) {
      setAddCustomerId(null)
      return
    }
    setAddCustomerId(customerId)
    if (addQuoteId) {
      const opt = addQuoteOptions.find((o) => o.quoteId === addQuoteId)
      if (opt?.customerId && opt.customerId !== customerId) setAddQuoteId(null)
    }
    const row = addCustomerOptions.find((c) => c.id === customerId)
    if (!row) return
    setAddTitle((prev) => prev.trim() || row.display_name)
    if (row.service_address.trim()) {
      setAddNotes((prev) => {
        const addr = `Service address: ${row.service_address.trim()}`
        if (!prev.trim()) return addr
        if (prev.includes(row.service_address.trim())) return prev
        return `${prev.trim()}\n${addr}`
      })
    }
  }

  function openAddItemFromEvent(ev: CalendarEvent) {
    resetAddForm()
    const start = new Date(ev.start_at)
    if (!Number.isNaN(start.getTime())) {
      const y = start.getFullYear()
      const m = String(start.getMonth() + 1).padStart(2, "0")
      const day = String(start.getDate()).padStart(2, "0")
      setAddStartDate(`${y}-${m}-${day}`)
      const hh = String(start.getHours()).padStart(2, "0")
      const mm = String(start.getMinutes()).padStart(2, "0")
      setAddStartTime(`${hh}:${mm}`)
    }
    const durMs = new Date(ev.end_at).getTime() - start.getTime()
    if (Number.isFinite(durMs) && durMs > 0) {
      setAddDurationStr(formatDurationFieldFromMinutes(Math.round(durMs / 60000), timeIncrement))
    }
    setAddTitle(ev.title || "")
    setAddNotes(ev.notes?.trim() || "")
    setAddCustomerId(ev.customer_id ?? null)
    setAddQuoteId(ev.quote_id ?? null)
    if (ev.job_type_id) setAddJobTypeId(ev.job_type_id)
    if (ev.mileage_miles != null) setAddMileage(String(ev.mileage_miles))
    setAddTargetUserId(ev.user_id ?? userId ?? "")
    setSelectedEvent(null)
    setShowAddItem(true)
  }

  async function resolveEventCustomerId(ev: CalendarEvent): Promise<string | null> {
    if (ev.customer_id) return ev.customer_id
    if (!ev.quote_id || !supabase) return null
    const { data } = await supabase.from("quotes").select("customer_id").eq("id", ev.quote_id).maybeSingle()
    return (data?.customer_id as string | null) ?? null
  }

  async function openCreateEstimateFromEvent(ev: CalendarEvent) {
    const customerId = await resolveEventCustomerId(ev)
    if (!customerId) {
      alert("Link a customer to this event before creating an estimate.")
      return
    }
    if (!setPage) return
    queueQuotesCreateNewForCustomer(customerId)
    setSelectedEvent(null)
    setPage("quotes")
  }

  async function openCustomReceiptFromEvent(ev: CalendarEvent) {
    const customerId = await resolveEventCustomerId(ev)
    setCustomReceiptPrefillCustomerId(customerId)
    setShowCustomReceiptModal(true)
    setSelectedEvent(null)
  }

  function openAddItemForDate(d: Date) {
    openAddItemForSlot(d, 9 * 60)
  }

  function openAddItemForSlot(day: Date, minutesFromMidnight: number) {
    resetAddForm()
    const y = day.getFullYear()
    const m = String(day.getMonth() + 1).padStart(2, "0")
    const dd = String(day.getDate()).padStart(2, "0")
    setAddStartDate(`${y}-${m}-${dd}`)
    setAddStartTime(formatTimeInputFromDate(dateWithMinutesFromMidnight(day, minutesFromMidnight)))
    setAddTargetUserId(userId)
    setShowAddItem(true)
  }

  useEffect(() => {
    if (!userId) return
    const cid = consumeCustomReceiptCustomerPrefill()
    if (cid) {
      setCustomReceiptPrefillCustomerId(cid)
      setShowCustomReceiptModal(true)
      return
    }
    if (consumeOpenCustomReceiptModal()) {
      setCustomReceiptPrefillCustomerId(null)
      setShowCustomReceiptModal(true)
    }
  }, [calendarDbUserId])

  useEffect(() => {
    if (!userId || !supabase) return
    const quotePrefill = consumeSchedulingQuotePrefill()
    if (quotePrefill?.customerId && quotePrefill.quoteId) {
      resetAddForm()
      setAddCustomerId(quotePrefill.customerId)
      setAddQuoteId(quotePrefill.quoteId)
      setShowAddItem(true)
      setAddTargetUserId(userId)
      void applyAddQuoteSelection(quotePrefill.quoteId)
      return
    }
    const cid = consumeSchedulingCustomerPrefill()
    if (!cid) return
    resetAddForm()
    setAddCustomerId(cid)
    setShowAddItem(true)
    setAddTargetUserId(userId)
    void (async () => {
      const { data } = await supabase.from("customers").select("display_name").eq("id", cid).maybeSingle()
      const name = String((data as { display_name?: string | null } | null)?.display_name ?? "").trim()
      if (name) setAddTitle(name)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot queue from Customers tab
  }, [userId, supabase])

  useEffect(() => {
    if (!supabase) return
    const openQueued = () => {
      const eventId = consumeSchedulingEventView()
      if (eventId) void openCalendarEventById(eventId)
    }
    openQueued()
    window.addEventListener(SCHEDULING_EVENT_VIEW_EVENT, openQueued)
    return () => window.removeEventListener(SCHEDULING_EVENT_VIEW_EVENT, openQueued)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open by queued id once
  }, [supabase])

  useEffect(() => {
    if (!showAddItem || !supabase || !userId) {
      if (!showAddItem) setAddCustomerSearch("")
      return
    }
    void loadCustomersForCustomReceipt(supabase, userId)
      .then(setAddCustomerOptions)
      .catch(() => setAddCustomerOptions([]))
  }, [showAddItem, supabase, userId])

  useEffect(() => {
    if (!showAddItem) return
    if (!addCustomerId) return
    const row = addCustomerOptions.find((c) => c.id === addCustomerId)
    if (row) setAddCustomerSearch(formatAddCustomerPickerLabel(row))
  }, [showAddItem, addCustomerId, addCustomerOptions])

  useEffect(() => {
    const onPrefill = () => {
      const prefill = consumeSchedulingAddWizardPrefill()
      if (!prefill) return
      applySchedulingAddWizardPrefill(prefill)
    }
    // Consume any handoff queued before this page mounted (e.g. from Estimates library).
    onPrefill()
    window.addEventListener(SCHEDULING_ADD_WIZARD_PREFILL_EVENT, onPrefill)
    return () => window.removeEventListener(SCHEDULING_ADD_WIZARD_PREFILL_EVENT, onPrefill)
  }, [applySchedulingAddWizardPrefill])

  function getEventsForDay(d: Date): CalendarEvent[] {
    const dayStart = new Date(d)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(d)
    dayEnd.setHours(23, 59, 59, 999)
    return calendarVisibleEvents.filter((e) => {
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
  gridTimeParamsRef.current = { dayViewStartHour, timeIncrement }

  function resolveGridSlotFromPointer(clientX: number, clientY: number): { day: Date; minutes: number } | null {
    const root = gridWrapperRef.current
    if (!root) return null
    const { dayViewStartHour: startHr, timeIncrement: inc } = gridTimeParamsRef.current
    const cols = root.querySelectorAll<HTMLElement>("[data-cal-day-column]")
    for (const col of cols) {
      const rect = col.getBoundingClientRect()
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue
      const iso = col.dataset.calDayIso
      if (!iso) continue
      const [yy, mm, dd] = iso.split("-").map((n) => parseInt(n, 10))
      if (!yy || !mm || !dd) continue
      const day = new Date(yy, mm - 1, dd)
      const minutes = minutesFromColumnY(clientY - rect.top, startHr, HOUR_HEIGHT, inc)
      return { day, minutes }
    }
    return null
  }

  function handleDayColumnClick(e: ReactMouseEvent<HTMLDivElement>, calDay: Date) {
    if (skipNextColumnClickRef.current) {
      skipNextColumnClickRef.current = false
      return
    }
    if ((e.target as HTMLElement).closest("[data-cal-event]")) return
    const rect = e.currentTarget.getBoundingClientRect()
    const minutes = minutesFromColumnY(
      e.clientY - rect.top,
      dayViewStartHour,
      HOUR_HEIGHT,
      timeIncrement,
    )
    openAddItemForSlot(calDay, minutes)
  }

  function beginGridEventPointerDown(e: React.PointerEvent, ev: CalendarEvent, calDay: Date) {
    if (e.button === 2) return
    e.stopPropagation()
    const start = new Date(ev.start_at)
    const end = new Date(ev.end_at)
    setGridEventDrag({
      event: ev,
      durationMs: Math.max(15 * 60 * 1000, end.getTime() - start.getTime()),
      pointerId: e.pointerId,
      moved: false,
      ghostDayIso: calDayIsoLocal(calDay),
      ghostMinutes: start.getHours() * 60 + start.getMinutes(),
      startX: e.clientX,
      startY: e.clientY,
    })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function beginMonthEventPointerDown(e: React.PointerEvent, ev: CalendarEvent) {
    if (e.button === 2) return
    e.preventDefault()
    e.stopPropagation()
    try {
      document.body.style.userSelect = "none"
    } catch {
      /* ignore */
    }
    const start = new Date(ev.start_at)
    setMonthEventDrag({
      event: ev,
      durationMs: Math.max(15 * 60 * 1000, new Date(ev.end_at).getTime() - start.getTime()),
      pointerId: e.pointerId,
      moved: false,
      ghostDayIso: calDayIsoLocal(start),
      startX: e.clientX,
      startY: e.clientY,
    })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function resolveMonthDayFromPointer(clientX: number, clientY: number): Date | null {
    const cells = document.querySelectorAll<HTMLElement>("[data-cal-month-day]")
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect()
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue
      const iso = cell.dataset.calMonthDay
      if (!iso) continue
      const [yy, mm, dd] = iso.split("-").map((n) => parseInt(n, 10))
      if (!yy || !mm || !dd) continue
      return new Date(yy, mm - 1, dd)
    }
    return null
  }

  useEffect(() => {
    if (!gridEventDrag) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== gridEventDrag.pointerId) return
      const dist = Math.hypot(e.clientX - gridEventDrag.startX, e.clientY - gridEventDrag.startY)
      const moved = dist > 4 || gridEventDrag.moved
      const slot = resolveGridSlotFromPointer(e.clientX, e.clientY)
      setGridEventDrag((prev) => {
        if (!prev || prev.pointerId !== e.pointerId) return prev
        if (!slot) return moved !== prev.moved ? { ...prev, moved } : prev
        return {
          ...prev,
          moved,
          ghostDayIso: calDayIsoLocal(slot.day),
          ghostMinutes: slot.minutes,
        }
      })
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== gridEventDrag.pointerId) return
      const drag = gridEventDrag
      setGridEventDrag(null)
      // Single click / short press: select for drag affordance only — open requires double-click.
      if (!drag.moved) return
      skipNextColumnClickRef.current = true
      const slot = resolveGridSlotFromPointer(e.clientX, e.clientY)
      if (!slot) return
      const newStart = dateWithMinutesFromMidnight(slot.day, slot.minutes)
      void commitEventTimeChange(drag.event, newStart, drag.durationMs)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drag session tied to pointer id
  }, [gridEventDrag])

  useEffect(() => {
    if (!monthEventDrag) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== monthEventDrag.pointerId) return
      const dist = Math.hypot(e.clientX - monthEventDrag.startX, e.clientY - monthEventDrag.startY)
      const moved = dist > 4 || monthEventDrag.moved
      const day = resolveMonthDayFromPointer(e.clientX, e.clientY)
      setMonthEventDrag((prev) => {
        if (!prev || prev.pointerId !== e.pointerId) return prev
        if (!day) return moved !== prev.moved ? { ...prev, moved } : prev
        return { ...prev, moved, ghostDayIso: calDayIsoLocal(day) }
      })
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== monthEventDrag.pointerId) return
      const drag = monthEventDrag
      setMonthEventDrag(null)
      try {
        document.body.style.userSelect = ""
      } catch {
        /* ignore */
      }
      if (!drag.moved) return
      const day = resolveMonthDayFromPointer(e.clientX, e.clientY)
      if (!day) return
      const prevStart = new Date(drag.event.start_at)
      const newStart = new Date(day)
      newStart.setHours(prevStart.getHours(), prevStart.getMinutes(), 0, 0)
      void commitEventTimeChange(drag.event, newStart, drag.durationMs)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthEventDrag])

  const addInputStyle: React.CSSProperties = {
    ...theme.formInput,
  }

  const filteredAddCustomers = useMemo(() => {
    const q = addCustomerSearch.trim().toLowerCase()
    if (!q) return addCustomerOptions.slice(0, 80)
    return addCustomerOptions
      .filter(
        (c) =>
          c.display_name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.service_address.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      )
      .slice(0, 40)
  }, [addCustomerOptions, addCustomerSearch])

  const selectedAddCustomer = useMemo(() => {
    if (!addCustomerId) return null
    return addCustomerOptions.find((c) => c.id === addCustomerId) ?? null
  }, [addCustomerId, addCustomerOptions])

  const addCustomerCanEmail = Boolean(selectedAddCustomer?.email?.trim())
  const addCustomerCanSms = Boolean(selectedAddCustomer?.phone?.trim())

  useEffect(() => {
    if (!showAddItem || !supabase || !userId) return
    let cancelled = false
    setAddQuoteOptionsLoading(true)
    void loadCalendarQuotePickerOptions(supabase, userId, addCustomerId).then((opts) => {
      if (cancelled) return
      setAddQuoteOptions(opts)
      setAddQuoteOptionsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [showAddItem, supabase, userId, addCustomerId])

  const applyAddQuoteSelection = useCallback(
    async (quoteId: string) => {
      setAddQuoteId(quoteId || null)
      if (!quoteId || !supabase) return
      const opt = addQuoteOptions.find((o) => o.quoteId === quoteId)
      if (opt?.customerId) {
        setAddCustomerId(opt.customerId)
        if (opt.customerName) setAddCustomerSearch(opt.customerName)
      }
      const { data: quoteRow } = await supabase
        .from("quotes")
        .select("job_type_id, metadata")
        .eq("id", quoteId)
        .maybeSingle()
      const jtId = String((quoteRow as { job_type_id?: string } | null)?.job_type_id ?? "").trim()
      if (jtId) {
        setAddJobTypeId(jtId)
        applyJobTypeToAddForm(jtId)
      }
      const { data: items } = await supabase
        .from("quote_items")
        .select("description, quantity, unit_price, metadata")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: true })
      const rows = (items ?? []) as Array<{
        description?: string | null
        quantity?: unknown
        unit_price?: unknown
        metadata?: unknown
      }>
      const titleLine = primaryLineItemTitleFromQuoteRows(rows)
      const notesText = scopeLineItemsTextFromQuoteRows(rows)
      if (titleLine) setAddTitle(titleLine)
      if (notesText) setAddNotes(notesText)
    },
    [supabase, addQuoteOptions],
  )

  const eventScheduleDirty = useMemo(() => {
    if (!selectedEvent) return false
    const start = parseLocalDateTime(eventEditStartDate, eventEditStartTime)
    if (Number.isNaN(start.getTime())) return false
    const addMinRaw = parseDurationFieldToMinutes(eventEditDurationStr, timeIncrement)
    if (addMinRaw == null) return false
    const working = readCalendarWorkingHoursFromStorage()
    const addMin = clampAppointmentDurationMinutes(addMinRaw, {
      start,
      workingStart: working.enabled ? working.start : undefined,
      workingEnd: working.enabled ? working.end : undefined,
    })
    const end = new Date(start.getTime() + addMin * 60 * 1000)
    const startIso = start.toISOString()
    const endIso = end.toISOString()
    return startIso !== selectedEvent.start_at || endIso !== selectedEvent.end_at
  }, [selectedEvent, eventEditStartDate, eventEditStartTime, eventEditDurationStr, timeIncrement])

  async function resolveCustomerNotifyContact(customerId: string): Promise<{
    display_name: string
    email: string
    phone: string
  } | null> {
    const cached = addCustomerOptions.find((c) => c.id === customerId)
    if (cached) return cached
    if (!supabase) return null
    const { data } = await supabase
      .from("customers")
      .select("id, display_name, customer_identifiers(type, value, is_primary)")
      .eq("id", customerId)
      .maybeSingle()
    if (!data) return null
    const ids = (data as { customer_identifiers?: { type: string; value: string; is_primary?: boolean }[] })
      .customer_identifiers
    const email =
      ids?.find((x) => x.type === "email" && x.is_primary)?.value?.trim() ||
      ids?.find((x) => x.type === "email")?.value?.trim() ||
      ""
    const phone =
      ids?.find((x) => x.type === "phone" && x.is_primary)?.value?.trim() ||
      ids?.find((x) => x.type === "phone")?.value?.trim() ||
      ""
    return {
      id: customerId,
      display_name: String((data as { display_name?: string | null }).display_name ?? "").trim() || "Customer",
      email,
      phone,
      service_address: "",
    } as CustomerReceiptPickerRow
  }

  async function sendCustomerAppointmentNotify(input: {
    customerId: string
    eventId?: string
    notifyEmail: boolean
    notifySms: boolean
    kind: "confirm" | "reschedule" | "cancel"
    title: string
    startIso: string
    ownerUserId: string
  }): Promise<string[]> {
    const errs: string[] = []
    if (!input.notifyEmail && !input.notifySms) return errs
    if (!supabase) return ["Not connected."]
    const cust = await resolveCustomerNotifyContact(input.customerId)
    if (!cust) {
      errs.push("Customer not found.")
      return errs
    }
    const businessName =
      ownerBusinessDisplayName.trim() ||
      (typeof authUser?.user_metadata?.display_name === "string" ? authUser.user_metadata.display_name.trim() : "") ||
      "Our team"
    const customerName = cust.display_name?.trim() || "there"
    const appointmentDate = formatAddAppointmentDate(input.startIso)
    const appointmentTime = formatAddAppointmentTime(input.startIso)
    const smsInner =
      input.kind === "reschedule"
        ? buildAppointmentRescheduleSmsInner({
            customerName,
            appointmentDate,
            appointmentTime,
            businessName,
            appointmentTitle: input.title,
          })
        : input.kind === "cancel"
          ? buildAppointmentCancelSmsInner({
              customerName,
              appointmentDate,
              appointmentTime,
              businessName,
              appointmentTitle: input.title,
            })
          : buildAppointmentConfirmSmsInner({
              customerName,
              appointmentDate,
              appointmentTime,
              businessName,
              appointmentTitle: input.title,
            })
    const templateVars = {
      customer_name: customerName,
      sender_name: businessName,
      company: businessName,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      appointment_title: input.title.trim() || "Your appointment",
    }
    const t = findEmailTemplate("appointment_confirm")
    const applied = t
      ? applyEmailTemplatePlaceholders(t, templateVars)
      : {
          subject: `Appointment confirmed — ${templateVars.appointment_date}`,
          bodyHtml: `<p>Hi ${customerName},</p><p>Your appointment with <strong>${businessName}</strong> is scheduled for <strong>${templateVars.appointment_date}</strong> at <strong>${templateVars.appointment_time}</strong> for: ${templateVars.appointment_title}</p>`,
        }
    const bodyPlain = htmlToPlainText(applied.bodyHtml)
    const sb = supabase
    const postOutbound = async (channel: "email" | "sms", payload: Record<string, unknown>) => {
      const { data: sessionData } = await sb.auth.getSession()
      const token = sessionData.session?.access_token
      return fetch(`/api/outbound-messages?__channel=${channel}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: outboundMessagesJsonBody(payload),
      })
    }
    if (input.notifyEmail) {
      if (!cust.email?.trim()) errs.push("No customer email on file.")
      else {
        const res = await postOutbound("email", {
          userId: input.ownerUserId,
          customerId: input.customerId,
          to: cust.email.trim(),
          subject: applied.subject,
          body: bodyPlain,
          bodyHtml: applied.bodyHtml,
          ...(input.eventId ? { calendarEventId: input.eventId } : {}),
        })
        const raw = await res.text()
        if (!res.ok) errs.push(formatOutboundError(raw))
      }
    }
    if (input.notifySms) {
      if (!cust.phone?.trim()) errs.push("No customer phone on file.")
      else {
        const res = await postOutbound("sms", {
          userId: input.ownerUserId,
          customerId: input.customerId,
          to: cust.phone.trim(),
          body: wrapAppointmentSmsBody(smsInner),
          ...(input.eventId ? { calendarEventId: input.eventId } : {}),
        })
        const raw = await res.text()
        if (!res.ok) errs.push(formatOutboundError(raw))
      }
    }
    return errs
  }


  function renderJobTypeSelect(
    value: string,
    context: "add" | "event",
    selectStyle: React.CSSProperties,
    onSelect: (id: string) => void,
  ) {
    return (
      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 4 }}>
          Job type
        </label>
        <select
          value={value}
          disabled={context === "event" && eventJobTypeSaving}
          onChange={(e) => {
            const id = e.target.value
            if (id === JOB_TYPE_CREATE_NEW_VALUE) {
              jobTypesModal?.openJobTypesModal({
                expandCreate: true,
                onChanged: () => void loadJobTypes(),
                onCreated: (newId) => {
                  void loadJobTypes().then(() => {
                    onSelect(newId)
                    if (context === "add") applyJobTypeToAddForm(newId)
                    else void saveEventJobType(newId)
                  })
                },
              })
              return
            }
            onSelect(id)
          }}
          style={selectStyle}
        >
          <option value="">No job type</option>
          {sortedJobTypes.map((jt) => (
            <option key={jt.id} value={jt.id}>
              {formatJobTypeSelectLabel(jt)}
            </option>
          ))}
          <option value={JOB_TYPE_CREATE_NEW_VALUE} style={{ fontWeight: 700 }}>
            + Create new job type…
          </option>
        </select>
        {jobTypes.length === 0 ? (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            No job types yet — choose <strong>Create new job type</strong> or open <strong>Job Types</strong> in the menu.
          </p>
        ) : null}
        {context === "event" && eventJobTypeSaving ? (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>Saving job type…</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="scheme-page scheme-calendar-page" style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-calendar-app="tradesman">
      <h1 style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {calendarSuite.id === "time_clock" ? "Time clock workspace" : calendarSuite.id === "team_management" ? "Team Management" : "Scheduling"}
        <span style={{ fontSize: "12px", fontWeight: 400, color: "#9ca3af" }}>(tradesman)</span>
      </h1>

      <div
        className="scheme-calendar-actions scheme-themed-panel"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          alignItems: "center",
          padding: "12px",
          background: theme.charcoalSmoke,
          borderRadius: "8px",
          border: `1px solid ${theme.border}`,
          boxSizing: "border-box",
        }}
      >
        {calendarSuite.id === "calendar" ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {showAddOnMainCalendar ? (
                <button
                  type="button"
                  onClick={() => { setShowAddItem(true); resetAddForm(); setAddTargetUserId(userId) }}
                  style={{ background: "var(--scheme-primary, #F97316)", color: "white", padding: "8px 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: 600 }}
                >
                  Add item to calendar
                </button>
              ) : null}
              {showTeamManagementEntry ? (
                <button
                  type="button"
                  onClick={() => setCalendarSuite({ id: "team_management", panel: "team_members" })}
                  style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "#eff6ff", cursor: "pointer", color: theme.text, fontWeight: 700 }}
                >
                  Team management
                </button>
              ) : null}
              {canOpenUnifiedMap ? (
                <button
                  type="button"
                  onClick={() => setCalendarSuite({ id: "scheduling_tools", panel: "customer_map" })}
                  style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "#eff6ff", cursor: "pointer", color: theme.text, fontWeight: 700 }}
                >
                  Map
                </button>
              ) : null}
              {userId ? (
                <>
                  <TabNotificationAlertsButton tab="calendar" profileUserId={userId} guideWizardId="scheduling_alerts" />
                </>
              ) : null}
            </div>
            {showCalAutoResponse ? (
              <button
                type="button"
                onClick={() => setShowAutoResponse(true)}
                style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
              >
                Auto Response Options
              </button>
            ) : null}
            {showCalJobTypes && !showTeamManagementEntry && !managedByOfficeManager && !showSchedulingToolsStandalone ? (
              <button
                type="button"
                onClick={openJobTypesFromCalendar}
                style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
              >
                Job Types
              </button>
            ) : null}
            {showCalCompletionSettings ? (
              <button
                type="button"
                onClick={() => setShowCompletionSettingsModal(true)}
                style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
              >
                {completionSettingsButtonLabel}
              </button>
            ) : null}
            {showCalReceiptTemplate ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowReceiptTemplateModal(true)}
                  style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}
                >
                  {receiptTemplateButtonLabel}
                </button>
              </>
            ) : null}
            {showCalCustomReceipt ? (
              <button
                type="button"
                onClick={() => {
                  setCustomReceiptPrefillCustomerId(null)
                  setShowCustomReceiptModal(true)
                }}
                style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text, fontWeight: 600 }}
              >
                {customReceiptButtonLabel}
              </button>
            ) : null}
            {showManagedJobTypesEntry ? (
              <button
                type="button"
                onClick={openJobTypesFromCalendar}
                style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text, fontWeight: 600 }}
              >
                Job types
              </button>
            ) : null}
            {showSchedulingToolsStandalone ? (
              <button
                type="button"
                onClick={() => {
                  if (canAccessCustomerMap) {
                    setCalendarSuite({ id: "scheduling_tools", panel: "customer_map" })
                  } else {
                    openJobTypesFromCalendar()
                  }
                }}
                style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "#eff6ff", cursor: "pointer", color: theme.text, fontWeight: 700 }}
              >
                Scheduling tools
              </button>
            ) : null}
            {customActionButtons.map((btn) => (
              <button key={btn.id} type="button" onClick={() => setOpenCustomButtonId(btn.id)} style={{ padding: "8px 14px", borderRadius: "6px", border: `1px solid ${theme.border}`, background: "white", cursor: "pointer", color: theme.text }}>
                {btn.label}
              </button>
            ))}
          </>
        ) : (
          <>
            {calendarSuite.id === "time_clock" ? (
              <>
                <button
                  type="button"
                  onClick={() => setCalendarSuite({ id: "team_management", panel: "team_members" })}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: `2px solid ${theme.primary}`,
                    background: "#eff6ff",
                    cursor: "pointer",
                    color: theme.text,
                    fontWeight: 700,
                  }}
                >
                  Back to team management
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarSuite({ id: "calendar" })}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: `1px solid ${theme.border}`,
                    background: "white",
                    cursor: "pointer",
                    color: theme.text,
                    fontWeight: 600,
                  }}
                >
                  Scheduling view
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>
                  Clock in/out and hours — team permissions and maps stay under Team management.
                </span>
              </>
            ) : calendarSuite.id === "team_management" ? (
              <>
                {(
                  ["job_types", ...(showCalSettings ? (["scheduling_settings"] as const) : [])] as const
                ).map((panel) => {
                  const active = calendarSuite.panel === panel
                  const label = panel === "job_types" ? "Job types" : calendarSettingsButtonLabel
                  return (
                    <button
                      key={panel}
                      type="button"
                      onClick={() => {
                        if (panel === "job_types") openJobTypesFromCalendar()
                        else setCalendarSuite({ id: "team_management", panel })
                      }}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "6px",
                        border: active ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                        background: active ? "#eff6ff" : "white",
                        cursor: "pointer",
                        color: theme.text,
                        fontWeight: active ? 700 : 500,
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </>
            ) : calendarSuite.id === "scheduling_tools" ? (
              <button
                type="button"
                onClick={() => setCalendarSuite({ id: "calendar" })}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: `2px solid ${theme.primary}`,
                  background: "#eff6ff",
                  cursor: "pointer",
                  color: theme.text,
                  fontWeight: 700,
                }}
              >
                Back to calendar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCalendarSuite({ id: "calendar" })}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: `2px solid ${theme.primary}`,
                  background: "#eff6ff",
                  cursor: "pointer",
                  color: theme.text,
                  fontWeight: 700,
                }}
              >
                Return to scheduling view
              </button>
            )}
          </>
        )}
      </div>

      {calendarShareMsg ? (
        <p
          role="status"
          style={{
            margin: "0 0 8px",
            fontSize: 13,
            color: calendarShareMsg.startsWith("Could not") || calendarShareMsg.startsWith("No active") ? "#b45309" : theme.text,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          {calendarShareMsg}
        </p>
      ) : null}

      {calendarSuite.id === "calendar" ? (
      <>
      {/* Scheduling area: view switcher + expand + job types */}
      <div className="scheme-calendar-shell scheme-themed-panel" style={{ border: `1px solid ${theme.border}`, borderRadius: "8px", background: "white", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            padding: isMobile ? "10px 12px" : "12px 16px",
            marginBottom: 0,
            background: theme.charcoalSmoke,
            borderBottom: `1px solid ${theme.border}`,
            boxSizing: "border-box",
          }}
        >
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
          <span style={{ fontWeight: 700, color: "#e2e8f0", marginLeft: isMobile ? "0" : "8px", flex: isMobile ? "1 1 100%" : undefined }}>
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
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowDisplayPrefs((v) => !v)}
              style={{ padding: "6px 12px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: showDisplayPrefs ? "#e2e8f0" : "white", cursor: "pointer", color: theme.text, fontWeight: 600 }}
            >
              Event titles
            </button>
            {showDisplayPrefs ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 6,
                  zIndex: 40,
                  width: 280,
                  padding: 12,
                  background: "#fff",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  boxShadow: "0 16px 36px rgba(15,23,42,0.18)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>Show on calendar chips</div>
                <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                  Pick what appears on each event. Order matches the list below.
                </p>
                {CALENDAR_TITLE_FIELD_OPTIONS.map((opt) => {
                  const checked = displayPrefs.titleFields.includes(opt.id)
                  return (
                    <label
                      key={opt.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#0f172a", cursor: "pointer" }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleTitleField(opt.id)} />
                      {opt.label}
                    </label>
                  )
                })}
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>Month chip style</div>
                {CALENDAR_CHIP_STYLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#0f172a", cursor: "pointer" }}
                  >
                    <input
                      type="radio"
                      name="cal-chip-style"
                      checked={displayPrefs.chipStyle === opt.id}
                      onChange={() => setChipStyle(opt.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ fontWeight: 700 }}>{opt.label}</span>
                      <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ padding: isMobile ? "12px" : "16px" }}>
        <div style={{ minHeight: expanded ? "70vh" : "400px", overflow: "auto" }}>
          {loadError && !sandboxTraining && (
            <p style={{ color: "#b91c1c", marginBottom: "8px", fontSize: "14px" }}>Scheduling error: {loadError}</p>
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
                          data-cal-month-day={calDayIsoLocal(cell)}
                          onDoubleClick={(e) => {
                            if ((e.target as HTMLElement).closest("[data-cal-event]")) return
                            openAddItemForDate(cell)
                          }}
                          style={{
                            padding: "4px",
                            border: `1px solid ${theme.border}`,
                            verticalAlign: "top",
                            height: expanded ? "120px" : "80px",
                            background:
                              monthEventDrag?.moved && monthEventDrag.ghostDayIso === calDayIsoLocal(cell)
                                ? "#e0f2fe"
                                : inMonth
                                  ? "white"
                                  : "#f9fafb",
                            color: inMonth ? theme.text : "#9ca3af",
                            cursor: "pointer",
                            userSelect: "none",
                            WebkitUserSelect: "none",
                          }}
                        >
                          <div style={{ fontWeight: isToday(cell) ? 700 : 400, fontSize: "13px", marginBottom: "4px" }}>{cell.getDate()}</div>
                          {dayEvents.slice(0, expanded ? 10 : 3).map((ev) => (
                            <div
                              key={ev.id}
                              data-cal-event
                              onPointerDown={(e) => beginMonthEventPointerDown(e, ev)}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                setSelectedEvent(ev)
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                ignoreEventCtxCloseUntilRef.current = Date.now() + 400
                                setEventCtxMenu({ x: e.clientX, y: e.clientY, event: ev })
                              }}
                              style={{
                                ...eventChipStyle(ev),
                                opacity: monthEventDrag?.event.id === ev.id && monthEventDrag.moved ? 0.35 : 1,
                                cursor: monthEventDrag?.event.id === ev.id ? "grabbing" : "grab",
                                userSelect: "none",
                                WebkitUserSelect: "none",
                              }}
                              title={`${formatEventChipLabel(ev)} · Double-click to open · Drag to move day`}
                            >
                              {formatEventChipLabel(ev)}
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
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => openAddItemForDate(d)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openAddItemForDate(d)
                      }}
                      style={{
                        background: "#f9fafb",
                        padding: "6px 8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        textAlign: "center",
                        color: theme.text,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>{WEEKDAY_NAMES_FULL[d.getDay()]}</div>
                      {WEEKDAY_NAMES[d.getDay()]} {d.getDate()}
                    </div>
                  )
                })}
              </div>
              <div ref={gridWrapperRef} style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)", overflow: "hidden", minWidth: isMobile ? "840px" : undefined }}>
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
                  const dayEvents = calendarVisibleEvents.filter((e) => {
                    const s = new Date(e.start_at)
                    const en = new Date(e.end_at)
                    if (!(s <= calDayEnd && en >= calDayStart)) return false
                    return s < dayEnd && en > dayStart
                  })
                  const dayIso = calDayIsoLocal(calDayStart)
                  const ghostActive =
                    gridEventDrag?.moved &&
                    gridEventDrag.ghostDayIso === dayIso
                  const ghostDurMin = gridEventDrag ? Math.max(15, Math.round(gridEventDrag.durationMs / 60000)) : 0
                  const ghostTopPx = ghostActive
                    ? ((gridEventDrag!.ghostMinutes - dayViewStartHour * 60) / 60) * HOUR_HEIGHT
                    : 0
                  const ghostHeightPx = ghostActive ? Math.max(2, (ghostDurMin / 60) * HOUR_HEIGHT) : 0
                  return (
                    <div
                      key={dayIdx}
                      data-cal-day-column
                      data-cal-day-iso={dayIso}
                      onClick={(e) => handleDayColumnClick(e, calDayStart)}
                      style={{ position: "relative", height: dayViewHours.length * HOUR_HEIGHT, background: "white", borderLeft: `1px solid ${theme.border}`, cursor: "pointer" }}
                    >
                      {ghostActive ? (
                        <div
                          style={{
                            position: "absolute",
                            left: 2,
                            right: 2,
                            top: ghostTopPx,
                            height: ghostHeightPx,
                            borderRadius: 4,
                            border: `2px dashed ${theme.primary}`,
                            background: "rgba(59,130,246,0.12)",
                            pointerEvents: "none",
                            zIndex: 3,
                          }}
                        />
                      ) : null}
                      {dayEvents.map((ev) => {
                        const start = new Date(ev.start_at)
                        const end = new Date(ev.end_at)
                        const clipStart = start < dayStart ? dayStart : start
                        const clipEnd = end > dayEnd ? dayEnd : end
                        const topMin = minutesFromDayStart(clipStart, dayStart)
                        const durMin = (clipEnd.getTime() - clipStart.getTime()) / (60 * 1000)
                        const topPx = (topMin / 60) * HOUR_HEIGHT
                        const heightPx = Math.max(2, (durMin / 60) * HOUR_HEIGHT)
                        const dragging = gridEventDrag?.event.id === ev.id && gridEventDrag.moved
                        return (
                          <div
                            key={ev.id}
                            data-cal-event
                            onPointerDown={(e) => beginGridEventPointerDown(e, ev, calDayStart)}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              setSelectedEvent(ev)
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              ignoreEventCtxCloseUntilRef.current = Date.now() + 400
                              setEventCtxMenu({ x: e.clientX, y: e.clientY, event: ev })
                            }}
                            style={{
                              position: "absolute",
                              left: 2,
                              right: 2,
                              top: topPx,
                              height: heightPx,
                              padding: "3px 6px",
                              borderRadius: "6px",
                              background: getEventColor(ev),
                              boxShadow: `inset 3px 0 0 ${getEventRibbonColorForEvent(ev)}`,
                              color: "#fff",
                              cursor: gridEventDrag?.event.id === ev.id ? "grabbing" : "grab",
                              fontSize: "11px",
                              overflow: "hidden",
                              boxSizing: "border-box",
                              opacity: dragging ? 0.35 : 1,
                              touchAction: "none",
                              zIndex: dragging ? 2 : 1,
                              fontWeight: 600,
                              userSelect: "none",
                            }}
                            title={`${formatEventChipLabel(ev)} · Double-click to open`}
                          >
                            {formatEventChipLabel(ev)}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div ref={gridWrapperRef} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "0", border: `1px solid ${theme.border}`, overflowX: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {dayViewHours.map((hour) => (
                  <div key={hour} style={{ padding: "4px 8px", fontSize: "12px", fontWeight: 500, background: "#f9fafb", borderBottom: `1px solid ${theme.border}`, height: HOUR_HEIGHT, boxSizing: "border-box", color: theme.text }}>
                    {hourLabel12hr(hour, 0)}
                  </div>
                ))}
              </div>
              <div
                data-cal-day-column
                data-cal-day-iso={calDayIsoLocal(currentDate)}
                onClick={(e) => handleDayColumnClick(e, currentDate)}
                style={{ position: "relative", height: dayViewHours.length * HOUR_HEIGHT, background: "white", cursor: "pointer" }}
              >
                {gridEventDrag?.moved && gridEventDrag.ghostDayIso === calDayIsoLocal(currentDate) ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 4,
                      right: 4,
                      top: ((gridEventDrag.ghostMinutes - dayViewStartHour * 60) / 60) * HOUR_HEIGHT,
                      height: Math.max(2, (Math.max(15, Math.round(gridEventDrag.durationMs / 60000)) / 60) * HOUR_HEIGHT),
                      borderRadius: 4,
                      border: `2px dashed ${theme.primary}`,
                      background: "rgba(59,130,246,0.12)",
                      pointerEvents: "none",
                      zIndex: 3,
                    }}
                  />
                ) : null}
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
                      const dragging = gridEventDrag?.event.id === ev.id && gridEventDrag.moved
                      return (
                        <div
                          key={ev.id}
                          data-cal-event
                          onPointerDown={(e) => beginGridEventPointerDown(e, ev, currentDate)}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setSelectedEvent(ev)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            ignoreEventCtxCloseUntilRef.current = Date.now() + 400
                            setEventCtxMenu({ x: e.clientX, y: e.clientY, event: ev })
                          }}
                          style={{
                            position: "absolute",
                            left: 4,
                            right: 4,
                            top: topPx,
                            height: heightPx,
                            padding: "5px 8px",
                            borderRadius: "8px",
                            background: getEventColor(ev),
                            boxShadow: `inset 3px 0 0 ${getEventRibbonColorForEvent(ev)}`,
                            color: "#fff",
                            cursor: gridEventDrag?.event.id === ev.id ? "grabbing" : "grab",
                            fontSize: "12px",
                            overflow: "hidden",
                            boxSizing: "border-box",
                            opacity: dragging ? 0.35 : 1,
                            touchAction: "none",
                            zIndex: dragging ? 2 : 1,
                            fontWeight: 600,
                            lineHeight: 1.35,
                            userSelect: "none",
                          }}
                          title={`${formatEventChipLabel(ev)} · Double-click to open`}
                        >
                          {formatEventChipLabel(ev)}
                        </div>
                      )
                    })
                })()}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
      </>
      ) : (
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: "8px",
            background: "white",
            padding: isMobile ? "14px" : "20px",
            overflow: "auto",
            maxHeight: calendarSuite.id === "time_clock" ? "calc(100vh - 160px)" : "calc(100vh - 220px)",
            boxSizing: "border-box",
          }}
        >
          {calendarSuite.id === "time_clock" && authUserId ? (
            <>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: theme.text, lineHeight: 1.55 }}>
                This view is only for <strong>time tracking</strong>. Team permission cards and maps stay under{" "}
                <strong>Team management → Team member options</strong> so this page stays focused on punches and hours.
              </p>
              <CalendarTeamManagementPanel
                officeManagerUserId={authUserId}
                viewerUserId={authUserId}
                roster={
                  scopeCtx?.clients?.length
                    ? scopeCtx.clients
                    : [{ userId: authUserId, label: "My account", email: authUser?.email ?? null, clientId: null, isSelf: true }]
                }
                managedOnly={(scopeCtx?.clients ?? []).filter((c) => !c.isSelf)}
                variant="time_clock_only"
                timeClockWorkspacePage
              />
            </>
          ) : null}
          {calendarSuite.id === "team_management" && calendarSuite.panel === "team_members" && authUserId ? (
            <CalendarTeamManagementPanel
              officeManagerUserId={authUserId}
              viewerUserId={authUserId}
              roster={
                scopeCtx?.clients?.length
                  ? scopeCtx.clients
                  : [{ userId: authUserId, label: "My account", email: authUser?.email ?? null, clientId: null, isSelf: true }]
              }
              managedOnly={(scopeCtx?.clients ?? []).filter((c) => !c.isSelf)}
              onOpenTimeClockWorkspace={() => setCalendarSuite({ id: "time_clock" })}
            />
          ) : null}
          {calendarSuite.id === "team_management" && calendarSuite.panel === "team_map" ? (
            teamMapUserIds.length > 0 ? (
            <TeamLocationsMapModal
              variant="embedded"
              title="Team map"
              members={teamMapMembers}
              orgUserIdsForJobs={teamMapUserIds}
              onClose={() => setCalendarSuite({ id: "team_management", panel: "team_members" })}
            />
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: theme.text, lineHeight: 1.5 }}>
                Team map needs at least one signed-in user. If you are previewing a demo team member, switch back to your account in the
                Viewing as bar, then reopen Team map.
              </p>
            )
          ) : null}
          {calendarSuite.id === "team_management" && calendarSuite.panel === "scheduling_settings" ? (
            <div>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: theme.text, lineHeight: 1.55 }}>
                Working hours, duplicate-time rules, and other calendar defaults for scheduling. Team permissions and time tracking are under{" "}
                <strong>Team member options</strong>.
              </p>
              {calendarSettingsItemsWithOrg.length === 0 ? (
                <p style={{ fontSize: 14, color: theme.text, opacity: 0.8 }}>No settings configured. Your admin can add items in the portal config.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, color: theme.text, maxWidth: 560 }}>
                  <PortalSettingItemsForm
                    items={calendarSettingsItemsWithOrg}
                    formValues={settingsFormValues}
                    setFormValue={(id, value) => {
                      setSettingsFormValues((prev) => ({ ...prev, [id]: value }))
                      if (id === "no_duplicate_times") {
                        writeCalendarNoDuplicateTimesSetting(value === "checked")
                      }
                      if (id === "__org_all_events") {
                        const next = value === "checked"
                        setShowAllOrgEvents(next)
                        try {
                          localStorage.setItem("calendar_showAllOrgEvents", String(next))
                        } catch {
                          /* ignore */
                        }
                      }
                    }}
                    isItemVisible={isCalendarSettingItemVisible}
                  />
                </div>
              )}
            </div>
          ) : null}
          {calendarSuite.id === "scheduling_tools" &&
          calendarSuite.panel === "customer_map" &&
          authUserId &&
          canAccessCustomerMap ? (
            <TeamLocationsMapModal
              variant="embedded"
              title="Team & jobs map"
              members={unifiedMapMembers}
              orgUserIdsForJobs={customerMapJobUserIds}
              sandboxDemoLocations={sandboxDemoLocations}
              resolveJobUserId={(id) => resolveSandboxDataUserId(id, calendarDbUserId || authUserId || id)}
              showTeamGps={canAccessTeamMap || sandboxTraining}
              showJobPins
              onClose={() => setCalendarSuite({ id: "calendar" })}
            />
          ) : null}
        </div>
      )}

      {/* Add item modal */}
      {showAddItem && (
        <>
          <div onClick={() => { setShowAddItem(false); setAddError("") }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: isMobile ? 420 : 920,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "white",
              borderRadius: "8px",
              padding: isMobile ? "24px" : "20px 24px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              zIndex: 9999,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: theme.text }}>Add to calendar</h3>
              <SetupWizardLaunchButton wizardId="scheduling_add_to_calendar" compact />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, alignItems: "start" }}>
              <div>
                <label style={{ fontSize: "12px", color: theme.text }}>Customer (optional)</label>
                <input
                  type="search"
                  autoComplete="off"
                  placeholder="Type to search customers…"
                  value={addCustomerSearch}
                  onChange={(e) => {
                    const v = e.target.value
                    setAddCustomerSearch(v)
                    if (!addCustomerId) return
                    const row = addCustomerOptions.find((c) => c.id === addCustomerId)
                    const label = row ? formatAddCustomerPickerLabel(row) : ""
                    if (label && v.trim().toLowerCase() !== label.trim().toLowerCase()) {
                      setAddCustomerId(null)
                    }
                  }}
                  style={{ ...addInputStyle, marginTop: 4 }}
                />
                <div
                  role="listbox"
                  aria-label="Matching customers"
                  style={{
                    marginTop: 6,
                    maxHeight: isMobile ? 180 : 140,
                    overflowY: "auto",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    background: "#fafafa",
                  }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={!addCustomerId}
                    onClick={() => {
                      setAddCustomerId(null)
                      setAddCustomerSearch("")
                      setAddNotifyEmail(false)
                      setAddNotifySms(false)
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      fontSize: 14,
                      border: "none",
                      borderBottom: `1px solid ${theme.border}`,
                      background: !addCustomerId ? "#eff6ff" : "transparent",
                      cursor: "pointer",
                      color: "#64748b",
                      fontWeight: !addCustomerId ? 700 : 500,
                    }}
                  >
                    — No customer —
                  </button>
                  {filteredAddCustomers.length === 0 ? (
                    <div style={{ padding: "12px 14px", fontSize: 13, color: "#64748b" }}>No matches.</div>
                  ) : (
                    filteredAddCustomers.map((c) => {
                      const label = formatAddCustomerPickerLabel(c)
                      const selected = addCustomerId === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            onAddCustomerPick(c.id)
                            setAddCustomerSearch(label)
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 14px",
                            fontSize: 14,
                            border: "none",
                            borderBottom: `1px solid ${theme.border}`,
                            background: selected ? "#eff6ff" : "transparent",
                            cursor: "pointer",
                            color: theme.text,
                            fontWeight: selected ? 700 : 500,
                          }}
                        >
                          {label}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
              <div>
                <label style={{ fontSize: "12px", color: theme.text, fontWeight: 600 }}>Assign to team member</label>
                <select value={addTargetUserId} onChange={(e) => setAddTargetUserId(e.target.value)} style={addInputStyle}>
                  {selectableUsers.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.label}{u.email ? ` (${u.email})` : ""}
                    </option>
                  ))}
                </select>
                {selectableUsers.length <= 1 ? (
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                    Link field users under Team management (Operations → Team management) or use sandbox demo team members to assign work to someone other than yourself.
                  </p>
                ) : null}
              </div>

              <div>
                <label style={{ fontSize: "12px", color: theme.text, fontWeight: 600 }}>Estimate (optional)</label>
                <select
                  value={addQuoteId ?? ""}
                  onChange={(e) => void applyAddQuoteSelection(e.target.value)}
                  style={{ ...addInputStyle, marginTop: 4 }}
                  disabled={addQuoteOptionsLoading}
                >
                  <option value="">— None —</option>
                  {addQuoteOptions.map((opt) => (
                    <option key={opt.quoteId} value={opt.quoteId}>
                      {opt.estimateLabel}
                    </option>
                  ))}
                </select>
                {addQuoteOptionsLoading ? (
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>Loading estimates…</p>
                ) : addQuoteOptions.length === 0 ? (
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                    {addCustomerId ? "No estimates for this customer yet." : "Select a customer to filter estimates, or pick from all estimates below."}
                  </p>
                ) : null}
              </div>

              <div style={isMobile ? undefined : { gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "12px", color: theme.text, fontWeight: 600 }}>Title</label>
                <input placeholder="Title" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} style={{ ...addInputStyle, marginTop: 4 }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="date" value={addStartDate} onChange={(e) => setAddStartDate(e.target.value)} style={{ ...addInputStyle, flex: 1 }} />
                  <select value={addStartTime} onChange={(e) => setAddStartTime(e.target.value)} style={addInputStyle}>
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
                  <label style={{ fontSize: "12px", color: theme.text }}>Time increments</label>
                  <select
                    value={timeIncrement}
                    onChange={(e) => {
                      const v = e.target.value === "60" ? 60 : 15
                      const parsed = parseDurationFieldToMinutes(addDurationStr, timeIncrement)
                      const base = parsed ?? 60
                      const rounded = snapMinutesToIncrement(base, v)
                      setAddDurationStr(formatDurationFieldFromMinutes(rounded, v))
                      setTimeIncrement(v)
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
                    value={addDurationStr}
                    onChange={(e) => setAddDurationStr(e.target.value)}
                    onBlur={() => {
                      const m = parseDurationFieldToMinutes(addDurationStr, timeIncrement)
                      if (m != null) setAddDurationStr(formatDurationFieldFromMinutes(m, timeIncrement))
                    }}
                    style={addInputStyle}
                  />
                </div>
              </div>

              {addRecurrencePortalItems.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: 0 }}>Recurrence</p>
                  {addJobTypeId && portalHasRecurrenceControls(addItemPortalItems) ? (
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                      Recurrence options apply even when a job type is selected. Defaults can also be set under{" "}
                      <strong>Job Types</strong>.
                    </p>
                  ) : null}
                  <PortalSettingItemsForm
                    items={addRecurrencePortalItems}
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
              ) : null}

              <div>
                <label style={{ fontSize: "12px", color: theme.text, fontWeight: 600 }}>Notes / description</label>
                <textarea
                  placeholder="Notes"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  rows={isMobile ? 2 : 4}
                  style={{ ...addInputStyle, marginTop: 4, resize: "vertical", minHeight: 72 }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontSize: "12px", color: theme.text, fontWeight: 600 }}>Job type</label>
                  <div style={{ marginTop: 4 }}>
                    {renderJobTypeSelect(addJobTypeId, "add", addInputStyle, (id) => {
                      setAddJobTypeId(id)
                      if (id) applyJobTypeToAddForm(id)
                      else setAddMileage("")
                    })}
                  </div>
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
              </div>

              {addOtherPortalItems.length > 0 ? (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10, ...(isMobile ? {} : { gridColumn: "1 / -1" }) }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>Options (from portal config)</p>
                  <PortalSettingItemsForm
                    items={addOtherPortalItems}
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
              ) : null}

              <div style={isMobile ? undefined : { gridColumn: "1 / -1" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>Notify customer</p>
                {!addCustomerId ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Select a customer to email or text appointment details.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: addCustomerCanEmail ? theme.text : "#94a3b8" }}>
                      <input
                        type="checkbox"
                        checked={addNotifyEmail}
                        disabled={!addCustomerCanEmail}
                        onChange={(e) => setAddNotifyEmail(e.target.checked)}
                      />
                      Email customer{selectedAddCustomer?.email?.trim() ? ` (${selectedAddCustomer.email.trim()})` : ""}
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: addCustomerCanSms ? theme.text : "#94a3b8" }}>
                      <input
                        type="checkbox"
                        checked={addNotifySms}
                        disabled={!addCustomerCanSms}
                        onChange={(e) => setAddNotifySms(e.target.checked)}
                      />
                      Text customer{selectedAddCustomer?.phone?.trim() ? ` (${selectedAddCustomer.phone.trim()})` : ""}
                    </label>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, ...(isMobile ? {} : { gridColumn: "1 / -1" }) }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: theme.text }}>
                  <input type="checkbox" checked={addAssignToSelectedUser} onChange={(e) => setAddAssignToSelectedUser(e.target.checked)} />
                  Assign to selected user calendar automatically
                </label>
                {addError && <p style={{ color: "#b91c1c", fontSize: "14px", margin: 0 }}>{addError}</p>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button onClick={saveEvent} disabled={addSaving} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                    {addSaving ? "Saving..." : "Add to calendar"}
                  </button>
                  <button onClick={() => { setShowAddItem(false); setAddError("") }} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </>
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
          guideWizardId="scheduling_receipt_template"
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
            <h3 style={{ margin: "0 0 16px", color: theme.text }}>Scheduling Auto Response Options</h3>
            <details open style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: "#f8fafc", padding: "10px 12px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, color: theme.text }}>Core automatic reply settings</summary>
              <div style={{ marginTop: 10 }}>
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
              </div>
            </details>
            <button onClick={() => setShowAutoResponse(false)} style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer" }}>Done</button>
          </div>
        </>
      )}

      {/* Selected event popover */}
      {completeFlowEvent && (
        <>
          <div
            onClick={() => {
              if (!completeBusy) {
                setCompleteEntireSeries(false)
                setCompleteFlowEvent(null)
              }
            }}
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
            {completeFlowSeriesCount > 1 ? (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={completeEntireSeries}
                  onChange={(e) => setCompleteEntireSeries(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Mark <strong>all {completeFlowSeriesCount} dates</strong> in this recurring series complete (same completion note on each; one receipt send if enabled below).
                </span>
              </label>
            ) : null}
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
                {completeCustomerPhone?.trim() ? (
                  <span style={{ marginLeft: 8 }}>
                    <CustomerCallButton
                      phone={completeCustomerPhone}
                      bridgeOwnerUserId={completeFlowEvent.user_id ?? userId}
                      compact
                    />
                  </span>
                ) : null}
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
                onClick={() => {
                  setCompleteEntireSeries(false)
                  setCompleteFlowEvent(null)
                }}
                style={{
                  padding: "8px 14px",
                  border: `1px solid ${theme.border}`,
                  borderRadius: "6px",
                  background: "white",
                  cursor: completeBusy ? "wait" : "pointer",
                  color: theme.charcoal,
                  fontWeight: 600,
                }}
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


      {eventCtxMenu ? (
        <div
          ref={eventCtxMenuRef}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: eventCtxMenuPos?.left ?? Math.min(eventCtxMenu.x, window.innerWidth - 308),
            top: eventCtxMenuPos?.top ?? Math.max(8, Math.min(eventCtxMenu.y, window.innerHeight - 400)),
            zIndex: 10050,
            width: 300,
            maxHeight: "min(78vh, 480px)",
            overflow: "auto",
            background: "#fff",
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            boxShadow: "0 18px 40px rgba(15,23,42,0.22)",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>Event look</div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {eventCtxMenu.event.title}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Color</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {JOB_TYPE_CALENDAR_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.label}
                onClick={() => void persistEventDisplayPatch(eventCtxMenu.event, { color_hex: c.hex })}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  border:
                    readCalendarEventDisplayMeta(eventCtxMenu.event.metadata).color_hex === c.hex
                      ? "2px solid #0f172a"
                      : `1px solid ${theme.border}`,
                  background: c.hex,
                  cursor: "pointer",
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => void persistEventDisplayPatch(eventCtxMenu.event, { color_hex: "" })}
              style={{
                padding: "2px 8px",
                fontSize: 11,
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: "#f8fafc",
                cursor: "pointer",
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              Reset
            </button>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Icon</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 120, overflow: "auto" }}>
            {JOB_TYPE_ICON_OPTIONS.slice(0, 18).map((opt) => (
              <button
                key={opt.id}
                type="button"
                title={opt.label}
                onClick={() => void persistEventDisplayPatch(eventCtxMenu.event, { icon_id: opt.id })}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border:
                    readCalendarEventDisplayMeta(eventCtxMenu.event.metadata).icon_id === opt.id
                      ? "2px solid #0f172a"
                      : `1px solid ${theme.border}`,
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {opt.glyph || "–"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Chip style (calendar view)</div>
          <div style={{ display: "grid", gap: 4 }}>
            {CALENDAR_CHIP_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setChipStyle(opt.id)
                }}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border:
                    displayPrefs.chipStyle === opt.id ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  background: displayPrefs.chipStyle === opt.id ? "#fff7ed" : "#fff",
                  cursor: "pointer",
                  color: "#0f172a",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedEvent(eventCtxMenu.event)
              setEventCtxMenu(null)
            }}
            style={{
              marginTop: 2,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Open event
          </button>
        </div>
      ) : null}

      {dragNotifyPrompt ? (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 10060 }} />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 10061,
              width: "min(420px, calc(100vw - 24px))",
              background: "#fff",
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              boxShadow: "0 20px 50px rgba(15,23,42,0.28)",
              padding: 18,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Send an update to the customer?</div>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
              This appointment was shared with the customer
              {dragNotifyPrompt.notifyEmail && dragNotifyPrompt.notifySms
                ? " by email and text"
                : dragNotifyPrompt.notifyEmail
                  ? " by email"
                  : " by text"}
              . Do you want to send a reschedule update?
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => dragNotifyResolverRef.current?.("cancel")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  color: "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => dragNotifyResolverRef.current?.("no")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                  color: "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => dragNotifyResolverRef.current?.("yes")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: theme.primary,
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </>
      ) : null}

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
              maxWidth: isMobile ? 420 : 920,
              maxHeight: "90vh",
              overflow: "auto",
              background: "white",
              borderRadius: "14px",
              padding: 0,
              boxShadow: "0 18px 50px rgba(15,23,42,0.28)",
              zIndex: 9999,
            }}
          >
            <div
              style={{
                padding: isMobile ? "18px 20px 14px" : "20px 24px 16px",
                borderBottom: `1px solid ${theme.border}`,
                background: `linear-gradient(135deg, ${getEventColor(selectedEvent)}22, #fff 55%)`,
                borderRadius: "14px 14px 0 0",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div
                  style={{
                    width: 12,
                    alignSelf: "stretch",
                    minHeight: 40,
                    borderRadius: 8,
                    background: getEventColor(selectedEvent),
                    boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.06)`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {getEventIconGlyph(selectedEvent) ? (
                      <span style={{ fontSize: 22, lineHeight: 1 }}>{getEventIconGlyph(selectedEvent)}</span>
                    ) : null}
                    <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? 18 : 20, fontWeight: 800, lineHeight: 1.25 }}>
                      {selectedEvent.title}
                    </h3>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569", fontWeight: 600 }}>
                    {new Date(selectedEvent.start_at).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {" – "}
                    {new Date(selectedEvent.end_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    {selectedEvent.job_types?.name ? ` · ${selectedEvent.job_types.name}` : ""}
                  </p>
                </div>
              </div>
            </div>
            <div style={{ padding: isMobile ? "16px 20px 24px" : "16px 24px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, alignItems: "start", marginBottom: 14 }}>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: theme.text }}>Customer</p>
                {selectedEvent.customers?.display_name ? (
                  <p style={{ margin: "0 0 6px", fontSize: 14, color: theme.text, fontWeight: 600 }}>{selectedEvent.customers.display_name}</p>
                ) : (
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "#64748b" }}>No customer linked</p>
                )}
                {(selectedEvent.customers?.service_address?.trim() ||
                  selectedEvent.customers?.service_lat != null ||
                  selectedEvent.customers?.service_lng != null) && (
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
                    <strong>Service address:</strong>{" "}
                    {selectedEvent.customers?.service_address?.trim() || "—"}
                    {selectedEvent.customers?.service_lat != null && selectedEvent.customers?.service_lng != null
                      ? ` · ${Number(selectedEvent.customers.service_lat).toFixed(5)}, ${Number(selectedEvent.customers.service_lng).toFixed(5)}`
                      : ""}
                  </p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(selectedEvent.customer_id || selectedEvent.quote_id) && setPage ? (
                    <button
                      type="button"
                      onClick={async () => {
                        let customerId = selectedEvent.customer_id ?? null
                        if (!customerId && selectedEvent.quote_id && supabase) {
                          const { data } = await supabase
                            .from("quotes")
                            .select("customer_id")
                            .eq("id", selectedEvent.quote_id)
                            .maybeSingle()
                          customerId = (data?.customer_id as string | null) ?? null
                        }
                        if (!customerId) {
                          alert("No customer is linked to this calendar event yet.")
                          return
                        }
                        queueCustomerProfile(customerId)
                        setSelectedEvent(null)
                        setPage("customer-profile")
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        background: "#fff",
                        color: theme.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Open customer profile
                    </button>
                  ) : null}
                  {selectedEvent.customer_id && showCalendarCustomerPayment ? (
                    <button
                      type="button"
                      onClick={() => setCustomerPaymentRequestOpen(true)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `2px solid ${theme.primary}`,
                        background: "#fff7ed",
                        color: theme.text,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Customer payment
                    </button>
                  ) : null}
                </div>
                {selectedEvent.quote_id ? (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ margin: 0, fontSize: 13, color: theme.text }}>
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
                ) : null}
              </div>

              <div>
                <label style={{ fontSize: "12px", color: theme.text, fontWeight: 600 }}>Assign to team member</label>
                {canAssignToTeam ? (
                  <>
                    <select
                      value={eventAssigneePick}
                      onChange={(e) => setEventAssigneePick(e.target.value)}
                      style={{ ...addInputStyle, marginTop: 4 }}
                    >
                      {selectableUsers.map((u) => (
                        <option key={u.userId} value={u.userId}>
                          {u.label}{u.email ? ` (${u.email})` : ""}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <button
                        type="button"
                        disabled={eventAssigneeSaving || !eventAssigneePick.trim()}
                        onClick={() => void saveEventAssignee()}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "none",
                          background: theme.primary,
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: eventAssigneeSaving ? "wait" : "pointer",
                        }}
                      >
                        {eventAssigneeSaving ? "Saving…" : "Save assignee"}
                      </button>
                      <span style={{ fontSize: 12, color: "#64748b" }}>
                        Currently: {calendarAssigneeLabel(selectedEvent, selectableUsers)}
                      </span>
                      {assigneeSaveNote ? (
                        <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>{assigneeSaveNote}</span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.text }}>
                    {selectedEvent.user_id ? calendarAssigneeLabel(selectedEvent, selectableUsers) : "—"}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="date"
                    value={eventEditStartDate}
                    onChange={(e) => setEventEditStartDate(e.target.value)}
                    style={{ ...addInputStyle, flex: 1 }}
                  />
                  <select
                    value={eventEditStartTime}
                    onChange={(e) => setEventEditStartTime(e.target.value)}
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
                  <label style={{ fontSize: "12px", color: theme.text }}>Time increments</label>
                  <select
                    value={timeIncrement}
                    onChange={(e) => {
                      const v = e.target.value === "60" ? 60 : 15
                      const parsed = parseDurationFieldToMinutes(eventEditDurationStr, timeIncrement)
                      const base = parsed ?? 60
                      const rounded = snapMinutesToIncrement(base, v)
                      setEventEditDurationStr(formatDurationFieldFromMinutes(rounded, v))
                      setTimeIncrement(v)
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
                    value={eventEditDurationStr}
                    onChange={(e) => setEventEditDurationStr(e.target.value)}
                    onBlur={() => {
                      const m = parseDurationFieldToMinutes(eventEditDurationStr, timeIncrement)
                      if (m != null) setEventEditDurationStr(formatDurationFieldFromMinutes(m, timeIncrement))
                    }}
                    style={addInputStyle}
                  />
                </div>
                {eventScheduleDirty && selectedEvent.customer_id ? (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: theme.text }}>Notify customer of schedule change</p>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                      <input
                        type="checkbox"
                        checked={rescheduleNotifyEmail}
                        onChange={(e) => setRescheduleNotifyEmail(e.target.checked)}
                      />
                      Email customer
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                      <input
                        type="checkbox"
                        checked={rescheduleNotifySms}
                        onChange={(e) => setRescheduleNotifySms(e.target.checked)}
                      />
                      Text customer
                    </label>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={eventScheduleSaving || !supabase}
                  onClick={() => void saveEventSchedule()}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: theme.primary,
                    color: "#fff",
                    fontWeight: 600,
                    cursor: eventScheduleSaving ? "wait" : "pointer",
                    fontSize: 13,
                    alignSelf: "flex-start",
                  }}
                >
                  {eventScheduleSaving ? "Saving…" : "Save date & time"}
                </button>
                {eventScheduleError ? (
                  <p style={{ margin: 0, fontSize: 13, color: "#b91c1c", lineHeight: 1.45 }}>{eventScheduleError}</p>
                ) : null}
                {(selectedEvent.recurrence_series_id || (selectedLegacyRecurringIds && selectedLegacyRecurringIds.length >= 2)) && (
                  <p style={{ margin: 0, fontSize: 12, color: "#2563eb", lineHeight: 1.45 }}>
                    <strong>Recurrence:</strong>{" "}
                    {selectedEvent.recurrence_series_id
                      ? selectedSeriesSiblingCount > 1
                        ? `${selectedSeriesSiblingCount} scheduled dates in this series`
                        : "Recurring series"
                      : `${selectedLegacyRecurringIds!.length} matching dates in view (legacy series)`}
                  </p>
                )}
              </div>

              {showRecurringRemoveChoices && addItemPortalItems.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: 0 }}>Recurrence</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                    Change frequency or end rules, then update the series. Non-completed occurrences are replaced using the date &amp; time above as the anchor.
                  </p>
                  <PortalSettingItemsForm
                    items={addItemPortalItems.filter((item) => !isRemoveRecurrencePortalItem(item))}
                    formValues={seriesRecurrenceValues}
                    setFormValue={(id, value) => setSeriesRecurrenceValues((p) => ({ ...p, [id]: value }))}
                    isItemVisible={(item) => isPortalItemVisible(addItemPortalItems, seriesRecurrenceValues, item)}
                  />
                  <button
                    type="button"
                    disabled={seriesRecurrenceSaving || !supabase}
                    onClick={() => void updateSeriesRecurrence()}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: theme.primary,
                      color: "#fff",
                      fontWeight: 600,
                      cursor: seriesRecurrenceSaving ? "wait" : "pointer",
                      fontSize: 13,
                      alignSelf: "flex-start",
                    }}
                  >
                    {seriesRecurrenceSaving ? "Updating…" : "Update recurrence series"}
                  </button>
                </div>
              ) : (
                <div aria-hidden style={{ minHeight: 0 }} />
              )}

              <div>
                <label style={{ fontSize: "12px", color: theme.text, fontWeight: 600 }}>Notes / description</label>
                <textarea
                  value={eventNotesDraft}
                  onChange={(e) => setEventNotesDraft(e.target.value)}
                  placeholder="Notes for this appointment"
                  rows={isMobile ? 2 : 4}
                  style={{ ...addInputStyle, marginTop: 4, resize: "vertical", minHeight: 72 }}
                />
                <button
                  type="button"
                  disabled={eventNotesSaving || !supabase}
                  onClick={() => void saveEventNotes()}
                  style={{
                    marginTop: 8,
                    padding: "8px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: theme.primary,
                    color: "#fff",
                    fontWeight: 600,
                    cursor: eventNotesSaving ? "wait" : "pointer",
                    fontSize: 13,
                  }}
                >
                  {eventNotesSaving ? "Saving…" : "Save description"}
                </button>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                  Description changes are saved without notifying the customer.
                </p>
                {selectedEvent.quote_total != null && selectedEvent.quote_total > 0 ? (
                  <p style={{ margin: "8px 0 0", fontSize: "14px", fontWeight: 600, color: theme.text }}>
                    Total: ${Number(selectedEvent.quote_total).toFixed(2)}
                  </p>
                ) : null}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontSize: "12px", color: theme.text, fontWeight: 600 }}>Job type</label>
                  <div style={{ marginTop: 4 }}>
                    {renderJobTypeSelect(eventEditJobTypeId, "event", addInputStyle, (id) => {
                      setEventEditJobTypeId(id)
                      void saveEventJobType(id || null)
                    })}
                  </div>
                </div>
                {(() => {
                  const jt =
                    selectedEvent.job_types && !Array.isArray(selectedEvent.job_types) ? selectedEvent.job_types : null
                  const jtResolved = jt ?? jobTypes.find((j) => j.id === selectedEvent.job_type_id)
                  if (!jtResolved?.track_mileage) return null
                  return (
                    <div>
                      <label style={{ fontSize: "12px", color: theme.text }}>Mileage (miles)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={eventMileageDraft}
                        onChange={(e) => setEventMileageDraft(e.target.value)}
                        placeholder="e.g. 42"
                        style={addInputStyle}
                      />
                      <button
                        type="button"
                        disabled={eventMileageSaving || !supabase}
                        onClick={() => void saveEventMileage()}
                        style={{
                          marginTop: 8,
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
              </div>
            </div>
            <details
              style={{
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                padding: "8px 10px",
                marginBottom: 14,
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
                Line items
                {eventLineItemRows.length > 0 ? (
                  <span style={{ fontWeight: 500, color: "#6b7280", marginLeft: 6 }}>
                    ({eventLineItemRows.length}
                    {eventLineItemSummaryHint ? ` — ${eventLineItemSummaryHint}` : ""})
                  </span>
                ) : selectedEvent.quote_id && quoteItemsForReceipt.length === 0 ? (
                  <span style={{ fontWeight: 500, color: "#6b7280", marginLeft: 6 }}>— loading estimate…</span>
                ) : (
                  <span style={{ fontWeight: 500, color: "#6b7280", marginLeft: 6 }}>— none yet</span>
                )}
              </summary>
              <div style={{ marginTop: 10 }}>
                {eventLineItemRows.length > 0 ? (
                  <ul
                    style={{
                      margin: "0 0 12px",
                      padding: "8px 10px",
                      listStyle: "none",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#fafafa",
                      maxHeight: 160,
                      overflowY: "auto",
                    }}
                  >
                    {eventLineItemRows.map((row) => (
                      <li
                        key={row.key}
                        style={{
                          fontSize: 12,
                          color: theme.text,
                          padding: "5px 0",
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginRight: 6 }}>
                          {row.sourceLabel}
                        </span>
                        {row.description}
                        {row.detail ? (
                          <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>{row.detail}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                    Items from the job type, linked estimate, or lines added on this event will appear here.
                  </p>
                )}
                <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 12, color: theme.text }}>Checklist / materials (one per line)</p>
                <textarea
                  value={eventMaterialsDraft}
                  onChange={(e) => setEventMaterialsDraft(e.target.value)}
                  rows={4}
                  placeholder="One line per item — from job type, estimate materials, or typed here"
                  style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
                />
                <button
                  type="button"
                  disabled={eventMaterialsSaving || !supabase}
                  onClick={() => void saveEventMaterialsList()}
                  style={{
                    marginTop: 8,
                    marginBottom: 14,
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
                  {eventMaterialsSaving ? "Saving…" : "Save checklist"}
                </button>
                <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 12, color: theme.text }}>Priced lines (estimate &amp; receipt)</p>
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
            </details>
            <details
              style={{
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                padding: "8px 10px",
                marginBottom: 14,
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
                Job site
                {jobSiteDraft.address.trim() ? (
                  <span style={{ fontWeight: 500, color: "#6b7280", marginLeft: 6 }}>
                    — {jobSiteDraft.address.trim().length > 36
                      ? `${jobSiteDraft.address.trim().slice(0, 36)}…`
                      : jobSiteDraft.address.trim()}
                  </span>
                ) : null}
              </summary>
              <div style={{ marginTop: 10 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: theme.text, fontWeight: 600 }}>Address</label>
                <textarea
                  value={jobSiteDraft.address}
                  onChange={(e) => setJobSiteDraft((p) => ({ ...p, address: e.target.value }))}
                  rows={2}
                  placeholder="Street, city, state"
                  style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", fontSize: 13, marginBottom: 8 }}
                />
                <details style={{ marginBottom: 8 }}>
                  <summary style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", cursor: "pointer", listStyle: "none" }}>
                    Coordinates (optional)
                  </summary>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <label style={{ flex: "1 1 120px", fontSize: 12 }}>
                      <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Lat</span>
                      <input
                        value={jobSiteDraft.lat}
                        onChange={(e) => setJobSiteDraft((p) => ({ ...p, lat: e.target.value }))}
                        style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", fontSize: 13 }}
                        placeholder="e.g. 40.7128"
                      />
                    </label>
                    <label style={{ flex: "1 1 120px", fontSize: 12 }}>
                      <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Lng</span>
                      <input
                        value={jobSiteDraft.lng}
                        onChange={(e) => setJobSiteDraft((p) => ({ ...p, lng: e.target.value }))}
                        style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", fontSize: 13 }}
                        placeholder="e.g. -74.0060"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={jobGeocodeBusy}
                    onClick={() => void geocodeJobSiteDraft()}
                    style={{
                      marginTop: 8,
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                      cursor: jobGeocodeBusy ? "wait" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {jobGeocodeBusy ? "Looking up…" : "Look up coordinates"}
                  </button>
                </details>
                <button
                  type="button"
                  disabled={jobSiteSaving || !supabase}
                  onClick={() => void saveEventJobSite()}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: theme.primary,
                    color: "#fff",
                    fontWeight: 600,
                    cursor: jobSiteSaving ? "wait" : "pointer",
                    fontSize: 13,
                  }}
                >
                  {jobSiteSaving ? "Saving…" : "Save job site"}
                </button>
              </div>
            </details>
            <details style={calendarEventEmailDetailsStyle}>
              <summary
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#111827",
                  cursor: "pointer",
                  listStyle: "none",
                }}
              >
                Email customer
              </summary>
              <div style={{ marginTop: 10 }}>
                <CalendarEventEmailCompose
                  event={selectedEvent}
                  userId={userId}
                  displayName={
                    typeof authUser?.user_metadata?.display_name === "string"
                      ? authUser.user_metadata.display_name.trim()
                      : null
                  }
                  role={authRole}
                />
              </div>
            </details>
            <details
              style={{
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                padding: "8px 10px",
                marginBottom: 12,
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
                Event files
                {calendarEventEntityRows.length > 0 ? (
                  <span style={{ fontWeight: 500, color: "#6b7280", marginLeft: 6 }}>({calendarEventEntityRows.length})</span>
                ) : null}
              </summary>
              <div style={{ marginTop: 10 }}>
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
                <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none", fontSize: 13, color: theme.text }}>
                  {calendarEventEntityRows.map((row) => {
                    const showThumb = isProbablyImageAttachment(row.content_type, row.public_url, row.file_name)
                    return (
                      <li key={row.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <a
                          href={row.public_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={row.file_name || undefined}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            color: theme.primary,
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          {showThumb ? (
                            <img
                              src={row.public_url}
                              alt={row.file_name || "Attachment"}
                              style={{
                                width: 48,
                                height: 48,
                                objectFit: "cover",
                                borderRadius: 8,
                                border: `1px solid ${theme.border}`,
                                display: "block",
                              }}
                            />
                          ) : (
                            row.file_name || "File"
                          )}
                        </a>
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
                    )
                  })}
                </ul>
              ) : (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>No files attached to this event yet.</p>
              )}
              </div>
            </details>
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
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#f8fafc",
              }}
            >
              <p style={{ margin: "0 0 8px", fontWeight: 700, color: theme.text, fontSize: 13 }}>Quick actions</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {setPage ? (
                  <button
                    type="button"
                    disabled={calendarEventActionBusy}
                    onClick={() => void openCreateEstimateFromEvent(selectedEvent)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: theme.primary,
                      color: "#fff",
                      fontWeight: 600,
                      cursor: calendarEventActionBusy ? "wait" : "pointer",
                      fontSize: 13,
                    }}
                  >
                    Create estimate
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={calendarEventActionBusy}
                  onClick={() => openAddItemFromEvent(selectedEvent)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    color: theme.text,
                    fontWeight: 600,
                    cursor: calendarEventActionBusy ? "wait" : "pointer",
                    fontSize: 13,
                  }}
                >
                  Add to calendar
                </button>
                <button
                  type="button"
                  disabled={calendarEventActionBusy}
                  onClick={() => void openCustomReceiptFromEvent(selectedEvent)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    color: theme.text,
                    fontWeight: 600,
                    cursor: calendarEventActionBusy ? "wait" : "pointer",
                    fontSize: 13,
                  }}
                >
                  Create receipt
                </button>
              </div>
            </div>
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
                      setCompleteEntireSeries(false)
                      setCompleteFlowEvent(selectedEvent)
                      setSelectedEvent(null)
                    }}
                    style={{ padding: "8px 14px", borderRadius: "6px", background: theme.primary, color: "white", border: "none", cursor: calendarEventActionBusy ? "wait" : "pointer", fontSize: "14px" }}
                  >
                    Complete
                  </button>
                )}
                {selectedEvent.customer_id ? (
                  <div style={{ width: "100%", marginTop: 4, marginBottom: 4 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: theme.text }}>Notify customer of cancellation</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                        <input type="checkbox" checked={removeNotifyEmail} onChange={(e) => setRemoveNotifyEmail(e.target.checked)} />
                        Email customer
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
                        <input type="checkbox" checked={removeNotifySms} onChange={(e) => setRemoveNotifySms(e.target.checked)} />
                        Text customer
                      </label>
                    </div>
                  </div>
                ) : null}
                {showRecurringRemoveChoices ? (
                  <>
                    <button
                      type="button"
                      disabled={calendarEventActionBusy}
                      onClick={async () => {
                        if (!supabase || !selectedEvent.id) return
                        const ev = selectedEvent
                        await removeCalendarEventWithOptionalNotify(ev, async () => {
                          if (!supabase) return
                          const prevCal = calendarEventEffectiveStatus(ev)
                          setCalendarEventActionBusy(true)
                          const { error: err } = await supabase
                            .from("calendar_events")
                            .update({ removed_at: new Date().toISOString() })
                            .eq("id", ev.id)
                          setCalendarEventActionBusy(false)
                          if (err) {
                            alert(err.message)
                            return
                          }
                          void invokeNotifyCalendarStatus([ev.id], prevCal, "Cancelled")
                          setSelectedEvent(null)
                          loadEvents()
                        })
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
                        const owner = resolveSandboxDataUserId(selectedEvent.user_id ?? userId, authUserId || userId)
                        const scopeId = selectedEvent.recurrence_series_id
                        const legacyIds = selectedLegacyRecurringIds
                        if (!scopeId && (!legacyIds || legacyIds.length < 2)) return
                        const msg = scopeId
                          ? "Remove the entire series? Every date in this recurrence will be removed. This cannot be undone."
                          : `Remove all ${legacyIds!.length} matching dates currently shown for this recurring set? This cannot be undone.`
                        if (!window.confirm(msg)) return
                        const prevCal = calendarEventEffectiveStatus(selectedEvent)
                        const idsToNotify = scopeId
                          ? events.filter((e) => e.recurrence_series_id === scopeId && !e.removed_at).map((e) => e.id)
                          : legacyIds!
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
                          void invokeNotifyCalendarStatus(idsToNotify, prevCal, "Cancelled")
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
                      const ev = selectedEvent
                      await removeCalendarEventWithOptionalNotify(ev, async () => {
                        if (!supabase) return
                        const prevCal = calendarEventEffectiveStatus(ev)
                        setCalendarEventActionBusy(true)
                        const { error: err } = await supabase
                          .from("calendar_events")
                          .update({ removed_at: new Date().toISOString() })
                          .eq("id", ev.id)
                        setCalendarEventActionBusy(false)
                        if (err) {
                          alert(err.message)
                          return
                        }
                        void invokeNotifyCalendarStatus([ev.id], prevCal, "Cancelled")
                        setSelectedEvent(null)
                        loadEvents()
                      })
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
          </div>
        </>
      )}
      {calendarSuite.id === "calendar" && userId ? (
        <div style={{ position: "fixed", bottom: 12, right: 12, zIndex: 30 }}>
          <button
            type="button"
            disabled={calendarShareBusy}
            onClick={() => void shareActiveJobsToDeviceCalendar()}
            title="Active jobs in the next 60 days. On the app, share sheet → Calendar; in a browser, downloads an .ics file to import. Full device sync may use push/subscribe later."
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              border: `1px solid ${theme.border}`,
              background: "#ffffffee",
              color: "#64748b",
              fontWeight: 600,
              fontSize: 11,
              cursor: calendarShareBusy ? "wait" : "pointer",
              boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
            }}
          >
            {calendarShareBusy ? "Preparing…" : isNativeApp() ? "Phone calendar (.ics)" : "Export .ics"}
          </button>
        </div>
      ) : null}

      {selectedEvent ? (
        <CustomerPaymentRequestModal
          open={customerPaymentRequestOpen}
          onClose={() => setCustomerPaymentRequestOpen(false)}
          supabase={supabase}
          userId={userId}
          customerId={selectedEvent.customer_id}
          customerName={selectedEvent.customers?.display_name ?? null}
          profile={customerPaymentProfile}
          estimateLabel={
            selectedEvent.quote_id ? `Estimate ${selectedEvent.quote_id.slice(0, 8)}` : selectedEvent.title ?? null
          }
          amountLabel={calendarPaymentAmountLabel}
          quoteId={selectedEvent.quote_id}
          calendarEventId={selectedEvent.id}
        />
      ) : null}
      <CustomReceiptModal
        open={showCustomReceiptModal}
        onClose={() => {
          setShowCustomReceiptModal(false)
          setCustomReceiptPrefillCustomerId(null)
        }}
        supabase={supabase}
        userId={userId}
        initialCustomerId={customReceiptPrefillCustomerId}
      />
    </div>
  )
}
