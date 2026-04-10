import { useEffect, useState, useMemo, Fragment, type ChangeEvent } from "react"
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
  customers: CustomerRow | null
  conversations?: { messages?: MessageRow[] | null } | null
}

type QuotesPageProps = { setPage?: (page: string) => void }
export default function QuotesPage({ setPage }: QuotesPageProps) {
  const isMobile = useIsMobile()
  const { userId: authUserId } = useAuth()
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
  const [addItemLoading, setAddItemLoading] = useState(false)
  // Add to Calendar (from quote detail)
  const [showAddToCalendar, setShowAddToCalendar] = useState(false)
  const [calTitle, setCalTitle] = useState("")
  const [calDate, setCalDate] = useState("")
  const [calTime, setCalTime] = useState("09:00")
  const [calDuration, setCalDuration] = useState(60)
  const [calJobTypeId, setCalJobTypeId] = useState("")
  const [calNotes, setCalNotes] = useState("")
  const [jobTypes, setJobTypes] = useState<{ id: string; name: string; duration_minutes: number }[]>([])
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
  const estimateTemplateButtonLabel = portalConfig?.controlLabels?.estimate_template ?? "Estimate template"

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
    setShowEstimateTemplateModal(false)
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
    void supabase
      .from("job_types")
      .select("id, name, duration_minutes")
      .eq("user_id", calendarTargetUserId)
      .order("name")
      .then(({ data }) => setJobTypes(data || []))
  }, [showAddToCalendar, calendarTargetUserId])

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
    let { data, error } = await supabase
      .from("quotes")
      .select(selectWith)
      .eq("user_id", userId)
      .is("scheduled_at", null)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })

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
      data = (res.data || []).map((q: any) => ({ ...q, scheduled_at: q.scheduled_at ?? null, removed_at: q.removed_at ?? null }))
    } else if (error) {
      setQuotesError(error.message)
      setQuotes([])
      return
    }
    setQuotes((data as any[]) || [])
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
    setSelectedQuoteItems([])
    setQuoteCommEvents([])
    setQuoteThreadMessages([])
    setQuoteAttachmentsByEvent({})
    setQuoteEntityRows([])
    if (!supabase) return
    const { data, error } = await supabase
      .from("quotes")
      .select(`
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
      `)
      .eq("id", quoteId)
      .single()
    if (error) {
      console.error(error)
      return
    }
    setSelectedQuote(data)
    const { data: items } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true })
    setSelectedQuoteItems(items || [])

    const cid = data.customer_id as string
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

    const convId = data.conversation_id as string | null
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

  async function addQuoteItem() {
    if (!supabase || !selectedQuoteId) return
    const qty = parseFloat(newItemQuantity) || 0
    const price = parseFloat(newItemUnitPrice) || 0
    if (!newItemDescription.trim()) {
      alert("Enter a description for the line item.")
      return
    }
    setAddItemLoading(true)
    const row: Record<string, unknown> = {
      quote_id: selectedQuoteId,
      description: newItemDescription.trim(),
      quantity: qty,
      unit_price: price
    }
    const { error } = await supabase.from("quote_items").insert(row)
    setAddItemLoading(false)
    if (error) {
      console.error(error)
      alert(error.message)
      return
    }
    setNewItemDescription("")
    setNewItemQuantity("1")
    setNewItemUnitPrice("")
    openQuote(selectedQuoteId)
  }

  function getItemDisplay(item: any) {
    const desc = item.description ?? item.item_description ?? item.name ?? "—"
    const qty = item.quantity ?? item.qty ?? "—"
    const up = item.unit_price ?? item.price ?? "—"
    const tot = item.total ?? (typeof item.quantity === "number" && typeof item.unit_price === "number" ? item.quantity * item.unit_price : null)
    return { desc, qty, up, tot }
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
        const total = typeof tot === "number" ? tot : quantity * unitPrice
        return { description: String(desc), quantity, unitPrice, total }
      })
      let logo: { bytes: Uint8Array; kind: "png" | "jpeg" } | null = null
      if (quoteShowLogo && quoteLogoUrl.trim()) {
        logo = await fetchQuoteLogoForExport(quoteLogoUrl.trim())
        if (!logo) console.warn("[quotes] Logo URL did not load (CORS, format, or network). Export continues without logo.")
      }
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
              estimateTemplateItems.some((i) => i.id === "estimate_template_logo_url") ? (
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
              ) : null
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
          <p style={{ color: "#b91c1c", marginBottom: "12px", fontSize: "14px" }}>
            {quotesError} Create the quotes table in Supabase (run supabase-quotes-table.sql).
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
                  {isRowSelected && selectedQuote?.id === q.id ? (
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

            <h3 style={{ marginTop: "24px" }}>Quote items</h3>
            <table style={{ width: "100%", minWidth: isMobile ? "540px" : "100%", borderCollapse: "collapse", marginTop: "8px", border: "1px solid #ddd" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd", background: "#f9fafb" }}>
                  <th style={{ padding: "8px" }}>Description</th>
                  <th style={{ padding: "8px" }}>Quantity</th>
                  <th style={{ padding: "8px" }}>Unit price</th>
                  <th style={{ padding: "8px" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuoteItems.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "12px", color: "#6b7280" }}>No line items. Add one below.</td></tr>
                ) : (
                  selectedQuoteItems.map((item) => {
                    const { desc, qty, up, tot } = getItemDisplay(item)
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "8px" }}>{desc}</td>
                        <td style={{ padding: "8px" }}>{qty}</td>
                        <td style={{ padding: "8px" }}>{typeof up === "number" ? up.toFixed(2) : up}</td>
                        <td style={{ padding: "8px" }}>{tot != null ? (typeof tot === "number" ? tot.toFixed(2) : tot) : "—"}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end" }}>
              <input
                placeholder="Description"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                style={{ ...theme.formInput, padding: "6px 10px", width: "200px" }}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Qty"
                value={newItemQuantity}
                onChange={(e) => setNewItemQuantity(e.target.value)}
                style={{ ...theme.formInput, padding: "6px 10px", width: "80px" }}
              />
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
                onClick={addQuoteItem}
                disabled={addItemLoading}
                style={{ padding: "6px 12px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}
              >
                {addItemLoading ? "Adding..." : "Add line item"}
              </button>
            </div>

            {!selectedQuote.scheduled_at && (
              <div style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setCalTitle(`${selectedQuote.customers?.display_name ?? "Customer"} – Quote`)
                  setCalDate(new Date().toISOString().slice(0, 10))
                  setCalTime("09:00")
                  setCalDuration(60)
                  setCalJobTypeId("")
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
                    <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>Portal options</p>
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
                      if (jt) setCalDuration(Math.max(15, jt.duration_minutes))
                    }}
                    style={{ ...theme.formInput }}
                  >
                    <option value="">— None —</option>
                    {jobTypes.map((jt) => (
                      <option key={jt.id} value={jt.id}>{jt.name} ({jt.duration_minutes} min)</option>
                    ))}
                  </select>
                </div>
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
                    const recurrenceFromJt =
                      calJobTypeId && calendarJobTypesPortalItems.length > 0
                        ? resolveRecurrenceFromPortal(calendarJobTypesPortalItems, quoteJobTypesPortalValues)
                        : null
                    const recurrenceFromQuote = resolveRecurrenceFromPortal(quoteCalendarItems, quoteCalPortalValues)
                    let series = recurrenceFromJt ?? recurrenceFromQuote
                    if (series) {
                      const endItems =
                        calJobTypeId && calendarJobTypesPortalItems.length > 0
                          ? calendarJobTypesPortalItems
                          : quoteCalendarItems
                      const endVals =
                        calJobTypeId && calendarJobTypesPortalItems.length > 0
                          ? quoteJobTypesPortalValues
                          : quoteCalPortalValues
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
                    const rows = newRanges.map(({ s, e }) => ({
                      user_id: targetUserId,
                      title: calTitle.trim(),
                      start_at: s.toISOString(),
                      end_at: e.toISOString(),
                      job_type_id: calJobTypeId || null,
                      quote_id: selectedQuote.id,
                      customer_id: selectedQuote.customer_id,
                      notes: calNotes.trim() || null,
                      quote_total: quoteTotal > 0 ? quoteTotal : null,
                      ...(recurrenceSeriesId ? { recurrence_series_id: recurrenceSeriesId } : {}),
                    }))
                    const { error } = await supabase.from("calendar_events").insert(rows)
                    if (error) { setAddToCalendarLoading(false); alert(error.message); return }
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
