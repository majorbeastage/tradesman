import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useScopedAiAutomationsEnabled } from "../../hooks/useScopedAiAutomationsEnabled"
import { useAuth } from "../../contexts/AuthContext"
import { useLocale } from "../../i18n/LocaleContext"
import { theme } from "../../styles/theme"
import CommunicationUrgencyBadge, { communicationUrgencySelectOptions } from "../../components/CommunicationUrgencyBadge"
import LeadFilterPreferencesModal, { type LeadFilterPrefsState } from "../../components/LeadFilterPreferencesModal"
import {
  normalizeCommunicationUrgency,
  nextUrgencyAfterSilence,
  parseCustomersUrgencyAutomation,
  type CommunicationUrgency,
  urgencyRank,
  type CustomersUrgencyAutomationPrefs,
} from "../../lib/customerUrgency"
import { getFreshAccessToken, forceRefreshAccessToken } from "../../lib/authPlatformApi"
import { platformToolsJsonBody } from "../../lib/platformToolsJsonBody"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import CustomerCallButton from "../../components/CustomerCallButton"
import TabNotificationAlertsButton from "../../components/TabNotificationAlertsButton"
import ConversationAutoRepliesModal from "../../components/ConversationAutoRepliesModal"
import AddCustomerModal from "../../components/AddCustomerModal"
import CustomerSmsOptInSection from "../../components/CustomerSmsOptInSection"
import { EMPTY_MANUAL_SMS_CONSENT_SOURCE } from "../../components/CustomerSmsConsentSourceFields"
import {
  buildConsentAuditNote,
  mapManualMethodToSource,
  parseCustomerSmsConsent,
  persistCustomerSmsConsent,
  validateManualSmsConsentSourceInput,
} from "../../lib/customerSmsConsent"
import { VoicemailRecordingBlock, VoicemailTranscriptBlock } from "../../components/VoicemailEventBlock"
import { useIsMobile } from "../../hooks/useIsMobile"
import { PROFILE_METADATA_APPLIED_EVENT, type ProfileMetadataAppliedDetail } from "../../lib/profileMetadataEvents"
import { consumeQueuedCustomerFocus, queueCustomerFocus } from "../../lib/customerNavigation"
import SetupWizardLaunchButton from "../../components/SetupWizardLaunchButton"
import {
  loadCustomerCalendarEvents,
  type CustomerCalendarEventRow,
} from "../../lib/customerSchedulingActivity"
import {
  queueQuotesCustomerPrefill,
  queueSchedulingCustomerPrefill,
  queueSchedulingQuotePrefill,
} from "../../lib/workflowNavigation"
import { geocodeAddressToLatLng } from "../../lib/jobSiteLocation"
import { getControlItemsForUser, getPageActionVisible } from "../../types/portal-builder"
import { leadFitBadgeEl } from "../../lib/leadFitUi"
import {
  clampSmsUserPortion,
  DEFAULT_SMS_POLICIES_URL,
  maxUserCharsForFirstSmsVariant,
  SMS_OUTBOUND_BODY_HARD_MAX_CHARS,
} from "../../lib/smsComplianceLimits"
import { SmsComposeCharBudget, SmsFirstOutboundCallout } from "../../components/SmsComposeFirstSendNotice"
import { requiresManualSmsOptInRecord, resolveSmsFirstComplianceVariant } from "../../lib/smsFirstOutboundCompliance"
import { customerEmailFromIdentifiers, formatCustomerContactLine } from "../../lib/customerIdentifiers"
import {
  SPECIALTY_REPORT_REGISTRY_KEY,
  parseSpecialtyReportRegistry,
  specialtyReportLinkedCustomerId,
  type SpecialtyReportRegistryItem,
} from "../../lib/specialtyReports/reportRecords"
import { parseCustomerPaymentMetadata, type CustomerPaymentProfileMetadata } from "../../lib/customerPaymentMetadata"
import CustomerPaymentRequestModal from "../../components/CustomerPaymentRequestModal"

const JOB_PIPELINE_OPTIONS = [
  "New Lead",
  "First Contact Sent",
  "First Reply Received",
  "Job Description Received",
  "Quote Sent",
  "Quote Approved",
  "Scheduled",
  "Lost",
  "Completed",
] as const

function formatFetchApiError(response: Response, raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.includes("Function_invocation_failed") || trimmed.includes("FUNCTION_INVOCATION_FAILED")) {
    return (
      "The server function crashed or timed out. Check deployment logs for /api/outbound-messages or /api/send-sms. " +
      "Common causes: missing env keys, Resend/Twilio errors."
    )
  }
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>
      const parts = [j.error, j.message, j.hint, j.logWarning].filter((x) => typeof x === "string" && String(x).trim()) as string[]
      if (parts.length) return parts.join("\n\n")
    } catch {
      /* ignore */
    }
  }
  return trimmed || `Request failed (HTTP ${response.status})`
}

const DEFAULT_BEST_CONTACT_OPTIONS = ["Phone call", "Text message", "Email", "Other"] as const

type CustomerRow = {
  id: string
  display_name: string | null
  customer_identifiers?: { type: string; value: string }[] | null
  service_address?: string | null
  service_lat?: number | null
  service_lng?: number | null
  best_contact_method?: string | null
  job_pipeline_status?: string | null
  communication_urgency?: string | null
  last_activity_at?: string | null
  updated_at?: string | null
  fit_classification?: string | null
  fit_confidence?: number | null
  fit_reason?: string | null
  fit_source?: string | null
  fit_manually_overridden?: boolean | null
  fit_evaluated_at?: string | null
  metadata?: unknown
}

function inferDefaultBestContact(c: CustomerRow): string {
  if (c.best_contact_method?.trim()) return c.best_contact_method.trim()
  const hasPhone = !!c.customer_identifiers?.some((i) => i.type === "phone" && String(i.value ?? "").trim())
  const hasEmail = !!c.customer_identifiers?.some((i) => i.type === "email" && String(i.value ?? "").trim())
  if (hasPhone) return "Phone call"
  if (hasEmail) return "Email"
  return "Other"
}

function displayBestContact(c: CustomerRow): string {
  return c.best_contact_method?.trim() || inferDefaultBestContact(c)
}

function customerContactLine(c: CustomerRow): string {
  return formatCustomerContactLine(c.customer_identifiers ?? null)
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

function lastUpdateDisplay(c: CustomerRow): string {
  return formatWhen(c.last_activity_at ?? null)
}

/** Prefer latest communication_events timestamp when newer than customers.last_activity_at. */
function mergeLastActivityFromRecentEvents(
  rows: CustomerRow[],
  latestMsByCustomer: Map<string, number>,
): CustomerRow[] {
  return rows.map((c) => {
    const evMs = latestMsByCustomer.get(c.id) ?? 0
    const dbMs = Date.parse(c.last_activity_at || "") || 0
    if (evMs > dbMs) return { ...c, last_activity_at: new Date(evMs).toISOString() }
    return c
  })
}

function buildLatestEventMsByCustomer(
  events: Array<{ customer_id?: string | null; created_at?: string | null }> | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of events ?? []) {
    const cid = String(row.customer_id ?? "").trim()
    if (!cid || map.has(cid)) continue
    const ms = Date.parse(String(row.created_at ?? ""))
    if (Number.isFinite(ms)) map.set(cid, ms)
  }
  return map
}

/** Workflow row chrome (matches Estimates “Start quote” section summaries). */
const CUSTOMER_COMM_CARD_SUMMARY: CSSProperties = {
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 15,
  color: theme.text,
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  margin: 0,
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  background: "#fff",
  textAlign: "left",
}

function classifyCustomerCommChannel(item: { kind: "msg" | "ev"; payload: Record<string, unknown> }): "sms" | "email" | "phone" | "other" {
  if (item.kind === "msg") return "sms"
  const ev = item.payload as { event_type?: string }
  const t = String(ev?.event_type ?? "").toLowerCase()
  if (t === "email") return "email"
  if (t === "sms") return "sms"
  if (t === "voicemail" || t.includes("call") || t === "phone" || t === "missed_call") return "phone"
  return "other"
}

function activityRowLabel(item: { kind: "msg" | "ev"; payload: any }): string {
  if (item.kind === "msg") {
    return item.payload?.sender === "customer" ? "Inbound text" : "Message"
  }
  const ev = item.payload
  return `${ev?.event_type || "Event"} ${ev?.direction || ""}`.trim()
}

function activityPreviewSnippet(item: { kind: "msg" | "ev"; payload: any }): string {
  if (item.kind === "msg") return String(item.payload?.content ?? "").trim().slice(0, 200)
  const ev = item.payload
  const subj = ev?.subject?.trim() ? `${ev.subject.trim()} — ` : ""
  return (subj + String(ev?.body ?? "")).trim().slice(0, 220)
}

function commChannelOneLineSummary(
  channel: "phone" | "sms" | "email",
  items: { sortMs: number; key: string; kind: "msg" | "ev"; payload: any }[],
  contactOnFile?: string,
): string {
  if (items.length === 0) {
    const hint = contactOnFile?.trim()
    if (channel === "phone") return hint ? `Phone · ${hint} · No calls logged yet` : "Phone · No calls or voicemail logged yet"
    if (channel === "sms") return hint ? `SMS · ${hint} · No texts yet` : "SMS · No texts in this thread yet"
    return hint ? `Email · ${hint} · No email logged yet` : "Email · No email logged yet"
  }
  const last = items[items.length - 1]
  const when = last.sortMs ? new Date(last.sortMs).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"
  const n = items.length
  const label = channel === "phone" ? "Phone" : channel === "sms" ? "SMS" : "Email"
  return `${label} · ${n} item${n === 1 ? "" : "s"} · Last ${when}`
}

function isCompletedJobStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "completed"
}

