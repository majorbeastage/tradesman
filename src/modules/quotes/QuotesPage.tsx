import { useEffect, useState, useMemo, useRef, Fragment, type ChangeEvent } from "react"
import { supabase } from "../../lib/supabase"
import { parseLocalDateTime } from "../../lib/parseLocalDateTime"
import { useOfficeManagerScopeOptional, usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import PortalSettingsModal from "../../components/PortalSettingsModal"
import PortalSettingItemsForm from "../../components/PortalSettingItemsForm"
import {
  getControlItemsForUser,
  getCustomActionButtonsForUser,
  getOmPageActionVisible,
  getPageActionVisible,
  isPortalSettingDependencyVisible,
} from "../../types/portal-builder"
import { useScopedAiAutomationsEnabled } from "../../hooks/useScopedAiAutomationsEnabled"
import { VoicemailRecordingBlock, VoicemailTranscriptBlock } from "../../components/VoicemailEventBlock"
import type { PortalSettingItem } from "../../types/portal-builder"
import { useIsMobile } from "../../hooks/useIsMobile"
import AttachmentStrip, { type AttachmentStripItem } from "../../components/AttachmentStrip"
import {
  loadAttachmentsByCommunicationEventIds,
  loadEntityAttachmentsForQuote,
  deleteEntityAttachmentRow,
  type EntityAttachmentRow,
} from "../../lib/communicationAttachments"
import { uploadEntityAttachmentFile, uploadFilesForOutbound } from "../../lib/uploadCommAttachment"
import { buildQuotePdfBytes, downloadPdfBlob } from "../../lib/documentPdf"
import { fetchQuoteLogoForExport } from "../../lib/quoteLogoImage"
import {
  resolveRecurrenceFromPortal,
  applyRecurrenceEndLimitsFromPortal,
  computeOccurrenceStarts,
  intervalsOverlap,
} from "../../lib/calendarRecurrence"
import {
  computeQuoteLineTotal,
  parseQuoteItemMetadata,
  type QuoteItemMetadata,
} from "../../lib/quoteItemMath"
import { insertQuoteItemRowSafe } from "../../lib/quoteItemsDb"
import {
  type EstimateLinePresetRow,
  formatEstimatePresetCostSummary,
  parseEstimateLinePresetsFromMetadata,
  serializePresetForProfile,
} from "../../lib/estimateLinePresets"

const ESTIMATE_FMT_PDF = "PDF"
const ESTIMATE_FMT_DOCX = "Microsoft Word (.docx)"

function metaToExportFormat(v: unknown): "pdf" | "docx" {
  return v === "docx" ? "docx" : "pdf"
}

function exportFormatToDropdown(fmt: "pdf" | "docx"): string {
  return fmt === "docx" ? ESTIMATE_FMT_DOCX : ESTIMATE_FMT_PDF
}

function dropdownToExportFormat(label: string): "pdf" | "docx" {
  return label.trim() === ESTIMATE_FMT_DOCX ? "docx" : "pdf"
}

const ELI_LINE_KINDS = ["labor", "material", "travel", "misc"] as const
type EliLineKind = (typeof ELI_LINE_KINDS)[number]
const ELI_KIND_LABEL: Record<EliLineKind, string> = {
  labor: "Labor",
  material: "Materials",
  travel: "Travel expenses",
  misc: "Miscellaneous",
}
const ELI_UNITS = ["hours", "miles", "each"] as const
type EliUnit = (typeof ELI_UNITS)[number]
const ELI_UNIT_LABEL: Record<EliUnit, string> = {
  hours: "Hours",
  miles: "Miles (mileage)",
  each: "Flat / each",
}

/** Crew count when inserting labor lines from saved presets (table row still edits crew per line). */
const DEFAULT_PRESET_LABOR_MANPOWER = 1

function eliLineKindFromPresetKind(kind: string | undefined): EliLineKind {
  if (kind === "material" || kind === "travel" || kind === "misc") return kind
  return "labor"
}

function eliUnitSuffix(unitBasis: string | undefined): string {
  if (unitBasis === "miles") return "mi"
  if (unitBasis === "each") return "ea"
  return "hr"
}

/** PostgREST when `quotes.job_type_id` has not been migrated yet */
function supabaseQuotesMissingJobTypeIdColumn(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase()
  return m.includes("job_type_id") && (m.includes("does not exist") || m.includes("schema cache"))
}

type CustomerIdentifier = { type: string; value: string; is_primary?: boolean }
type CustomerRow = { display_name: string | null; customer_identifiers: CustomerIdentifier[] | null }
type MessageRow = { content: string | null; created_at: string | null }
type QuoteRow = {
  id: string
  status: string | null
  created_at?: string
  updated_at?: string
  customer_id: string
  conversation_id: string | null
  job_type_id?: string | null
  customers: CustomerRow | null
  conversations?: { messages?: MessageRow[] | null } | null
}

type QuotesPageProps = { setPage?: (page: string) => void }

/** Job type row for calendar picker + Job types modal (columns vary with DB migration). */
type QuoteJobTypeListRow = {
  id: string
  name: string
  duration_minutes: number
  description: string | null
  color_hex: string | null
  materials_list?: string | null
  track_mileage?: boolean | null
}

type CalendarPickerJobType = {
  id: string
  name: string
  duration_minutes: number
  materials_list?: string | null
  track_mileage?: boolean | null
}

export default function QuotesPage({ setPage }: QuotesPageProps) {
  const isMobile = useIsMobile()
  const { userId: authUserId, session } = useAuth()
  const scopeCtx = useOfficeManagerScopeOptional()
  const userId = useScopedUserId()
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(userId)
  const portalConfig = usePortalConfigForPage()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [showEstimateTemplateModal, setShowEstimateTemplateModal] = useState(false)
  const [estimateTemplateFormValues, setEstimateTemplateFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
  const [showAutoResponseOptions, setShowAutoResponseOptions] = useState(false)
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [quotesError, setQuotesError] = useState<string>("")
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
  const [selectedQuote, setSelectedQuote] = useState<any>(null)
  /** Shown in expanded row when openQuote fails (e.g. missing DB column) */
  const [quoteOpenError, setQuoteOpenError] = useState("")
  const [selectedQuoteItems, setSelectedQuoteItems] = useState<any[]>([])
  const [quoteCommEvents, setQuoteCommEvents] = useState<any[]>([])
  const [quoteAttachmentsByEvent, setQuoteAttachmentsByEvent] = useState<Record<string, AttachmentStripItem[]>>({})
  const [quoteEntityRows, setQuoteEntityRows] = useState<EntityAttachmentRow[]>([])
  const [quoteEntityUploadBusy, setQuoteEntityUploadBusy] = useState(false)
  const [quotePdfBusy, setQuotePdfBusy] = useState(false)
  const [quotePdfTemplate, setQuotePdfTemplate] = useState<string | null>(null)
  const [quoteTemplateFooter, setQuoteTemplateFooter] = useState("")
  const [quoteExportFormat, setQuoteExportFormat] = useState<"pdf" | "docx">("pdf")
  const [quoteIncludePreparedDate, setQuoteIncludePreparedDate] = useState(true)
  const [quoteShowLineNumbers, setQuoteShowLineNumbers] = useState(false)
  const [quoteShowLogo, setQuoteShowLogo] = useState(false)
  const [quoteLogoUrl, setQuoteLogoUrl] = useState("")
  const [estimateLogoUploadBusy, setEstimateLogoUploadBusy] = useState(false)
  const [legalDraftBusy, setLegalDraftBusy] = useState(false)
  const [quoteIncludeLegal, setQuoteIncludeLegal] = useState(false)
  const [quoteLegalText, setQuoteLegalText] = useState("")
  const [quoteCancellationText, setQuoteCancellationText] = useState("")
  const [quoteLegalSignatures, setQuoteLegalSignatures] = useState(true)
  const [showEstimateLineItemsModal, setShowEstimateLineItemsModal] = useState(false)
  const [showQuoteJobTypesModal, setShowQuoteJobTypesModal] = useState(false)
  const [estimateLinePresets, setEstimateLinePresets] = useState<EstimateLinePresetRow[]>([])
  const [estimateDefaultLaborRate, setEstimateDefaultLaborRate] = useState("")
  const [estimateLineSaveBusy, setEstimateLineSaveBusy] = useState(false)
  const [quoteJobTypesList, setQuoteJobTypesList] = useState<QuoteJobTypeListRow[]>([])
  const [quoteJobTypesModalValues, setQuoteJobTypesModalValues] = useState<Record<string, string>>({})
  const [estimateReview, setEstimateReview] = useState<{
    subtotal: number | null
    issues: string[]
    agreesWithSubtotal: boolean | null
  }>({ subtotal: null, issues: [], agreesWithSubtotal: null })
  const [estimateLinePortalValues, setEstimateLinePortalValues] = useState<Record<string, string>>({})
  const [estimateLineDraft, setEstimateLineDraft] = useState<EstimateLinePresetRow[]>([])
  /** Simple “add saved line” form inside Estimate line items modal */
  const [eliSimpleKind, setEliSimpleKind] = useState<EliLineKind>("labor")
  const [eliSimpleUnit, setEliSimpleUnit] = useState<EliUnit>("hours")
  const [eliSimpleQty, setEliSimpleQty] = useState("1")
  const [eliSimplePrice, setEliSimplePrice] = useState("")
  /** Saved-line row id → expanded (edit fields visible) */
  const [expandedEliById, setExpandedEliById] = useState<Record<string, boolean>>({})
  /** Per draft row: job type picked for “Add to job type” */
  const [eliLinkJtPick, setEliLinkJtPick] = useState<Record<string, string>>({})
  /** Job types modal: link templates to the job type being added/edited */
  const [jtModalPresetChecks, setJtModalPresetChecks] = useState<Record<string, boolean>>({})
  const [estimateModalJobTypes, setEstimateModalJobTypes] = useState<{ id: string; name: string }[]>([])
  /** Job types for quote line dropdowns (loaded with quote detail). */
  const [quoteDetailJobTypes, setQuoteDetailJobTypes] = useState<{ id: string; name: string }[]>([])
  /** Controlled fields for quote_items table — fixes editing after quick add (uncontrolled defaultValue sync issues). */
  const [quoteLineDrafts, setQuoteLineDrafts] = useState<
    Record<string, { description: string; quantity: string; unit_price: string; manpower: string; minimum: string; job_type_id: string }>
  >({})
  const estimateReviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [profileDisplayNameForPdf, setProfileDisplayNameForPdf] = useState("")
  const [quoteEmailSubject, setQuoteEmailSubject] = useState("")
  const [quoteEmailBody, setQuoteEmailBody] = useState("")
  const [quoteEmailSending, setQuoteEmailSending] = useState(false)
  const [quoteEmailAttachEntity, setQuoteEmailAttachEntity] = useState(true)
  const [showQuoteEmailPanel, setShowQuoteEmailPanel] = useState(false)
  const [quoteThreadMessages, setQuoteThreadMessages] = useState<any[]>([])
  const [voicemailProfileDisplay, setVoicemailProfileDisplay] = useState<string>("use_channel")
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [customerList, setCustomerList] = useState<any[]>([])
  const [addExistingId, setAddExistingId] = useState<string>("")
  const [addNewName, setAddNewName] = useState("")
  const [addNewPhone, setAddNewPhone] = useState("")
  const [addNewEmail, setAddNewEmail] = useState("")
  const [addUseNew, setAddUseNew] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  // Add line item (quote_items)
  const [newItemDescription, setNewItemDescription] = useState("")
  const [newItemQuantity, setNewItemQuantity] = useState("1")
  const [newItemUnitPrice, setNewItemUnitPrice] = useState("")
  const [newItemManpower, setNewItemManpower] = useState("1")
  const [newItemMinimum, setNewItemMinimum] = useState("")
  const [newItemPresetId, setNewItemPresetId] = useState<string | null>(null)
  const [presetSuggestOpen, setPresetSuggestOpen] = useState(false)
  const [addItemLoading, setAddItemLoading] = useState(false)
  const [quoteJtNewName, setQuoteJtNewName] = useState("")
  const [quoteJtNewDuration, setQuoteJtNewDuration] = useState(60)
  const [quoteJtNewDesc, setQuoteJtNewDesc] = useState("")
  const [quoteJtNewColor, setQuoteJtNewColor] = useState("#F97316")
  const [quoteJtSaving, setQuoteJtSaving] = useState(false)
  const [editingQuoteJtId, setEditingQuoteJtId] = useState<string | null>(null)
  const [quoteJtMaterials, setQuoteJtMaterials] = useState("")
  const [quoteJtTrackMileage, setQuoteJtTrackMileage] = useState(false)
  const [applyJtLinesBusy, setApplyJtLinesBusy] = useState(false)
  // Add to Calendar (from quote detail)
  const [showAddToCalendar, setShowAddToCalendar] = useState(false)
  const [calTitle, setCalTitle] = useState("")
  const [calDate, setCalDate] = useState("")
  const [calTime, setCalTime] = useState("09:00")
  const [calDuration, setCalDuration] = useState(60)
  const [calJobTypeId, setCalJobTypeId] = useState("")
  const [calMileage, setCalMileage] = useState("")
  const [calNotes, setCalNotes] = useState("")
  const [jobTypes, setJobTypes] = useState<CalendarPickerJobType[]>([])
  const [addToCalendarLoading, setAddToCalendarLoading] = useState(false)
  const [quoteCalPortalValues, setQuoteCalPortalValues] = useState<Record<string, string>>({})
  const [quoteJobTypesPortalValues, setQuoteJobTypesPortalValues] = useState<Record<string, string>>({})
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true)
  const [assignToScopedUser, setAssignToScopedUser] = useState(true)
  const [calendarTargetUserId, setCalendarTargetUserId] = useState("")

  const selectableUsers = useMemo(() => {
    if (scopeCtx?.clients?.length) return scopeCtx.clients
    return [{ userId, label: "My calendar", email: null, clientId: null, isSelf: true }]
  }, [scopeCtx?.clients, userId])

  const quoteSettingsItems = useMemo(
    () => getControlItemsForUser(portalConfig, "quotes", "quote_settings", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const quoteCalendarItems = useMemo(
    () => getControlItemsForUser(portalConfig, "quotes", "add_quote_to_calendar", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const calendarJobTypesPortalItems = useMemo(
    () => getControlItemsForUser(portalConfig, "calendar", "job_types", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const estimateTemplateItems = useMemo(
    () => getControlItemsForUser(portalConfig, "quotes", "estimate_template", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const estimateLineItemsPortal = useMemo(
    () => getControlItemsForUser(portalConfig, "quotes", "estimate_line_items", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const quoteJobTypesPanelItems = useMemo(
    () => getControlItemsForUser(portalConfig, "quotes", "job_types", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const customActionButtons = useMemo(() => getCustomActionButtonsForUser(portalConfig, "quotes"), [portalConfig])
  const showQuotesAddCustomer = getPageActionVisible(portalConfig, "quotes", "add_customer_to_quotes") && getOmPageActionVisible(portalConfig, "quotes", "add_customer")
  const quoteAddCustomerPortalItems = useMemo(
    () => getControlItemsForUser(portalConfig, "quotes", "add_customer_to_quotes", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const [quoteAddCustomerPortalValues, setQuoteAddCustomerPortalValues] = useState<Record<string, string>>({})
  const showQuotesAutoResponse = getOmPageActionVisible(portalConfig, "quotes", "auto_response")
  const showQuotesSettings = getOmPageActionVisible(portalConfig, "quotes", "settings")
  const showQuotesEstimateTemplate =
    getPageActionVisible(portalConfig, "quotes", "estimate_template") && getOmPageActionVisible(portalConfig, "quotes", "estimate_template")
  const showQuotesEstimateLineItems =
    getPageActionVisible(portalConfig, "quotes", "estimate_line_items") &&
    getOmPageActionVisible(portalConfig, "quotes", "estimate_line_items")
  const showQuotesJobTypesPanel =
    getPageActionVisible(portalConfig, "quotes", "job_types") && getOmPageActionVisible(portalConfig, "quotes", "job_types")
  const estimateTemplateButtonLabel = portalConfig?.controlLabels?.estimate_template ?? "Estimate template"
  const estimateLineItemsButtonLabel = portalConfig?.controlLabels?.estimate_line_items ?? "Estimate line items"
  const quoteJobTypesButtonLabel = portalConfig?.controlLabels?.job_types ?? "Job types"

  function isEstimateLinePortalItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, estimateLineItemsPortal, estimateLinePortalValues)
  }

  useEffect(() => {
    if (estimateLineItemsPortal.length === 0) {
      setEstimateLinePortalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of estimateLineItemsPortal) {
      try {
        const s = localStorage.getItem(`quotes_eli_${item.id}`)
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
    setEstimateLinePortalValues(next)
  }, [estimateLineItemsPortal])

  useEffect(() => {
    if (!showEstimateLineItemsModal || !supabase || !userId) return
    void supabase
      .from("job_types")
      .select("id, name")
      .eq("user_id", userId)
      .order("name")
      .then(({ data }) => setEstimateModalJobTypes(data || []))
  }, [showEstimateLineItemsModal, userId])

  const conversationPortalDefaults = useMemo(() => {
    const items = getControlItemsForUser(portalConfig, "conversations", "conversation_settings", { aiAutomationsEnabled })
    const out: Record<string, string> = {}
    for (const item of items) {
      if (item.type === "checkbox") out[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) out[item.id] = item.options[0]
    }
    return out
  }, [portalConfig, aiAutomationsEnabled])

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("voicemail_conversations_display")
        .eq("id", userId)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) return
      const v = (data as { voicemail_conversations_display?: string }).voicemail_conversations_display
      if (typeof v === "string" && v.trim()) setVoicemailProfileDisplay(v.trim())
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("document_template_quote, display_name, metadata")
        .eq("id", userId)
        .maybeSingle()
      if (cancelled || error || !data) return
      const row = data as { document_template_quote?: string | null; display_name?: string | null; metadata?: unknown }
      setQuotePdfTemplate(typeof row.document_template_quote === "string" && row.document_template_quote.trim() ? row.document_template_quote : null)
      setProfileDisplayNameForPdf(typeof row.display_name === "string" ? row.display_name.trim() : "")
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}
      setQuoteExportFormat(metaToExportFormat(meta.estimate_template_output_format))
      setQuoteTemplateFooter(typeof meta.estimate_template_footer === "string" ? meta.estimate_template_footer : "")
      setQuoteIncludePreparedDate(meta.estimate_template_include_prepared_date !== false)
      setQuoteShowLineNumbers(meta.estimate_template_show_line_numbers === true)
      setQuoteShowLogo(meta.estimate_template_show_logo === true)
      setQuoteLogoUrl(typeof meta.estimate_template_logo_url === "string" ? meta.estimate_template_logo_url : "")
      setQuoteIncludeLegal(meta.estimate_template_include_legal === true)
      setQuoteLegalText(typeof meta.estimate_template_legal_text === "string" ? meta.estimate_template_legal_text : "")
      setQuoteCancellationText(typeof meta.estimate_template_cancellation_fee === "string" ? meta.estimate_template_cancellation_fee : "")
      setQuoteLegalSignatures(meta.estimate_template_legal_signatures !== false)
      const laborMeta = meta.estimate_default_labor_rate
      if (typeof laborMeta === "number" && Number.isFinite(laborMeta)) setEstimateDefaultLaborRate(String(laborMeta))
      else if (typeof laborMeta === "string") setEstimateDefaultLaborRate(laborMeta)
      setEstimateLinePresets(parseEstimateLinePresetsFromMetadata(meta))
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!selectedQuote?.id) return
    const name = selectedQuote.customers?.display_name ?? "Customer"
    setQuoteEmailSubject(`Quote for ${name}`)
    setQuoteEmailBody("Please see the quote below and let us know if you have any questions.\n\nThank you,")
  }, [selectedQuote?.id])

  useEffect(() => {
    if (!showSettings || quoteSettingsItems.length === 0) return
    const next: Record<string, string> = {}
    quoteSettingsItems.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setSettingsFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [showSettings, quoteSettingsItems])

  function isQuoteCalendarPortalItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, quoteCalendarItems, quoteCalPortalValues)
  }

  function isQuoteSettingItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, quoteSettingsItems, settingsFormValues)
  }

  function isEstimateTemplateItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, estimateTemplateItems, estimateTemplateFormValues)
  }

  function isQuoteJobTypesPanelItemVisible(item: PortalSettingItem): boolean {
    return isPortalSettingDependencyVisible(item, quoteJobTypesPanelItems, quoteJobTypesModalValues)
  }

  useEffect(() => {
    if (!showEstimateTemplateModal || !supabase || !userId || estimateTemplateItems.length === 0) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from("profiles").select("document_template_quote, metadata").eq("id", userId).maybeSingle()
      if (cancelled) return
      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {}
      const useAi = meta.estimate_template_use_ai === true
      const notes = String((data as { document_template_quote?: string | null })?.document_template_quote ?? "")
      const footer = typeof meta.estimate_template_footer === "string" ? meta.estimate_template_footer : ""
      const fmt = exportFormatToDropdown(metaToExportFormat(meta.estimate_template_output_format))
      const includeDate = meta.estimate_template_include_prepared_date !== false
      const lineNums = meta.estimate_template_show_line_numbers === true
      const showLogo = meta.estimate_template_show_logo === true
      const logoUrl = typeof meta.estimate_template_logo_url === "string" ? meta.estimate_template_logo_url : ""
      const includeLegal = meta.estimate_template_include_legal === true
      const legalBody = typeof meta.estimate_template_legal_text === "string" ? meta.estimate_template_legal_text : ""
      const legalCancel = typeof meta.estimate_template_cancellation_fee === "string" ? meta.estimate_template_cancellation_fee : ""
      const legalSigs = meta.estimate_template_legal_signatures !== false
      const next: Record<string, string> = {}
      for (const item of estimateTemplateItems) {
        if (item.id === "estimate_template_notes") next[item.id] = notes
        else if (item.id === "estimate_template_footer") next[item.id] = footer
        else if (item.id === "estimate_template_output_format")
          next[item.id] = item.options?.includes(fmt) ? fmt : item.options?.[0] ?? ESTIMATE_FMT_PDF
        else if (item.id === "estimate_template_include_prepared_date")
          next[item.id] = includeDate ? "checked" : "unchecked"
        else if (item.id === "estimate_template_show_line_numbers") next[item.id] = lineNums ? "checked" : "unchecked"
        else if (item.id === "estimate_template_show_logo") next[item.id] = showLogo ? "checked" : "unchecked"
        else if (item.id === "estimate_template_logo_url") next[item.id] = logoUrl
        else if (item.id === "estimate_template_include_legal") next[item.id] = includeLegal ? "checked" : "unchecked"
        else if (item.id === "estimate_template_legal_text") next[item.id] = legalBody
        else if (item.id === "estimate_template_cancellation_fee") next[item.id] = legalCancel
        else if (item.id === "estimate_template_legal_signatures") next[item.id] = legalSigs ? "checked" : "unchecked"
        else if (item.id === "estimate_template_use_ai") next[item.id] = useAi ? "checked" : "unchecked"
        else if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
        else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
        else next[item.id] = ""
      }
      setEstimateTemplateFormValues(next)
    })()
    return () => {
      cancelled = true
    }
  }, [showEstimateTemplateModal, userId, estimateTemplateItems])

  async function closeEstimateTemplateModal() {
    if (!supabase || !userId) {
      setShowEstimateTemplateModal(false)
      return
    }
    const notes = (estimateTemplateFormValues.estimate_template_notes ?? "").trim()
    const useAi = estimateTemplateFormValues.estimate_template_use_ai === "checked"
    const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    if (fetchErr) {
      alert(fetchErr.message)
      return
    }
    const prevMeta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? { ...(data.metadata as Record<string, unknown>) }
        : {}
    const hasItem = (id: string) => estimateTemplateItems.some((i) => i.id === id)

    prevMeta.estimate_template_use_ai = useAi
    if (hasItem("estimate_template_output_format")) {
      const fmt = dropdownToExportFormat(estimateTemplateFormValues.estimate_template_output_format ?? ESTIMATE_FMT_PDF)
      prevMeta.estimate_template_output_format = fmt
    }
    if (hasItem("estimate_template_footer")) {
      const footerRaw = (estimateTemplateFormValues.estimate_template_footer ?? "").trim()
      if (footerRaw) prevMeta.estimate_template_footer = footerRaw
      else delete prevMeta.estimate_template_footer
    }
    if (hasItem("estimate_template_include_prepared_date")) {
      prevMeta.estimate_template_include_prepared_date =
        estimateTemplateFormValues.estimate_template_include_prepared_date === "checked"
    }
    if (hasItem("estimate_template_show_line_numbers")) {
      prevMeta.estimate_template_show_line_numbers =
        estimateTemplateFormValues.estimate_template_show_line_numbers === "checked"
    }
    if (hasItem("estimate_template_show_logo")) {
      prevMeta.estimate_template_show_logo = estimateTemplateFormValues.estimate_template_show_logo === "checked"
    }
    if (hasItem("estimate_template_logo_url")) {
      const logoRaw = (estimateTemplateFormValues.estimate_template_logo_url ?? "").trim()
      if (logoRaw) prevMeta.estimate_template_logo_url = logoRaw
      else delete prevMeta.estimate_template_logo_url
    }
    if (hasItem("estimate_template_include_legal")) {
      prevMeta.estimate_template_include_legal = estimateTemplateFormValues.estimate_template_include_legal === "checked"
    }
    if (hasItem("estimate_template_legal_text")) {
      const lt = (estimateTemplateFormValues.estimate_template_legal_text ?? "").trim()
      if (lt) prevMeta.estimate_template_legal_text = lt
      else delete prevMeta.estimate_template_legal_text
    }
    if (hasItem("estimate_template_cancellation_fee")) {
      const cf = (estimateTemplateFormValues.estimate_template_cancellation_fee ?? "").trim()
      if (cf) prevMeta.estimate_template_cancellation_fee = cf
      else delete prevMeta.estimate_template_cancellation_fee
    }
    if (hasItem("estimate_template_legal_signatures")) {
      prevMeta.estimate_template_legal_signatures =
        estimateTemplateFormValues.estimate_template_legal_signatures === "checked"
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        document_template_quote: notes || null,
        metadata: prevMeta,
      })
      .eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    setQuotePdfTemplate(notes || null)
    if (hasItem("estimate_template_footer")) {
      setQuoteTemplateFooter((estimateTemplateFormValues.estimate_template_footer ?? "").trim())
    }
    if (hasItem("estimate_template_output_format")) {
      setQuoteExportFormat(dropdownToExportFormat(estimateTemplateFormValues.estimate_template_output_format ?? ESTIMATE_FMT_PDF))
    }
    if (hasItem("estimate_template_include_prepared_date")) {
      setQuoteIncludePreparedDate(estimateTemplateFormValues.estimate_template_include_prepared_date === "checked")
    }
    if (hasItem("estimate_template_show_line_numbers")) {
      setQuoteShowLineNumbers(estimateTemplateFormValues.estimate_template_show_line_numbers === "checked")
    }
    if (hasItem("estimate_template_show_logo")) {
      setQuoteShowLogo(estimateTemplateFormValues.estimate_template_show_logo === "checked")
    }
    if (hasItem("estimate_template_logo_url")) {
      setQuoteLogoUrl((estimateTemplateFormValues.estimate_template_logo_url ?? "").trim())
    }
    if (hasItem("estimate_template_include_legal")) {
      setQuoteIncludeLegal(estimateTemplateFormValues.estimate_template_include_legal === "checked")
    }
    if (hasItem("estimate_template_legal_text")) {
      setQuoteLegalText((estimateTemplateFormValues.estimate_template_legal_text ?? "").trim())
    }
    if (hasItem("estimate_template_cancellation_fee")) {
      setQuoteCancellationText((estimateTemplateFormValues.estimate_template_cancellation_fee ?? "").trim())
    }
    if (hasItem("estimate_template_legal_signatures")) {
      setQuoteLegalSignatures(estimateTemplateFormValues.estimate_template_legal_signatures === "checked")
    }
    setShowEstimateTemplateModal(false)
  }

  async function runEstimateLegalDraft() {
    if (!session?.access_token) {
      alert("Sign in required.")
      return
    }
    setLegalDraftBusy(true)
    try {
      const res = await fetch("/api/platform-tools?__route=estimate-legal-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ businessName: profileDisplayNameForPdf }),
      })
      const j = (await res.json()) as { ok?: boolean; legalText?: string; cancellationText?: string; error?: string }
      if (!res.ok) throw new Error(j.error || "Request failed")
      setEstimateTemplateFormValues((prev) => ({
        ...prev,
        ...(typeof j.legalText === "string" && j.legalText.trim()
          ? { estimate_template_legal_text: j.legalText }
          : {}),
        ...(typeof j.cancellationText === "string" && j.cancellationText.trim()
          ? { estimate_template_cancellation_fee: j.cancellationText }
          : {}),
      }))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setLegalDraftBusy(false)
    }
  }

  async function onEstimateLogoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setEstimateLogoUploadBusy(true)
    try {
      const urls = await uploadFilesForOutbound(userId, [file], "quote-estimate-logo")
      if (urls[0]) setEstimateTemplateFormValues((prev) => ({ ...prev, estimate_template_logo_url: urls[0] }))
      else alert("Logo upload failed. Check storage permissions for comm-attachments.")
    } finally {
      setEstimateLogoUploadBusy(false)
      e.target.value = ""
    }
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

  // Settings (localStorage)
  const [defaultQuoteStatus] = useState(() => {
    try { return localStorage.getItem("quotes_defaultStatus") ?? "draft" } catch { return "draft" }
  })

  // Auto Response Options (in-depth) - localStorage
  const [arOnQuoteCreated, setArOnQuoteCreated] = useState(() => {
    try { return JSON.parse(localStorage.getItem("quotes_arOnQuoteCreated") ?? "true") } catch { return true }
  })
  const [arOnQuoteCreatedMessage, setArOnQuoteCreatedMessage] = useState(() => {
    try { return localStorage.getItem("quotes_arOnQuoteCreatedMessage") ?? "" } catch { return "" }
  })
  const [arOnQuoteSent, setArOnQuoteSent] = useState(() => {
    try { return JSON.parse(localStorage.getItem("quotes_arOnQuoteSent") ?? "false") } catch { return false }
  })
  const [arOnQuoteSentMessage, setArOnQuoteSentMessage] = useState(() => {
    try { return localStorage.getItem("quotes_arOnQuoteSentMessage") ?? "" } catch { return "" }
  })
  const [arOnQuoteViewed, setArOnQuoteViewed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("quotes_arOnQuoteViewed") ?? "false") } catch { return false }
  })
  const [arOnQuoteViewedMessage, setArOnQuoteViewedMessage] = useState(() => {
    try { return localStorage.getItem("quotes_arOnQuoteViewedMessage") ?? "" } catch { return "" }
  })
  const [arDelayMinutes, setArDelayMinutes] = useState(() => {
    try { return localStorage.getItem("quotes_arDelayMinutes") ?? "0" } catch { return "0" }
  })

  useEffect(() => {
    if (!calendarTargetUserId || !supabase) return
    void supabase
      .from("user_calendar_preferences")
      .select("auto_assign_enabled")
      .eq("owner_user_id", calendarTargetUserId)
      .maybeSingle()
      .then(({ data }) => {
        const enabled = ((data as { auto_assign_enabled?: boolean | null } | null)?.auto_assign_enabled) !== false
        setAutoAssignEnabled(enabled)
        setAssignToScopedUser(enabled)
      })
  }, [calendarTargetUserId])

  useEffect(() => {
    if (!showAddToCalendar || !supabase || !calendarTargetUserId) return
    void (async () => {
      let rows: CalendarPickerJobType[] = []
      let q = await supabase
        .from("job_types")
        .select("id, name, duration_minutes, materials_list, track_mileage")
        .eq("user_id", calendarTargetUserId)
        .order("name")
      rows = (q.data ?? []) as CalendarPickerJobType[]
      let err = q.error
      const em = (e: typeof err) => (e?.message ?? "").toLowerCase()
      if (err && (em(err).includes("track_mileage") || em(err).includes("materials_list"))) {
        const q2 = await supabase
          .from("job_types")
          .select("id, name, duration_minutes, materials_list")
          .eq("user_id", calendarTargetUserId)
          .order("name")
        rows = (q2.data ?? []) as CalendarPickerJobType[]
        err = q2.error
      }
      if (err?.message?.toLowerCase().includes("materials_list")) {
        const q3 = await supabase
          .from("job_types")
          .select("id, name, duration_minutes")
          .eq("user_id", calendarTargetUserId)
          .order("name")
        rows = (q3.data ?? []) as CalendarPickerJobType[]
      }
      setJobTypes(rows)
    })()
  }, [showAddToCalendar, calendarTargetUserId, supabase])

  useEffect(() => {
    if (!showAddToCalendar) return
    if (quoteCalendarItems.length === 0) {
      setQuoteCalPortalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of quoteCalendarItems) {
      try {
        const s = localStorage.getItem(`quotes_qcal_${item.id}`)
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
    setQuoteCalPortalValues(next)
  }, [showAddToCalendar, quoteCalendarItems])

  useEffect(() => {
    if (!showAddToCalendar) return
    if (calendarJobTypesPortalItems.length === 0) {
      setQuoteJobTypesPortalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of calendarJobTypesPortalItems) {
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
    setQuoteJobTypesPortalValues(next)
  }, [showAddToCalendar, calendarJobTypesPortalItems])

  useEffect(() => {
    if (!showAddCustomer) return
    if (quoteAddCustomerPortalItems.length === 0) {
      setQuoteAddCustomerPortalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of quoteAddCustomerPortalItems) {
      try {
        const s = localStorage.getItem(`quotes_addcust_${item.id}`)
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
    setQuoteAddCustomerPortalValues(next)
  }, [showAddCustomer, quoteAddCustomerPortalItems])

  useEffect(() => {
    if (!showQuoteJobTypesModal || quoteJobTypesPanelItems.length === 0) {
      if (showQuoteJobTypesModal) setQuoteJobTypesModalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of quoteJobTypesPanelItems) {
      try {
        const s = localStorage.getItem(`quotes_qjt_${item.id}`)
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
    setQuoteJobTypesModalValues(next)
  }, [showQuoteJobTypesModal, quoteJobTypesPanelItems])

  useEffect(() => {
    if (!showQuoteJobTypesModal || !supabase || !userId) return
    const client = supabase
    void (async () => {
      const em = (e: { message?: string } | null) => (e?.message ?? "").toLowerCase()
      const full = await client
        .from("job_types")
        .select("id, name, duration_minutes, description, color_hex, materials_list, track_mileage")
        .eq("user_id", userId)
        .order("name")
      if (!full.error) {
        setQuoteJobTypesList((full.data ?? []) as QuoteJobTypeListRow[])
        return
      }
      if (full.error && (em(full.error).includes("track_mileage") || em(full.error).includes("materials_list"))) {
        const mid = await client
          .from("job_types")
          .select("id, name, duration_minutes, description, color_hex, materials_list")
          .eq("user_id", userId)
          .order("name")
        if (!mid.error) {
          setQuoteJobTypesList((mid.data ?? []) as QuoteJobTypeListRow[])
          return
        }
        if (mid.error?.message?.toLowerCase().includes("materials_list")) {
          const min = await client
            .from("job_types")
            .select("id, name, duration_minutes, description, color_hex")
            .eq("user_id", userId)
            .order("name")
          setQuoteJobTypesList((min.data ?? []) as QuoteJobTypeListRow[])
          return
        }
      }
      setQuoteJobTypesList([])
    })()
  }, [showQuoteJobTypesModal, supabase, userId])

  useEffect(() => {
    if (!showQuoteJobTypesModal) return
    setEstimateModalJobTypes(quoteJobTypesList.map((j) => ({ id: j.id, name: j.name })))
  }, [showQuoteJobTypesModal, quoteJobTypesList])

  useEffect(() => {
    if (!showEstimateLineItemsModal || !supabase || !userId) return
    void supabase
      .from("job_types")
      .select("id, name")
      .eq("user_id", userId)
      .order("name")
      .then(({ data }) => setEstimateModalJobTypes(data || []))
  }, [showEstimateLineItemsModal, userId])

  useEffect(() => {
    if (eliSimpleKind === "travel") setEliSimpleUnit("miles")
    else if (eliSimpleKind === "labor") setEliSimpleUnit("hours")
    else setEliSimpleUnit("each")
  }, [eliSimpleKind])

  useEffect(() => {
    if (!editingQuoteJtId) return
    const next: Record<string, boolean> = {}
    for (const p of estimateLinePresets) {
      next[p.id] = (p.linked_job_type_ids ?? []).includes(editingQuoteJtId)
    }
    setJtModalPresetChecks(next)
  }, [editingQuoteJtId, estimateLinePresets])

  async function loadQuotes() {
    if (!userId || !supabase) return
    setQuotesError("")
    const selectWith = `
        id,
        status,
        created_at,
        updated_at,
        customer_id,
        conversation_id,
        job_type_id,
        scheduled_at,
        removed_at,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        ),
        conversations (
          messages (
            content,
            created_at
          )
        )
      `
    const selectWithNoJobType = `
        id,
        status,
        created_at,
        updated_at,
        customer_id,
        conversation_id,
        scheduled_at,
        removed_at,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        ),
        conversations (
          messages (
            content,
            created_at
          )
        )
      `
    const selectWithout = `
        id,
        status,
        created_at,
        updated_at,
        customer_id,
        conversation_id,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        ),
        conversations (
          messages (
            content,
            created_at
          )
        )
      `
    const listFirst = await supabase
      .from("quotes")
      .select(selectWith)
      .eq("user_id", userId)
      .is("scheduled_at", null)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })

    let data: any[] | null = listFirst.data
    let error = listFirst.error

    if (error && supabaseQuotesMissingJobTypeIdColumn(error.message)) {
      const r = await supabase
        .from("quotes")
        .select(selectWithNoJobType)
        .eq("user_id", userId)
        .is("scheduled_at", null)
        .is("removed_at", null)
        .order("updated_at", { ascending: false })
      data = r.data
      error = r.error
      if (data) {
        data = data.map((q: any) => ({ ...q, job_type_id: q.job_type_id ?? null }))
      }
    }

    if (error && (error.message?.includes("scheduled_at") || error.message?.includes("removed_at"))) {
      const res = await supabase
        .from("quotes")
        .select(selectWithout)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
      if (res.error) {
        setQuotesError(res.error.message)
        setQuotes([])
        return
      }
      data = (res.data || []).map((q: any) => ({
        ...q,
        scheduled_at: q.scheduled_at ?? null,
        removed_at: q.removed_at ?? null,
        job_type_id: q.job_type_id ?? null,
      }))
      error = null
    } else if (error) {
      setQuotesError(error.message)
      setQuotes([])
      return
    }
    setQuotes(data || [])
  }

  useEffect(() => {
    loadQuotes()
  }, [userId])

  async function loadCustomerList() {
    if (!supabase || !userId) return
    const { data } = await supabase.from("customers").select("id, display_name").eq("user_id", userId).order("display_name")
    setCustomerList(data || [])
  }

  async function addCustomerToQuotesFlow() {
    if (!supabase) return
    setAddLoading(true)
    try {
      let customerId: string
      if (addUseNew) {
        if (!addNewName?.trim() && !addNewPhone?.trim()) {
          alert("Enter at least a name or phone for the new customer.")
          setAddLoading(false)
          return
        }
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({ user_id: userId, display_name: addNewName.trim() || null, notes: null })
          .select("id")
          .single()
        if (custErr) throw custErr
        customerId = newCustomer.id
        if (addNewPhone.trim()) {
          await supabase.from("customer_identifiers").insert({
            user_id: userId,
            customer_id: customerId,
            type: "phone",
            value: addNewPhone.trim(),
            is_primary: true,
            verified: false,
          })
        }
        if (addNewEmail.trim()) {
          await supabase.from("customer_identifiers").insert({
            user_id: userId,
            customer_id: customerId,
            type: "email",
            value: addNewEmail.trim(),
            is_primary: false,
            verified: false,
          })
        }
      } else {
        if (!addExistingId) {
          alert("Select an existing customer.")
          setAddLoading(false)
          return
        }
        customerId = addExistingId
      }
      const { error: quoteErr } = await supabase
        .from("quotes")
        .insert({
          user_id: userId,
          customer_id: customerId,
          status: defaultQuoteStatus,
          conversation_id: null
        })
      if (quoteErr) throw quoteErr
      setShowAddCustomer(false)
      setAddExistingId("")
      setAddNewName("")
      setAddNewPhone("")
      setAddNewEmail("")
      setAddUseNew(false)
      await loadQuotes()
    } catch (err: any) {
      console.error(err)
      alert(err?.message ?? "Failed to add customer to quotes. Ensure the quotes table exists (see supabase-quotes-table.sql).")
    } finally {
      setAddLoading(false)
    }
  }

  function toggleQuoteRow(quoteId: string) {
    if (selectedQuoteId === quoteId) {
      setSelectedQuoteId(null)
      setSelectedQuote(null)
      setQuoteOpenError("")
      setSelectedQuoteItems([])
      setQuoteCommEvents([])
      setQuoteThreadMessages([])
      setQuoteAttachmentsByEvent({})
      setQuoteEntityRows([])
    } else {
      void openQuote(quoteId)
    }
  }

  async function openQuote(quoteId: string) {
    setSelectedQuoteId(quoteId)
    setSelectedQuote(null)
    setQuoteOpenError("")
    setSelectedQuoteItems([])
    setQuoteCommEvents([])
    setQuoteThreadMessages([])
    setQuoteAttachmentsByEvent({})
    setQuoteEntityRows([])
    if (!supabase) return
    const quoteDetailSelect = `
        id,
        status,
        created_at,
        updated_at,
        customer_id,
        conversation_id,
        job_type_id,
        scheduled_at,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        )
      `
    const quoteDetailSelectNoJobType = `
        id,
        status,
        created_at,
        updated_at,
        customer_id,
        conversation_id,
        scheduled_at,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        )
      `
    const detailFirst = await supabase.from("quotes").select(quoteDetailSelect).eq("id", quoteId).single()
    let row: any = detailFirst.data
    let error = detailFirst.error

    if (error && supabaseQuotesMissingJobTypeIdColumn(error.message)) {
      const r = await supabase.from("quotes").select(quoteDetailSelectNoJobType).eq("id", quoteId).single()
      row = r.data
      error = r.error
    }
    if (error) {
      console.error(error)
      setQuoteOpenError(
        `${error.message ?? "Could not load quote."}${
          supabaseQuotesMissingJobTypeIdColumn(error.message)
            ? "\n\nRun supabase-quotes-table.sql in the Supabase SQL Editor to add quotes.job_type_id (and RLS if needed)."
            : ""
        }`,
      )
      return
    }
    if (!row) {
      setQuoteOpenError("Quote not found.")
      return
    }
    setSelectedQuote({ ...row, job_type_id: row.job_type_id ?? null })
    const { data: items } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true })
    setSelectedQuoteItems(items || [])

    if (userId) {
      const { data: jtRows } = await supabase.from("job_types").select("id, name").eq("user_id", userId).order("name")
      setQuoteDetailJobTypes(jtRows || [])
    } else {
      setQuoteDetailJobTypes([])
    }

    const cid = row.customer_id as string
    if (userId && cid) {
      const { data: evs } = await supabase
        .from("communication_events")
        .select(
          "id, event_type, subject, body, direction, created_at, metadata, recording_url, transcript_text, summary_text",
        )
        .eq("user_id", userId)
        .eq("customer_id", cid)
        .order("created_at", { ascending: true })
        .limit(200)
      const evRows = evs || []
      setQuoteCommEvents(evRows)
      const eventIds = evRows.map((e: { id?: string }) => e.id).filter(Boolean) as string[]
      setQuoteAttachmentsByEvent(await loadAttachmentsByCommunicationEventIds(eventIds))
    } else {
      setQuoteCommEvents([])
      setQuoteAttachmentsByEvent({})
    }

    setQuoteEntityRows(await loadEntityAttachmentsForQuote(quoteId))

    const convId = row.conversation_id as string | null
    if (convId) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true })
      setQuoteThreadMessages(msgs || [])
    } else {
      setQuoteThreadMessages([])
    }
  }

  /** Reload only quote_items (no full quote panel reset — avoids flash when editing lines). */
  async function refreshQuoteItemsOnly() {
    if (!supabase || !selectedQuoteId) return
    const { data: items, error } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", selectedQuoteId)
      .order("created_at", { ascending: true })
    if (error) {
      console.error(error)
      return
    }
    setSelectedQuoteItems(items || [])
  }

  function mergeQuoteItemMetadataRow(
    item: any,
    patch: Omit<Partial<QuoteItemMetadata>, "minimum_line_total"> & { minimum_line_total?: number | null },
  ): Record<string, unknown> {
    const prev =
      item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
        ? { ...(item.metadata as Record<string, unknown>) }
        : {}
    if (patch.manpower != null) prev.manpower = patch.manpower
    if (patch.minimum_line_total !== undefined) {
      if (patch.minimum_line_total == null || patch.minimum_line_total <= 0) delete prev.minimum_line_total
      else prev.minimum_line_total = patch.minimum_line_total
    }
    if (patch.preset_id !== undefined) {
      if (!patch.preset_id) delete prev.preset_id
      else prev.preset_id = patch.preset_id
    }
    if (patch.job_type_id !== undefined) {
      if (patch.job_type_id === null || patch.job_type_id === "") delete prev.job_type_id
      else prev.job_type_id = patch.job_type_id
    }
    if (patch.line_kind !== undefined) {
      if (!patch.line_kind) delete prev.line_kind
      else prev.line_kind = patch.line_kind
    }
    return prev
  }

  async function addQuoteItem() {
    if (!supabase || !selectedQuoteId) return
    const qty = parseFloat(newItemQuantity) || 0
    const price = parseFloat(newItemUnitPrice) || 0
    if (!newItemDescription.trim()) {
      alert("Enter a description for the line item.")
      return
    }
    const mp = Math.max(1, Math.floor(Number.parseFloat(newItemManpower) || 1))
    const minRaw = newItemMinimum.trim()
    const minNum = minRaw ? Number.parseFloat(minRaw.replace(/[^0-9.]/g, "")) : Number.NaN
    const meta: QuoteItemMetadata = {}
    if (estimateLineTemplateOffered("eli_show_manpower")) meta.manpower = mp
    if (Number.isFinite(minNum) && minNum >= 0) meta.minimum_line_total = minNum
    const preset = newItemPresetId ? estimateLinePresets.find((p) => p.id === newItemPresetId) : null
    if (preset) {
      meta.preset_id = preset.id
      if (preset.line_kind) meta.line_kind = preset.line_kind
      if (preset.minimum_line_total != null && meta.minimum_line_total === undefined) meta.minimum_line_total = preset.minimum_line_total
    }
    const qJt =
      selectedQuote && typeof (selectedQuote as QuoteRow).job_type_id === "string" && (selectedQuote as QuoteRow).job_type_id?.trim()
        ? (selectedQuote as QuoteRow).job_type_id!.trim()
        : ""
    if (qJt) meta.job_type_id = qJt
    setAddItemLoading(true)
    const result = await insertQuoteItemRowSafe(supabase, {
      quote_id: selectedQuoteId,
      description: newItemDescription.trim(),
      quantity: qty,
      unit_price: price,
      metadata: Object.keys(meta).length > 0 ? (meta as Record<string, unknown>) : undefined,
    })
    setAddItemLoading(false)
    if (!result.ok) {
      console.error(result.error)
      alert(result.error)
      return
    }
    setNewItemDescription("")
    setNewItemQuantity("1")
    setNewItemUnitPrice("")
    setNewItemManpower("1")
    setNewItemMinimum("")
    setNewItemPresetId(null)
    setPresetSuggestOpen(false)
    void refreshQuoteItemsOnly()
  }

  function getItemDisplay(item: any) {
    const desc = item.description ?? item.item_description ?? item.name ?? "—"
    const qtyRaw = item.quantity ?? item.qty ?? 0
    const upRaw = item.unit_price ?? item.price ?? 0
    const qtyNum = typeof qtyRaw === "number" ? qtyRaw : Number.parseFloat(String(qtyRaw)) || 0
    const upNum = typeof upRaw === "number" ? upRaw : Number.parseFloat(String(upRaw)) || 0
    const meta = parseQuoteItemMetadata(item.metadata)
    const { effectiveQuantity, total } = computeQuoteLineTotal(qtyNum, upNum, meta)
    return { desc, qty: qtyNum, up: upNum, tot: total, meta, effectiveQuantity }
  }

  useEffect(() => {
    setQuoteLineDrafts((prev) => {
      const next: Record<
        string,
        { description: string; quantity: string; unit_price: string; manpower: string; minimum: string; job_type_id: string }
      > = {}
      for (const item of selectedQuoteItems) {
        const { desc, qty, up, meta } = getItemDisplay(item)
        const crew = meta.manpower ?? 1
        const minStr =
          meta.minimum_line_total != null && Number.isFinite(meta.minimum_line_total) ? String(meta.minimum_line_total) : ""
        const jt = typeof meta.job_type_id === "string" && meta.job_type_id.trim() ? meta.job_type_id.trim() : ""
        const built = {
          description: String(desc),
          quantity: String(qty),
          unit_price: String(typeof up === "number" ? up : 0),
          manpower: String(crew),
          minimum: minStr,
          job_type_id: jt,
        }
        next[item.id] = prev[item.id] ?? built
      }
      return next
    })
  }, [selectedQuoteItems])

  const quoteItemsReviewKey = useMemo(
    () =>
      JSON.stringify(
        selectedQuoteItems.map((item) => {
          const { desc, qty, up, tot } = getItemDisplay(item)
          const quantity = typeof qty === "number" ? qty : Number.parseFloat(String(qty)) || 0
          const unit_price = typeof up === "number" ? up : Number.parseFloat(String(up)) || 0
          const lineTotal = typeof tot === "number" ? tot : quantity * unit_price
          return { description: String(desc), quantity, unit_price, lineTotal }
        }),
      ),
    [selectedQuoteItems],
  )

  useEffect(() => {
    if (!selectedQuoteId || !session?.access_token) {
      setEstimateReview({ subtotal: null, issues: [], agreesWithSubtotal: null })
      return
    }
    let cancelled = false
    if (estimateReviewTimerRef.current) clearTimeout(estimateReviewTimerRef.current)
    estimateReviewTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const lines = JSON.parse(quoteItemsReviewKey) as {
            description: string
            quantity: number
            unit_price: number
          }[]
          const res = await fetch("/api/platform-tools?__route=quote-estimate-review", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ quoteId: selectedQuoteId, lines }),
          })
          const j = (await res.json()) as {
            ok?: boolean
            computedSubtotal?: number
            issues?: string[]
            agreesWithSubtotal?: boolean
            error?: string
          }
          if (cancelled) return
          if (!res.ok) {
            setEstimateReview({ subtotal: null, issues: [], agreesWithSubtotal: null })
            return
          }
          setEstimateReview({
            subtotal: typeof j.computedSubtotal === "number" ? j.computedSubtotal : null,
            issues: Array.isArray(j.issues) ? j.issues : [],
            agreesWithSubtotal: typeof j.agreesWithSubtotal === "boolean" ? j.agreesWithSubtotal : null,
          })
        } catch {
          if (!cancelled) setEstimateReview({ subtotal: null, issues: [], agreesWithSubtotal: null })
        }
      })()
    }, 900)
    return () => {
      cancelled = true
      if (estimateReviewTimerRef.current) clearTimeout(estimateReviewTimerRef.current)
    }
  }, [selectedQuoteId, quoteItemsReviewKey, session?.access_token])

  function parseDefaultLaborRateNumber(): number {
    const laborItem = estimateLineItemsPortal.find((i) => i.id === "eli_default_labor_rate")
    const raw =
      laborItem && isEstimateLinePortalItemVisible(laborItem)
        ? (estimateLinePortalValues.eli_default_labor_rate ?? "").trim()
        : String(estimateDefaultLaborRate).trim()
    const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
    return Number.isFinite(n) ? n : 0
  }

  function openEstimateLineItemsModal() {
    setEstimateLineDraft(estimateLinePresets.map((r) => ({ ...r })))
    setExpandedEliById({})
    setEliLinkJtPick({})
    setEliSimpleKind("labor")
    setEliSimpleUnit("hours")
    setEliSimpleQty("1")
    const lr = parseDefaultLaborRateNumber()
    setEliSimplePrice(lr > 0 ? String(lr) : "")
    setShowEstimateLineItemsModal(true)
  }

  function appendEliPresetFromSimpleForm() {
    const qty = Number.parseFloat(String(eliSimpleQty).replace(/[^0-9.]/g, "")) || 0
    const price = Number.parseFloat(String(eliSimplePrice).replace(/[^0-9.]/g, "")) || 0
    if (qty <= 0) {
      alert("Enter how many units (hours, miles, or quantity).")
      return
    }
    if (price < 0) {
      alert("Cost per unit cannot be negative.")
      return
    }
    const line_kind: EstimateLinePresetRow["line_kind"] =
      eliSimpleKind === "material"
        ? "material"
        : eliSimpleKind === "travel"
          ? "travel"
          : eliSimpleKind === "misc"
            ? "misc"
            : "labor"
    setEstimateLineDraft((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        description: ELI_KIND_LABEL[eliSimpleKind],
        quantity: qty,
        unit_price: price,
        minimum_line_total: undefined,
        linked_job_type_ids: [],
        line_kind,
        unit_basis: eliSimpleUnit,
      },
    ])
  }

  function estimateLineTemplateOffered(itemId: string): boolean {
    const item = estimateLineItemsPortal.find((i) => i.id === itemId)
    if (!item) return false
    const v = estimateLinePortalValues[itemId]
    if (v === "checked" || v === "unchecked") return v === "checked"
    return Boolean(item.defaultChecked)
  }

  const spreadsheetEstimateSubtotal = useMemo(() => {
    let sum = 0
    const showMp = estimateLineTemplateOffered("eli_show_manpower")
    for (const item of selectedQuoteItems) {
      const dr = quoteLineDrafts[item.id]
      const baseMeta = parseQuoteItemMetadata(item.metadata)
      const qty = Number.parseFloat(String(dr?.quantity ?? item.quantity ?? 0)) || 0
      const up = Number.parseFloat(String(dr?.unit_price ?? item.unit_price ?? 0)) || 0
      const crew = showMp
        ? Math.max(1, Number.parseInt(String(dr?.manpower ?? baseMeta.manpower ?? 1), 10) || 1)
        : Math.max(1, baseMeta.manpower ?? 1)
      const minDraft = (dr?.minimum ?? "").trim()
      let minimum_line_total = baseMeta.minimum_line_total
      if (minDraft !== "") {
        const n = Number.parseFloat(minDraft.replace(/[^0-9.]/g, ""))
        if (Number.isFinite(n) && n >= 0) minimum_line_total = n > 0 ? n : undefined
      }
      const meta: QuoteItemMetadata = { ...baseMeta, manpower: crew, minimum_line_total }
      sum += computeQuoteLineTotal(qty, up, meta).total
    }
    return sum
  }, [selectedQuoteItems, quoteLineDrafts, estimateLineItemsPortal, estimateLinePortalValues])

  async function insertQuoteLineRow(
    description: string,
    quantity: number,
    unitPrice: number,
    opts?: { metadata?: QuoteItemMetadata; presetId?: string; skipRefresh?: boolean },
  ): Promise<boolean> {
    if (!supabase || !selectedQuoteId) return false
    const meta: Record<string, unknown> = {}
    if (opts?.metadata) {
      const m = opts.metadata
      if (m.manpower != null) meta.manpower = m.manpower
      if (m.minimum_line_total != null) meta.minimum_line_total = m.minimum_line_total
      if (m.job_type_id) meta.job_type_id = m.job_type_id
      if (m.line_kind) meta.line_kind = m.line_kind
    }
    if (opts?.presetId) meta.preset_id = opts.presetId
    const qJt =
      selectedQuote && typeof (selectedQuote as QuoteRow).job_type_id === "string" && (selectedQuote as QuoteRow).job_type_id?.trim()
        ? (selectedQuote as QuoteRow).job_type_id!.trim()
        : ""
    if (qJt && !meta.job_type_id) meta.job_type_id = qJt
    const result = await insertQuoteItemRowSafe(supabase, {
      quote_id: selectedQuoteId,
      description: description.trim(),
      quantity,
      unit_price: unitPrice,
      metadata: Object.keys(meta).length > 0 ? meta : undefined,
    })
    if (!result.ok) {
      alert(result.error)
      return false
    }
    if (!opts?.skipRefresh) void refreshQuoteItemsOnly()
    return true
  }

  async function applyJobTypeLinesToQuoteItems() {
    const jtId =
      selectedQuote && typeof (selectedQuote as QuoteRow).job_type_id === "string"
        ? String((selectedQuote as QuoteRow).job_type_id ?? "").trim()
        : ""
    if (!jtId) {
      alert("Choose a quote job type first.")
      return
    }
    if (!supabase || !selectedQuoteId) return
    const presets = estimateLinePresets.filter((p) => (p.linked_job_type_ids ?? []).includes(jtId))
    if (presets.length === 0) {
      alert(
        "No saved line templates are linked to this job type. Link them under Job types or Estimate line items (Add to job type), then try again.",
      )
      return
    }
    const existingIds = new Set<string>()
    for (const item of selectedQuoteItems) {
      const m = parseQuoteItemMetadata(item.metadata)
      if (m.preset_id) existingIds.add(m.preset_id)
    }
    const toInsert = presets.filter((p) => !existingIds.has(p.id))
    if (toInsert.length === 0) {
      alert("Every template line linked to this job type is already on the quote.")
      return
    }
    setApplyJtLinesBusy(true)
    try {
      for (let i = 0; i < toInsert.length; i++) {
        const p = toInsert[i]
        const skipRefresh = i < toInsert.length - 1
        const ok = await insertQuoteLineRow(p.description, p.quantity, p.unit_price, {
          presetId: p.id,
          metadata: {
            minimum_line_total: p.minimum_line_total,
            line_kind: p.line_kind,
            ...(p.line_kind === "labor" && estimateLineTemplateOffered("eli_show_manpower")
              ? { manpower: DEFAULT_PRESET_LABOR_MANPOWER }
              : {}),
          },
          skipRefresh,
        })
        if (!ok) return
      }
      void refreshQuoteItemsOnly()
    } finally {
      setApplyJtLinesBusy(false)
    }
  }

  function insertSavedPresetOnOpenQuote(p: EstimateLinePresetRow) {
    if (!selectedQuoteId) {
      alert("Open a quote from the list first. Then use Saved lines under Quote items, or the buttons here.")
      return
    }
    void insertQuoteLineRow(p.description, p.quantity, p.unit_price, {
      presetId: p.id,
      metadata: {
        minimum_line_total: p.minimum_line_total,
        line_kind: p.line_kind,
        ...(p.line_kind === "labor" && estimateLineTemplateOffered("eli_show_manpower")
          ? { manpower: DEFAULT_PRESET_LABOR_MANPOWER }
          : {}),
      },
    })
  }

  async function persistQuoteItemUpdate(itemId: string, patch: { description?: string; quantity?: number; unit_price?: number; metadata?: Record<string, unknown> }) {
    if (!supabase || !selectedQuoteId) return
    const { error } = await supabase.from("quote_items").update(patch).eq("id", itemId)
    if (error) {
      alert(error.message)
      return
    }
    setSelectedQuoteItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it
        const next = { ...it } as Record<string, unknown>
        if (patch.description !== undefined) next.description = patch.description
        if (patch.quantity !== undefined) next.quantity = patch.quantity
        if (patch.unit_price !== undefined) next.unit_price = patch.unit_price
        if (patch.metadata !== undefined) next.metadata = patch.metadata
        return next as (typeof prev)[number]
      }),
    )
  }

  async function deleteQuoteItemRow(itemId: string) {
    if (!supabase || !selectedQuoteId) return
    if (!confirm("Remove this line item?")) return
    const { error } = await supabase.from("quote_items").delete().eq("id", itemId)
    if (error) {
      alert(error.message)
      return
    }
    setSelectedQuoteItems((prev) => prev.filter((it) => it.id !== itemId))
    setQuoteLineDrafts((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  async function persistEstimatePresetsToProfile(nextPresets: EstimateLinePresetRow[]) {
    if (!supabase || !userId) return
    const trimmed = nextPresets.filter((p) => p.description.trim())
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
    setEstimateLinePresets(trimmed)
    if (showEstimateLineItemsModal) {
      setEstimateLineDraft((prev) =>
        prev.map((row) => {
          const u = trimmed.find((t) => t.id === row.id)
          if (!u) return row
          return { ...row, linked_job_type_ids: u.linked_job_type_ids ? [...u.linked_job_type_ids] : [] }
        }),
      )
    }
  }

  async function mergePresetLinksForJobType(jobTypeId: string, checks: Record<string, boolean>) {
    const merged = estimateLinePresets.map((p) => {
      const want = checks[p.id] === true
      const set = new Set(p.linked_job_type_ids ?? [])
      if (want) set.add(jobTypeId)
      else set.delete(jobTypeId)
      return { ...p, linked_job_type_ids: Array.from(set) }
    })
    await persistEstimatePresetsToProfile(merged)
  }

  async function persistQuoteJobType(jobTypeId: string) {
    if (!supabase || !selectedQuoteId) return
    const v = jobTypeId.trim() || null
    const { error } = await supabase
      .from("quotes")
      .update({ job_type_id: v, updated_at: new Date().toISOString() })
      .eq("id", selectedQuoteId)
    if (error) {
      const msg = String(error.message ?? "")
      alert(
        msg +
          (msg.toLowerCase().includes("job_type") || msg.toLowerCase().includes("column")
            ? "\n\nRun tradesman/supabase/quotes-job-type.sql in the Supabase SQL Editor."
            : ""),
      )
      return
    }
    setSelectedQuote((prev: QuoteRow | null) => (prev && typeof prev === "object" ? { ...prev, job_type_id: v } : prev))
  }

  async function saveQuoteModalNewJobType() {
    if (!quoteJtNewName.trim()) {
      alert("Please enter a name for the job type.")
      return
    }
    if (!supabase || !userId) return
    setQuoteJtSaving(true)
    try {
      let patch: Record<string, unknown> = {
        name: quoteJtNewName.trim(),
        description: quoteJtNewDesc.trim() || null,
        duration_minutes: Math.max(15, quoteJtNewDuration),
        color_hex: quoteJtNewColor,
        materials_list: quoteJtMaterials.trim() || null,
        track_mileage: quoteJtTrackMileage,
      }
      if (editingQuoteJtId) {
        let r = await supabase.from("job_types").update(patch).eq("id", editingQuoteJtId).eq("user_id", userId)
        const lower = (m: string) => m.toLowerCase()
        if (r.error && lower(r.error.message).includes("track_mileage")) {
          const { track_mileage: _t, ...rest } = patch
          patch = rest
          r = await supabase.from("job_types").update(patch).eq("id", editingQuoteJtId).eq("user_id", userId)
        }
        if (r.error && lower(r.error.message).includes("materials_list")) {
          const { materials_list: _m, ...rest } = patch
          patch = { ...rest }
          r = await supabase.from("job_types").update(patch).eq("id", editingQuoteJtId).eq("user_id", userId)
        }
        if (r.error) {
          alert(r.error.message)
          return
        }
        await mergePresetLinksForJobType(editingQuoteJtId, jtModalPresetChecks)
      } else {
        let r = await supabase.from("job_types").insert({ user_id: userId, ...patch }).select("id").single()
        const lower = (m: string) => m.toLowerCase()
        if (r.error && lower(r.error.message).includes("track_mileage")) {
          const { track_mileage: _t, ...rest } = patch
          patch = rest
          r = await supabase.from("job_types").insert({ user_id: userId, ...patch }).select("id").single()
        }
        if (r.error && lower(r.error.message).includes("materials_list")) {
          const { materials_list: _m, ...rest } = patch
          patch = { ...rest }
          r = await supabase.from("job_types").insert({ user_id: userId, ...patch }).select("id").single()
        }
        if (r.error) {
          alert(r.error.message)
          return
        }
        const newId = (r.data as { id?: string } | null)?.id
        if (newId) await mergePresetLinksForJobType(newId, jtModalPresetChecks)
      }
      setQuoteJtNewName("")
      setQuoteJtNewDesc("")
      setQuoteJtNewDuration(60)
      setQuoteJtNewColor("#F97316")
      setQuoteJtTrackMileage(false)
      setEditingQuoteJtId(null)
      setJtModalPresetChecks({})
      const listFull = await supabase
        .from("job_types")
        .select("id, name, duration_minutes, description, color_hex, materials_list, track_mileage")
        .eq("user_id", userId)
        .order("name")
      let nextList: QuoteJobTypeListRow[]
      if (!listFull.error) {
        nextList = (listFull.data ?? []) as QuoteJobTypeListRow[]
      } else if (
        listFull.error.message.toLowerCase().includes("track_mileage") ||
        listFull.error.message.toLowerCase().includes("materials_list")
      ) {
        const listMid = await supabase
          .from("job_types")
          .select("id, name, duration_minutes, description, color_hex, materials_list")
          .eq("user_id", userId)
          .order("name")
        if (!listMid.error) {
          nextList = (listMid.data ?? []) as QuoteJobTypeListRow[]
        } else if (listMid.error.message.toLowerCase().includes("materials_list")) {
          const listMin = await supabase
            .from("job_types")
            .select("id, name, duration_minutes, description, color_hex")
            .eq("user_id", userId)
            .order("name")
          nextList = (listMin.data ?? []) as QuoteJobTypeListRow[]
        } else {
          nextList = []
        }
      } else {
        nextList = []
      }
      setQuoteJobTypesList(nextList)
      const { data: shortList } = await supabase.from("job_types").select("id, name").eq("user_id", userId).order("name")
      setEstimateModalJobTypes(shortList || [])
      setQuoteDetailJobTypes(shortList || [])
    } finally {
      setQuoteJtSaving(false)
    }
  }

  function startEditQuoteJobType(jt: {
    id: string
    name: string
    duration_minutes: number
    description: string | null
    color_hex: string | null
    materials_list?: string | null
    track_mileage?: boolean | null
  }) {
    setQuoteJtNewName(jt.name)
    setQuoteJtNewDesc(jt.description ?? "")
    setQuoteJtNewDuration(Math.max(15, jt.duration_minutes))
    setQuoteJtNewColor(jt.color_hex ?? "#F97316")
    setQuoteJtMaterials(typeof jt.materials_list === "string" ? jt.materials_list : "")
    setQuoteJtTrackMileage(jt.track_mileage === true)
    setEditingQuoteJtId(jt.id)
  }

  function cancelEditQuoteJobType() {
    setQuoteJtNewName("")
    setQuoteJtNewDesc("")
    setQuoteJtNewDuration(60)
    setQuoteJtNewColor("#F97316")
    setQuoteJtMaterials("")
    setQuoteJtTrackMileage(false)
    setEditingQuoteJtId(null)
    setJtModalPresetChecks({})
  }

  async function removeQuoteJobTypeRow(jt: { id: string; name: string }) {
    if (!supabase || !userId) return
    if (!confirm(`Remove job type "${jt.name}"? Calendar events keep their color; the type drops from lists.`)) return
    const { error } = await supabase.from("job_types").delete().eq("id", jt.id).eq("user_id", userId)
    if (error) {
      alert(error.message)
      return
    }
    if (editingQuoteJtId === jt.id) cancelEditQuoteJobType()
    const rqFull = await supabase
      .from("job_types")
      .select("id, name, duration_minutes, description, color_hex, materials_list, track_mileage")
      .eq("user_id", userId)
      .order("name")
    let afterRemove: QuoteJobTypeListRow[]
    if (!rqFull.error) {
      afterRemove = (rqFull.data ?? []) as QuoteJobTypeListRow[]
    } else if (
      rqFull.error.message.toLowerCase().includes("track_mileage") ||
      rqFull.error.message.toLowerCase().includes("materials_list")
    ) {
      const rqMid = await supabase
        .from("job_types")
        .select("id, name, duration_minutes, description, color_hex, materials_list")
        .eq("user_id", userId)
        .order("name")
      if (!rqMid.error) {
        afterRemove = (rqMid.data ?? []) as QuoteJobTypeListRow[]
      } else if (rqMid.error.message.toLowerCase().includes("materials_list")) {
        const rqMin = await supabase
          .from("job_types")
          .select("id, name, duration_minutes, description, color_hex")
          .eq("user_id", userId)
          .order("name")
        afterRemove = (rqMin.data ?? []) as QuoteJobTypeListRow[]
      } else {
        afterRemove = []
      }
    } else {
      afterRemove = []
    }
    setQuoteJobTypesList(afterRemove)
    const { data: shortList } = await supabase.from("job_types").select("id, name").eq("user_id", userId).order("name")
    setEstimateModalJobTypes(shortList || [])
    setQuoteDetailJobTypes(shortList || [])
    const stripped = estimateLinePresets.map((p) => ({
      ...p,
      linked_job_type_ids: (p.linked_job_type_ids ?? []).filter((id) => id !== jt.id),
    }))
    await persistEstimatePresetsToProfile(stripped)
  }

  async function saveEstimateLineItemsModal() {
    if (!supabase || !userId) {
      setShowEstimateLineItemsModal(false)
      return
    }
    setEstimateLineSaveBusy(true)
    try {
      for (const item of estimateLineItemsPortal) {
        const v = estimateLinePortalValues[item.id]
        if (v != null) {
          try {
            localStorage.setItem(`quotes_eli_${item.id}`, v)
          } catch {
            /* ignore */
          }
        }
      }
      const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (fetchErr) {
        alert(fetchErr.message)
        return
      }
      const prevMeta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      const laborItem = estimateLineItemsPortal.find((i) => i.id === "eli_default_labor_rate")
      const laborFieldVisible = laborItem ? isEstimateLinePortalItemVisible(laborItem) : false
      const laborRaw = laborFieldVisible
        ? (estimateLinePortalValues.eli_default_labor_rate ?? "").trim()
        : estimateDefaultLaborRate.trim()
      const laborNum = Number.parseFloat(laborRaw.replace(/[^0-9.]/g, ""))
      if (Number.isFinite(laborNum) && laborNum >= 0) prevMeta.estimate_default_labor_rate = laborNum
      else delete prevMeta.estimate_default_labor_rate

      const cleanedDraft = estimateLineDraft.filter((row) => row.description.trim())
      prevMeta.estimate_line_presets = cleanedDraft.map(serializePresetForProfile)

      const { error } = await supabase.from("profiles").update({ metadata: prevMeta }).eq("id", userId)
      if (error) {
        alert(error.message)
        return
      }
      setEstimateLinePresets(cleanedDraft)
      if (Number.isFinite(laborNum) && laborNum >= 0) setEstimateDefaultLaborRate(String(laborNum))
      setShowEstimateLineItemsModal(false)
    } finally {
      setEstimateLineSaveBusy(false)
    }
  }

  async function handleQuoteEntityFileChange(files: FileList | null) {
    if (!files?.length || !userId || !selectedQuoteId || !supabase) return
    const file = files[0]
    setQuoteEntityUploadBusy(true)
    try {
      const up = await uploadEntityAttachmentFile({ userId, quoteId: selectedQuoteId, file })
      if (!up) throw new Error("Upload failed")
      const { error } = await supabase.from("entity_attachments").insert({
        user_id: userId,
        quote_id: selectedQuoteId,
        storage_path: up.storage_path,
        public_url: up.public_url,
        content_type: file.type || null,
        file_name: file.name || null,
      })
      if (error) throw error
      setQuoteEntityRows(await loadEntityAttachmentsForQuote(selectedQuoteId))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setQuoteEntityUploadBusy(false)
    }
  }

  async function removeQuoteEntityRowLocal(row: EntityAttachmentRow) {
    if (!confirm("Remove this file from the quote?")) return
    const ok = await deleteEntityAttachmentRow(row)
    if (!ok) {
      alert("Could not remove attachment.")
      return
    }
    if (selectedQuoteId) setQuoteEntityRows(await loadEntityAttachmentsForQuote(selectedQuoteId))
  }

  async function downloadQuoteDocumentClick() {
    if (!selectedQuote) return
    setQuotePdfBusy(true)
    try {
      const items = selectedQuoteItems.map((item) => {
        const { desc, qty, up, tot } = getItemDisplay(item)
        const quantity = typeof qty === "number" ? qty : Number.parseFloat(String(qty)) || 0
        const unitPrice = typeof up === "number" ? up : Number.parseFloat(String(up)) || 0
        const total = typeof tot === "number" && !Number.isNaN(tot) ? tot : quantity * unitPrice
        return { description: String(desc), quantity, unitPrice, total }
      })
      let logo: { bytes: Uint8Array; kind: "png" | "jpeg" } | null = null
      if (quoteShowLogo && quoteLogoUrl.trim()) {
        logo = await fetchQuoteLogoForExport(quoteLogoUrl.trim())
        if (!logo) console.warn("[quotes] Logo URL did not load (CORS, format, or network). Export continues without logo.")
      }
      const legal =
        quoteIncludeLegal && quoteLegalText.trim()
          ? {
              body: quoteLegalText.trim(),
              cancellation: quoteCancellationText.trim() ? quoteCancellationText.trim() : null,
              showSignatures: quoteLegalSignatures,
            }
          : null
      const base = {
        title: `Quote ${selectedQuote.id.slice(0, 8)}`,
        businessLabel: profileDisplayNameForPdf || "Quote",
        customerName: selectedQuote.customers?.display_name ?? "Customer",
        items,
        templateHeader: quotePdfTemplate,
        templateFooter: quoteTemplateFooter.trim() ? quoteTemplateFooter.trim() : null,
        includePreparedDate: quoteIncludePreparedDate,
        showLineNumbers: quoteShowLineNumbers,
        logo: quoteShowLogo && quoteLogoUrl.trim() && logo ? logo : null,
        legal,
      }
      const shortId = selectedQuote.id.slice(0, 8)
      if (quoteExportFormat === "docx") {
        const { buildQuoteDocxBlob, downloadDocxBlob } = await import("../../lib/documentQuoteDocx")
        const blob = await buildQuoteDocxBlob(base)
        downloadDocxBlob(blob, `quote-${shortId}.docx`)
      } else {
        const bytes = await buildQuotePdfBytes(base)
        downloadPdfBlob(bytes, `quote-${shortId}.pdf`)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setQuotePdfBusy(false)
    }
  }

  async function sendQuoteCustomerEmail() {
    if (!supabase || !userId || !selectedQuote) return
    const email = selectedQuote.customers?.customer_identifiers?.find((i: any) => i.type === "email")?.value?.trim?.()
    if (!email) {
      alert("This customer has no email on file. Add an email identifier on the customer record.")
      return
    }
    const subject = quoteEmailSubject.trim()
    const body = quoteEmailBody.trim()
    if (!subject || !body) {
      alert("Enter subject and body.")
      return
    }
    let attachmentPublicUrls: string[] | undefined
    if (quoteEmailAttachEntity && quoteEntityRows.length > 0) {
      attachmentPublicUrls = quoteEntityRows.map((r) => r.public_url)
    }
    setQuoteEmailSending(true)
    try {
      const res = await fetch("/api/outbound-messages?__channel=email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject,
          body,
          userId,
          conversationId: selectedQuote.conversation_id || undefined,
          customerId: selectedQuote.customer_id,
          ...(attachmentPublicUrls?.length ? { attachmentPublicUrls } : {}),
        }),
      })
      const raw = await res.text()
      if (!res.ok) throw new Error(raw.slice(0, 400))
      alert("Email sent.")
      setShowQuoteEmailPanel(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setQuoteEmailSending(false)
    }
  }

  const filteredQuotes = quotes.filter((q: any) => {
    const name = (q.customers?.display_name || "").toLowerCase()
    const phone = q.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value || ""
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    return (!searchLower || name.includes(searchLower)) && (!phoneFilter || phone.includes(phoneFilter))
  })

  const sortedQuotes = [...filteredQuotes].sort((a: any, b: any) => {
    let aVal = ""
    let bVal = ""
    if (sortField === "name") {
      aVal = (a.customers?.display_name || "").toLowerCase()
      bVal = (b.customers?.display_name || "").toLowerCase()
    }
    if (sortField === "created_at") {
      aVal = a.updated_at || a.created_at || ""
      bVal = b.updated_at || b.created_at || ""
    }
    if (sortField === "status") {
      aVal = (a.status || "").toLowerCase()
      bVal = (b.status || "").toLowerCase()
    }
    if (sortAsc) return aVal > bVal ? 1 : -1
    return aVal < bVal ? 1 : -1
  })

  function getLastMessage(q: QuoteRow): string | null {
    const msgs = (q.conversations as { messages?: MessageRow[] } | null)?.messages
    if (!msgs?.length) return null
    const sorted = [...msgs].sort((x, y) => (y.created_at || "").localeCompare(x.created_at || ""))
    return sorted[0]?.content ?? null
  }

  const quoteActivityItems = useMemo(() => {
    const items: { sortMs: number; key: string; kind: "msg" | "ev"; payload: any }[] = []
    for (const m of quoteThreadMessages) {
      const t = m.created_at ? Date.parse(m.created_at) : 0
      items.push({ sortMs: t, key: `m-${m.id}`, kind: "msg", payload: m })
    }
    for (const e of quoteCommEvents) {
      const t = e.created_at ? Date.parse(e.created_at) : 0
      items.push({ sortMs: t, key: `e-${e.id}`, kind: "ev", payload: e })
    }
    items.sort((a, b) => a.sortMs - b.sortMs)
    return items
  }, [quoteThreadMessages, quoteCommEvents])

  const selectedQuoteRowText = theme.text

  return (
    <div style={{ display: "flex", position: "relative", minWidth: 0 }}>
      <div style={{ width: "100%", minWidth: 0 }}>
        <h1>Quotes</h1>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {showQuotesAddCustomer && (
              <button
                onClick={() => { setShowAddCustomer(true); loadCustomerList() }}
                style={{ background: theme.primary, color: "white", padding: "8px 14px", borderRadius: "6px", border: "none", cursor: "pointer" }}
              >
                Add Customer to quotes
              </button>
            )}
            {showQuotesAutoResponse && (
              <button
                onClick={() => setShowAutoResponseOptions(true)}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
              >
                Auto Response Options
              </button>
            )}
            {showQuotesSettings && (
              <button
                onClick={() => setShowSettings(true)}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
              >
                Settings
              </button>
            )}
            {showQuotesEstimateTemplate && (
              <button
                type="button"
                onClick={() => setShowEstimateTemplateModal(true)}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
              >
                {estimateTemplateButtonLabel}
              </button>
            )}
            {showQuotesEstimateLineItems && (
              <button
                type="button"
                onClick={() => openEstimateLineItemsModal()}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
              >
                {estimateLineItemsButtonLabel}
              </button>
            )}
            {showQuotesJobTypesPanel && (
              <button
                type="button"
                onClick={() => setShowQuoteJobTypesModal(true)}
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
              >
                {quoteJobTypesButtonLabel}
              </button>
            )}
            {customActionButtons.map((btn) => (
              <button key={btn.id} onClick={() => setOpenCustomButtonId(btn.id)} style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}>{btn.label}</button>
            ))}
          </div>
        </div>

        {showSettings && (
          <PortalSettingsModal
            title="Quotes Settings"
            items={quoteSettingsItems}
            formValues={settingsFormValues}
            setFormValue={(id, value) => setSettingsFormValues((prev) => ({ ...prev, [id]: value }))}
            isItemVisible={isQuoteSettingItemVisible}
            onClose={() => setShowSettings(false)}
          />
        )}

        {showEstimateTemplateModal && (
          <PortalSettingsModal
            title={estimateTemplateButtonLabel}
            maxWidthPx={560}
            closeButtonLabel="Save & close"
            intro={
              <p style={{ margin: 0 }}>
                These options control how the <strong>Download quote</strong> file is built (PDF or Word). Intro and footer are plain text;
                use line breaks for paragraphs. Optional logo appears at the top of both formats. Your admin can rename this button (for example,
                Advanced Estimate Options) in the portal builder.
              </p>
            }
            items={estimateTemplateItems}
            formValues={estimateTemplateFormValues}
            setFormValue={(id, value) => setEstimateTemplateFormValues((prev) => ({ ...prev, [id]: value }))}
            isItemVisible={isEstimateTemplateItemVisible}
            onClose={() => void closeEstimateTemplateModal()}
            belowForm={
              <>
              {estimateTemplateItems.some((i) => i.id === "estimate_template_include_legal") ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: theme.text }}>Suggested wording</p>
                  <p style={{ margin: 0, fontSize: 12, color: theme.text, opacity: 0.82, lineHeight: 1.45 }}>
                    Generates acknowledgment and cancellation-style paragraphs you can edit above. Not legal advice — have an attorney review before use.
                  </p>
                  <button
                    type="button"
                    disabled={legalDraftBusy || !session?.access_token}
                    onClick={() => void runEstimateLegalDraft()}
                    style={{
                      alignSelf: "flex-start",
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                      color: theme.text,
                      cursor: legalDraftBusy ? "wait" : "pointer",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {legalDraftBusy ? "Working…" : "Fill legal & cancellation from business name"}
                  </button>
                </div>
              ) : null}
              {estimateTemplateItems.some((i) => i.id === "estimate_template_logo_url") ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: theme.text }}>Upload company logo</p>
                  <p style={{ margin: 0, fontSize: 12, color: theme.text, opacity: 0.82, lineHeight: 1.45 }}>
                    PNG or JPEG. Stored in your comm-attachments bucket with a public URL (same pattern as other outbound attachments).
                  </p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,.jpg,.png"
                    disabled={!userId || estimateLogoUploadBusy}
                    onChange={(e) => void onEstimateLogoFileChange(e)}
                    style={{ fontSize: 13 }}
                  />
                  {estimateLogoUploadBusy ? <span style={{ fontSize: 12, color: theme.text }}>Uploading…</span> : null}
                  {(estimateTemplateFormValues.estimate_template_logo_url ?? "").trim() ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                      <img
                        src={(estimateTemplateFormValues.estimate_template_logo_url ?? "").trim()}
                        alt="Logo preview"
                        style={{ maxHeight: 56, maxWidth: 220, objectFit: "contain", border: `1px solid ${theme.border}`, borderRadius: 6 }}
                      />
                      <button
                        type="button"
                        onClick={() => setEstimateTemplateFormValues((prev) => ({ ...prev, estimate_template_logo_url: "" }))}
                        style={{
                          fontSize: 12,
                          padding: "6px 10px",
                          cursor: "pointer",
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          background: "#fff",
                          color: theme.text,
                        }}
                      >
                        Clear logo URL
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              </>
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

        {quotesError && (
          <p style={{ color: "#b91c1c", marginBottom: "12px", fontSize: "14px", whiteSpace: "pre-wrap" }}>
            {quotesError}
            {quotesError.toLowerCase().includes("job_type_id")
              ? " Run supabase-quotes-table.sql in the Supabase SQL Editor to add quotes.job_type_id."
              : " Create the quotes table in Supabase (run supabase-quotes-table.sql) if the table is missing."}
          </p>
        )}

        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          alignItems: "center",
          marginBottom: "16px",
          padding: "12px",
          background: theme.charcoalSmoke,
          borderRadius: "8px",
          border: `1px solid ${theme.border}`,
          width: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Filter</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="By name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
              />
              <input
                type="text"
                placeholder="By phone..."
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
              />
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
                <option value="status">Status</option>
                <option value="created_at">Date</option>
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
        </div>

        <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: isMobile ? "760px" : "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col />
          </colgroup>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th onClick={() => { setSortField("name"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>Name</th>
              <th style={{ padding: "8px" }}>Phone</th>
              <th style={{ padding: "8px" }}>Source</th>
              <th onClick={() => { setSortField("status"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>Status</th>
              <th onClick={() => { setSortField("created_at"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>Last Update</th>
              <th style={{ padding: "8px" }}>Last message</th>
            </tr>
          </thead>
          <tbody>
            {sortedQuotes.map((q) => {
              const phone = q.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value || ""
              const lastMsg = getLastMessage(q)
              const lastMsgText = lastMsg?.trim() ? (lastMsg.length > 50 ? lastMsg.slice(0, 50) + "…" : lastMsg) : "—"
              const source = q.conversation_id ? "Conversation" : "Manual"
              const isRowSelected = selectedQuoteId === q.id
              const cellBase = {
                padding: "8px" as const,
                color: isRowSelected ? selectedQuoteRowText : undefined,
                fontWeight: isRowSelected ? (600 as const) : (400 as const),
              }
              return (
                <Fragment key={q.id}>
                  <tr
                    onClick={() => toggleQuoteRow(q.id)}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid #eee",
                      background: isRowSelected ? "#bae6fd" : "transparent",
                    }}
                  >
                    <td style={cellBase}>{q.customers?.display_name ?? "—"}</td>
                    <td style={cellBase}>{phone || "—"}</td>
                    <td style={cellBase}>{source}</td>
                    <td style={cellBase}>{q.status ?? "—"}</td>
                    <td style={cellBase}>
                      {(q.updated_at || q.created_at) ? new Date(q.updated_at || q.created_at!).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ ...cellBase, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={lastMsg ?? undefined}>{lastMsgText}</td>
                  </tr>
                  {isRowSelected && quoteOpenError ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 16, borderBottom: "1px solid #fecaca", background: "#fef2f2", verticalAlign: "top" }}>
                        <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(960px, 100%)", boxSizing: "border-box" }}>
                          <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "#991b1b" }}>Could not load this quote</h3>
                          <p style={{ margin: 0, fontSize: 14, color: "#7f1d1d", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{quoteOpenError}</p>
                        </div>
                      </td>
                    </tr>
                  ) : isRowSelected && selectedQuote?.id === q.id ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 0, borderBottom: "1px solid #e5e7eb", background: "#f8fafc", verticalAlign: "top" }}>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{ padding: "16px 18px 20px", maxWidth: "min(960px, 100%)", boxSizing: "border-box" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                            <div>
                              <h3 style={{ margin: 0, fontSize: 18, color: theme.text }}>Quote</h3>
                              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>
                                {selectedQuote.customers?.display_name ?? "Customer"} · Click the row again to collapse.
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-label="Close quote detail"
                              onClick={() => toggleQuoteRow(q.id)}
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
                          <div style={{ fontSize: 14, color: theme.text, marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 700 }}>Customer</div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setNotesCustomerId(selectedQuote.customer_id ?? null)
                                  setNotesCustomerName(selectedQuote.customers?.display_name ?? "")
                                }}
                                style={{ padding: "4px 10px", fontSize: "12px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
                              >
                                Notes
                              </button>
                            </div>
                            <p style={{ margin: 0 }}><strong>Phone:</strong> {selectedQuote.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value ?? "—"}</p>
                            <p style={{ margin: 0 }}><strong>Status:</strong> {selectedQuote.status ?? "—"}</p>
                            {showQuotesJobTypesPanel ? (
                              <label style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14, color: theme.text }}>
                                <strong style={{ flexShrink: 0 }}>Quote job type:</strong>
                                <select
                                  value={
                                    typeof (selectedQuote as QuoteRow).job_type_id === "string"
                                      ? (selectedQuote as QuoteRow).job_type_id ?? ""
                                      : ""
                                  }
                                  onChange={(e) => void persistQuoteJobType(e.target.value)}
                                  style={{ ...theme.formInput, padding: "6px 10px", fontSize: 14, minWidth: 180, maxWidth: "100%" }}
                                >
                                  <option value="">— None —</option>
                                  {quoteDetailJobTypes.map((jt) => (
                                    <option key={jt.id} value={jt.id}>
                                      {jt.name}
                                    </option>
                                  ))}
                                </select>
                                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
                                  New lines inherit this unless the line already has a job type.
                                </span>
                              </label>
                            ) : null}
                            {showQuotesJobTypesPanel && estimateLinePresets.length > 0 ? (
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                                <button
                                  type="button"
                                  disabled={applyJtLinesBusy || !(selectedQuote as QuoteRow).job_type_id}
                                  onClick={() => void applyJobTypeLinesToQuoteItems()}
                                  style={{
                                    padding: "6px 12px",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    borderRadius: 6,
                                    border: "none",
                                    background: theme.primary,
                                    color: "#fff",
                                    cursor: applyJtLinesBusy ? "wait" : "pointer",
                                    opacity: (selectedQuote as QuoteRow).job_type_id ? 1 : 0.5,
                                  }}
                                >
                                  {applyJtLinesBusy ? "Adding…" : "Add job type lines to quote"}
                                </button>
                                <span style={{ fontSize: 12, color: "#64748b", maxWidth: 420 }}>
                                  Inserts every saved line template linked to this job type (skips lines already on the quote).
                                </span>
                              </div>
                            ) : null}
                            <p style={{ margin: 0 }}><strong>Source:</strong> {selectedQuote.conversation_id ? "From conversation" : "Added manually"}</p>
                          </div>

                          <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: theme.text }}>Activity</h4>
                          <div
                            style={{
                              border: `1px solid ${theme.border}`,
                              padding: 12,
                              borderRadius: 8,
                              background: "#fff",
                              minHeight: 72,
                              maxHeight: "min(36vh, 320px)",
                              overflow: "auto",
                              boxSizing: "border-box",
                              marginBottom: 20,
                            }}
                          >
                            {quoteActivityItems.length === 0 ? (
                              <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                                No messages or communication events for this customer yet. Voicemails and inbound messages appear here when logged for this contact.
                              </p>
                            ) : (
                              quoteActivityItems.map((item) => {
                                if (item.kind === "msg") {
                                  const msg = item.payload
                                  return (
                                    <div key={item.key} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                                        {msg.sender === "customer" ? "Customer" : "You"}
                                        {msg.created_at ? (
                                          <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                                            {new Date(msg.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                          </span>
                                        ) : null}
                                      </div>
                                      <p style={{ margin: 0, fontSize: 14, color: theme.text, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                                    </div>
                                  )
                                }
                                const ev = item.payload
                                const label =
                                  ev.event_type === "email"
                                    ? "Email"
                                    : ev.event_type === "sms"
                                      ? "SMS"
                                      : ev.event_type === "call"
                                        ? "Call"
                                        : ev.event_type === "voicemail"
                                          ? "Voicemail"
                                          : String(ev.event_type || "Event")
                                return (
                                  <div key={item.key} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                                      {label}
                                      {ev.direction === "inbound" ? " · In" : ev.direction === "outbound" ? " · Out" : ""}
                                      {ev.created_at ? (
                                        <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                                          {new Date(ev.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                        </span>
                                      ) : null}
                                    </div>
                                    {ev.event_type === "voicemail" ? (
                                      <>
                                        <VoicemailRecordingBlock recordingUrl={ev.recording_url} />
                                        <VoicemailTranscriptBlock
                                          ev={ev}
                                          profileVoicemailDisplay={voicemailProfileDisplay}
                                          conversationPortalValues={conversationPortalDefaults}
                                        />
                                        {ev.body ? (
                                          <p style={{ margin: "8px 0 0", fontSize: 14, color: theme.text, whiteSpace: "pre-wrap" }}>{ev.body}</p>
                                        ) : null}
                                      </>
                                    ) : ev.event_type === "email" ? (
                                      <>
                                        {ev.subject?.trim() ? <p style={{ margin: "0 0 6px", fontWeight: 700 }}>{ev.subject.trim()}</p> : null}
                                        <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{ev.body || "—"}</p>
                                      </>
                                    ) : (
                                      <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{ev.body || "—"}</p>
                                    )}
                                    <AttachmentStrip items={quoteAttachmentsByEvent[ev.id] ?? []} compact />
                                  </div>
                                )
                              })
                            )}
                          </div>

                          <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => void downloadQuoteDocumentClick()}
                              disabled={quotePdfBusy}
                              style={{
                                padding: "8px 14px",
                                borderRadius: 6,
                                border: "none",
                                background: theme.primary,
                                color: "#fff",
                                fontWeight: 600,
                                cursor: quotePdfBusy ? "wait" : "pointer",
                                fontSize: 14,
                              }}
                            >
                              {quotePdfBusy
                                ? quoteExportFormat === "docx"
                                  ? "Word…"
                                  : "PDF…"
                                : quoteExportFormat === "docx"
                                  ? "Download quote (Word)"
                                  : "Download quote PDF"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowQuoteEmailPanel((v) => !v)}
                              style={{
                                padding: "8px 14px",
                                borderRadius: 6,
                                border: `1px solid ${theme.border}`,
                                background: "#fff",
                                fontWeight: 600,
                                cursor: "pointer",
                                fontSize: 14,
                                color: theme.text,
                              }}
                            >
                              {showQuoteEmailPanel ? "Hide email" : "Email customer"}
                            </button>
                          </div>
                          {showQuoteEmailPanel ? (
                            <div
                              style={{
                                marginBottom: 16,
                                padding: 12,
                                borderRadius: 8,
                                border: `1px solid ${theme.border}`,
                                background: "#fff",
                                display: "grid",
                                gap: 10,
                              }}
                            >
                              <input
                                value={quoteEmailSubject}
                                onChange={(e) => setQuoteEmailSubject(e.target.value)}
                                placeholder="Subject"
                                style={theme.formInput}
                              />
                              <textarea
                                value={quoteEmailBody}
                                onChange={(e) => setQuoteEmailBody(e.target.value)}
                                rows={4}
                                placeholder="Message"
                                style={{ ...theme.formInput, resize: "vertical" }}
                              />
                              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: theme.text }}>
                                <input
                                  type="checkbox"
                                  style={{ marginTop: 3 }}
                                  checked={quoteEmailAttachEntity}
                                  onChange={(e) => setQuoteEmailAttachEntity(e.target.checked)}
                                />
                                <span>
                                  Attach files from <strong>Quote files</strong> below ({quoteEntityRows.length} on this quote)
                                  <span style={{ display: "block", fontSize: 12, opacity: 0.75, marginTop: 4, fontWeight: 400 }}>
                                    This uses what you uploaded on the quote, not the generated PDF/Word unless you add that file here.
                                  </span>
                                </span>
                              </label>
                              <button
                                type="button"
                                onClick={() => void sendQuoteCustomerEmail()}
                                disabled={quoteEmailSending}
                                style={{
                                  padding: "8px 14px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: theme.primary,
                                  color: "#fff",
                                  fontWeight: 600,
                                  cursor: quoteEmailSending ? "wait" : "pointer",
                                  justifySelf: "start",
                                }}
                              >
                                {quoteEmailSending ? "Sending…" : "Send email"}
                              </button>
                            </div>
                          ) : null}

                          <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: theme.text }}>Quote files</h4>
                          <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                              Upload file
                              <input
                                type="file"
                                disabled={quoteEntityUploadBusy}
                                onChange={(e) => void handleQuoteEntityFileChange(e.target.files)}
                                style={{ display: "block", marginTop: 6, fontSize: 13 }}
                              />
                            </label>
                            {quoteEntityUploadBusy ? <span style={{ fontSize: 12, color: "#6b7280" }}>Uploading…</span> : null}
                          </div>
                          {quoteEntityRows.length > 0 ? (
                            <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 13, color: theme.text }}>
                              {quoteEntityRows.map((row) => (
                                <li key={row.id} style={{ marginBottom: 6 }}>
                                  <a href={row.public_url} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 600 }}>
                                    {row.file_name || "File"}
                                  </a>
                                  {" · "}
                                  <button
                                    type="button"
                                    onClick={() => void removeQuoteEntityRowLocal(row)}
                                    style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 13 }}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280" }}>No files attached to this quote yet.</p>
                          )}

            <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>Quote items</h3>
              {showQuotesEstimateLineItems ? (
                <button
                  type="button"
                  onClick={() => openEstimateLineItemsModal()}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    color: theme.text,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {estimateLineItemsButtonLabel}
                </button>
              ) : null}
              {showQuotesJobTypesPanel ? (
                <button
                  type="button"
                  onClick={() => setShowQuoteJobTypesModal(true)}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    color: theme.text,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {quoteJobTypesButtonLabel}
                </button>
              ) : null}
            </div>
            {estimateLinePresets.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>Saved lines</span>
                {estimateLinePresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      void insertQuoteLineRow(p.description, p.quantity, p.unit_price, {
                        presetId: p.id,
                        metadata: {
                          minimum_line_total: p.minimum_line_total,
                          line_kind: p.line_kind,
                          ...(p.line_kind === "labor" && estimateLineTemplateOffered("eli_show_manpower")
                            ? { manpower: DEFAULT_PRESET_LABOR_MANPOWER }
                            : {}),
                        },
                      })
                    }
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid #94a3b8",
                      background: "#f1f5f9",
                      color: "#0f172a",
                      cursor: "pointer",
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={p.description}
                  >
                    {p.description.length > 36 ? `${p.description.slice(0, 36)}…` : p.description}
                  </button>
                ))}
              </div>
            ) : null}
            {(estimateReview.subtotal != null || estimateReview.issues.length > 0) && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  fontSize: 13,
                  color: "#111827",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Document check</div>
                {estimateReview.subtotal != null ? (
                  <p style={{ margin: "4px 0" }}>
                    Line items subtotal (cross-check):{" "}
                    <strong>${estimateReview.subtotal.toFixed(2)}</strong>
                    {estimateReview.agreesWithSubtotal === false ? (
                      <span style={{ color: "#b45309" }}> — double-check quantities and unit prices.</span>
                    ) : null}
                  </p>
                ) : null}
                {estimateReview.issues.length > 0 ? (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#1e293b" }}>
                    {estimateReview.issues.map((issue, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>
                        {issue}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            <table
              style={{
                width: "100%",
                minWidth: isMobile ? "640px" : "100%",
                borderCollapse: "collapse",
                marginTop: "8px",
                border: "1px solid #cbd5e1",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #94a3b8", background: "#e2e8f0" }}>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, fontSize: 13 }}>#</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, fontSize: 13 }}>Description</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, fontSize: 13 }}>Qty</th>
                  {estimateLineTemplateOffered("eli_show_manpower") ? (
                    <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, fontSize: 13 }}>Crew</th>
                  ) : null}
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, fontSize: 13 }}>Min $</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, fontSize: 13 }}>Unit</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, fontSize: 13 }}>Total</th>
                  <th style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 700, fontSize: 13 }} />
                </tr>
              </thead>
              <tbody>
                {selectedQuoteItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7 + (estimateLineTemplateOffered("eli_show_manpower") ? 1 : 0)}
                      style={{ padding: "12px", color: "#334155", fontWeight: 500 }}
                    >
                      No line items. Add one below.
                    </td>
                  </tr>
                ) : (
                  selectedQuoteItems.map((item, rowIdx) => {
                    const { desc, qty, up, meta } = getItemDisplay(item)
                    const dr = quoteLineDrafts[item.id]
                    const showMpRow = estimateLineTemplateOffered("eli_show_manpower")
                    const baseMetaRow = parseQuoteItemMetadata(item.metadata)
                    const qtyLive = Number.parseFloat(String(dr?.quantity ?? item.quantity ?? 0)) || 0
                    const upLive = Number.parseFloat(String(dr?.unit_price ?? item.unit_price ?? 0)) || 0
                    const crewLive = showMpRow
                      ? Math.max(1, Number.parseInt(String(dr?.manpower ?? baseMetaRow.manpower ?? 1), 10) || 1)
                      : Math.max(1, baseMetaRow.manpower ?? 1)
                    const minDraftLive = (dr?.minimum ?? "").trim()
                    let minimumLive = baseMetaRow.minimum_line_total
                    if (minDraftLive !== "") {
                      const n = Number.parseFloat(minDraftLive.replace(/[^0-9.]/g, ""))
                      if (Number.isFinite(n) && n >= 0) minimumLive = n > 0 ? n : undefined
                    }
                    const metaLive: QuoteItemMetadata = {
                      ...baseMetaRow,
                      manpower: crewLive,
                      minimum_line_total: minimumLive,
                    }
                    const lineTotalLive = computeQuoteLineTotal(qtyLive, upLive, metaLive).total
                    const crew = meta.manpower ?? 1
                    const serverDesc = String(item.description ?? item.item_description ?? item.name ?? "—")
                    const serverQty = typeof item.quantity === "number" ? item.quantity : Number.parseFloat(String(item.quantity ?? 0)) || 0
                    const serverUp =
                      typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(String(item.unit_price ?? 0)) || 0
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 600, fontSize: 13 }}>{rowIdx + 1}</td>
                        <td style={{ padding: "6px 8px", color: "#0f172a", fontSize: 13 }}>
                          <input
                            value={dr?.description ?? String(desc)}
                            onChange={(e) => {
                              const v = e.target.value
                              setQuoteLineDrafts((prev) => {
                                const cur = prev[item.id]
                                if (!cur) return prev
                                return { ...prev, [item.id]: { ...cur, description: v } }
                              })
                            }}
                            onBlur={(e) => {
                              const v = e.target.value.trim()
                              if (v && v !== serverDesc) void persistQuoteItemUpdate(item.id, { description: v })
                            }}
                            style={{ ...theme.formInput, padding: "6px 8px", width: "100%", minWidth: 120, boxSizing: "border-box" }}
                          />
                        </td>
                        <td style={{ padding: "6px 8px", fontSize: 13 }}>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={dr?.quantity ?? String(qty)}
                            onChange={(e) => {
                              const v = e.target.value
                              setQuoteLineDrafts((prev) => {
                                const cur = prev[item.id]
                                if (!cur) return prev
                                return { ...prev, [item.id]: { ...cur, quantity: v } }
                              })
                            }}
                            onBlur={(e) => {
                              const n = Number.parseFloat(e.target.value) || 0
                              if (Math.abs(n - serverQty) > 1e-9) void persistQuoteItemUpdate(item.id, { quantity: n })
                            }}
                            style={{ ...theme.formInput, padding: "6px 8px", width: 72 }}
                          />
                        </td>
                        {estimateLineTemplateOffered("eli_show_manpower") ? (
                          <td style={{ padding: "6px 8px", fontSize: 13 }}>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={dr?.manpower ?? String(crew)}
                              onChange={(e) => {
                                const v = e.target.value
                                setQuoteLineDrafts((prev) => {
                                  const cur = prev[item.id]
                                  if (!cur) return prev
                                  return { ...prev, [item.id]: { ...cur, manpower: v } }
                                })
                              }}
                              onBlur={(e) => {
                                const n = Math.max(1, parseInt(e.target.value, 10) || 1)
                                if (n !== crew)
                                  void persistQuoteItemUpdate(item.id, {
                                    metadata: mergeQuoteItemMetadataRow(item, { manpower: n }),
                                  })
                              }}
                              style={{ ...theme.formInput, padding: "6px 8px", width: 56 }}
                            />
                          </td>
                        ) : null}
                        <td style={{ padding: "6px 8px", fontSize: 13 }}>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="—"
                            value={dr?.minimum ?? (meta.minimum_line_total != null && Number.isFinite(meta.minimum_line_total) ? String(meta.minimum_line_total) : "")}
                            onChange={(e) => {
                              const v = e.target.value
                              setQuoteLineDrafts((prev) => {
                                const cur = prev[item.id]
                                if (!cur) return prev
                                return { ...prev, [item.id]: { ...cur, minimum: v } }
                              })
                            }}
                            onBlur={(e) => {
                              const t = e.target.value.trim()
                              const n = t === "" ? null : Number.parseFloat(t)
                              const nextMin = n != null && Number.isFinite(n) && n > 0 ? n : null
                              const cur = meta.minimum_line_total
                              const same =
                                (nextMin == null && cur == null) ||
                                (nextMin != null && cur != null && Math.abs(nextMin - cur) < 1e-9)
                              if (!same)
                                void persistQuoteItemUpdate(item.id, {
                                  metadata: mergeQuoteItemMetadataRow(item, { minimum_line_total: nextMin }),
                                })
                            }}
                            style={{ ...theme.formInput, padding: "6px 8px", width: 72 }}
                          />
                        </td>
                        <td style={{ padding: "6px 8px", fontSize: 13 }}>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={dr?.unit_price ?? String(typeof up === "number" ? up : 0)}
                            onChange={(e) => {
                              const v = e.target.value
                              setQuoteLineDrafts((prev) => {
                                const cur = prev[item.id]
                                if (!cur) return prev
                                return { ...prev, [item.id]: { ...cur, unit_price: v } }
                              })
                            }}
                            onBlur={(e) => {
                              const n = Number.parseFloat(e.target.value) || 0
                              if (Math.abs(n - serverUp) > 1e-9) void persistQuoteItemUpdate(item.id, { unit_price: n })
                            }}
                            style={{ ...theme.formInput, padding: "6px 8px", width: 88 }}
                          />
                        </td>
                        <td style={{ padding: "10px 8px", color: "#0f172a", fontWeight: 600, fontSize: 14 }}>
                          {lineTotalLive.toFixed(2)}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <button
                            type="button"
                            onClick={() => void deleteQuoteItemRow(item.id)}
                            style={{
                              fontSize: 12,
                              color: "#b91c1c",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {selectedQuoteItems.length > 0 ? (
                <tfoot>
                  <tr style={{ borderTop: "2px solid #94a3b8", background: "#f1f5f9" }}>
                    <td
                      colSpan={5 + (estimateLineTemplateOffered("eli_show_manpower") ? 1 : 0)}
                      style={{
                        padding: "10px 8px",
                        textAlign: "right",
                        fontWeight: 800,
                        fontSize: 14,
                        color: "#0f172a",
                      }}
                    >
                      Estimate subtotal
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: 800, fontSize: 15, color: "#0f172a", whiteSpace: "nowrap" }}>
                      ${spreadsheetEstimateSubtotal.toFixed(2)}
                    </td>
                    <td style={{ padding: "10px 8px" }} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
            <p style={{ margin: "10px 0 4px", fontSize: 12, color: "#64748b" }}>
              Edit any column in the table. New lines use <strong>Quote job type</strong> when set (above). Line totals use crew × quantity × unit price, then the minimum if set. The subtotal updates as you type.
            </p>
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
              <div style={{ position: "relative" }}>
                <input
                  placeholder="Description (type to filter saved lines)"
                  value={newItemDescription}
                  onChange={(e) => {
                    setNewItemDescription(e.target.value)
                    setNewItemPresetId(null)
                    setPresetSuggestOpen(true)
                  }}
                  onFocus={() => setPresetSuggestOpen(true)}
                  onBlur={() => window.setTimeout(() => setPresetSuggestOpen(false), 180)}
                  style={{ ...theme.formInput, padding: "6px 10px", width: "100%", boxSizing: "border-box" }}
                />
                {presetSuggestOpen && estimateLinePresets.length > 0 ? (
                  <ul
                    style={{
                      position: "absolute",
                      zIndex: 20,
                      left: 0,
                      right: 0,
                      top: "100%",
                      margin: "4px 0 0",
                      padding: 4,
                      listStyle: "none",
                      background: "#fff",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      maxHeight: 200,
                      overflowY: "auto",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                  >
                    {estimateLinePresets
                      .filter((p) =>
                        !newItemDescription.trim()
                          ? true
                          : p.description.toLowerCase().includes(newItemDescription.toLowerCase().trim()),
                      )
                      .slice(0, 12)
                      .map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewItemDescription(p.description)
                              setNewItemQuantity(String(p.quantity))
                              setNewItemUnitPrice(String(p.unit_price))
                              setNewItemMinimum(
                                p.minimum_line_total != null && Number.isFinite(p.minimum_line_total)
                                  ? String(p.minimum_line_total)
                                  : "",
                              )
                              setNewItemManpower(
                                p.line_kind === "labor" && estimateLineTemplateOffered("eli_show_manpower")
                                  ? String(DEFAULT_PRESET_LABOR_MANPOWER)
                                  : "1",
                              )
                              setNewItemPresetId(p.id)
                              setPresetSuggestOpen(false)
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "8px 10px",
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 13,
                              color: "#0f172a",
                              borderRadius: 4,
                            }}
                          >
                            {p.description}
                            <span style={{ opacity: 0.65, fontSize: 11 }}>
                              {" "}
                              · qty {p.quantity} @ ${p.unit_price.toFixed(2)}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end" }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Qty"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(e.target.value)}
                  style={{ ...theme.formInput, padding: "6px 10px", width: "80px" }}
                />
                {estimateLineTemplateOffered("eli_show_manpower") ? (
                  <label style={{ fontSize: 12, color: theme.text, display: "flex", flexDirection: "column", gap: 4 }}>
                    Crew
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={newItemManpower}
                      onChange={(e) => setNewItemManpower(e.target.value)}
                      style={{ ...theme.formInput, padding: "6px 10px", width: "72px" }}
                    />
                  </label>
                ) : null}
                <label style={{ fontSize: 12, color: theme.text, display: "flex", flexDirection: "column", gap: 4 }}>
                  Min $
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="optional"
                    value={newItemMinimum}
                    onChange={(e) => setNewItemMinimum(e.target.value)}
                    style={{ ...theme.formInput, padding: "6px 10px", width: "88px" }}
                  />
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit price"
                  value={newItemUnitPrice}
                  onChange={(e) => setNewItemUnitPrice(e.target.value)}
                  style={{ ...theme.formInput, padding: "6px 10px", width: "100px" }}
                />
                <button
                  type="button"
                  onClick={() => void addQuoteItem()}
                  disabled={addItemLoading}
                  style={{
                    padding: "6px 12px",
                    background: theme.primary,
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  {addItemLoading ? "Adding..." : "Add line item"}
                </button>
              </div>
            </div>

            {!selectedQuote.scheduled_at && (
              <div style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setCalTitle(`${selectedQuote.customers?.display_name ?? "Customer"} – Quote`)
                    setCalDate(new Date().toISOString().slice(0, 10))
                    setCalTime("09:00")
                    setCalMileage("")
                    const qjt =
                      typeof (selectedQuote as QuoteRow).job_type_id === "string"
                        ? (selectedQuote as QuoteRow).job_type_id?.trim() ?? ""
                        : ""
                    setCalJobTypeId(qjt)
                    setCalDuration(60)
                    if (qjt && supabase) {
                      void supabase
                        .from("job_types")
                        .select("duration_minutes")
                        .eq("id", qjt)
                        .maybeSingle()
                        .then(({ data }) => {
                          const dm = (data as { duration_minutes?: number } | null)?.duration_minutes
                          if (typeof dm === "number" && dm >= 15) setCalDuration(dm)
                        })
                    }
                    setCalNotes("")
                    setCalendarTargetUserId(userId)
                    setShowAddToCalendar(true)
                  }}
                  style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  Add to Calendar
                </button>
              </div>
            )}
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={async () => {
                  if (!supabase || !selectedQuote?.id) return
                  if (!confirm("Remove this quote? It can be recalled from Customers later.")) return
                  const { error } = await supabase.from("quotes").update({ removed_at: new Date().toISOString() }).eq("id", selectedQuote.id)
                  if (error) { alert(error.message); return }
                  setSelectedQuote(null)
                  setSelectedQuoteId(null)
                  setQuoteCommEvents([])
                  setQuoteThreadMessages([])
                  setQuoteAttachmentsByEvent({})
                  setQuoteEntityRows([])
                  loadQuotes()
                }}
                style={{ padding: "8px 14px", borderRadius: "6px", background: "#b91c1c", color: "white", border: "none", cursor: "pointer", fontSize: "14px" }}
              >
                Remove
              </button>
            </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        </div>

        {showAddToCalendar && selectedQuote && supabase && (
          <>
            <div onClick={() => setShowAddToCalendar(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "420px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <h3 style={{ margin: "0 0 16px", color: theme.text }}>Add quote to calendar</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {quoteCalendarItems.length > 0 && (
                  <div style={{ marginBottom: 4, paddingBottom: 12, borderBottom: `1px solid ${theme.border}` }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>
                      Scheduling options (from your portal setup)
                    </p>
                    <PortalSettingItemsForm
                      items={quoteCalendarItems}
                      formValues={quoteCalPortalValues}
                      setFormValue={(id, v) => {
                        setQuoteCalPortalValues((prev) => ({ ...prev, [id]: v }))
                        try {
                          localStorage.setItem(`quotes_qcal_${id}`, v)
                        } catch {
                          /* ignore */
                        }
                      }}
                      isItemVisible={(item) => isQuoteCalendarPortalItemVisible(item)}
                    />
                    <p style={{ fontSize: 11, color: theme.text, opacity: 0.75, margin: "8px 0 0" }}>
                      If a job type is selected, recurrence from Calendar → Job Types (same checkboxes) is used when configured; otherwise these options apply.
                    </p>
                  </div>
                )}
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Select user</label>
                  <select
                    value={calendarTargetUserId}
                    onChange={(e) => setCalendarTargetUserId(e.target.value)}
                    style={{ ...theme.formInput }}
                  >
                    {selectableUsers.map((u) => (
                      <option key={u.userId} value={u.userId}>
                        {u.label}{u.email ? ` (${u.email})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <input placeholder="Title" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} style={{ ...theme.formInput }} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} style={{ ...theme.formInput, flex: 1 }} />
                  <input type="time" value={calTime} onChange={(e) => setCalTime(e.target.value)} style={{ ...theme.formInput }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Duration (minutes)</label>
                  <input type="number" min={15} step={15} value={calDuration} onChange={(e) => setCalDuration(parseInt(e.target.value, 10) || 60)} style={{ ...theme.formInput }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Job type</label>
                  <select
                    value={calJobTypeId}
                    onChange={(e) => {
                      const id = e.target.value
                      setCalJobTypeId(id)
                      const jt = jobTypes.find((j) => j.id === id)
                      if (jt) {
                        setCalDuration(Math.max(15, jt.duration_minutes))
                        if (!jt.track_mileage) setCalMileage("")
                      } else {
                        setCalMileage("")
                      }
                    }}
                    style={{ ...theme.formInput }}
                  >
                    <option value="">— None —</option>
                    {jobTypes.map((jt) => (
                      <option key={jt.id} value={jt.id}>{jt.name} ({jt.duration_minutes} min)</option>
                    ))}
                  </select>
                </div>
                {calJobTypeId && jobTypes.find((j) => j.id === calJobTypeId)?.track_mileage ? (
                  <div>
                    <label style={{ fontSize: "12px", color: theme.text }}>Mileage (miles)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={calMileage}
                      onChange={(e) => setCalMileage(e.target.value)}
                      placeholder="e.g. 42"
                      style={{ ...theme.formInput }}
                    />
                  </div>
                ) : null}
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Notes</label>
                  <input placeholder="Optional notes" value={calNotes} onChange={(e) => setCalNotes(e.target.value)} style={{ ...theme.formInput }} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", color: theme.text, fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={assignToScopedUser}
                    onChange={(e) => setAssignToScopedUser(e.target.checked)}
                  />
                  Assign to selected user calendar automatically
                  <span style={{ opacity: 0.65 }}>(default from Customize user: {autoAssignEnabled ? "on" : "off"})</span>
                </label>
                {!assignToScopedUser && scopeCtx && calendarTargetUserId !== authUserId && (
                  <p style={{ margin: 0, fontSize: "12px", color: theme.text, opacity: 0.8 }}>
                    This event will be assigned to your office manager calendar instead of the selected user.
                  </p>
                )}
                <button
                  disabled={addToCalendarLoading}
                  onClick={async () => {
                    if (!supabase || !calTitle.trim()) return
                    setAddToCalendarLoading(true)
                    const quoteTotal = selectedQuoteItems.reduce((sum, item) => {
                      const { tot } = getItemDisplay(item)
                      return sum + (typeof tot === "number" && !Number.isNaN(tot) ? tot : 0)
                    }, 0)
                    const start = parseLocalDateTime(calDate, calTime)
                    if (Number.isNaN(start.getTime())) {
                      setAddToCalendarLoading(false)
                      alert("Invalid date or time.")
                      return
                    }
                    const durationMs = calDuration * 60 * 1000
                    const recurrenceFromQuote = resolveRecurrenceFromPortal(quoteCalendarItems, quoteCalPortalValues)
                    const recurrenceFromJt =
                      calJobTypeId && calendarJobTypesPortalItems.length > 0
                        ? resolveRecurrenceFromPortal(calendarJobTypesPortalItems, quoteJobTypesPortalValues)
                        : null
                    let series = recurrenceFromQuote ?? recurrenceFromJt
                    if (series) {
                      const fromQuoteModal = recurrenceFromQuote != null
                      const endItems = fromQuoteModal ? quoteCalendarItems : calendarJobTypesPortalItems
                      const endVals = fromQuoteModal ? quoteCalPortalValues : quoteJobTypesPortalValues
                      series = applyRecurrenceEndLimitsFromPortal(endItems, endVals, series)
                    }
                    const starts = series ? computeOccurrenceStarts(start, series) : [start]
                    const newRanges = starts.map((s) => ({ s, e: new Date(s.getTime() + durationMs) }))

                    let noDup = false
                    try {
                      noDup = localStorage.getItem("calendar_noDuplicateTimes") === "true"
                    } catch {
                      noDup = false
                    }
                    const selectedTarget = calendarTargetUserId || userId
                    if (noDup && newRanges.length > 0) {
                      const windowStart = newRanges[0].s
                      const windowEnd = newRanges[newRanges.length - 1].e
                      const { data: existing } = await supabase
                        .from("calendar_events")
                        .select("start_at, end_at")
                        .eq("user_id", selectedTarget)
                        .is("removed_at", null)
                        .lt("start_at", windowEnd.toISOString())
                        .gt("end_at", windowStart.toISOString())
                      const exRows = (existing ?? []) as { start_at: string; end_at: string }[]
                      for (const nr of newRanges) {
                        for (const ex of exRows) {
                          if (intervalsOverlap(nr.s, nr.e, new Date(ex.start_at), new Date(ex.end_at))) {
                            setAddToCalendarLoading(false)
                            alert("One or more recurring times overlap an existing calendar event.")
                            return
                          }
                        }
                      }
                      for (let i = 0; i < newRanges.length; i++) {
                        for (let j = i + 1; j < newRanges.length; j++) {
                          if (intervalsOverlap(newRanges[i].s, newRanges[i].e, newRanges[j].s, newRanges[j].e)) {
                            setAddToCalendarLoading(false)
                            alert("Recurring instances overlap each other. Adjust duration or frequency.")
                            return
                          }
                        }
                      }
                    }

                    const targetUserId = assignToScopedUser ? selectedTarget : (authUserId || selectedTarget)
                    const recurrenceSeriesId = starts.length > 1 ? crypto.randomUUID() : null
                    const jtRow = calJobTypeId ? jobTypes.find((j) => j.id === calJobTypeId) : null
                    const materialsFromJobType =
                      jtRow && typeof jtRow.materials_list === "string" && jtRow.materials_list.trim()
                        ? jtRow.materials_list.trim()
                        : null
                    const milesRaw = calMileage.trim().replace(/[^0-9.]/g, "")
                    const milesParsed = milesRaw ? Number.parseFloat(milesRaw) : Number.NaN
                    const mileageMiles =
                      jtRow?.track_mileage === true && Number.isFinite(milesParsed) && milesParsed >= 0
                        ? milesParsed
                        : null
                    const rowBase = {
                      user_id: targetUserId,
                      title: calTitle.trim(),
                      start_at: "" as string,
                      end_at: "" as string,
                      job_type_id: calJobTypeId || null,
                      quote_id: selectedQuote.id,
                      customer_id: selectedQuote.customer_id,
                      notes: calNotes.trim() || null,
                      quote_total: quoteTotal > 0 ? quoteTotal : null,
                      ...(recurrenceSeriesId ? { recurrence_series_id: recurrenceSeriesId } : {}),
                    }
                    const buildCalRows = (includeMat: boolean, includeMile: boolean) =>
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
                    const calAttempts: [boolean, boolean][] = [
                      [true, true],
                      [true, false],
                      [false, true],
                      [false, false],
                    ]
                    let insertError: { message: string } | null = null
                    for (const [incMat, incMile] of calAttempts) {
                      const r = await supabase.from("calendar_events").insert(buildCalRows(incMat, incMile))
                      if (!r.error) {
                        insertError = null
                        break
                      }
                      insertError = r.error
                      const em = (r.error.message ?? "").toLowerCase()
                      if (!em.includes("materials_list") && !em.includes("mileage_miles")) break
                    }
                    if (insertError) {
                      setAddToCalendarLoading(false)
                      alert(insertError.message)
                      return
                    }
                    const { error: updateErr } = await supabase.from("quotes").update({ scheduled_at: new Date().toISOString() }).eq("id", selectedQuote.id)
                    setAddToCalendarLoading(false)
                    if (updateErr) { alert(updateErr.message); return }
                    setShowAddToCalendar(false)
                    setSelectedQuote(null)
                    setSelectedQuoteId(null)
                    loadQuotes()
                    if (setPage) setPage("calendar")
                  }}
                  style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {addToCalendarLoading ? "Adding..." : "Add to calendar"}
                </button>
                <button onClick={() => setShowAddToCalendar(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
              </div>
            </div>
          </>
        )}

        {showEstimateLineItemsModal && (
          <>
            <div
              onClick={() => setShowEstimateLineItemsModal(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }}
            />
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "92%",
                maxWidth: 920,
                maxHeight: "90vh",
                overflow: "auto",
                background: "white",
                borderRadius: 8,
                padding: 24,
                boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                zIndex: 9999,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>{estimateLineItemsButtonLabel}</h3>
                <button
                  type="button"
                  onClick={() => setShowEstimateLineItemsModal(false)}
                  style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: theme.text }}
                >
                  ✕
                </button>
              </div>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                Build <strong>saved lines</strong> here, then use them from <strong>Quote items → Saved lines</strong> on any open quote.
                The same list appears under <strong>{quoteJobTypesButtonLabel}</strong> so you can insert a line while managing job types.
                Click <strong>Save &amp; close</strong> to store your list.
              </p>
              {showQuotesJobTypesPanel ? (
                <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setShowQuoteJobTypesModal(true)}
                    style={{
                      fontSize: 13,
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#f8fafc",
                      color: theme.text,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {quoteJobTypesButtonLabel}
                  </button>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Shared with Calendar.</span>
                </div>
              ) : null}

              <div
                style={{
                  marginBottom: 18,
                  padding: 14,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: theme.text, marginBottom: 10 }}>Add a saved line</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 90px) minmax(0, 110px) auto",
                    gap: 10,
                    alignItems: "end",
                  }}
                >
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.text }}>
                    Line type
                    <select
                      value={eliSimpleKind}
                      onChange={(e) => setEliSimpleKind(e.target.value as EliLineKind)}
                      style={theme.formInput}
                    >
                      {ELI_LINE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {ELI_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.text }}>
                    Unit
                    <select
                      value={eliSimpleUnit}
                      onChange={(e) => setEliSimpleUnit(e.target.value as EliUnit)}
                      style={theme.formInput}
                    >
                      {ELI_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {ELI_UNIT_LABEL[u]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.text }}>
                    Qty
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={eliSimpleQty}
                      onChange={(e) => setEliSimpleQty(e.target.value)}
                      style={theme.formInput}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.text }}>
                    $ / unit
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={eliSimplePrice}
                      onChange={(e) => setEliSimplePrice(e.target.value)}
                      placeholder="0"
                      style={theme.formInput}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={appendEliPresetFromSimpleForm}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: theme.primary,
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Add to list
                  </button>
                </div>
              </div>

              <details style={{ marginBottom: 16 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 8 }}>
                  Advanced: portal options &amp; default labor rate
                </summary>
                {estimateLineItemsPortal.length > 0 ? (
                  <div style={{ marginTop: 10, marginBottom: 12 }}>
                    <PortalSettingItemsForm
                      items={estimateLineItemsPortal}
                      formValues={estimateLinePortalValues}
                      setFormValue={(id, v) => {
                        setEstimateLinePortalValues((prev) => ({ ...prev, [id]: v }))
                        try {
                          localStorage.setItem(`quotes_eli_${id}`, v)
                        } catch {
                          /* ignore */
                        }
                      }}
                      isItemVisible={isEstimateLinePortalItemVisible}
                    />
                  </div>
                ) : null}
                {(() => {
                  const li = estimateLineItemsPortal.find((i) => i.id === "eli_default_labor_rate")
                  const portalShowsLabor = li && isEstimateLinePortalItemVisible(li)
                  return portalShowsLabor ? null : (
                    <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: theme.text }}>
                      <span style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>Default labor rate ($/hr) for quick-add</span>
                      <input
                        value={estimateDefaultLaborRate}
                        onChange={(e) => setEstimateDefaultLaborRate(e.target.value)}
                        placeholder="e.g. 85"
                        style={{ ...theme.formInput, maxWidth: 200 }}
                      />
                    </label>
                  )
                })()}
              </details>

              <div style={{ fontWeight: 700, fontSize: 13, color: theme.text, marginBottom: 8 }}>Your saved lines</div>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>
                Collapse rows to focus; expand to edit. Link templates to job types with <strong>Add to job type</strong> (one template can belong to several types). Save &amp; close to persist.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {estimateLineDraft.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No saved lines yet. Use the form above.</p>
                ) : (
                  estimateLineDraft.map((row, idx) => {
                    const expanded = expandedEliById[row.id] === true
                    const linkedIds = row.linked_job_type_ids ?? []
                    const linkedLabels = linkedIds
                      .map((id) => estimateModalJobTypes.find((j) => j.id === id)?.name ?? id.slice(0, 8))
                      .filter(Boolean)
                    return (
                      <div
                        key={row.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: expanded ? 10 : 0,
                          padding: 14,
                          borderRadius: 8,
                          border: `1px solid ${theme.border}`,
                          background: "#f9fafb",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setExpandedEliById((prev) => ({ ...prev, [row.id]: !expanded }))}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              textAlign: "left",
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              font: "inherit",
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
                              {row.description.trim() || "Line"}{" "}
                              <span style={{ fontWeight: 500, opacity: 0.75 }}>
                                · {row.quantity} {eliUnitSuffix(row.unit_basis)} @ ${Number(row.unit_price).toFixed(2)}
                              </span>
                            </span>
                            {!expanded && linkedLabels.length > 0 ? (
                              <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 4, fontWeight: 500 }}>
                                Job types: {linkedLabels.join(", ")}
                              </span>
                            ) : null}
                            <span style={{ display: "block", fontSize: 11, color: theme.primary, marginTop: 4, fontWeight: 600 }}>
                              {expanded ? "▾ Collapse" : "▸ Expand to edit"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEstimateLineDraft((prev) => prev.filter((_, i) => i !== idx))}
                            style={{
                              fontSize: 12,
                              color: "#b91c1c",
                              background: "white",
                              border: "1px solid #fecaca",
                              borderRadius: 6,
                              padding: "4px 10px",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        {expanded ? (
                          <>
                            <input
                              placeholder="Description on quote"
                              value={row.description}
                              onChange={(e) => {
                                const v = e.target.value
                                setEstimateLineDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, description: v } : r)))
                              }}
                              style={theme.formInput}
                            />
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: isMobile ? "1fr 1fr" : "90px 90px 90px minmax(0,1fr)",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <select
                                value={row.unit_basis === "miles" || row.unit_basis === "each" ? row.unit_basis : "hours"}
                                onChange={(e) => {
                                  const v = e.target.value as EliUnit
                                  setEstimateLineDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_basis: v } : r)))
                                }}
                                style={theme.formInput}
                                title="Unit"
                              >
                                <option value="hours">Hours</option>
                                <option value="miles">Miles</option>
                                <option value="each">Each</option>
                              </select>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                title="Quantity"
                                placeholder="Qty"
                                value={row.quantity}
                                onChange={(e) => {
                                  const q = Number.parseFloat(e.target.value) || 0
                                  setEstimateLineDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: q } : r)))
                                }}
                                style={theme.formInput}
                              />
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                placeholder="$/unit"
                                value={row.unit_price}
                                onChange={(e) => {
                                  const p = Number.parseFloat(e.target.value) || 0
                                  setEstimateLineDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: p } : r)))
                                }}
                                style={theme.formInput}
                              />
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                title="Minimum line $ (optional)"
                                placeholder="Min $"
                                value={row.minimum_line_total ?? ""}
                                onChange={(e) => {
                                  const t = e.target.value.trim()
                                  const n = t === "" ? undefined : Number.parseFloat(t)
                                  setEstimateLineDraft((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, minimum_line_total: n != null && Number.isFinite(n) && n > 0 ? n : undefined } : r,
                                    ),
                                  )
                                }}
                                style={theme.formInput}
                              />
                            </div>
                            <select
                              value={eliLineKindFromPresetKind(row.line_kind)}
                              onChange={(e) => {
                                const k = e.target.value as EliLineKind
                                const lk =
                                  k === "material" ? "material" : k === "travel" ? "travel" : k === "misc" ? "misc" : "labor"
                                setEstimateLineDraft((prev) =>
                                  prev.map((r, i) => {
                                    if (i !== idx) return r
                                    const next: EstimateLinePresetRow = { ...r, line_kind: lk }
                                    if (!r.description.trim()) next.description = ELI_KIND_LABEL[k]
                                    return next
                                  }),
                                )
                              }}
                              style={{ ...theme.formInput, maxWidth: 280 }}
                            >
                              {ELI_LINE_KINDS.map((k) => (
                                <option key={k} value={k}>
                                  {ELI_KIND_LABEL[k]}
                                </option>
                              ))}
                            </select>
                            {showQuotesJobTypesPanel && estimateModalJobTypes.length > 0 ? (
                              <div
                                style={{
                                  padding: 10,
                                  borderRadius: 6,
                                  border: `1px dashed ${theme.border}`,
                                  background: "#fff",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Add to job type</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                  <select
                                    value={eliLinkJtPick[row.id] ?? ""}
                                    onChange={(e) =>
                                      setEliLinkJtPick((prev) => ({ ...prev, [row.id]: e.target.value }))
                                    }
                                    style={{ ...theme.formInput, minWidth: 160, flex: "1 1 160px" }}
                                  >
                                    <option value="">Choose job type…</option>
                                    {estimateModalJobTypes.map((jt) => (
                                      <option key={jt.id} value={jt.id}>
                                        {jt.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const pick = (eliLinkJtPick[row.id] ?? "").trim()
                                      if (!pick) {
                                        alert("Choose a job type first.")
                                        return
                                      }
                                      setEstimateLineDraft((prev) =>
                                        prev.map((r, i) => {
                                          if (i !== idx) return r
                                          const set = new Set(r.linked_job_type_ids ?? [])
                                          set.add(pick)
                                          return { ...r, linked_job_type_ids: Array.from(set) }
                                        }),
                                      )
                                      setEliLinkJtPick((prev) => ({ ...prev, [row.id]: "" }))
                                    }}
                                    style={{
                                      padding: "8px 12px",
                                      borderRadius: 6,
                                      border: "none",
                                      background: theme.primary,
                                      color: "#fff",
                                      fontWeight: 600,
                                      fontSize: 12,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Add link
                                  </button>
                                </div>
                                {linkedIds.length > 0 ? (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {linkedIds.map((jid) => {
                                      const name = estimateModalJobTypes.find((j) => j.id === jid)?.name ?? jid.slice(0, 8)
                                      return (
                                        <span
                                          key={jid}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 6,
                                            fontSize: 11,
                                            padding: "4px 8px",
                                            borderRadius: 999,
                                            background: "#e0e7ff",
                                            color: "#312e81",
                                          }}
                                        >
                                          {name}
                                          <button
                                            type="button"
                                            aria-label={`Remove ${name}`}
                                            onClick={() =>
                                              setEstimateLineDraft((prev) =>
                                                prev.map((r, i) =>
                                                  i === idx
                                                    ? {
                                                        ...r,
                                                        linked_job_type_ids: (r.linked_job_type_ids ?? []).filter((x) => x !== jid),
                                                      }
                                                    : r,
                                                ),
                                              )
                                            }
                                            style={{
                                              border: "none",
                                              background: "none",
                                              padding: 0,
                                              cursor: "pointer",
                                              fontSize: 14,
                                              lineHeight: 1,
                                              color: "#4338ca",
                                            }}
                                          >
                                            ×
                                          </button>
                                        </span>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 11, color: "#64748b" }}>Not linked to any job type yet.</span>
                                )}
                              </div>
                            ) : showQuotesJobTypesPanel ? (
                              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                                Add job types under <strong>{quoteJobTypesButtonLabel}</strong> to link templates here.
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={estimateLineSaveBusy}
                  onClick={() => void saveEstimateLineItemsModal()}
                  style={{
                    padding: "10px 16px",
                    background: theme.primary,
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: estimateLineSaveBusy ? "wait" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {estimateLineSaveBusy ? "Saving…" : "Save & close"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEstimateLineItemsModal(false)}
                  style={{
                    padding: "10px 16px",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    background: "#fff",
                    color: theme.text,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}

        {showQuoteJobTypesModal && (
          <>
            <div
              onClick={() => {
                cancelEditQuoteJobType()
                setShowQuoteJobTypesModal(false)
              }}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10000 }}
            />
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "92%",
                maxWidth: 520,
                maxHeight: "90vh",
                overflow: "auto",
                background: "white",
                borderRadius: 8,
                padding: 24,
                boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                zIndex: 10001,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>{quoteJobTypesButtonLabel}</h3>
                <button
                  type="button"
                  onClick={() => {
                    cancelEditQuoteJobType()
                    setShowQuoteJobTypesModal(false)
                  }}
                  style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: theme.text }}
                >
                  ✕
                </button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                Same list as <strong>Calendar → Job Types</strong>. Color and duration apply to calendar events; types also appear on quote lines and estimate presets.
              </p>
              <div
                style={{
                  marginBottom: 16,
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                }}
              >
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: theme.text }}>
                  {editingQuoteJtId ? "Edit job type" : "New job type"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    placeholder="Name"
                    value={quoteJtNewName}
                    onChange={(e) => setQuoteJtNewName(e.target.value)}
                    style={theme.formInput}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 12, color: theme.text }}>
                      Duration (min)
                      <input
                        type="number"
                        min={15}
                        step={15}
                        value={quoteJtNewDuration}
                        onChange={(e) => setQuoteJtNewDuration(parseInt(e.target.value, 10) || 60)}
                        style={{ ...theme.formInput, display: "block", marginTop: 4, width: 100 }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: theme.text }}>
                      Color
                      <input
                        type="color"
                        value={quoteJtNewColor}
                        onChange={(e) => setQuoteJtNewColor(e.target.value)}
                        style={{ display: "block", marginTop: 4, width: 48, height: 32, padding: 0, border: "none" }}
                      />
                    </label>
                  </div>
                  <input
                    placeholder="Description (optional)"
                    value={quoteJtNewDesc}
                    onChange={(e) => setQuoteJtNewDesc(e.target.value)}
                    style={theme.formInput}
                  />
                  <label style={{ display: "grid", gap: 6, fontSize: 12, color: theme.text }}>
                    Materials checklist (optional, one line per item — shown on scheduled calendar events)
                    <textarea
                      value={quoteJtMaterials}
                      onChange={(e) => setQuoteJtMaterials(e.target.value)}
                      rows={4}
                      placeholder={"e.g. Shingles — 10 bundles\nUnderlayment roll\nDrip edge 40 ft"}
                      style={{ ...theme.formInput, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={quoteJtTrackMileage} onChange={(e) => setQuoteJtTrackMileage(e.target.checked)} />
                    Track mileage on calendar events (mileage field when this job type is selected)
                  </label>
                  <details
                    style={{
                      marginTop: 4,
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
                      {estimateLinePresets.length > 0 ? (
                        <span style={{ fontWeight: 600, color: "#374151", marginLeft: 6 }}>({estimateLinePresets.length})</span>
                      ) : null}
                    </summary>
                    <p style={{ margin: "10px 0 10px", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                      Check lines to link them to this job type. One line can be linked to several types. Manage the full list under{" "}
                      <strong style={{ color: "#111827" }}>{estimateLineItemsButtonLabel}</strong>.
                    </p>
                    {estimateLinePresets.length === 0 ? (
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
                        {estimateLinePresets.map((p) => {
                          const costLine = formatEstimatePresetCostSummary(p)
                          return (
                            <label
                              key={p.id}
                              style={{ fontSize: 13, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}
                            >
                              <input
                                type="checkbox"
                                style={{ marginTop: 4, flexShrink: 0 }}
                                checked={jtModalPresetChecks[p.id] === true}
                                onChange={(e) =>
                                  setJtModalPresetChecks((prev) => ({ ...prev, [p.id]: e.target.checked }))
                                }
                              />
                              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                                <span style={{ color: "#111827", fontWeight: 600, lineHeight: 1.35 }}>{p.description.trim() || "Line"}</span>
                                {costLine ? (
                                  <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 500 }}>{costLine}</span>
                                ) : null}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </details>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={quoteJtSaving}
                      onClick={() => void saveQuoteModalNewJobType()}
                      style={{
                        alignSelf: "flex-start",
                        padding: "8px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: theme.primary,
                        color: "#fff",
                        fontWeight: 600,
                        cursor: quoteJtSaving ? "wait" : "pointer",
                      }}
                    >
                      {quoteJtSaving ? "Saving…" : editingQuoteJtId ? "Update job type" : "Add job type"}
                    </button>
                    {editingQuoteJtId ? (
                      <button
                        type="button"
                        disabled={quoteJtSaving}
                        onClick={() => cancelEditQuoteJobType()}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          background: "#fff",
                          color: theme.text,
                          cursor: "pointer",
                        }}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              {quoteJobTypesPanelItems.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <PortalSettingItemsForm
                    items={quoteJobTypesPanelItems}
                    formValues={quoteJobTypesModalValues}
                    setFormValue={(id, v) => {
                      setQuoteJobTypesModalValues((prev) => ({ ...prev, [id]: v }))
                      try {
                        localStorage.setItem(`quotes_qjt_${id}`, v)
                      } catch {
                        /* ignore */
                      }
                    }}
                    isItemVisible={isQuoteJobTypesPanelItemVisible}
                  />
                </div>
              ) : null}
              {quoteJobTypesList.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No job types yet. Add one above or under Calendar → Job Types.</p>
              ) : (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: theme.text }}>Your job types</h4>
                  {quoteJobTypesList.map((jt) => (
                    <div
                      key={jt.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                        padding: 10,
                        background: "#f9fafb",
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          background: jt.color_hex ?? theme.primary,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: theme.text, fontSize: 14 }}>{jt.name}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {jt.duration_minutes} min
                          {jt.description?.trim() ? ` · ${jt.description.trim()}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditQuoteJobType(jt)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 6,
                          background: "white",
                          cursor: "pointer",
                          color: theme.text,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeQuoteJobTypeRow(jt)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          border: "1px solid #fca5a5",
                          borderRadius: 6,
                          background: "white",
                          cursor: "pointer",
                          color: "#b91c1c",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {estimateLinePresets.length > 0 ? (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: theme.text }}>Saved line templates</h4>
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                    Same presets as <strong>{estimateLineItemsButtonLabel}</strong>. With a quote open in the table above, click to add that line to the quote.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {estimateLinePresets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => insertSavedPresetOnOpenQuote(p)}
                        style={{
                          fontSize: 12,
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: `1px solid #94a3b8`,
                          background: "#f1f5f9",
                          color: "#0f172a",
                          cursor: "pointer",
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={`${p.description} · ${p.quantity} ${eliUnitSuffix(p.unit_basis)} @ $${Number(p.unit_price).toFixed(2)}`}
                      >
                        {p.description.length > 40 ? `${p.description.slice(0, 40)}…` : p.description}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  cancelEditQuoteJobType()
                  setShowQuoteJobTypesModal(false)
                }}
                style={{
                  marginTop: 16,
                  padding: "10px 16px",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  background: theme.background,
                  color: theme.text,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
          </>
        )}

        {showAddCustomer && (
          <>
            <div onClick={() => setShowAddCustomer(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "480px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text }}>Add Customer to quotes</h3>
                <button onClick={() => setShowAddCustomer(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: theme.text }}>
                  <input type="radio" checked={!addUseNew} onChange={() => { setAddUseNew(false); setAddExistingId(customerList[0]?.id ?? ""); loadCustomerList() }} />
                  Select existing customer
                </label>
                {!addUseNew && (
                  <select
                    value={addExistingId}
                    onFocus={loadCustomerList}
                    onChange={(e) => setAddExistingId(e.target.value)}
                    style={{ ...theme.formInput }}
                  >
                    <option value="">— Select customer —</option>
                    {customerList.map((c) => (
                      <option key={c.id} value={c.id}>{c.display_name || "Unnamed"}</option>
                    ))}
                  </select>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: theme.text }}>
                  <input type="radio" checked={addUseNew} onChange={() => setAddUseNew(true)} />
                  Create new customer
                </label>
                {addUseNew && (
                  <>
                    <input placeholder="Customer name" value={addNewName} onChange={(e) => setAddNewName(e.target.value)} style={{ ...theme.formInput }} />
                    <input placeholder="Phone" value={addNewPhone} onChange={(e) => setAddNewPhone(e.target.value)} style={{ ...theme.formInput }} />
                    <input placeholder="Email" value={addNewEmail} onChange={(e) => setAddNewEmail(e.target.value)} style={{ ...theme.formInput }} />
                  </>
                )}
                {quoteAddCustomerPortalItems.length > 0 && (
                  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>Options (from portal config)</p>
                    <PortalSettingItemsForm
                      items={quoteAddCustomerPortalItems}
                      formValues={quoteAddCustomerPortalValues}
                      setFormValue={(id, v) => {
                        setQuoteAddCustomerPortalValues((prev) => ({ ...prev, [id]: v }))
                        try {
                          localStorage.setItem(`quotes_addcust_${id}`, v)
                        } catch {
                          /* ignore */
                        }
                      }}
                      isItemVisible={(item) => isCustomButtonItemVisible(item, quoteAddCustomerPortalItems, quoteAddCustomerPortalValues)}
                    />
                  </div>
                )}
                <button onClick={addCustomerToQuotesFlow} disabled={addLoading} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                  {addLoading ? "Adding..." : "Add to Quotes"}
                </button>
                <button onClick={() => setShowAddCustomer(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
              </div>
            </div>
          </>
        )}

        {showAutoResponseOptions && (
          <>
            <div onClick={() => setShowAutoResponseOptions(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "560px", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>Auto Response Options</h3>
                <button onClick={() => setShowAutoResponseOptions(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "20px", color: theme.text }}>
                <div style={{ padding: "12px", background: "#f9fafb", borderRadius: "8px", border: `1px solid ${theme.border}` }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={arOnQuoteCreated}
                      onChange={(e) => {
                        const v = e.target.checked
                        setArOnQuoteCreated(v)
                        try { localStorage.setItem("quotes_arOnQuoteCreated", JSON.stringify(v)) } catch { /* ignore */ }
                      }}
                    />
                    <span><strong>When a quote is created</strong> — send an auto response to the customer.</span>
                  </label>
                  {arOnQuoteCreated && (
                    <textarea
                      value={arOnQuoteCreatedMessage}
                      onChange={(e) => {
                        setArOnQuoteCreatedMessage(e.target.value)
                        try { localStorage.setItem("quotes_arOnQuoteCreatedMessage", e.target.value) } catch { /* ignore */ }
                      }}
                      placeholder="Message to send when a new quote is added..."
                      rows={3}
                      style={{ ...theme.formInput, marginTop: "10px", resize: "vertical" }}
                    />
                  )}
                </div>
                <div style={{ padding: "12px", background: "#f9fafb", borderRadius: "8px", border: `1px solid ${theme.border}` }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={arOnQuoteSent}
                      onChange={(e) => {
                        const v = e.target.checked
                        setArOnQuoteSent(v)
                        try { localStorage.setItem("quotes_arOnQuoteSent", JSON.stringify(v)) } catch { /* ignore */ }
                      }}
                    />
                    <span><strong>When a quote is sent</strong> — send an auto response.</span>
                  </label>
                  {arOnQuoteSent && (
                    <textarea
                      value={arOnQuoteSentMessage}
                      onChange={(e) => {
                        setArOnQuoteSentMessage(e.target.value)
                        try { localStorage.setItem("quotes_arOnQuoteSentMessage", e.target.value) } catch { /* ignore */ }
                      }}
                      placeholder="Message to send when quote is sent to customer..."
                      rows={3}
                      style={{ ...theme.formInput, marginTop: "10px", resize: "vertical" }}
                    />
                  )}
                </div>
                <div style={{ padding: "12px", background: "#f9fafb", borderRadius: "8px", border: `1px solid ${theme.border}` }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={arOnQuoteViewed}
                      onChange={(e) => {
                        const v = e.target.checked
                        setArOnQuoteViewed(v)
                        try { localStorage.setItem("quotes_arOnQuoteViewed", JSON.stringify(v)) } catch { /* ignore */ }
                      }}
                    />
                    <span><strong>When a quote is viewed</strong> (by customer) — send an auto response.</span>
                  </label>
                  {arOnQuoteViewed && (
                    <textarea
                      value={arOnQuoteViewedMessage}
                      onChange={(e) => {
                        setArOnQuoteViewedMessage(e.target.value)
                        try { localStorage.setItem("quotes_arOnQuoteViewedMessage", e.target.value) } catch { /* ignore */ }
                      }}
                      placeholder="Message to send when customer views the quote..."
                      rows={3}
                      style={{ ...theme.formInput, marginTop: "10px", resize: "vertical" }}
                    />
                  )}
                </div>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Delay before sending (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    value={arDelayMinutes}
                    onChange={(e) => {
                      setArDelayMinutes(e.target.value)
                      try { localStorage.setItem("quotes_arDelayMinutes", e.target.value) } catch { /* ignore */ }
                    }}
                    style={{ ...theme.formInput }}
                  />
                </div>
              </div>
              <button onClick={() => setShowAutoResponseOptions(false)} style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer", fontWeight: 600 }}>Done</button>
            </div>
          </>
        )}

        {notesCustomerId && (
          <CustomerNotesPanel
            customerId={notesCustomerId}
            customerName={notesCustomerName}
            onClose={() => { setNotesCustomerId(null); setNotesCustomerName("") }}
          />
        )}
      </div>
    </div>
  )
}