export default function CustomersPage({ setPage }: { setPage?: (page: string) => void } = {}) {
  const userId = useScopedUserId()
  const { session } = useAuth()
  const { t } = useLocale()
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(userId)
  const portalConfig = usePortalConfigForPage()
  const showCustomersCustomerPayment = getPageActionVisible(portalConfig, "customers", "customer_payment")
  const isMobile = useIsMobile()
  const [activeCustomers, setActiveCustomers] = useState<CustomerRow[]>([])
  const [inProcessCustomers, setInProcessCustomers] = useState<CustomerRow[]>([])
  const [archivedCustomers, setArchivedCustomers] = useState<CustomerRow[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")
  const [customerPaymentProfile, setCustomerPaymentProfile] = useState<CustomerPaymentProfileMetadata>({})
  const [customerPaymentRequestOpen, setCustomerPaymentRequestOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [filterUrgency, setFilterUrgency] = useState<string>("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [section, setSection] = useState<"active" | "in_process" | "archived">("active")
  const [loadError, setLoadError] = useState<string>("")
  const [pendingFocusCustomerId, setPendingFocusCustomerId] = useState<string | null>(() => consumeQueuedCustomerFocus())
  const [showAutoReplies, setShowAutoReplies] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [detailRecordSmsConsent, setDetailRecordSmsConsent] = useState(false)
  const [detailConsentSource, setDetailConsentSource] = useState(EMPTY_MANUAL_SMS_CONSENT_SOURCE)
  const [detailConsentSourceTouched, setDetailConsentSourceTouched] = useState(false)
  const [detailSmsConsentSaving, setDetailSmsConsentSaving] = useState(false)
  const [detailEditMode, setDetailEditMode] = useState(false)
  const [customerInsightOpen, setCustomerInsightOpen] = useState(false)
  const [contactJobDetailsOpen, setContactJobDetailsOpen] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [serviceGeocodeBusy, setServiceGeocodeBusy] = useState(false)
  const [detailForm, setDetailForm] = useState<{
    customerName: string
    phone: string
    email: string
    serviceAddress: string
    serviceLat: string
    serviceLng: string
    bestContact: string
    jobStatus: string
    urgency: CommunicationUrgency
  }>({
    customerName: "",
    phone: "",
    email: "",
    serviceAddress: "",
    serviceLat: "",
    serviceLng: "",
    bestContact: DEFAULT_BEST_CONTACT_OPTIONS[0],
    jobStatus: JOB_PIPELINE_OPTIONS[0],
    urgency: "Good Standing",
  })

  const [customerMessages, setCustomerMessages] = useState<any[]>([])
  const [customerCommEvents, setCustomerCommEvents] = useState<any[]>([])
  const [customerActivityLoading, setCustomerActivityLoading] = useState(false)
  const [primaryConversationId, setPrimaryConversationId] = useState<string | null>(null)
  const [customerReplySms, setCustomerReplySms] = useState("")
  const [customerEmailTo, setCustomerEmailTo] = useState("")
  const [customerEmailSubject, setCustomerEmailSubject] = useState("")
  const [customerEmailBody, setCustomerEmailBody] = useState("")
  const [customerSmsSending, setCustomerSmsSending] = useState(false)
  const [customerEmailSending, setCustomerEmailSending] = useState(false)
  const [voicemailProfileDisplay, setVoicemailProfileDisplay] = useState<string>("use_channel")
  const [completeBusy, setCompleteBusy] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [showLeadFilterPrefs, setShowLeadFilterPrefs] = useState(false)
  const [leadFilterSaveBusy, setLeadFilterSaveBusy] = useState(false)
  const [leadFilterPrefs, setLeadFilterPrefs] = useState<LeadFilterPrefsState>({
    accepted_job_types: "",
    minimum_job_size: "",
    service_radius_miles: "",
    use_account_service_radius: true,
    availability: "flexible",
    enable_auto_filter: false,
    use_ai_for_unclear: true,
  })
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null)
  /** profiles.display_name — used in SMS compliance footer preview and character budget. */
  const [contractorSmsDisplayName, setContractorSmsDisplayName] = useState("")
  const [timelineExpanded, setTimelineExpanded] = useState<Record<string, boolean>>({})
  const [commCardOpen, setCommCardOpen] = useState({ phone: false, sms: false, email: false })
  const [commHistoryChannel, setCommHistoryChannel] = useState<null | "phone" | "sms" | "email">(null)
  const [aiSummaryByKey, setAiSummaryByKey] = useState<Record<string, string>>({})
  const [aiSummaryBusy, setAiSummaryBusy] = useState<Record<string, boolean>>({})
  const [manualFitChoice, setManualFitChoice] = useState<"hot" | "maybe" | "bad" | "">("")
  const [fitOverrideBusy, setFitOverrideBusy] = useState(false)
  const [fitReRunBusy, setFitReRunBusy] = useState(false)
  const [customerReports, setCustomerReports] = useState<SpecialtyReportRegistryItem[]>([])
  const [customerCalendarEvents, setCustomerCalendarEvents] = useState<CustomerCalendarEventRow[]>([])

  const conversationPortalDefaults = useMemo(() => {
    const items = getControlItemsForUser(portalConfig, "conversations", "conversation_settings", { aiAutomationsEnabled })
    const out: Record<string, string> = {}
    for (const item of items) {
      if (item.type === "checkbox") out[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) out[item.id] = item.options[0]
      else out[item.id] = ""
    }
    return out
  }, [portalConfig, aiAutomationsEnabled])

  const customerActivityItems = useMemo(() => {
    const items: { sortMs: number; key: string; kind: "msg" | "ev"; payload: any }[] = []
    for (const m of customerMessages) {
      const t = m.created_at ? Date.parse(m.created_at) : 0
      items.push({ sortMs: t, key: `m-${m.id}`, kind: "msg", payload: m })
    }
    for (const e of customerCommEvents) {
      const t = e.created_at ? Date.parse(e.created_at) : 0
      items.push({ sortMs: t, key: `e-${e.id}`, kind: "ev", payload: e })
    }
    items.sort((a, b) => a.sortMs - b.sortMs)
    return items
  }, [customerMessages, customerCommEvents])

  const commItemsByChannel = useMemo(() => {
    const phone: typeof customerActivityItems = []
    const sms: typeof customerActivityItems = []
    const email: typeof customerActivityItems = []
    for (const it of customerActivityItems) {
      const ch = classifyCustomerCommChannel(it)
      if (ch === "phone") phone.push(it)
      else if (ch === "sms") sms.push(it)
      else if (ch === "email") email.push(it)
    }
    return { phone, sms, email }
  }, [customerActivityItems])

  const activityMaxSortMs = useMemo(() => {
    let m = 0
    for (const it of customerActivityItems) {
      if (it.sortMs > m) m = it.sortMs
    }
    return m
  }, [customerActivityItems])

  const customerWaitingForReply = useMemo(() => {
    if (customerActivityItems.length === 0) return false
    const last = customerActivityItems[customerActivityItems.length - 1]
    if (last.kind === "msg") {
      const sender = String(last.payload?.sender ?? "").toLowerCase()
      const dir = String(last.payload?.direction ?? "").toLowerCase()
      return sender === "customer" || dir === "inbound" || dir === "in"
    }
    const dir = String(last.payload?.direction ?? "").toLowerCase()
    return dir === "inbound" || dir === "in"
  }, [customerActivityItems])

  const bumpCustomerLastActivity = useCallback(
    async (customerId: string) => {
      if (!supabase) return
      const nowIso = new Date().toISOString()
      const { error } = await supabase.from("customers").update({ last_activity_at: nowIso }).eq("id", customerId)
      if (error && !String(error.message || "").toLowerCase().includes("last_activity")) {
        console.warn("[customers] last_activity_at bump", error.message)
      }
    },
    [supabase],
  )

  useEffect(() => {
    setCommHistoryChannel(null)
    setCustomerInsightOpen(false)
    setContactJobDetailsOpen(false)
    setDetailRecordSmsConsent(false)
    setDetailConsentSource(EMPTY_MANUAL_SMS_CONSENT_SOURCE)
    setDetailConsentSourceTouched(false)
    if (!selectedCustomer) {
      setCommCardOpen({ phone: false, sms: false, email: false })
      return
    }
    const ids = selectedCustomer.customer_identifiers ?? []
    const hasPhone = ids.some((i) => i.type === "phone" && String(i.value ?? "").trim())
    const hasEmail = ids.some((i) => i.type === "email" && String(i.value ?? "").trim())
    setCommCardOpen({ phone: hasPhone, sms: hasPhone, email: hasEmail })
  }, [selectedCustomer?.id])

  const smsFirstComplianceVariant = useMemo(
    () => resolveSmsFirstComplianceVariant(customerCommEvents),
    [customerCommEvents],
  )

  const smsComposeMaxChars = useMemo(() => {
    if (!smsFirstComplianceVariant) return SMS_OUTBOUND_BODY_HARD_MAX_CHARS
    const biz = contractorSmsDisplayName.trim() || "Your business"
    return maxUserCharsForFirstSmsVariant(smsFirstComplianceVariant, biz, DEFAULT_SMS_POLICIES_URL)
  }, [smsFirstComplianceVariant, contractorSmsDisplayName])

  const selectedCustomerSmsConsent = useMemo(
    () => (selectedCustomer ? parseCustomerSmsConsent(selectedCustomer.metadata) : null),
    [selectedCustomer],
  )

  const selectedCustomerPhoneOnFile = useMemo(() => {
    if (!selectedCustomer) return ""
    return selectedCustomer.customer_identifiers?.find((i) => i.type === "phone")?.value?.trim() ?? ""
  }, [selectedCustomer])

  const customerHasPhone = Boolean(selectedCustomerPhoneOnFile || detailForm.phone.trim())

  /** Manual opt-in UI only for manually entered numbers — not when they called/voicemail first. */
  const showManualSmsOptInSection = useMemo(() => {
    if (!customerHasPhone || customerActivityLoading) return false
    return requiresManualSmsOptInRecord(customerCommEvents)
  }, [customerHasPhone, customerActivityLoading, customerCommEvents])

  const smsBlockedPendingManualOptIn =
    showManualSmsOptInSection && !selectedCustomerSmsConsent

  async function recordDetailSmsConsent() {
    if (!supabase || !selectedCustomer || !detailRecordSmsConsent) return
    const phone = selectedCustomerPhoneOnFile || detailForm.phone.trim()
    if (!phone) {
      alert("Add a phone number for this customer before recording SMS opt-in.")
      return
    }
    const srcErr = validateManualSmsConsentSourceInput(detailConsentSource)
    if (srcErr) {
      setDetailConsentSourceTouched(true)
      alert(srcErr)
      return
    }
    const method = detailConsentSource.method
    if (!method) return
    setDetailSmsConsentSaving(true)
    try {
      const biz = contractorSmsDisplayName.trim() || "Your business"
      const { metadata } = await persistCustomerSmsConsent(supabase, selectedCustomer.id, selectedCustomer.metadata, {
        source: mapManualMethodToSource(method),
        businessName: biz,
        consentMethod: method,
        consentUrl: detailConsentSource.consentUrl,
        consentNote: buildConsentAuditNote(detailConsentSource),
      })
      const patched: CustomerRow = { ...selectedCustomer, metadata }
      setSelectedCustomer(patched)
      setActiveCustomers((rows) => rows.map((r) => (r.id === patched.id ? patched : r)))
      setInProcessCustomers((rows) => rows.map((r) => (r.id === patched.id ? patched : r)))
      setArchivedCustomers((rows) => rows.map((r) => (r.id === patched.id ? patched : r)))
      setDetailRecordSmsConsent(false)
      setDetailConsentSource(EMPTY_MANUAL_SMS_CONSENT_SOURCE)
      setDetailConsentSourceTouched(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailSmsConsentSaving(false)
    }
  }

  useEffect(() => {
    if (!supabase || !userId) {
      setCustomerPaymentProfile({})
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const m =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        setCustomerPaymentProfile(parseCustomerPaymentMetadata(m))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    setCustomerReplySms((prev) => (prev.length <= smsComposeMaxChars ? prev : prev.slice(0, smsComposeMaxChars)))
  }, [smsComposeMaxChars])

  const applyDetailFromCustomer = useCallback((c: CustomerRow) => {
    const phone = c.customer_identifiers?.find((i) => i.type === "phone")?.value?.trim() ?? ""
    const email = c.customer_identifiers?.find((i) => i.type === "email")?.value?.trim() ?? ""
    const bc = displayBestContact(c)
    const best = (DEFAULT_BEST_CONTACT_OPTIONS as readonly string[]).includes(bc) ? bc : DEFAULT_BEST_CONTACT_OPTIONS[0]
    const js = c.job_pipeline_status?.trim()
    const jobOk = js && (JOB_PIPELINE_OPTIONS as readonly string[]).includes(js) ? js : JOB_PIPELINE_OPTIONS[0]
    setDetailForm({
      customerName: c.display_name?.trim() ?? "",
      phone,
      email,
      serviceAddress: typeof c.service_address === "string" ? c.service_address : "",
      serviceLat: c.service_lat != null && Number.isFinite(Number(c.service_lat)) ? String(c.service_lat) : "",
      serviceLng: c.service_lng != null && Number.isFinite(Number(c.service_lng)) ? String(c.service_lng) : "",
      bestContact: best,
      jobStatus: jobOk,
      urgency: normalizeCommunicationUrgency(c.communication_urgency),
    })
  }, [])

  const loadCustomers = useCallback(async () => {
    if (!userId || !supabase) {
      if (!supabase) setLoadError("Supabase not configured.")
      return
    }
    setLoadError("")

    const activeIds = new Set<string>()
    const recurringBookedIds = new Set<string>()

    const addActive = (r: { data?: { customer_id?: string }[] | null; error?: { message?: string } | null }) => {
      if (!r.error && r.data) r.data.forEach((row) => row.customer_id && activeIds.add(row.customer_id))
    }

    let eventsRes = await supabase.from("calendar_events").select("customer_id").eq("user_id", userId).is("removed_at", null).is("completed_at", null)
    if (eventsRes.error) {
      eventsRes = await supabase.from("calendar_events").select("customer_id").eq("user_id", userId).is("removed_at", null)
    }
    addActive(eventsRes)
    let recurringRes = await supabase
      .from("calendar_events")
      .select("customer_id, recurrence_series_id")
      .eq("user_id", userId)
      .is("removed_at", null)
      .is("completed_at", null)
    if (recurringRes.error) {
      recurringRes = await supabase
        .from("calendar_events")
        .select("customer_id, recurrence_series_id")
        .eq("user_id", userId)
        .is("removed_at", null)
    }
    if (!recurringRes.error && recurringRes.data) {
      recurringRes.data.forEach((row) => {
        if (row.customer_id && row.recurrence_series_id) recurringBookedIds.add(row.customer_id)
      })
    }

    const leadsRes = await supabase.from("leads").select("customer_id").eq("user_id", userId).is("removed_at", null).is("converted_at", null)
    const leadsResFallback = leadsRes.error
      ? await supabase.from("leads").select("customer_id").eq("user_id", userId).is("removed_at", null)
      : leadsRes
    addActive(leadsResFallback)

    const convosRes = await supabase.from("conversations").select("customer_id").eq("user_id", userId).is("removed_at", null)
    addActive(convosRes)

    const quotesRes = await supabase.from("quotes").select("customer_id").eq("user_id", userId).is("removed_at", null).is("scheduled_at", null)
    addActive(quotesRes)

    /** Customers referenced by leads, quotes, conversations, or calendar (any history). */
    const relatedIds = new Set<string>()
    const [allLeads, allConvos, allQuotes, allEvents, ownedCustomersRes] = await Promise.all([
      supabase.from("leads").select("customer_id").eq("user_id", userId),
      supabase.from("conversations").select("customer_id").eq("user_id", userId),
      supabase.from("quotes").select("customer_id").eq("user_id", userId),
      supabase.from("calendar_events").select("customer_id").eq("user_id", userId),
      supabase.from("customers").select("id").eq("user_id", userId),
    ])
    ;[allLeads.data, allConvos.data, allQuotes.data, allEvents.data].forEach((data) => {
      if (data) data.forEach((row: { customer_id?: string }) => row.customer_id && relatedIds.add(row.customer_id))
    })

    const allIds = new Set<string>()
    if (ownedCustomersRes.error) {
      setLoadError(ownedCustomersRes.error.message)
      setActiveCustomers([])
      setInProcessCustomers([])
      setArchivedCustomers([])
      return
    }
    for (const row of ownedCustomersRes.data ?? []) {
      if (row.id) allIds.add(row.id as string)
    }
    relatedIds.forEach((id) => allIds.add(id))

    const idList = Array.from(allIds)
    if (idList.length === 0) {
      setActiveCustomers([])
      setInProcessCustomers([])
      setArchivedCustomers([])
      return
    }

    const profRes = await supabase.from("profiles").select("metadata, display_name").eq("id", userId).maybeSingle()
    const metaRaw = profRes.data?.metadata
    const dn = (profRes.data as { display_name?: string | null } | null)?.display_name
    setContractorSmsDisplayName(typeof dn === "string" ? dn.trim() : "")
    const urgencyPrefs = parseCustomersUrgencyAutomation(metaRaw)
    const mr = metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw) ? (metaRaw as Record<string, unknown>) : {}
    const logoGuess =
      typeof mr.estimate_template_logo_url === "string"
        ? mr.estimate_template_logo_url.trim()
        : typeof mr.receipt_template_logo_url === "string"
          ? mr.receipt_template_logo_url.trim()
          : ""
    setBrandLogoUrl(logoGuess || null)

    const fullSelectPipeline = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        communication_urgency,
        last_activity_at,
        fit_classification,
        fit_confidence,
        fit_reason,
        fit_source,
        fit_manually_overridden,
        fit_evaluated_at,
        metadata,
        customer_identifiers (
          type,
          value
        )
      `
    const fullSelectPipelineNoUrgency = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        last_activity_at,
        metadata,
        customer_identifiers (
          type,
          value
        )
      `
    const fullSelectPipelineNoFit = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        communication_urgency,
        last_activity_at,
        metadata,
        customer_identifiers (
          type,
          value
        )
      `
    const fullSelectLegacy = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        customer_identifiers (
          type,
          value
        )
      `
    let customers: CustomerRow[] | null = null
    let error: { message: string } | null = null
    {
      const r0 = await supabase.from("customers").select(fullSelectPipeline).in("id", idList)
      error = r0.error
      customers = (r0.data as CustomerRow[] | null) ?? null
      if (error && String(error.message || "").toLowerCase().includes("fit_")) {
        const r1 = await supabase.from("customers").select(fullSelectPipelineNoFit).in("id", idList)
        error = r1.error
        customers = (r1.data as CustomerRow[] | null) ?? null
        if (!error) {
          setLoadError((prev) => prev || "Run supabase/customers-lead-fit.sql to enable Lead score on customers.")
        }
      }
      if (error && String(error.message || "").includes("communication_urgency")) {
        const rU = await supabase.from("customers").select(fullSelectPipelineNoUrgency).in("id", idList)
        error = rU.error
        customers = (rU.data as CustomerRow[] | null) ?? null
        if (!error) {
          setLoadError((prev) => prev || "Run supabase/customers-communication-urgency.sql to enable the Urgency column.")
        }
      }
      if (error && String(error.message || "").toLowerCase().includes("metadata")) {
        const stripMeta = (s: string) => s.replace(/\s*metadata,\s*/g, "")
        const rM = await supabase.from("customers").select(stripMeta(fullSelectPipeline)).in("id", idList)
        error = rM.error
        customers = (rM.data as CustomerRow[] | null) ?? null
        if (error && String(error.message || "").toLowerCase().includes("fit_")) {
          const rM2 = await supabase.from("customers").select(stripMeta(fullSelectPipelineNoFit)).in("id", idList)
          error = rM2.error
          customers = (rM2.data as CustomerRow[] | null) ?? null
        }
        if (error) {
          const rM3 = await supabase.from("customers").select(fullSelectLegacy).in("id", idList)
          error = rM3.error
          customers = (rM3.data as CustomerRow[] | null) ?? null
        }
        if (!error) {
          setLoadError((prev) => prev || "Run supabase/customers-metadata.sql to store SMS opt-in on customers.")
        }
      }
    }
    if (error && (error.message.includes("best_contact") || error.message.includes("job_pipeline") || error.message.includes("last_activity"))) {
      const r2 = await supabase.from("customers").select(fullSelectLegacy).in("id", idList)
      if (!r2.error) {
        customers = (r2.data as CustomerRow[] | null) ?? null
        error = null
        setLoadError("Run supabase/customers-pipeline-columns.sql to enable Best contact, Job status, and Last update columns.")
      }
    }
    if (error) {
      setLoadError(error.message)
      setActiveCustomers([])
      setInProcessCustomers([])
      setArchivedCustomers([])
      return
    }

    let list = (customers || []) as CustomerRow[]

    const { data: recentComm } = await supabase
      .from("communication_events")
      .select("customer_id, created_at")
      .eq("user_id", userId)
      .in("customer_id", idList)
      .order("created_at", { ascending: false })
      .limit(5000)

    const latestMsByCustomer = buildLatestEventMsByCustomer(recentComm)
    list = mergeLastActivityFromRecentEvents(list, latestMsByCustomer)

    async function escalateList(rows: CustomerRow[], prefs: CustomersUrgencyAutomationPrefs | null): Promise<CustomerRow[]> {
      if (!prefs?.enabled || prefs.amount <= 0 || !supabase) return rows
      const now = Date.now()
      const next = [...rows]
      for (let i = 0; i < next.length; i++) {
        const c = next[i]
        const cur = normalizeCommunicationUrgency(c.communication_urgency)
        const lastMs = Date.parse(c.last_activity_at || c.updated_at || "") || 0
        const bumped = nextUrgencyAfterSilence(cur, prefs, lastMs, now)
        if (bumped) {
          const { error: upErr } = await supabase.from("customers").update({ communication_urgency: bumped }).eq("id", c.id)
          if (!upErr) next[i] = { ...c, communication_urgency: bumped }
        }
      }
      return next
    }

    // Completed customers should move to Archived even if legacy related rows still exist.
    // Standalone customers (Add customer only — no lead/quote/conversation/calendar yet) stay on Active.
    let inProcess = list.filter((c) => recurringBookedIds.has(c.id) && !isCompletedJobStatus(c.job_pipeline_status))
    let active = list.filter(
      (c) =>
        !recurringBookedIds.has(c.id) &&
        !isCompletedJobStatus(c.job_pipeline_status) &&
        (activeIds.has(c.id) || !relatedIds.has(c.id)),
    )
    let archived = list.filter(
      (c) =>
        isCompletedJobStatus(c.job_pipeline_status) ||
        (relatedIds.has(c.id) && !activeIds.has(c.id) && !recurringBookedIds.has(c.id)),
    )
    inProcess = await escalateList(inProcess, urgencyPrefs)
    active = await escalateList(active, urgencyPrefs)
    archived = await escalateList(archived, urgencyPrefs)
    setInProcessCustomers(inProcess)
    setActiveCustomers(active)
    setArchivedCustomers(archived)
  }, [userId])

  const loadCustomerActivity = useCallback(
    async (customerId: string) => {
      if (!supabase || !userId) return
      setCustomerActivityLoading(true)
      try {
        const { data: convos } = await supabase
          .from("conversations")
          .select("id")
          .eq("user_id", userId)
          .eq("customer_id", customerId)
          .is("removed_at", null)
          .order("created_at", { ascending: false })
        const convoIds = (convos ?? []).map((c: { id: string }) => c.id)
        setPrimaryConversationId(convoIds[0] ?? null)

        let messages: any[] = []
        if (convoIds.length > 0) {
          const { data: msgs } = await supabase.from("messages").select("*").in("conversation_id", convoIds).order("created_at", { ascending: true })
          messages = msgs ?? []
        }
        setCustomerMessages(messages)

        const evSelect =
          "id, event_type, subject, body, direction, created_at, metadata, recording_url, transcript_text, summary_text, lead_id, conversation_id, customer_id"
        const seen = new Set<string>()
        const merged: any[] = []
        const { data: evCust } = await supabase
          .from("communication_events")
          .select(evSelect)
          .eq("user_id", userId)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: true })
          .limit(400)
        for (const row of evCust ?? []) {
          if (row.id && !seen.has(row.id)) {
            seen.add(row.id)
            merged.push(row)
          }
        }
        if (convoIds.length > 0) {
          const { data: evConvo } = await supabase
            .from("communication_events")
            .select(evSelect)
            .eq("user_id", userId)
            .in("conversation_id", convoIds)
            .order("created_at", { ascending: true })
            .limit(400)
          for (const row of evConvo ?? []) {
            if (row.id && !seen.has(row.id)) {
              seen.add(row.id)
              merged.push(row)
            }
          }
        }
        merged.sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""))
        setCustomerCommEvents(merged)
        setCustomerCalendarEvents(await loadCustomerCalendarEvents(supabase, userId, customerId))
      } finally {
        setCustomerActivityLoading(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void supabase
      .from("profiles")
      .select("voicemail_conversations_display")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        const v = (data as { voicemail_conversations_display?: string }).voicemail_conversations_display
        if (typeof v === "string" && v.trim()) setVoicemailProfileDisplay(v.trim())
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const hydrateLeadFilterPrefsFromMetadata = useCallback((meta: Record<string, unknown>) => {
    const lf = meta.lead_filter_preferences
    if (lf && typeof lf === "object" && !Array.isArray(lf)) {
      const p = lf as Record<string, unknown>
      const minRaw = p.minimum_job_size
      const radRaw = p.service_radius_miles
      setLeadFilterPrefs({
        accepted_job_types: typeof p.accepted_job_types === "string" ? p.accepted_job_types : "",
        minimum_job_size:
          typeof minRaw === "number" && Number.isFinite(minRaw)
            ? String(minRaw)
            : typeof minRaw === "string"
              ? minRaw
              : "",
        service_radius_miles:
          typeof radRaw === "number" && Number.isFinite(radRaw)
            ? String(radRaw)
            : typeof radRaw === "string"
              ? radRaw
              : "",
        use_account_service_radius: p.use_account_service_radius !== false,
        availability: p.availability === "asap" ? "asap" : "flexible",
        enable_auto_filter: p.enable_auto_filter === true,
        use_ai_for_unclear: p.use_ai_for_unclear !== false,
      })
    }
  }, [])

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.metadata || typeof data.metadata !== "object" || Array.isArray(data.metadata)) return
        hydrateLeadFilterPrefsFromMetadata(data.metadata as Record<string, unknown>)
      })
    return () => {
      cancelled = true
    }
  }, [userId, hydrateLeadFilterPrefsFromMetadata])

  useEffect(() => {
    const onMeta = (ev: Event) => {
      const detail = (ev as CustomEvent<ProfileMetadataAppliedDetail>).detail
      if (!detail || detail.userId !== userId) return
      hydrateLeadFilterPrefsFromMetadata(detail.metadata)
    }
    window.addEventListener(PROFILE_METADATA_APPLIED_EVENT, onMeta)
    return () => window.removeEventListener(PROFILE_METADATA_APPLIED_EVENT, onMeta)
  }, [userId, hydrateLeadFilterPrefsFromMetadata])

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

  useEffect(() => {
    const onFocus = () => {
      void loadCustomers()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [loadCustomers])

  useEffect(() => {
    if (!selectedCustomer?.id || activityMaxSortMs <= 0) return
    const dbMs = Date.parse(selectedCustomer.last_activity_at || "") || 0
    if (activityMaxSortMs <= dbMs) return
    const iso = new Date(activityMaxSortMs).toISOString()
    const patch = (rows: CustomerRow[]) => rows.map((c) => (c.id === selectedCustomer.id ? { ...c, last_activity_at: iso } : c))
    setActiveCustomers(patch)
    setInProcessCustomers(patch)
    setArchivedCustomers(patch)
    setSelectedCustomer((prev) => (prev?.id === selectedCustomer.id ? { ...prev, last_activity_at: iso } : prev))
  }, [activityMaxSortMs, selectedCustomer?.id])

  useEffect(() => {
    if (!pendingFocusCustomerId) return
    const activeMatch = activeCustomers.find((c) => c.id === pendingFocusCustomerId)
    if (activeMatch) {
      setSection("active")
      setSelectedCustomer(activeMatch)
      setPendingFocusCustomerId(null)
      return
    }
    const inProcessMatch = inProcessCustomers.find((c) => c.id === pendingFocusCustomerId)
    if (inProcessMatch) {
      setSection("in_process")
      setSelectedCustomer(inProcessMatch)
      setPendingFocusCustomerId(null)
      return
    }
    const archivedMatch = archivedCustomers.find((c) => c.id === pendingFocusCustomerId)
    if (archivedMatch) {
      setSection("archived")
      setSelectedCustomer(archivedMatch)
      setPendingFocusCustomerId(null)
    }
  }, [pendingFocusCustomerId, activeCustomers, inProcessCustomers, archivedCustomers])

  useEffect(() => {
    if (selectedCustomer) applyDetailFromCustomer(selectedCustomer)
  }, [selectedCustomer, applyDetailFromCustomer])

  useEffect(() => {
    if (!selectedCustomer?.id || !supabase || !userId) {
      setCustomerMessages([])
      setCustomerCommEvents([])
      setPrimaryConversationId(null)
      setCustomerReplySms("")
      setCustomerEmailBody("")
      return
    }
    const em = selectedCustomer.customer_identifiers?.find((i) => i.type === "email")?.value?.trim() ?? ""
    setCustomerEmailTo(em)
    setCustomerEmailSubject(selectedCustomer.display_name?.trim() ? `Re: ${selectedCustomer.display_name.trim()}` : "Message from us")
    void loadCustomerActivity(selectedCustomer.id)
  }, [selectedCustomer?.id, userId, loadCustomerActivity])

  useEffect(() => {
    let cancelled = false
    async function loadCustomerReports() {
      if (!supabase || !userId || !selectedCustomer?.id) {
        setCustomerReports([])
        return
      }
      const { data, error } = await supabase.from("quotes").select("id, customer_id, metadata").eq("user_id", userId)
      if (cancelled) return
      if (error || !data) {
        setCustomerReports([])
        return
      }
      const rows: SpecialtyReportRegistryItem[] = []
      const seen = new Set<string>()
      for (const q of data as Array<{ id: string; customer_id?: string | null; metadata?: unknown }>) {
        const meta =
          q.metadata && typeof q.metadata === "object" && !Array.isArray(q.metadata)
            ? (q.metadata as Record<string, unknown>)
            : {}
        const parsed = parseSpecialtyReportRegistry(meta[SPECIALTY_REPORT_REGISTRY_KEY]).filter((r) => r.quote_id === q.id)
        for (const r of parsed) {
          if (specialtyReportLinkedCustomerId(r, q.customer_id) !== selectedCustomer.id) continue
          if (seen.has(r.id)) continue
          seen.add(r.id)
          rows.push(r)
        }
      }
      rows.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      setCustomerReports(rows)
    }
    void loadCustomerReports()
    return () => {
      cancelled = true
    }
  }, [selectedCustomer?.id, userId])

  const currentList = section === "active" ? activeCustomers : section === "in_process" ? inProcessCustomers : archivedCustomers
  const filtered = currentList.filter((c) => {
    const name = (c.display_name || "").toLowerCase()
    const phone = c.customer_identifiers?.find((i) => i.type === "phone")?.value || ""
    const email = customerEmailFromIdentifiers(c.customer_identifiers).toLowerCase()
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    const urg = normalizeCommunicationUrgency(c.communication_urgency)
    const urgOk = !filterUrgency.trim() || urg === filterUrgency
    const searchOk =
      !searchLower || name.includes(searchLower) || phone.includes(searchLower) || email.includes(searchLower)
    return searchOk && (!phoneFilter || phone.includes(phoneFilter) || email.includes(phoneFilter)) && urgOk
  })
  const sorted = [...filtered].sort((a, b) => {
    let aVal = ""
    let bVal = ""
    if (sortField === "name") {
      aVal = (a.display_name || "").toLowerCase()
      bVal = (b.display_name || "").toLowerCase()
    } else if (sortField === "best_contact") {
      aVal = customerContactLine(a).toLowerCase()
      bVal = customerContactLine(b).toLowerCase()
    } else if (sortField === "job_status") {
      aVal = (a.job_pipeline_status || inferDefaultBestContact(a)).toLowerCase()
      bVal = (b.job_pipeline_status || inferDefaultBestContact(b)).toLowerCase()
    } else if (sortField === "last_update") {
      aVal = String(Date.parse(a.last_activity_at || "") || 0)
      bVal = String(Date.parse(b.last_activity_at || "") || 0)
    } else if (sortField === "urgency") {
      aVal = String(urgencyRank(normalizeCommunicationUrgency(a.communication_urgency))).padStart(3, "0")
      bVal = String(urgencyRank(normalizeCommunicationUrgency(b.communication_urgency))).padStart(3, "0")
    } else {
      aVal = (a.customer_identifiers?.find((i) => i.type === "phone")?.value || "").toLowerCase()
      bVal = (b.customer_identifiers?.find((i) => i.type === "phone")?.value || "").toLowerCase()
    }
    const cmp = aVal.localeCompare(bVal, undefined, { numeric: sortField === "last_update" })
    return sortAsc ? cmp : -cmp
  })

  const selectedRowText = "#0f172a"

  function activateCustomerRow(c: CustomerRow) {
    if (selectedCustomer?.id === c.id) {
      setSelectedCustomer(null)
      setDetailEditMode(false)
    } else {
      setSelectedCustomer(c)
      setDetailEditMode(false)
    }
  }

  async function geocodeCustomerServiceAddress() {
    const q = detailForm.serviceAddress.trim()
    if (!q) {
      alert("Enter a street address first (include city and state when you can).")
      return
    }
    setServiceGeocodeBusy(true)
    try {
      const coords = await geocodeAddressToLatLng(q)
      if (!coords) {
        alert("Could not find coordinates for that address. Try a fuller street + city + state.")
        return
      }
      setDetailForm((p) => ({ ...p, serviceLat: String(coords.lat), serviceLng: String(coords.lng) }))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setServiceGeocodeBusy(false)
    }
  }

  async function saveCustomerDetail() {
    if (!supabase || !userId || !selectedCustomer) return
    setDetailSaving(true)
    try {
      const cid = selectedCustomer.id
      const phoneT = detailForm.phone.trim()
      const emailT = detailForm.email.trim().toLowerCase()
      const nameT = detailForm.customerName.trim()
      const latRaw = detailForm.serviceLat.trim()
      const lngRaw = detailForm.serviceLng.trim()
      const latN = latRaw ? Number.parseFloat(latRaw) : Number.NaN
      const lngN = lngRaw ? Number.parseFloat(lngRaw) : Number.NaN
      const nowIso = new Date().toISOString()
      const custPatch: Record<string, unknown> = {
        display_name: nameT || null,
        service_address: detailForm.serviceAddress.trim() || null,
        service_lat: Number.isFinite(latN) ? latN : null,
        service_lng: Number.isFinite(lngN) ? lngN : null,
        best_contact_method: detailForm.bestContact.trim() || null,
        job_pipeline_status: detailForm.jobStatus.trim() || null,
        communication_urgency: detailForm.urgency,
        last_activity_at: nowIso,
      }
      let { error: custErr } = await supabase.from("customers").update(custPatch).eq("id", cid)
      if (custErr && String(custErr.message || "").toLowerCase().match(/communication_urgency/)) {
        const { communication_urgency: _co, ...restNoU } = custPatch
        const rTry = await supabase.from("customers").update(restNoU).eq("id", cid)
        custErr = rTry.error
        if (!custErr) {
          setLoadError((prev) => prev || "Saved without urgency — run supabase/customers-communication-urgency.sql.")
        }
      }
      if (custErr && String(custErr.message || "").toLowerCase().match(/service_|best_contact|job_pipeline|last_activity/)) {
        const { best_contact_method: _bc, job_pipeline_status: _js, last_activity_at: _la, communication_urgency: _cu, ...rest } = custPatch
        const r = await supabase.from("customers").update(rest).eq("id", cid)
        custErr = r.error
        if (!custErr) {
          setLoadError((prev) => prev || "Saved core fields. Run supabase/customers-pipeline-columns.sql for pipeline columns.")
        }
      }
      if (custErr) throw custErr

      const { error: delErr } = await supabase.from("customer_identifiers").delete().eq("customer_id", cid).in("type", ["phone", "email", "name"])
      if (delErr) throw delErr

      const identRows: Array<{ user_id: string; customer_id: string; type: string; value: string; is_primary: boolean; verified: boolean }> = []
      if (phoneT) identRows.push({ user_id: userId, customer_id: cid, type: "phone", value: phoneT, is_primary: true, verified: false })
      if (emailT)
        identRows.push({
          user_id: userId,
          customer_id: cid,
          type: "email",
          value: emailT,
          is_primary: identRows.length === 0,
          verified: false,
        })
      if (nameT)
        identRows.push({
          user_id: userId,
          customer_id: cid,
          type: "name",
          value: nameT,
          is_primary: identRows.length === 0,
          verified: false,
        })
      if (identRows.length > 0) {
        const { error: insErr } = await supabase.from("customer_identifiers").insert(identRows)
        if (insErr) throw insErr
      }

      await loadCustomers()
      const fullSelectOne = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        communication_urgency,
        last_activity_at,
        metadata,
        customer_identifiers ( type, value )
      `
      const tried = await supabase.from("customers").select(fullSelectOne).eq("id", cid).maybeSingle()
      let nextSel: CustomerRow | null = tried.error ? null : (tried.data as CustomerRow | null)
      if (tried.error) {
        const fb = await supabase
          .from("customers")
          .select(`id, display_name, updated_at, service_address, service_lat, service_lng, customer_identifiers ( type, value )`)
          .eq("id", cid)
          .maybeSingle()
        if (!fb.error && fb.data) nextSel = fb.data as CustomerRow
      }
      if (nextSel) setSelectedCustomer(nextSel)
      setDetailEditMode(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailSaving(false)
    }
  }

  async function sendCustomerSms() {
    if (!userId || !selectedCustomer?.id) return
    if (smsBlockedPendingManualOptIn) {
      alert("SMS is blocked until you complete SMS opt-in consent for this customer (checkbox + consent source).")
      return
    }
    const trimmed = clampSmsUserPortion(customerReplySms, smsComposeMaxChars)
    const to = detailForm.phone.trim() || selectedCustomer.customer_identifiers?.find((i) => i.type === "phone")?.value?.trim() || ""
    if (!trimmed) {
      alert("Enter a message to send.")
      return
    }
    if (!to) {
      alert("Add a phone number for this customer before sending SMS.")
      return
    }
    setCustomerSmsSending(true)
    try {
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          body: trimmed,
          userId,
          customerId: selectedCustomer.id,
          ...(primaryConversationId ? { conversationId: primaryConversationId } : {}),
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      setCustomerReplySms("")
      await bumpCustomerLastActivity(selectedCustomer.id)
      await loadCustomerActivity(selectedCustomer.id)
      await loadCustomers()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setCustomerSmsSending(false)
    }
  }

  async function sendCustomerEmail() {
    if (!userId || !selectedCustomer?.id) return
    const to = customerEmailTo.trim()
    const subject = customerEmailSubject.trim()
    const body = customerEmailBody.trim()
    if (!to) {
      alert("Enter an email address.")
      return
    }
    if (!subject) {
      alert("Enter a subject.")
      return
    }
    if (!body) {
      alert("Enter message body.")
      return
    }
    setCustomerEmailSending(true)
    try {
      const response = await fetch("/api/outbound-messages?__channel=email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body,
          userId,
          customerId: selectedCustomer.id,
          ...(primaryConversationId ? { conversationId: primaryConversationId } : {}),
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      setCustomerEmailBody("")
      await bumpCustomerLastActivity(selectedCustomer.id)
      await loadCustomerActivity(selectedCustomer.id)
      await loadCustomers()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setCustomerEmailSending(false)
    }
  }

  async function markCustomerComplete() {
    if (!supabase || !selectedCustomer) return
    setCompleteBusy(true)
    try {
      const nowIso = new Date().toISOString()
      const patch: Record<string, unknown> = { job_pipeline_status: "Completed", last_activity_at: nowIso }
      let { error } = await supabase.from("customers").update(patch).eq("id", selectedCustomer.id)
      if (error && String(error.message || "").toLowerCase().includes("job_pipeline")) {
        const { job_pipeline_status: _j, last_activity_at: _la, ...rest } = patch
        const r = await supabase.from("customers").update(rest).eq("id", selectedCustomer.id)
        error = r.error
      }
      if (error) throw error
      setDetailForm((p) => ({ ...p, jobStatus: "Completed" }))
      await loadCustomers()
      const tried = await supabase
        .from("customers")
        .select(
          `id, display_name, updated_at, service_address, service_lat, service_lng, best_contact_method, job_pipeline_status, communication_urgency, last_activity_at, customer_identifiers ( type, value )`,
        )
        .eq("id", selectedCustomer.id)
        .maybeSingle()
      if (!tried.error && tried.data) setSelectedCustomer(tried.data as CustomerRow)
      setSection("archived")
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setCompleteBusy(false)
    }
  }

  useEffect(() => {
    const fc = selectedCustomer?.fit_classification
    setManualFitChoice(fc === "hot" || fc === "maybe" || fc === "bad" ? fc : "")
  }, [selectedCustomer?.id, selectedCustomer?.fit_classification])

  async function applyManualCustomerFit() {
    if (!supabase || !userId || !selectedCustomer?.id || !manualFitChoice) return
    setFitOverrideBusy(true)
    try {
      const now = new Date().toISOString()
      const { error: uErr } = await supabase
        .from("customers")
        .update({
          fit_classification: manualFitChoice,
          fit_confidence: null,
          fit_reason: "Updated manually from the Customers screen.",
          fit_source: "manual",
          fit_manually_overridden: true,
          fit_evaluated_at: now,
        })
        .eq("id", selectedCustomer.id)
        .eq("user_id", userId)
      if (uErr) {
        alert(uErr.message)
        return
      }
      setSelectedCustomer((prev) =>
        prev && prev.id === selectedCustomer.id
          ? {
              ...prev,
              fit_classification: manualFitChoice,
              fit_confidence: null,
              fit_reason: "Updated manually from the Customers screen.",
              fit_source: "manual",
              fit_manually_overridden: true,
              fit_evaluated_at: now,
            }
          : prev,
      )
      await loadCustomers()
    } finally {
      setFitOverrideBusy(false)
    }
  }

  async function reRunCustomerFit() {
    if (!supabase || !selectedCustomer?.id || !session) return
    setFitReRunBusy(true)
    try {
      let token = await getFreshAccessToken(supabase, session)
      if (!token) {
        alert("Please sign in again.")
        return
      }
      const run = (t: string) =>
        fetch("/api/platform-tools?__route=customer-evaluate-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: platformToolsJsonBody({ customerId: selectedCustomer.id, force: true }),
        })
      let res = await run(token)
      if (res.status === 401) {
        const t2 = await forceRefreshAccessToken(supabase)
        if (t2) res = await run(t2)
      }
      const raw = await res.text()
      if (!res.ok) {
        alert(formatFetchApiError(res, raw))
        return
      }
      try {
        const j = JSON.parse(raw) as {
          skipped?: boolean
          classification?: string
          confidence?: number
          reason?: string
          source?: string
        }
        if (!j.skipped && j.classification) {
          const evaluatedAt = new Date().toISOString()
          setSelectedCustomer((prev) =>
            prev && prev.id === selectedCustomer.id
              ? {
                  ...prev,
                  fit_classification: j.classification ?? prev.fit_classification,
                  fit_confidence: typeof j.confidence === "number" ? j.confidence : prev.fit_confidence,
                  fit_reason: typeof j.reason === "string" ? j.reason : prev.fit_reason,
                  fit_source: typeof j.source === "string" ? j.source : prev.fit_source,
                  fit_manually_overridden: false,
                  fit_evaluated_at: evaluatedAt,
                }
              : prev,
          )
        }
      } catch {
        /* ignore parse */
      }
      await loadCustomers()
    } finally {
      setFitReRunBusy(false)
    }
  }

  async function removeCustomerRecord() {
    if (!supabase || !selectedCustomer) return
    if (
      !window.confirm(
        "Remove this customer record permanently? This only works if nothing still references them (quotes, events, etc.). Otherwise the database will refuse deletion.",
      )
    )
      return
    setRemoveBusy(true)
    try {
      const { error } = await supabase.from("customers").delete().eq("id", selectedCustomer.id)
      if (error) {
        alert(error.message)
        return
      }
      setSelectedCustomer(null)
      setDetailEditMode(false)
      await loadCustomers()
    } finally {
      setRemoveBusy(false)
    }
  }

  async function focusCustomerAfterCreate(customerId: string, reusedExisting: boolean) {
    if (!supabase) return
    const fullSelectOne = `
      id,
      display_name,
      updated_at,
      service_address,
      service_lat,
      service_lng,
      best_contact_method,
      job_pipeline_status,
      communication_urgency,
      last_activity_at,
      metadata,
      customer_identifiers ( type, value )
    `
    let row: CustomerRow | null = null
    const tried = await supabase.from("customers").select(fullSelectOne).eq("id", customerId).maybeSingle()
    if (!tried.error && tried.data) row = tried.data as CustomerRow
    if (!row) {
      const fb = await supabase
        .from("customers")
        .select(`id, display_name, updated_at, service_address, service_lat, service_lng, customer_identifiers ( type, value )`)
        .eq("id", customerId)
        .maybeSingle()
      if (!fb.error && fb.data) row = fb.data as CustomerRow
    }
    await loadCustomers()
    setSection("active")
    if (row) {
      setSelectedCustomer(row)
      applyDetailFromCustomer(row)
      setDetailEditMode(false)
      setContactJobDetailsOpen(false)
    }
    if (reusedExisting) {
      alert("A customer with that phone or email already exists — opened their record.")
    }
  }

  async function saveLeadFilterPreferences() {
    if (!supabase || !userId) return
    setLeadFilterSaveBusy(true)
    try {
      const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (fetchErr) {
        alert(fetchErr.message)
        return
      }
      const prevMeta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      const minN = Number.parseFloat(leadFilterPrefs.minimum_job_size.replace(/[^0-9.]/g, ""))
      const radN = Number.parseFloat(leadFilterPrefs.service_radius_miles.replace(/[^0-9.]/g, ""))
      prevMeta.lead_filter_preferences = {
        v: 1,
        accepted_job_types: leadFilterPrefs.accepted_job_types.slice(0, 4000),
        minimum_job_size: Number.isFinite(minN) && minN >= 0 ? minN : null,
        service_radius_miles: Number.isFinite(radN) && radN > 0 ? radN : null,
        use_account_service_radius: leadFilterPrefs.use_account_service_radius,
        availability: leadFilterPrefs.availability,
        enable_auto_filter: leadFilterPrefs.enable_auto_filter,
        use_ai_for_unclear: leadFilterPrefs.use_ai_for_unclear,
      }
      const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
      if (error) {
        alert(error.message)
        return
      }
      setShowLeadFilterPrefs(false)
    } finally {
      setLeadFilterSaveBusy(false)
    }
  }

  async function patchCustomerUrgencyRow(c: CustomerRow, next: CommunicationUrgency) {
    if (!supabase) return
    const { error } = await supabase.from("customers").update({ communication_urgency: next }).eq("id", c.id)
    if (error) {
      alert(error.message)
      return
    }
    const bump = (rows: CustomerRow[]) =>
      rows.map((x) => (x.id === c.id ? { ...x, communication_urgency: next } : x))
    setInProcessCustomers(bump)
    setActiveCustomers(bump)
    setArchivedCustomers(bump)
    if (selectedCustomer?.id === c.id) {
      setSelectedCustomer({ ...c, communication_urgency: next })
      setDetailForm((p) => ({ ...p, urgency: next }))
    }
  }

  const fetchAiSummaryForTimelineItem = useCallback(
    async (item: { kind: "msg" | "ev"; key: string; payload: any }) => {
      if (!supabase || !selectedCustomer?.id) return
      setAiSummaryBusy((m) => ({ ...m, [item.key]: true }))
      try {
        let token = await getFreshAccessToken(supabase, session)
        const origin = typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : ""
        const basePayload = { profileUserId: userId }
        const body =
          item.kind === "msg"
            ? platformToolsJsonBody({
                ...basePayload,
                messageId: String(item.payload?.id ?? ""),
                customerId: selectedCustomer.id,
              })
            : platformToolsJsonBody({
                ...basePayload,
                communicationEventId: String(item.payload?.id ?? ""),
              })
        let r = await fetch(`${origin}/api/platform-tools?__route=ai-summarize-customer-event`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body,
        })
        if (r.status === 401) {
          const t2 = await forceRefreshAccessToken(supabase)
          if (t2)
            r = await fetch(`${origin}/api/platform-tools?__route=ai-summarize-customer-event`, {
              method: "POST",
              headers: { Authorization: `Bearer ${t2}`, "Content-Type": "application/json" },
              body,
            })
        }
        const raw = await r.text()
        let msgErr = ""
        if (!r.ok) {
          try {
            const j = JSON.parse(raw) as { error?: string; hint?: string }
            const parts = [j.error, j.hint].filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            msgErr = parts.length > 0 ? parts.join("\n\n") : raw.slice(0, 300)
          } catch {
            msgErr = raw.slice(0, 300)
          }
          alert(msgErr || `Request failed (${r.status})`)
          return
        }
        try {
          const j = JSON.parse(raw) as { summary?: string }
          const sum = typeof j.summary === "string" ? j.summary.trim() : ""
          if (sum) {
            setAiSummaryByKey((prev) => ({ ...prev, [item.key]: sum }))
          }
        } catch {
          alert("Could not read summary.")
        }
      } finally {
        setAiSummaryBusy((m) => ({ ...m, [item.key]: false }))
      }
    },
    [supabase, selectedCustomer?.id, session, userId],
  )

  useEffect(() => {
    setTimelineExpanded({})
    setAiSummaryByKey({})
    setAiSummaryBusy({})
  }, [selectedCustomer?.id])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0, position: "relative" }}>
      <h1 style={{ margin: 0 }}>Customers</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setShowAddCustomer(true)}
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            border: "none",
            background: theme.primary,
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Add customer
        </button>
        <button
          type="button"
          onClick={() => setShowAutoReplies(true)}
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
            color: theme.text,
            fontWeight: 600,
          }}
        >
          {portalConfig?.controlLabels?.automatic_replies ?? "Automatic replies"}
        </button>
        <SetupWizardLaunchButton wizardId="customers_auto_replies" compact />
        <button
          type="button"
          onClick={() => setShowLeadFilterPrefs(true)}
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
            color: theme.text,
            fontWeight: 600,
          }}
        >
          Lead filter preferences
        </button>
        <SetupWizardLaunchButton wizardId="customers_lead_filters" compact />
        {userId ? <TabNotificationAlertsButton tab="customers" profileUserId={userId} /> : null}
      </div>

      <LeadFilterPreferencesModal
        open={showLeadFilterPrefs}
        onClose={() => setShowLeadFilterPrefs(false)}
        leadFilterPrefs={leadFilterPrefs}
        setLeadFilterPrefs={setLeadFilterPrefs}
        onSave={() => void saveLeadFilterPreferences()}
        saveBusy={leadFilterSaveBusy}
        aiAutomationsEnabled={aiAutomationsEnabled}
        t={t}
      />

      <AddCustomerModal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        userId={userId}
        onCreated={focusCustomerAfterCreate}
      />

      <ConversationAutoRepliesModal
        open={showAutoReplies}
        onClose={() => setShowAutoReplies(false)}
        userId={userId}
        portalConfig={portalConfig}
        aiAutomationsEnabled={aiAutomationsEnabled}
        hideCarryOverToQuotes
      />

      {!supabase && (
        <p style={{ color: "#b91c1c" }}>Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to tradesman/.env and restart the dev server.</p>
      )}

      {loadError && <p style={{ color: "#b91c1c", marginBottom: 0 }}>{loadError}</p>}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          alignItems: "flex-end",
          marginBottom: 0,
          padding: "12px",
          background: theme.charcoalSmoke,
          borderRadius: "8px",
          border: `1px solid ${theme.border}`,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>List</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setSection("active")
                setSelectedCustomer(null)
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: section === "active" ? `2px solid ${theme.primary}` : "1px solid #d1d5db",
                background: section === "active" ? "#eff6ff" : "white",
                cursor: "pointer",
                color: theme.text,
                fontWeight: section === "active" ? 600 : 400,
              }}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => {
                setSection("in_process")
                setSelectedCustomer(null)
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: section === "in_process" ? `2px solid ${theme.primary}` : "1px solid #d1d5db",
                background: section === "in_process" ? "#eff6ff" : "white",
                cursor: "pointer",
                color: theme.text,
                fontWeight: section === "in_process" ? 600 : 400,
              }}
            >
              Booked
            </button>
            <button
              type="button"
              onClick={() => {
                setSection("archived")
                setSelectedCustomer(null)
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: section === "archived" ? `2px solid ${theme.primary}` : "1px solid #d1d5db",
                background: section === "archived" ? "#eff6ff" : "white",
                cursor: "pointer",
                color: theme.text,
                fontWeight: section === "archived" ? 600 : 400,
              }}
            >
              Archived
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Filter</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="By name, phone, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
            />
            <input
              type="text"
              placeholder="By phone or email..."
              value={filterPhone}
              onChange={(e) => setFilterPhone(e.target.value)}
              style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
            />
            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
              style={{
                padding: "6px 10px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                background: "white",
                color: theme.text,
                cursor: "pointer",
                maxWidth: isMobile ? "100%" : 200,
              }}
            >
              <option value="">All urgencies</option>
              {communicationUrgencySelectOptions().map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Sort by</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text, cursor: "pointer" }}
            >
              <option value="name">Name</option>
              <option value="best_contact">Phone / email</option>
              <option value="job_status">Job status</option>
              <option value="last_update">Last update</option>
              <option value="urgency">Urgency</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text, cursor: "pointer" }}
            >
              {sortAsc ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginLeft: isMobile ? 0 : "auto" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Reload list</label>
          <button
            type="button"
            onClick={() => void loadCustomers()}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "none",
              background: theme.primary,
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: isMobile ? "720px" : "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th onClick={() => { setSortField("name"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Name
              </th>
              <th onClick={() => { setSortField("best_contact"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Phone / email
              </th>
              <th onClick={() => { setSortField("job_status"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Job status
              </th>
              <th onClick={() => { setSortField("last_update"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Last update
              </th>
              <th onClick={() => { setSortField("urgency"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Urgency
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "16px", color: "#6b7280" }}>
                  {section === "active" ? "No active customers." : "No archived customers."}
                </td>
              </tr>
            ) : (
              sorted.map((c) => {
                const isRowSelected = selectedCustomer?.id === c.id
                const cellBase = {
                  padding: "8px" as const,
                  color: isRowSelected ? selectedRowText : undefined,
                  fontWeight: isRowSelected ? (600 as const) : (400 as const),
                }
                return (
                  <Fragment key={c.id}>
                    <tr
                      onClick={() => activateCustomerRow(c)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid #eee",
                        background: isRowSelected ? "#bae6fd" : "transparent",
                      }}
                    >
                      <td style={cellBase}>{c.display_name || "—"}</td>
                      <td
                        style={{ ...cellBase, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}
                        title={`${customerContactLine(c)}${displayBestContact(c) ? ` · Prefers: ${displayBestContact(c)}` : ""}`}
                      >
                        {customerContactLine(c)}
                      </td>
                      <td style={{ ...cellBase, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }} title={c.job_pipeline_status || JOB_PIPELINE_OPTIONS[0]}>
                        {c.job_pipeline_status?.trim() || JOB_PIPELINE_OPTIONS[0]}
                      </td>
                      <td style={{ ...cellBase, fontSize: 13, color: isRowSelected ? selectedRowText : "#64748b" }}>{lastUpdateDisplay(c)}</td>
                      <td style={{ ...cellBase, maxWidth: "220px" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <CommunicationUrgencyBadge level={c.communication_urgency} brandLogoUrl={brandLogoUrl} />
                          <select
                            value={normalizeCommunicationUrgency(c.communication_urgency)}
                            onChange={(e) => void patchCustomerUrgencyRow(c, e.target.value as CommunicationUrgency)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: `1px solid ${theme.border}`,
                              fontSize: 12,
                              maxWidth: 170,
                              background: "#fff",
                              cursor: "pointer",
                              color: theme.text,
                            }}
                          >
                            {communicationUrgencySelectOptions().map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                    {isRowSelected ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            padding: 0,
                            borderBottom: "1px solid #e5e7eb",
                            background: "#f8fafc",
                            verticalAlign: "top",
                          }}
                        >
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: "16px 18px 20px",
                              maxWidth: "min(960px, 100%)",
                              boxSizing: "border-box",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                              <div>
                                <h3 style={{ margin: 0, fontSize: 18, color: theme.text }}>{c.display_name || "Customer"}</h3>
                                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>
                                  Edit contact, pipeline, and site details. Use Notes and call actions like Conversations. Click the same row again to close.
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Close customer detail"
                                onClick={() => setSelectedCustomer(null)}
                                style={{
                                  flexShrink: 0,
                                  width: 36,
                                  height: 36,
                                  borderRadius: 8,
                                  border: `1px solid ${theme.border}`,
                                  background: "#fff",
                                  cursor: "pointer",
                                  fontSize: 18,
                                  lineHeight: 1,
                                  color: theme.text,
                                }}
                              >
                                ✕
                              </button>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                {setPage ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      queueSchedulingCustomerPrefill(c.id)
                                      queueCustomerFocus(c.id)
                                      setPage("calendar")
                                    }}
                                    style={{
                                      padding: "10px 16px",
                                      borderRadius: 6,
                                      border: "none",
                                      background: theme.primary,
                                      color: "white",
                                      cursor: "pointer",
                                      fontWeight: 600,
                                      fontSize: 13,
                                    }}
                                  >
                                    Add to calendar
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={completeBusy || !selectedCustomer}
                                  onClick={() => void markCustomerComplete()}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 6,
                                    border: "1px solid #047857",
                                    background: "#ecfdf5",
                                    color: "#065f46",
                                    cursor: completeBusy ? "wait" : "pointer",
                                    fontWeight: 700,
                                    fontSize: 13,
                                  }}
                                >
                                  {completeBusy ? "…" : "Complete"}
                                </button>
                                <button
                                  type="button"
                                  disabled={removeBusy || !selectedCustomer}
                                  onClick={() => void removeCustomerRecord()}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 6,
                                    border: "1px solid #b91c1c",
                                    background: "#fef2f2",
                                    color: "#991b1b",
                                    cursor: removeBusy ? "wait" : "pointer",
                                    fontWeight: 700,
                                    fontSize: 13,
                                  }}
                                >
                                  {removeBusy ? "…" : "Remove"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNotesCustomerId(c.id)
                                    setNotesCustomerName(c.display_name ?? "")
                                  }}
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 6,
                                    border: "none",
                                    background: theme.primary,
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                    fontSize: 13,
                                  }}
                                >
                                  Notes
                                </button>
                                {showCustomersCustomerPayment ? (
                                  <button
                                    type="button"
                                    onClick={() => setCustomerPaymentRequestOpen(true)}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 6,
                                      border: `2px solid ${theme.primary}`,
                                      background: "#fff7ed",
                                      color: theme.text,
                                      cursor: "pointer",
                                      fontWeight: 800,
                                      fontSize: 13,
                                    }}
                                  >
                                    Customer payment
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {showManualSmsOptInSection ? (
                              <div onClick={(e) => e.stopPropagation()}>
                                <CustomerSmsOptInSection
                                  businessName={contractorSmsDisplayName.trim() || "Your business"}
                                  consent={selectedCustomerSmsConsent}
                                  phoneOnFile={selectedCustomerPhoneOnFile}
                                  draftPhone={detailForm.phone}
                                  recordChecked={detailRecordSmsConsent}
                                  onRecordCheckedChange={setDetailRecordSmsConsent}
                                  consentSource={detailConsentSource}
                                  onConsentSourceChange={setDetailConsentSource}
                                  showSourceValidation={detailConsentSourceTouched}
                                  onSave={() => void recordDetailSmsConsent()}
                                  saving={detailSmsConsentSaving}
                                />
                              </div>
                            ) : null}

                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                marginBottom: 12,
                                borderRadius: 10,
                                border: `1px solid ${theme.border}`,
                                background: "#fff",
                                overflow: "hidden",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setCustomerInsightOpen((v) => !v)}
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  padding: "10px 14px",
                                  border: "none",
                                  background: customerInsightOpen ? "#f8fafc" : "#fff",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <span style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>Customer insight</span>
                                <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>
                                  {customerInsightOpen
                                    ? "Hide"
                                    : `${String(c.fit_classification ?? "—")} · ${customerReports.length} report(s) · Show`}
                                </span>
                              </button>
                              {customerInsightOpen ? (
                                <div style={{ padding: "12px 14px 14px", borderTop: `1px solid ${theme.border}` }}>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, marginBottom: 8 }}>Lead score</div>

                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                {leadFitBadgeEl((c.fit_classification as "hot" | "maybe" | "bad" | null) ?? null)}
                                {c.fit_confidence != null && typeof c.fit_confidence === "number" ? (
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                                    Confidence: {Math.round(c.fit_confidence * 100)}%
                                  </span>
                                ) : null}
                                {c.fit_source ? (
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>Source: {c.fit_source}</span>
                                ) : null}
                                {c.fit_manually_overridden ? (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed" }}>Manual override</span>
                                ) : null}
                              </div>
                              {c.fit_reason ? (
                                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.45 }}>{c.fit_reason}</p>
                              ) : (
                                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>
                                  No score yet. Turn on <strong>Enable auto filter</strong> in Lead Filter Preferences, or run a check
                                  below.
                                </p>
                              )}
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                <select
                                  value={manualFitChoice}
                                  onChange={(e) => setManualFitChoice(e.target.value as "hot" | "maybe" | "bad" | "")}
                                  style={{ ...theme.formInput, padding: "6px 10px", fontSize: 13, maxWidth: 160 }}
                                >
                                  <option value="">Set manually…</option>
                                  <option value="hot">Hot</option>
                                  <option value="maybe">Maybe</option>
                                  <option value="bad">Bad</option>
                                </select>
                                <button
                                  type="button"
                                  disabled={!manualFitChoice || fitOverrideBusy}
                                  onClick={() => void applyManualCustomerFit()}
                                  style={{
                                    padding: "6px 12px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    borderRadius: 6,
                                    border: "none",
                                    background: theme.primary,
                                    color: "#fff",
                                    cursor: fitOverrideBusy ? "wait" : "pointer",
                                  }}
                                >
                                  {fitOverrideBusy ? "Saving…" : "Apply"}
                                </button>
                                <button
                                  type="button"
                                  disabled={fitReRunBusy || !supabase || !aiAutomationsEnabled}
                                  onClick={() => void reRunCustomerFit()}
                                  style={{
                                    padding: "6px 12px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    borderRadius: 6,
                                    border: `1px solid ${theme.border}`,
                                    background: "#fff",
                                    color: theme.text,
                                    cursor: fitReRunBusy ? "wait" : "pointer",
                                  }}
                                >
                                  {fitReRunBusy ? "Running…" : "Re-run auto scoring"}
                                </button>
                              </div>
                              {!aiAutomationsEnabled ? (
                                <p style={{ margin: "8px 0 0", fontSize: 11, color: "#94a3b8" }}>
                                  Enable AI automations under Account to use auto scoring.
                                </p>
                              ) : null}

                                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, marginBottom: 8 }}>Reports</div>

                              {customerReports.length === 0 ? (
                                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No saved reports on this client yet.</p>
                              ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                                  {customerReports.map((r) => (
                                    <div key={r.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: "#f8fafc", padding: "8px 10px" }}>
                                      <strong style={{ fontSize: 13, color: "#0f172a" }}>{r.title}</strong>
                                      <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                                        Updated {new Date(r.updated_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                        {r.assigned_user_id?.trim() ? (
                                          <span style={{ display: "block", marginTop: 4, fontSize: 11 }}>
                                            Assignee: <strong style={{ color: "#334155" }}>{r.assigned_user_id.trim().slice(0, 8)}…</strong>
                                          </span>
                                        ) : null}
                                      </div>
                                      {setPage ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (selectedCustomer?.id) queueQuotesCustomerPrefill(selectedCustomer.id)
                                            setPage("quotes")
                                          }}
                                          style={{
                                            marginTop: 6,
                                            padding: "6px 10px",
                                            borderRadius: 6,
                                            border: `1px solid ${theme.border}`,
                                            background: "#fff",
                                            color: theme.text,
                                            cursor: "pointer",
                                            fontSize: 12,
                                            fontWeight: 600,
                                          }}
                                        >
                                          Open in Estimates
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              )}
                                    
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                marginBottom: 12,
                                borderRadius: 10,
                                border: `1px solid ${theme.border}`,
                                background: "#fff",
                                overflow: "hidden",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setContactJobDetailsOpen((v) => !v)}
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  padding: "10px 14px",
                                  border: "none",
                                  background: contactJobDetailsOpen ? "#f8fafc" : "#fff",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <span style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>Contact & job details</span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "#64748b",
                                    flexShrink: 0,
                                    maxWidth: "min(420px, 52vw)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {contactJobDetailsOpen
                                    ? "Hide"
                                    : `${(c.job_pipeline_status?.trim() || JOB_PIPELINE_OPTIONS[0]).slice(0, 28)} · ${displayBestContact(c).slice(0, 36)}${displayBestContact(c).length > 36 ? "…" : ""} · Show`}
                                </span>
                              </button>
                              {contactJobDetailsOpen ? (
                                <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${theme.border}` }}>
                                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 0 4px" }}>
                                    <button
                                      type="button"
                                      onClick={() => setDetailEditMode((e) => !e)}
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: 6,
                                        border: "1px solid #334155",
                                        background: "#e2e8f0",
                                        color: "#0f172a",
                                        cursor: "pointer",
                                        fontWeight: 700,
                                        fontSize: 12,
                                      }}
                                    >
                                      {detailEditMode ? "Done editing" : "Edit"}
                                    </button>
                                  </div>
                              <div style={{ display: "grid", gap: 8 }}>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Last update</span>
                                  <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span>
                                      {(() => {
                                        const dbMs = Date.parse(c.last_activity_at || "") || 0
                                        const bestMs = Math.max(dbMs, selectedCustomer?.id === c.id ? activityMaxSortMs : 0)
                                        const iso =
                                          bestMs > 0 && bestMs >= dbMs ? new Date(bestMs).toISOString() : c.last_activity_at ?? null
                                        return formatWhen(iso)
                                      })()}
                                    </span>
                                    {selectedCustomer?.id === c.id && customerWaitingForReply ? (
                                      <span title="Latest activity looks inbound — customer may be waiting for a reply." style={{ fontSize: 16, lineHeight: 1 }}>
                                        ⏳
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Name</span>
                                  {detailEditMode ? (
                                    <input
                                      value={detailForm.customerName}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, customerName: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, width: "100%", maxWidth: 400 }}
                                    />
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{c.display_name || "—"}</div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Best contact</span>
                                  {detailEditMode ? (
                                    <select
                                      value={detailForm.bestContact}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, bestContact: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, maxWidth: 280 }}
                                    >
                                      {DEFAULT_BEST_CONTACT_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{displayBestContact(c)}</div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Job status</span>
                                  {detailEditMode ? (
                                    <select
                                      value={detailForm.jobStatus}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, jobStatus: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, maxWidth: 320 }}
                                    >
                                      {JOB_PIPELINE_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{c.job_pipeline_status?.trim() || JOB_PIPELINE_OPTIONS[0]}</div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Urgency</span>
                                  {detailEditMode ? (
                                    <select
                                      value={detailForm.urgency}
                                      onChange={(e) =>
                                        setDetailForm((p) => ({ ...p, urgency: e.target.value as CommunicationUrgency }))
                                      }
                                      style={{ ...theme.formInput, marginTop: 4, maxWidth: 280 }}
                                    >
                                      {communicationUrgencySelectOptions().map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div style={{ marginTop: 6 }}>
                                      <CommunicationUrgencyBadge level={c.communication_urgency} brandLogoUrl={brandLogoUrl} />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Phone</span>
                                  {detailEditMode ? (
                                    <input
                                      value={detailForm.phone}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, phone: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, width: "100%", maxWidth: 400 }}
                                    />
                                  ) : (
                                    <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                      {(() => {
                                        const ph = c.customer_identifiers?.find((i) => i.type === "phone")?.value ?? ""
                                        return ph.trim() ? <span style={{ fontWeight: 600, color: "#0f172a" }}>{ph}</span> : "—"
                                      })()}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Email</span>
                                  {detailEditMode ? (
                                    <input
                                      value={detailForm.email}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, email: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, width: "100%", maxWidth: 400 }}
                                    />
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{c.customer_identifiers?.find((i) => i.type === "email")?.value ?? "—"}</div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Service address</span>
                                  {detailEditMode ? (
                                    <textarea
                                      value={detailForm.serviceAddress}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, serviceAddress: e.target.value }))}
                                      rows={2}
                                      style={{ ...theme.formInput, marginTop: 4, width: "100%", maxWidth: 480, resize: "vertical" }}
                                    />
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{typeof c.service_address === "string" && c.service_address.trim() ? c.service_address : "—"}</div>
                                  )}
                                </div>
                                {detailEditMode ? (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                    <label style={{ fontSize: 12, color: "#64748b" }}>
                                      Lat
                                      <input
                                        value={detailForm.serviceLat}
                                        onChange={(e) => setDetailForm((p) => ({ ...p, serviceLat: e.target.value }))}
                                        style={{ ...theme.formInput, marginLeft: 6, width: 120 }}
                                      />
                                    </label>
                                    <label style={{ fontSize: 12, color: "#64748b" }}>
                                      Lng
                                      <input
                                        value={detailForm.serviceLng}
                                        onChange={(e) => setDetailForm((p) => ({ ...p, serviceLng: e.target.value }))}
                                        style={{ ...theme.formInput, marginLeft: 6, width: 120 }}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      disabled={serviceGeocodeBusy || detailSaving}
                                      onClick={() => void geocodeCustomerServiceAddress()}
                                      style={{
                                        padding: "6px 12px",
                                        borderRadius: 6,
                                        border: "1px solid #334155",
                                        background: "#f1f5f9",
                                        color: "#0f172a",
                                        cursor: serviceGeocodeBusy ? "wait" : "pointer",
                                        fontWeight: 600,
                                        fontSize: 12,
                                      }}
                                    >
                                      {serviceGeocodeBusy ? "Looking up…" : "Look up coordinates"}
                                    </button>
                                  </div>
                                ) : null}
                                {detailEditMode ? (
                                  <div style={{ marginTop: 8 }}>
                                    <button
                                      type="button"
                                      disabled={detailSaving}
                                      onClick={() => void saveCustomerDetail()}
                                      style={{
                                        padding: "8px 16px",
                                        borderRadius: 6,
                                        border: "none",
                                        background: theme.primary,
                                        color: "#fff",
                                        fontWeight: 600,
                                        cursor: detailSaving ? "wait" : "pointer",
                                      }}
                                    >
                                      {detailSaving ? "Saving…" : "Save customer"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                                </div>
                              ) : null}
                            </div>

                                <div
                                  style={{
                                    borderTop: `1px solid ${theme.border}`,
                                    paddingTop: 16,
                                    marginTop: 12,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 14,
                                  }}
                                >
                                  <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13 }}>Scheduled jobs</div>
                                  {customerActivityLoading ? (
                                    <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Loading schedule…</p>
                                  ) : customerCalendarEvents.length === 0 ? (
                                    <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
                                      No calendar events linked yet. Schedule from an open estimate with <strong>Add to calendar</strong>.
                                    </p>
                                  ) : (
                                    <div style={{ display: "grid", gap: 8 }}>
                                      {customerCalendarEvents.slice(0, 8).map((ev) => {
                                        const when = ev.start_at
                                          ? new Date(ev.start_at).toLocaleString([], {
                                              dateStyle: "short",
                                              timeStyle: "short",
                                            })
                                          : "—"
                                        const done = Boolean(ev.completed_at)
                                        return (
                                          <div
                                            key={ev.id}
                                            style={{
                                              border: `1px solid ${theme.border}`,
                                              borderRadius: 8,
                                              padding: "8px 10px",
                                              background: done ? "#f1f5f9" : "#fff",
                                            }}
                                          >
                                            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{ev.title}</div>
                                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                                              {when}
                                              {done ? " · Completed" : " · Scheduled"}
                                              {ev.quote_id ? " · From estimate" : ""}
                                            </div>
                                            {ev.notes?.trim() ? (
                                              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{ev.notes.trim()}</div>
                                            ) : null}
                                            {setPage && ev.quote_id ? (
                                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    queueSchedulingQuotePrefill({
                                                      customerId: c.id,
                                                      quoteId: ev.quote_id!,
                                                    })
                                                    setPage("calendar")
                                                  }}
                                                  style={{
                                                    padding: "5px 10px",
                                                    borderRadius: 6,
                                                    border: `1px solid ${theme.border}`,
                                                    background: "#f8fafc",
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                    color: "#0f172a",
                                                  }}
                                                >
                                                  View on calendar
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    queueQuotesCustomerPrefill(c.id)
                                                    setPage("quotes")
                                                  }}
                                                  style={{
                                                    padding: "5px 10px",
                                                    borderRadius: 6,
                                                    border: `1px solid ${theme.border}`,
                                                    background: "#fff",
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                    color: theme.text,
                                                  }}
                                                >
                                                  Open estimate
                                                </button>
                                              </div>
                                            ) : null}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}

                                  <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 13, marginTop: 8 }}>Communications</div>
                                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                                    Preferred: <strong>{displayBestContact(c)}</strong>
                                    {selectedCustomerPhoneOnFile ? ` · Phone ${selectedCustomerPhoneOnFile}` : ""}
                                    {customerEmailFromIdentifiers(c.customer_identifiers ?? null)
                                      ? ` · ${customerEmailFromIdentifiers(c.customer_identifiers ?? null)}`
                                      : ""}
                                  </p>
                                  {customerActivityLoading ? (
                                    <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Loading messages…</p>
                                  ) : null}
                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {(["phone", "sms", "email"] as const).map((chan) => {
                                        const list = commItemsByChannel[chan]
                                        const open = commCardOpen[chan]
                                        const phoneHint = c.customer_identifiers?.find((i) => i.type === "phone")?.value?.trim() ?? ""
                                        const emailHint = customerEmailFromIdentifiers(c.customer_identifiers ?? null) ?? ""
                                        const contactHint = chan === "email" ? emailHint : phoneHint
                                        return (
                                          <div
                                            key={chan}
                                            style={{
                                              border: `1px solid ${theme.border}`,
                                              borderRadius: 10,
                                              background: "#fff",
                                              overflow: "hidden",
                                            }}
                                          >
                                            <button
                                              type="button"
                                              onClick={() => setCommCardOpen((m) => ({ ...m, [chan]: !m[chan] }))}
                                              style={CUSTOMER_COMM_CARD_SUMMARY}
                                            >
                                              <span style={{ color: "#64748b", fontSize: 13 }}>{open ? "▾" : "▸"}</span>
                                              <span style={{ flex: 1, minWidth: 0 }}>
                                                {commChannelOneLineSummary(chan, list, contactHint)}
                                              </span>
                                            </button>
                                            {open ? (
                                              <div style={{ padding: "0 12px 12px", display: "grid", gap: 10 }}>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                                                  {chan === "phone" ? (
                                                    (() => {
                                                      const ph = c.customer_identifiers?.find((i) => i.type === "phone")?.value ?? ""
                                                      return ph.trim() ? <CustomerCallButton phone={ph} bridgeOwnerUserId={userId} compact /> : (
                                                        <span style={{ fontSize: 12, color: "#94a3b8" }}>No phone on file</span>
                                                      )
                                                    })()
                                                  ) : (
                                                    <span style={{ fontSize: 12, color: "#64748b" }}>
                                                      {chan === "sms" ? "Thread texts below." : "Outbound / inbound email log below."}
                                                    </span>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={() => setCommHistoryChannel(chan)}
                                                    style={{
                                                      padding: "6px 10px",
                                                      borderRadius: 6,
                                                      border: `1px solid ${theme.border}`,
                                                      background: "#f8fafc",
                                                      fontSize: 12,
                                                      fontWeight: 700,
                                                      cursor: "pointer",
                                                      color: "#0f172a",
                                                    }}
                                                  >
                                                    Full history
                                                  </button>
                                                </div>
                                                {list.length === 0 ? (
                                                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>Nothing in this channel yet.</p>
                                                ) : (
                                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    {[...list].slice(-3).reverse().map((item) => (
                                                      <div key={item.key} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, background: "#f8fafc" }}>
                                                        <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a" }}>{activityRowLabel(item)}</div>
                                                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                                                          {item.payload?.created_at
                                                            ? new Date(item.payload.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                                                            : ""}
                                                        </div>
                                                        <div style={{ fontSize: 12, color: "#334155", marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                                                          {activityPreviewSnippet(item) || "—"}
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                                {chan === "sms" ? (
                                                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                                                    {smsBlockedPendingManualOptIn ? (
                                                      <p
                                                        style={{
                                                          margin: 0,
                                                          padding: "10px 12px",
                                                          borderRadius: 8,
                                                          background: "#fef2f2",
                                                          border: "1px solid #fecaca",
                                                          fontSize: 12,
                                                          fontWeight: 600,
                                                          color: "#991b1b",
                                                          lineHeight: 1.45,
                                                        }}
                                                      >
                                                        SMS compose is disabled — complete <strong>SMS opt-in consent</strong>{" "}
                                                        at the top of this customer panel first.
                                                      </p>
                                                    ) : (
                                                      <SmsFirstOutboundCallout variant={smsFirstComplianceVariant} />
                                                    )}
                                                    <textarea
                                                      placeholder={
                                                        smsBlockedPendingManualOptIn
                                                          ? "Complete SMS opt-in above to enable texting"
                                                          : "SMS reply…"
                                                      }
                                                      value={customerReplySms}
                                                      maxLength={smsComposeMaxChars}
                                                      onChange={(e) => setCustomerReplySms(e.target.value.slice(0, smsComposeMaxChars))}
                                                      rows={2}
                                                      disabled={smsBlockedPendingManualOptIn || customerSmsSending}
                                                      style={{
                                                        ...theme.formInput,
                                                        resize: "vertical",
                                                        maxWidth: "100%",
                                                        color: "#0f172a",
                                                        opacity: smsBlockedPendingManualOptIn ? 0.55 : 1,
                                                        cursor: smsBlockedPendingManualOptIn ? "not-allowed" : "text",
                                                      }}
                                                    />
                                                    {!smsBlockedPendingManualOptIn ? (
                                                      <SmsComposeCharBudget
                                                        variant={smsFirstComplianceVariant}
                                                        bodyLength={customerReplySms.length}
                                                        maxChars={smsComposeMaxChars}
                                                      />
                                                    ) : null}
                                                    <button
                                                      type="button"
                                                      onClick={() => void sendCustomerSms()}
                                                      disabled={customerSmsSending || smsBlockedPendingManualOptIn}
                                                      title={
                                                        smsBlockedPendingManualOptIn
                                                          ? "Complete SMS opt-in consent before sending texts"
                                                          : undefined
                                                      }
                                                      style={{
                                                        alignSelf: "flex-start",
                                                        padding: "8px 14px",
                                                        background: smsBlockedPendingManualOptIn ? "#94a3b8" : theme.primary,
                                                        color: "white",
                                                        border: "none",
                                                        borderRadius: "6px",
                                                        cursor:
                                                          customerSmsSending || smsBlockedPendingManualOptIn
                                                            ? "not-allowed"
                                                            : "pointer",
                                                        fontWeight: 600,
                                                        opacity: smsBlockedPendingManualOptIn ? 0.7 : 1,
                                                      }}
                                                    >
                                                      {customerSmsSending ? "Sending…" : "Send text"}
                                                    </button>
                                                  </div>
                                                ) : null}
                                                {chan === "email" ? (
                                                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                                                    <input
                                                      placeholder="To"
                                                      value={customerEmailTo}
                                                      onChange={(e) => setCustomerEmailTo(e.target.value)}
                                                      style={{ ...theme.formInput, maxWidth: "100%", color: "#0f172a" }}
                                                    />
                                                    <input
                                                      placeholder="Subject"
                                                      value={customerEmailSubject}
                                                      onChange={(e) => setCustomerEmailSubject(e.target.value)}
                                                      style={{ ...theme.formInput, maxWidth: "100%", color: "#0f172a" }}
                                                    />
                                                    <textarea
                                                      placeholder="Email body…"
                                                      value={customerEmailBody}
                                                      onChange={(e) => setCustomerEmailBody(e.target.value)}
                                                      rows={4}
                                                      style={{ ...theme.formInput, resize: "vertical", maxWidth: "100%", color: "#0f172a" }}
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() => void sendCustomerEmail()}
                                                      disabled={customerEmailSending}
                                                      style={{
                                                        alignSelf: "flex-start",
                                                        padding: "8px 14px",
                                                        background: theme.primary,
                                                        color: "white",
                                                        border: "none",
                                                        borderRadius: "6px",
                                                        cursor: customerEmailSending ? "wait" : "pointer",
                                                        fontWeight: 600,
                                                      }}
                                                    >
                                                      {customerEmailSending ? "Sending…" : "Send email"}
                                                    </button>
                                                  </div>
                                                ) : null}
                                              </div>
                                            ) : null}
                                          </div>
                                        )
                                      })}
                                    </div>

                                  {commHistoryChannel ? (
                                    <div
                                      role="presentation"
                                      style={{
                                        position: "fixed",
                                        inset: 0,
                                        background: "rgba(15,23,42,0.45)",
                                        zIndex: 12000,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: 16,
                                      }}
                                      onClick={() => setCommHistoryChannel(null)}
                                    >
                                      <div
                                        role="dialog"
                                        aria-modal
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          width: "min(560px, 100vw - 24px)",
                                          maxHeight: "min(80vh, 720px)",
                                          overflow: "auto",
                                          background: "#fff",
                                          borderRadius: 12,
                                          border: `1px solid ${theme.border}`,
                                          boxShadow: "0 20px 50px rgba(15,23,42,0.25)",
                                          padding: 14,
                                        }}
                                      >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
                                          <strong style={{ fontSize: 15, color: "#0f172a" }}>
                                            {commHistoryChannel === "phone" ? "Phone" : commHistoryChannel === "sms" ? "SMS" : "Email"} history
                                          </strong>
                                          <button
                                            type="button"
                                            onClick={() => setCommHistoryChannel(null)}
                                            style={{
                                              border: `1px solid ${theme.border}`,
                                              background: "#f8fafc",
                                              borderRadius: 8,
                                              width: 34,
                                              height: 34,
                                              cursor: "pointer",
                                              fontWeight: 800,
                                              color: "#0f172a",
                                              fontSize: 16,
                                            }}
                                            aria-label="Close"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                          {commItemsByChannel[commHistoryChannel].map((item) => {
                                            const open = !!timelineExpanded[item.key]
                                            const ev = item.kind === "ev" ? item.payload : null
                                            const isVm = item.kind === "ev" && ev?.event_type === "voicemail"
                                            const label = activityRowLabel(item)
                                            return (
                                              <div key={item.key} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, background: "#fff" }}>
                                                <button
                                                  type="button"
                                                  onClick={() => setTimelineExpanded((m) => ({ ...m, [item.key]: !open }))}
                                                  style={{
                                                    width: "100%",
                                                    textAlign: "left",
                                                    border: "none",
                                                    background: "transparent",
                                                    cursor: "pointer",
                                                    padding: 0,
                                                    fontWeight: 700,
                                                    fontSize: 13,
                                                    color: "#0f172a",
                                                  }}
                                                >
                                                  {label} ·{" "}
                                                  {item.payload?.created_at
                                                    ? new Date(item.payload.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                                                    : ""}{" "}
                                                  <span style={{ color: "#64748b", fontWeight: 500 }}>{open ? "−" : "+"}</span>
                                                </button>
                                                {open ? (
                                                  <div style={{ marginTop: 10 }}>
                                                    {item.kind === "msg" ? (
                                                      <p style={{ margin: 0, fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap" }}>
                                                        {item.payload?.content ?? "—"}
                                                      </p>
                                                    ) : isVm && ev ? (
                                                      <>
                                                        <VoicemailRecordingBlock recordingUrl={ev?.recording_url} />
                                                        <VoicemailTranscriptBlock
                                                          ev={ev}
                                                          profileVoicemailDisplay={voicemailProfileDisplay}
                                                          conversationPortalValues={conversationPortalDefaults}
                                                        />
                                                        {ev?.body ? (
                                                          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap" }}>{ev.body}</p>
                                                        ) : null}
                                                      </>
                                                    ) : (
                                                      <>
                                                        {ev?.subject?.trim() ? (
                                                          <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 4 }}>{ev.subject.trim()}</div>
                                                        ) : null}
                                                        <p style={{ margin: 0, fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap" }}>{ev?.body || "—"}</p>
                                                      </>
                                                    )}
                                                    <div style={{ marginTop: 12 }}>
                                                      <button
                                                        type="button"
                                                        disabled={!!aiSummaryBusy[item.key]}
                                                        onClick={() => void fetchAiSummaryForTimelineItem(item)}
                                                        style={{
                                                          padding: "6px 12px",
                                                          borderRadius: 6,
                                                          border: `1px solid ${theme.border}`,
                                                          background: "#f8fafc",
                                                          fontSize: 12,
                                                          fontWeight: 600,
                                                          cursor: aiSummaryBusy[item.key] ? "wait" : "pointer",
                                                          color: "#0f172a",
                                                        }}
                                                      >
                                                        {aiSummaryBusy[item.key] ? "Working…" : "Provide AI summary of job"}
                                                      </button>
                                                      {aiSummaryByKey[item.key] ? (
                                                        <div
                                                          style={{
                                                            marginTop: 8,
                                                            padding: 10,
                                                            borderRadius: 8,
                                                            background: "#f1f5f9",
                                                            fontSize: 13,
                                                            color: "#0f172a",
                                                            lineHeight: 1.5,
                                                            whiteSpace: "pre-wrap",
                                                          }}
                                                        >
                                                          {aiSummaryByKey[item.key]}
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  </div>
                                                ) : null}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                  {setPage ? (
                                    <div
                                      style={{
                                        marginTop: 14,
                                        paddingTop: 14,
                                        borderTop: `1px solid ${theme.border}`,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 10,
                                      }}
                                    >
                                      <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 14 }}>Scheduling and estimates</div>
                                      <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                                        Open Scheduling with this customer prefilled, or open their latest estimate (saved job details, line items, and notes reload).
                                      </p>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            queueSchedulingCustomerPrefill(c.id)
                                            queueCustomerFocus(c.id)
                                            setPage("calendar")
                                          }}
                                          style={{
                                            padding: "8px 14px",
                                            borderRadius: 6,
                                            border: "none",
                                            background: theme.primary,
                                            color: "#fff",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            fontSize: 13,
                                          }}
                                        >
                                          Scheduling
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            queueQuotesCustomerPrefill(c.id)
                                            queueCustomerFocus(c.id)
                                            setPage("quotes")
                                          }}
                                          style={{
                                            padding: "8px 14px",
                                            borderRadius: 6,
                                            border: `1px solid ${theme.border}`,
                                            background: "#fff",
                                            color: theme.text,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            fontSize: 13,
                                          }}
                                        >
                                          Open estimate
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedCustomer ? (
        <CustomerPaymentRequestModal
          open={customerPaymentRequestOpen}
          onClose={() => setCustomerPaymentRequestOpen(false)}
          supabase={supabase}
          userId={userId}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.display_name ?? null}
          profile={customerPaymentProfile}
          estimateLabel={null}
          amountLabel={null}
        />
      ) : null}

      {notesCustomerId && (
        <CustomerNotesPanel
          customerId={notesCustomerId}
          customerName={notesCustomerName}
          onClose={() => {
            setNotesCustomerId(null)
            setNotesCustomerName("")
          }}
        />
      )}
    </div>
  )
}
