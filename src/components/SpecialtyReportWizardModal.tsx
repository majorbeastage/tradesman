import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useIsMobile } from "../hooks/useIsMobile"
import { useAuth } from "../contexts/AuthContext"
import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { DRONE_PROVIDER_CATALOG } from "../lib/specialtyReports/droneIntegrationCatalog"
import {
  CONDITION_RATING_LABELS,
  HOME_INSPECTION_MAJOR_SECTIONS,
  conditionRatingOptionLabel,
  conditionRatingSelectStyle,
  type ConditionRating,
  type HomeInspectionReportV1,
  emptyHomeInspectionReport,
  parseHomeInspectionReport,
} from "../lib/specialtyReports/homeInspectionTemplate"
import { SPECIALTY_REPORT_TYPE_LABELS, type SpecialtyReportTypeKey } from "../lib/specialtyReports/reportTypeIds"
import {
  SPECIALTY_REPORT_REGISTRY_KEY,
  defaultSpecialtyReportTitle,
  parseSpecialtyReportRegistry,
  upsertSpecialtyReportRegistryItem,
  type SpecialtyReportRegistryItem,
} from "../lib/specialtyReports/reportRecords"
import {
  majorIdContainingSubsection,
  parseConditionRating,
  parseSpecialtyReportFieldAssignments,
  parseStructuredFillAndNavCommands,
  utteranceLooksLikeFieldCommands,
  type SpecialtyReportFillContext,
  type SpecialtyReportParseResult,
  type SpecialtyReportStructuredPatch,
} from "../lib/specialtyReportAssistantParse"
import { fetchSpecialtyReportFieldFills, getPlatformToolsAccessToken } from "../lib/specialtyReportAssistantApi"
import {
  combineSpeechSessionDisplay,
  createThrottledSpeechDisplay,
  parseSpeechResultsList,
  speechRecognitionOptionsForPlatform,
} from "../lib/speechRecognitionTranscript"

type WizardPhase =
  | "pick_type"
  | "home_header"
  | "home_findings"
  | "home_media"
  | "home_review"
  | "generic_notes"

type Props = {
  open: boolean
  onClose: () => void
  quoteId: string | null
  userId: string | null
  enabledReportTypes: SpecialtyReportTypeKey[]
  propertyAddressHint?: string
  customerLabel?: string
  customerId?: string | null
  varianceAssigneeOptions?: Array<{ userId: string; label: string }>
}

type AiTargetField =
  | "scopeLimitations"
  | "mediaWorkflowNotes"
  | "droneIntegrationNotes"
  | "summaryFindings"
  | "genericNotes"
  | "header.inspectorName"
  | "header.licenseId"
  | "header.inspectionReference"
  | "header.inspectionDate"
  | "header.weather"
  | "header.propertyAddress"
  | "header.partiesPresent"
  | `sub:${string}`

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number
    readonly results: SpeechRecognitionResultList
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    onresult: ((ev: SpeechRecognitionEvent) => void) | null
    onerror: ((ev: Event) => void) | null
    onend: (() => void) | null
    start: () => void
    stop: () => void
  }
}

const META_KEY_HOME = "specialty_report_home_inspection"
const META_KEY_GENERIC_PREFIX = "specialty_report_notes_"
const META_KEY_GENERIC_MEDIA_PREFIX = "specialty_report_media_"
const REPORT_MEDIA_BUCKET = "specialty-report-media"
type FieldMediaItem = { id: string; name: string; mime: string; size: number; url: string; uploaded_at: string }

function labelForAiTarget(t: AiTargetField): string {
  if (t === "scopeLimitations") return "Scope & limitations"
  if (t === "mediaWorkflowNotes") return "Media workflow notes"
  if (t === "droneIntegrationNotes") return "Drone / integration notes"
  if (t === "summaryFindings") return "Executive summary"
  if (t === "genericNotes") return "Generic report notes"
  if (t === "header.inspectorName") return "Header: Inspector name"
  if (t === "header.licenseId") return "Header: License / cert ID"
  if (t === "header.inspectionReference") return "Header: Inspection / file ID"
  if (t === "header.inspectionDate") return "Header: Inspection date"
  if (t === "header.weather") return "Header: Weather / site conditions"
  if (t === "header.propertyAddress") return "Header: Property address"
  if (t === "header.partiesPresent") return "Header: Parties present"
  if (t.startsWith("sub:")) {
    const id = t.slice(4)
    for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
      const sub = sec.subsections.find((s) => s.id === id)
      if (sub) return `Findings: ${sub.label}`
    }
    return "Findings subsection"
  }
  return "Report field"
}

/** Match first words of free text to a findings subsection (for “Tradesman record …” routing). */
function matchFindingsSubsection(rest: string): { target: AiTargetField; body: string } | null {
  const words = rest.trim().split(/\s+/).filter(Boolean)
  for (let take = Math.min(8, words.length); take >= 1; take -= 1) {
    const phrase = words.slice(0, take).join(" ").toLowerCase()
    if (phrase.length < 3) continue
    for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
      for (const sub of sec.subsections) {
        const L = sub.label.toLowerCase()
        if (phrase.length >= 4 && (L.includes(phrase) || phrase.includes(L))) {
          const body = words.slice(take).join(" ").trim()
          return { target: `sub:${sub.id}`, body }
        }
      }
    }
  }
  return null
}

/**
 * Voice / typing helper: after “Tradesman record”, optional area keyword then note text.
 * Examples: “Tradesman record summary roof needs flashing”, “Tradesman record scope. Limited attic access.”
 */
function parseTradesmanRecordIntent(raw: string): {
  consumed: boolean
  target?: AiTargetField
  body?: string
  hint?: string
} {
  const text = raw.trim()
  if (!text) return { consumed: false }
  const wake = /^\s*tradesman\s+record\b[,:\s]*/i
  if (!wake.test(text)) return { consumed: false }
  let rest = text.replace(wake, "").trim()
  if (!rest) {
    return {
      consumed: true,
      hint: 'Say where to record (scope, summary, media, drone, generic, or a findings label like “roof”), then your note — or pick the field above.',
    }
  }

  const routesFixed: Array<{ re: RegExp; target: AiTargetField }> = [
    { re: /^(executive\s+summary|summary)\b/i, target: "summaryFindings" },
    { re: /^(inspector(\s+name)?|inspector\s+info)\b/i, target: "header.inspectorName" },
    { re: /^(weather|site\s+conditions?)\b/i, target: "header.weather" },
    { re: /^(inspection\s+date|report\s+date)\b/i, target: "header.inspectionDate" },
    { re: /^(property\s+address|job\s+address|site\s+address)\b/i, target: "header.propertyAddress" },
    { re: /^(parties\s+present|attendees)\b/i, target: "header.partiesPresent" },
    { re: /^(license|cert(\s+id)?)\b/i, target: "header.licenseId" },
    { re: /^(inspection\s+id|file\s+id|report\s+id|reference\s+number)\b/i, target: "header.inspectionReference" },
    { re: /^(scope|limitations|header\s+scope)\b/i, target: "scopeLimitations" },
    { re: /^(media|workflow)\b/i, target: "mediaWorkflowNotes" },
    { re: /^drone\b/i, target: "droneIntegrationNotes" },
    { re: /^(generic(\s+notes)?)\b/i, target: "genericNotes" },
  ]

  for (const { re, target } of routesFixed) {
    const m = rest.match(re)
    if (m) {
      const body = rest.slice(m[0].length).replace(/^[,.\s:-]+/, "").trim()
      return { consumed: true, target, body }
    }
  }

  const sub = matchFindingsSubsection(rest)
  if (sub) return { consumed: true, target: sub.target, body: sub.body }

  return { consumed: true, body: rest }
}

function specialtyReportFieldDomId(fieldKey: string): string {
  const slug = fieldKey.replace(/\./g, "_").replace(/:/g, "_").replace(/[^\w-]/g, "_").replace(/_+/g, "_")
  return `srw-field-${slug}`
}

export default function SpecialtyReportWizardModal({
  open,
  onClose,
  quoteId,
  userId,
  enabledReportTypes,
  propertyAddressHint = "",
  customerLabel,
  customerId = null,
  varianceAssigneeOptions = [],
}: Props) {
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const globalAssistant = useGlobalAssistantOptional()
  const accountDisplayName = useMemo(() => {
    const meta = user?.user_metadata as Record<string, unknown> | undefined
    const dn = typeof meta?.display_name === "string" ? meta.display_name.trim() : ""
    if (dn) return dn
    const fn = typeof meta?.full_name === "string" ? meta.full_name.trim() : ""
    if (fn) return fn
    return user?.email?.split("@")[0]?.trim() ?? ""
  }, [user])

  const [phase, setPhase] = useState<WizardPhase>("pick_type")
  const [picked, setPicked] = useState<SpecialtyReportTypeKey | null>(null)
  const [home, setHome] = useState<HomeInspectionReportV1>(() => emptyHomeInspectionReport(propertyAddressHint))
  const [genericNotes, setGenericNotes] = useState("")
  const [loadBusy, setLoadBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [assistantText, setAssistantText] = useState("")
  const [assistantNote, setAssistantNote] = useState<string | null>(null)
  const [assistantProcessing, setAssistantProcessing] = useState(false)
  const [assistantListening, setAssistantListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [aiTarget, setAiTarget] = useState<AiTargetField>("scopeLimitations")
  const [voiceFieldKey, setVoiceFieldKey] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [genericFieldMedia, setGenericFieldMedia] = useState<Record<string, FieldMediaItem[]>>({})
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [assignedUserId, setAssignedUserId] = useState<string>("")
  /** Searchable label stored in specialty_reports_registry_v1.title */
  const [reportTitle, setReportTitle] = useState("")
  /** Customer this report is filed under (registry + estimate link on save). */
  const [reportCustomerId, setReportCustomerId] = useState("")
  const [customerOptions, setCustomerOptions] = useState<Array<{ id: string; label: string }>>([])
  /** False until loadDraftForType finishes — blocks autosave from wiping metadata before hydration. */
  const [draftHydrated, setDraftHydrated] = useState(false)
  /** Ctrl / voice: expand `<details>` for major findings sections. */
  const [findingSectionOpen, setFindingSectionOpen] = useState<Record<string, boolean>>({})
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  /** Snapshot + appended finals + interim (Web Speech fires overlapping interim finals). */
  const voiceSessionBaseRef = useRef("")
  const voiceFinalSuffixRef = useRef("")
  /** Chars of overall-assist transcript already parsed/applied (keeps listening on new fields). */
  const voiceConsumedLenRef = useRef(0)
  /** Length of merged finals last sent to the command parser (avoids duplicate mobile fires). */
  const voiceLastParserFinalsLenRef = useRef(0)
  const voiceKeepListeningRef = useRef(false)
  const voiceOverallAssistRef = useRef(false)
  const activeVoiceFieldRef = useRef<string | null>(null)
  const voiceDisplayThrottleRef = useRef<ReturnType<typeof createThrottledSpeechDisplay> | null>(null)
  const voiceParserDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Last throttled transcript shown in the assistant box (preserve on stop). */
  const voiceLiveDisplayRef = useRef("")

  const loadDraftForType = useCallback(
    async (reportType: SpecialtyReportTypeKey | null) => {
      if (!quoteId || !supabase || !userId) return
      setDraftHydrated(false)
      setLoadBusy(true)
      setSaveError(null)
      try {
        const { data, error } = await supabase.from("quotes").select("metadata").eq("id", quoteId).eq("user_id", userId).maybeSingle()
        if (error) throw error
        const meta =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        if (reportType === "home_inspection") {
          const parsed = parseHomeInspectionReport(meta[META_KEY_HOME])
          const base = emptyHomeInspectionReport(propertyAddressHint)
          if (parsed) {
            setHome({
              ...base,
              ...parsed,
              header: { ...base.header, ...parsed.header },
              subsections: { ...base.subsections, ...parsed.subsections },
            })
          } else {
            setHome(base)
          }
        }
        if (reportType && reportType !== "home_inspection") {
          const gKey = `${META_KEY_GENERIC_PREFIX}${reportType}`
          const gRaw = meta[gKey]
          setGenericNotes(typeof gRaw === "string" ? gRaw : "")
          const gmRaw = meta[`${META_KEY_GENERIC_MEDIA_PREFIX}${reportType}`]
          if (gmRaw && typeof gmRaw === "object" && !Array.isArray(gmRaw)) {
            setGenericFieldMedia(gmRaw as Record<string, FieldMediaItem[]>)
          } else {
            setGenericFieldMedia({})
          }
        }
        if (reportType) {
          const reportKeyId = `${quoteId}:${reportType}`
          const reg = parseSpecialtyReportRegistry(meta[SPECIALTY_REPORT_REGISTRY_KEY])
          const hit =
            reg.find((r) => r.id === reportKeyId) ??
            reg.find((r) => r.quote_id === quoteId && r.report_type === reportType)
          setAssignedUserId(hit?.assigned_user_id?.trim() ? hit.assigned_user_id.trim() : "")
          setReportTitle(hit?.title?.trim() ?? (reportType ? defaultSpecialtyReportTitle(reportType) : ""))
          setReportCustomerId(
            hit?.customer_id?.trim() || (typeof customerId === "string" ? customerId.trim() : "") || "",
          )
        } else {
          setAssignedUserId("")
          setReportTitle("")
          setReportCustomerId(typeof customerId === "string" ? customerId.trim() : "")
        }
        setDraftHydrated(true)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e))
        setDraftHydrated(false)
      } finally {
        setLoadBusy(false)
      }
    },
    [quoteId, userId, propertyAddressHint, customerId],
  )

  useEffect(() => {
    if (!open || !userId || !supabase) {
      setCustomerOptions([])
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from("customers").select("id, display_name").eq("user_id", userId).order("display_name")
      if (cancelled || error) return
      setCustomerOptions(
        (data ?? []).map((c) => ({
          id: c.id,
          label: (typeof c.display_name === "string" && c.display_name.trim()) || "Unnamed customer",
        })),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [open, userId])

  const reset = useCallback(() => {
    setPhase("pick_type")
    setPicked(null)
    setHome(emptyHomeInspectionReport(propertyAddressHint))
    setGenericNotes("")
    setGenericFieldMedia({})
    setSaveError(null)
    setPreviewOpen(false)
    setSaveNote(null)
    setAssignedUserId("")
    setReportTitle("")
    setReportCustomerId("")
    setDraftHydrated(false)
    setFindingSectionOpen({})
  }, [propertyAddressHint])

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    if (enabledReportTypes.length === 1) {
      const only = enabledReportTypes[0]
      setPicked(only)
      setPhase(only === "home_inspection" ? "home_header" : "generic_notes")
      void loadDraftForType(only)
    } else {
      setPhase("pick_type")
      setPicked(null)
    }
  }, [open, enabledReportTypes, reset, loadDraftForType])

  useEffect(() => {
    if (!open) return
    const ctor = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ?? window.webkitSpeechRecognition) : undefined
    setSpeechSupported(Boolean(ctor))
  }, [open])

  useEffect(() => {
    if (!globalAssistant) return
    if (!open) {
      globalAssistant.setReportModalOpen(false)
      return
    }
    globalAssistant.setReportModalOpen(true)
    return () => {
      globalAssistant.setReportModalOpen(false)
      globalAssistant.stopVoiceListening()
    }
  }, [open, globalAssistant])

  useEffect(() => {
    if (!globalAssistant?.voiceListening && !globalAssistant?.assistantText) return
    setAssistantText(globalAssistant.assistantText)
  }, [globalAssistant?.assistantText, globalAssistant?.voiceListening])

  useEffect(() => {
    if (globalAssistant?.voiceListening && assistantListening) stopDictation()
  }, [globalAssistant?.voiceListening, assistantListening])

  const buildRegistryRow = useCallback(
    (existing: SpecialtyReportRegistryItem | undefined, nowIso: string): SpecialtyReportRegistryItem => {
      const titleTrim = reportTitle.trim()
      return {
        id: `${quoteId}:${picked}`,
        report_type: picked!,
        quote_id: quoteId!,
        customer_id: reportCustomerId.trim() || null,
        assigned_user_id: assignedUserId.trim() || null,
        title: titleTrim || defaultSpecialtyReportTitle(picked!),
        status: existing?.status === "ready" ? "ready" : "draft",
        updated_at: nowIso,
      }
    },
    [quoteId, picked, reportCustomerId, assignedUserId, reportTitle],
  )

  const syncQuoteCustomerLink = useCallback(
    async (customerIdToLink: string) => {
      if (!quoteId || !userId || !supabase || !customerIdToLink.trim()) return
      const { error } = await supabase
        .from("quotes")
        .update({ customer_id: customerIdToLink.trim(), updated_at: new Date().toISOString() })
        .eq("id", quoteId)
        .eq("user_id", userId)
      if (error) throw error
    },
    [quoteId, userId],
  )

  const persistRegistryMeta = useCallback(async () => {
    if (!quoteId || !userId || !supabase || !picked) return
    try {
      const nowIso = new Date().toISOString()
      const reportId = `${quoteId}:${picked}`
      const { data, error } = await supabase.from("quotes").select("metadata").eq("id", quoteId).eq("user_id", userId).maybeSingle()
      if (error) throw error
      const prev =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      const rows = parseSpecialtyReportRegistry(prev[SPECIALTY_REPORT_REGISTRY_KEY])
      const existing = rows.find((r) => r.id === reportId)
      prev[SPECIALTY_REPORT_REGISTRY_KEY] = upsertSpecialtyReportRegistryItem(rows, buildRegistryRow(existing, nowIso))
      const { error: upErr } = await supabase
        .from("quotes")
        .update({ metadata: prev, updated_at: nowIso })
        .eq("id", quoteId)
        .eq("user_id", userId)
      if (upErr) throw upErr
      if (reportCustomerId.trim()) await syncQuoteCustomerLink(reportCustomerId)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }, [quoteId, userId, picked, buildRegistryRow, reportCustomerId, syncQuoteCustomerLink])

  const persistMetadata = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!quoteId || !userId || !supabase) return
      const { data, error } = await supabase.from("quotes").select("metadata").eq("id", quoteId).eq("user_id", userId).maybeSingle()
      if (error) throw error
      const prev =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      const nextMeta = { ...prev, ...patch }
      const { error: upErr } = await supabase
        .from("quotes")
        .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
        .eq("id", quoteId)
        .eq("user_id", userId)
      if (upErr) throw upErr
    },
    [quoteId, userId],
  )

  useEffect(() => {
    if (!draftHydrated || !open || !quoteId || phase === "pick_type" || picked !== "home_inspection") return
    const t = window.setTimeout(() => {
      const snap = { ...home, updatedAt: new Date().toISOString() }
      void persistMetadata({ [META_KEY_HOME]: snap }).catch((e) => setSaveError(e instanceof Error ? e.message : String(e)))
    }, 700)
    return () => window.clearTimeout(t)
  }, [draftHydrated, home, open, quoteId, phase, picked, persistMetadata])

  useEffect(() => {
    if (!draftHydrated || !open || !quoteId || picked == null || picked === "home_inspection") return
    if (phase !== "generic_notes") return
    const t = window.setTimeout(() => {
      void persistMetadata({
        [`${META_KEY_GENERIC_PREFIX}${picked}`]: genericNotes,
        [`${META_KEY_GENERIC_MEDIA_PREFIX}${picked}`]: genericFieldMedia,
      }).catch((e) =>
        setSaveError(e instanceof Error ? e.message : String(e)),
      )
    }, 700)
    return () => window.clearTimeout(t)
  }, [draftHydrated, genericNotes, genericFieldMedia, open, quoteId, picked, phase, persistMetadata])

  useEffect(() => {
    if (!draftHydrated || !open || !quoteId || !picked) return
    const t = window.setTimeout(() => {
      void persistRegistryMeta()
    }, 450)
    return () => window.clearTimeout(t)
  }, [assignedUserId, draftHydrated, open, persistRegistryMeta, picked, quoteId, reportTitle, reportCustomerId])

  const customerSelectOptions = useMemo(() => {
    const opts = [...customerOptions]
    const cid = reportCustomerId.trim()
    if (cid && customerLabel && !opts.some((o) => o.id === cid)) {
      opts.unshift({ id: cid, label: customerLabel })
    }
    return opts
  }, [customerOptions, reportCustomerId, customerLabel])

  const varianceAssigneeSelectOptions = useMemo(() => {
    const opts = [...varianceAssigneeOptions]
    const aid = assignedUserId.trim()
    if (aid && !opts.some((o) => o.userId === aid)) {
      opts.unshift({ userId: aid, label: `Saved assignee (${aid.slice(0, 8)}…)` })
    }
    return opts
  }, [varianceAssigneeOptions, assignedUserId])

  const headerLine = useMemo(() => {
    const custom = reportTitle.trim()
    if (custom) return custom
    if (picked) return defaultSpecialtyReportTitle(picked)
    return "Specialty report"
  }, [reportTitle, picked])

  const deficientCount = useMemo(() => {
    return Object.values(home.subsections).filter((s) => s.condition === "deficient").length
  }, [home.subsections])

  const close = () => {
    reset()
    onClose()
  }

  const selectType = (k: SpecialtyReportTypeKey) => {
    setPicked(k)
    if (k === "home_inspection") setPhase("home_header")
    else setPhase("generic_notes")
    void loadDraftForType(k)
  }

  const goNextPhase = useCallback(() => {
    if (phase === "home_header") setPhase("home_findings")
    else if (phase === "home_findings") setPhase("home_media")
    else if (phase === "home_media") setPhase("home_review")
    else if (phase === "pick_type") setAssistantNote("Choose a report template first.")
  }, [phase])

  const goBackPhase = useCallback(() => {
    if (phase === "home_review") setPhase("home_media")
    else if (phase === "home_media") setPhase("home_findings")
    else if (phase === "home_findings") setPhase("home_header")
    else if (phase === "home_header" && enabledReportTypes.length > 1) {
      setPhase("pick_type")
      setPicked(null)
    } else if (phase === "generic_notes" && enabledReportTypes.length > 1) {
      setPhase("pick_type")
      setPicked(null)
    }
  }, [phase, enabledReportTypes.length])

  const setDefaultTargetForPhase = useCallback((nextPhase: WizardPhase) => {
    if (nextPhase === "home_header") setAiTarget("header.inspectorName")
    else if (nextPhase === "home_findings") {
      const firstSub = HOME_INSPECTION_MAJOR_SECTIONS[0]?.subsections[0]?.id
      if (firstSub) setAiTarget(`sub:${firstSub}` as AiTargetField)
    } else if (nextPhase === "home_media") setAiTarget("mediaWorkflowNotes")
    else if (nextPhase === "home_review") setAiTarget("summaryFindings")
    else if (nextPhase === "generic_notes") setAiTarget("genericNotes")
  }, [])

  useEffect(() => {
    setDefaultTargetForPhase(phase)
  }, [phase, setDefaultTargetForPhase])

  if (!open) return null

  function appendToTarget(target: AiTargetField, text: string) {
    const chunk = text.trim()
    if (!chunk) return
    if (target === "genericNotes") {
      setGenericNotes((prev) => (prev.trim() ? `${prev.trim()}\n${chunk}` : chunk))
      return
    }
    if (target === "scopeLimitations") {
      setHome((h) => ({ ...h, scopeLimitations: h.scopeLimitations.trim() ? `${h.scopeLimitations.trim()}\n${chunk}` : chunk }))
      return
    }
    if (target === "mediaWorkflowNotes") {
      setHome((h) => ({ ...h, mediaWorkflowNotes: h.mediaWorkflowNotes.trim() ? `${h.mediaWorkflowNotes.trim()}\n${chunk}` : chunk }))
      return
    }
    if (target === "droneIntegrationNotes") {
      setHome((h) => ({ ...h, droneIntegrationNotes: h.droneIntegrationNotes.trim() ? `${h.droneIntegrationNotes.trim()}\n${chunk}` : chunk }))
      return
    }
    if (target === "summaryFindings") {
      setHome((h) => ({ ...h, summaryFindings: h.summaryFindings.trim() ? `${h.summaryFindings.trim()}\n${chunk}` : chunk }))
      return
    }
    if (
      target === "header.inspectorName" ||
      target === "header.licenseId" ||
      target === "header.inspectionReference" ||
      target === "header.inspectionDate" ||
      target === "header.weather" ||
      target === "header.propertyAddress" ||
      target === "header.partiesPresent"
    ) {
      const tail = target.slice("header.".length) as keyof HomeInspectionReportV1["header"]
      setHome((h) => {
        const prev = String(h.header[tail] ?? "").trim()
        return { ...h, header: { ...h.header, [tail]: prev ? `${prev}\n${chunk}` : chunk } }
      })
      return
    }
    if (target.startsWith("sub:")) {
      const subId = target.slice(4)
      setHome((h) => {
        const row = h.subsections[subId] ?? { condition: "not_inspected" as ConditionRating, notes: "" }
        return {
          ...h,
          subsections: {
            ...h.subsections,
            [subId]: { ...row, notes: row.notes.trim() ? `${row.notes.trim()}\n${chunk}` : chunk },
          },
        }
      })
    }
  }

  function readFieldValue(fieldKey: string): string {
    if (fieldKey === "genericNotes") return genericNotes
    if (fieldKey === "scopeLimitations") return home.scopeLimitations
    if (fieldKey === "mediaWorkflowNotes") return home.mediaWorkflowNotes
    if (fieldKey === "droneIntegrationNotes") return home.droneIntegrationNotes
    if (fieldKey === "summaryFindings") return home.summaryFindings
    if (fieldKey === "header.inspectorName") return home.header.inspectorName
    if (fieldKey === "header.licenseId") return home.header.licenseId
    if (fieldKey === "header.inspectionReference") return home.header.inspectionReference
    if (fieldKey === "header.inspectionDate") return home.header.inspectionDate
    if (fieldKey === "header.weather") return home.header.weather
    if (fieldKey === "header.propertyAddress") return home.header.propertyAddress
    if (fieldKey === "header.partiesPresent") return home.header.partiesPresent
    if (fieldKey.startsWith("sub:")) return home.subsections[fieldKey.slice(4)]?.notes ?? ""
    return ""
  }

  function writeFieldValue(fieldKey: string, value: string) {
    if (fieldKey === "genericNotes") {
      setGenericNotes(value)
      return
    }
    if (fieldKey === "scopeLimitations") {
      setHome((h) => ({ ...h, scopeLimitations: value }))
      return
    }
    if (fieldKey === "mediaWorkflowNotes") {
      setHome((h) => ({ ...h, mediaWorkflowNotes: value }))
      return
    }
    if (fieldKey === "droneIntegrationNotes") {
      setHome((h) => ({ ...h, droneIntegrationNotes: value }))
      return
    }
    if (fieldKey === "summaryFindings") {
      setHome((h) => ({ ...h, summaryFindings: value }))
      return
    }
    if (fieldKey === "header.inspectorName") {
      setHome((h) => ({ ...h, header: { ...h.header, inspectorName: value } }))
      return
    }
    if (fieldKey === "header.licenseId") {
      setHome((h) => ({ ...h, header: { ...h.header, licenseId: value } }))
      return
    }
    if (fieldKey === "header.inspectionReference") {
      setHome((h) => ({ ...h, header: { ...h.header, inspectionReference: value } }))
      return
    }
    if (fieldKey === "header.inspectionDate") {
      setHome((h) => ({ ...h, header: { ...h.header, inspectionDate: value } }))
      return
    }
    if (fieldKey === "header.weather") {
      setHome((h) => ({ ...h, header: { ...h.header, weather: value } }))
      return
    }
    if (fieldKey === "header.propertyAddress") {
      setHome((h) => ({ ...h, header: { ...h.header, propertyAddress: value } }))
      return
    }
    if (fieldKey === "header.partiesPresent") {
      setHome((h) => ({ ...h, header: { ...h.header, partiesPresent: value } }))
      return
    }
    if (fieldKey.startsWith("sub:")) {
      const subId = fieldKey.slice(4)
      setHome((h) => ({
        ...h,
        subsections: { ...h.subsections, [subId]: { ...(h.subsections[subId] ?? { condition: "not_inspected" as ConditionRating, notes: "" }), notes: value } },
      }))
    }
  }

  function applyParsedFieldAssignments(assignments: Array<{ fieldKey: string; value: string }>): { applied: number; skipped: number } {
    let applied = 0
    let skipped = 0
    for (const { fieldKey, value } of assignments) {
      if (fieldKey.startsWith("cond:sub:")) {
        const subId = fieldKey.slice("cond:sub:".length)
        const rating = parseConditionRating(value) ?? (value in CONDITION_RATING_LABELS ? (value as ConditionRating) : null)
        if (!subId || !rating) {
          skipped += 1
          continue
        }
        applyStructuredAssistantPatch({ setCondition: { subId, condition: rating } })
        applied += 1
        continue
      }
      if (fieldKey.startsWith("sub:")) {
        const rating = parseConditionRating(value)
        if (rating) {
          const subId = fieldKey.slice(4)
          applyStructuredAssistantPatch({ setCondition: { subId, condition: rating } })
          applied += 1
          continue
        }
        if (phase !== "home_findings" && phase !== "home_review") {
          skipped += 1
          continue
        }
      }
      const cur = readFieldValue(fieldKey).trim()
      if (cur && cur !== value) {
        skipped += 1
        continue
      }
      writeFieldValue(fieldKey, value)
      applied += 1
      if (fieldKey.startsWith("header.")) setPhase("home_header")
      if (fieldKey.startsWith("sub:")) {
        const sid = fieldKey.slice(4)
        const maj = majorIdContainingSubsection(sid)
        if (maj) setFindingSectionOpen((prev) => ({ ...prev, [maj]: true }))
        setPhase("home_findings")
      }
      if (fieldKey === "scopeLimitations" || fieldKey === "summaryFindings" || fieldKey === "mediaWorkflowNotes" || fieldKey === "droneIntegrationNotes") {
        if (fieldKey === "scopeLimitations") setPhase("home_header")
        if (fieldKey === "summaryFindings") setPhase("home_review")
        if (fieldKey === "mediaWorkflowNotes" || fieldKey === "droneIntegrationNotes") setPhase("home_media")
      }
    }
    return { applied, skipped }
  }

  function applyStructuredAssistantPatch(p: SpecialtyReportStructuredPatch) {
    if (p.openMajorSection) {
      setFindingSectionOpen((prev) => ({ ...prev, [p.openMajorSection!]: true }))
      setPhase("home_findings")
    }
    if (p.fieldKey && p.value != null && String(p.value).length > 0) {
      writeFieldValue(p.fieldKey, String(p.value))
      if (p.fieldKey.startsWith("header.")) setPhase("home_header")
      if (p.fieldKey.startsWith("sub:")) {
        const sid = p.fieldKey.slice(4)
        const maj = majorIdContainingSubsection(sid)
        if (maj) setFindingSectionOpen((prev) => ({ ...prev, [maj]: true }))
        setPhase("home_findings")
      }
    }
    if (p.setCondition) {
      const { subId, condition } = p.setCondition
      setPhase("home_findings")
      const maj = majorIdContainingSubsection(subId)
      if (maj) setFindingSectionOpen((prev) => ({ ...prev, [maj]: true }))
      setHome((h) => ({
        ...h,
        subsections: {
          ...h.subsections,
          [subId]: {
            ...(h.subsections[subId] ?? { condition: "not_inspected" as ConditionRating, notes: "" }),
            condition,
          },
        },
      }))
    }
    if (p.focusSubId && !p.fieldKey && !p.setCondition) {
      const maj = majorIdContainingSubsection(p.focusSubId)
      if (maj) setFindingSectionOpen((prev) => ({ ...prev, [maj]: true }))
      setPhase("home_findings")
    }
  }

  function applyNavigationPatches(patches: SpecialtyReportStructuredPatch[]) {
    for (const p of patches) applyStructuredAssistantPatch(p)
  }

  function resetOverallVoiceSessionRefs() {
    voiceSessionBaseRef.current = ""
    voiceFinalSuffixRef.current = ""
    voiceConsumedLenRef.current = 0
    voiceLastParserFinalsLenRef.current = 0
    voiceLiveDisplayRef.current = ""
  }

  function preserveOverallVoiceTranscriptInUi() {
    voiceDisplayThrottleRef.current?.flushNow()
    if (!activeVoiceFieldRef.current) {
      const display =
        voiceLiveDisplayRef.current.trim() ||
        combineSpeechSessionDisplay(voiceSessionBaseRef.current, {
          finals: voiceFinalSuffixRef.current,
          interim: "",
        })
      if (display.trim()) setAssistantText(display.trim())
    }
  }

  /** Mark transcript processed so the next phrase parses fresh; keep text visible for review / Apply. */
  function markOverallVoiceConsumed() {
    const full = `${voiceSessionBaseRef.current}${voiceFinalSuffixRef.current}`
    voiceConsumedLenRef.current = full.length
    voiceLastParserFinalsLenRef.current = voiceFinalSuffixRef.current.length
  }

  function maybeRunOverallVoiceParser(finals: string) {
    if (finals.length <= voiceLastParserFinalsLenRef.current) return
    const fullCommitted = `${voiceSessionBaseRef.current}${finals}`
    const chunk = fullCommitted.slice(voiceConsumedLenRef.current).trim()
    voiceLastParserFinalsLenRef.current = finals.length
    if (chunk.length >= 3) {
      void runAssistantCommand(chunk, { allowDefaultTarget: false, voiceChunk: true })
    }
  }

  function scheduleOverallVoiceParser(finals: string) {
    if (voiceParserDebounceRef.current) clearTimeout(voiceParserDebounceRef.current)
    voiceParserDebounceRef.current = setTimeout(() => {
      voiceParserDebounceRef.current = null
      maybeRunOverallVoiceParser(finals)
    }, 1100)
  }

  function applyHomeInspectionParseResult(parsed: SpecialtyReportParseResult): { applied: number; skipped: number } {
    if (parsed.structuredPatches.length > 0) applyNavigationPatches(parsed.structuredPatches)
    return applyParsedFieldAssignments(parsed.assignments)
  }

  async function attachFieldImage(fieldKey: string, file: File | null) {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setSaveError("Only image files can be attached to report fields.")
      return
    }
    if (file.size > 2_000_000) {
      setSaveError("Image is too large. Use files under 2MB for field-level attachments.")
      return
    }
    if (!supabase || !quoteId || !userId) {
      setSaveError("Select a saved estimate before uploading field photos.")
      return
    }
    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const storagePath = `${userId}/${quoteId}/${entryId}-${safeName}`
    const { error: uploadErr } = await supabase.storage.from(REPORT_MEDIA_BUCKET).upload(storagePath, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    })
    if (uploadErr) {
      setSaveError(uploadErr.message || "Could not upload image.")
      return
    }
    const { data } = supabase.storage.from(REPORT_MEDIA_BUCKET).getPublicUrl(storagePath)
    const url = data?.publicUrl?.trim() ?? ""
    if (!url) {
      setSaveError("Could not resolve uploaded image URL.")
      return
    }
    const entry = {
      id: entryId,
      name: file.name,
      mime: file.type,
      size: file.size,
      url,
      uploaded_at: new Date().toISOString(),
    }
    if (fieldKey === "genericNotes") {
      setGenericFieldMedia((prev) => ({ ...prev, [fieldKey]: [...(prev[fieldKey] ?? []), entry] }))
      return
    }
    setHome((h) => ({ ...h, field_media: { ...h.field_media, [fieldKey]: [...(h.field_media[fieldKey] ?? []), entry] } }))
  }

  function removeFieldImage(fieldKey: string, imageId: string) {
    if (fieldKey === "genericNotes") {
      setGenericFieldMedia((prev) => ({ ...prev, [fieldKey]: (prev[fieldKey] ?? []).filter((x) => x.id !== imageId) }))
      return
    }
    setHome((h) => ({ ...h, field_media: { ...h.field_media, [fieldKey]: (h.field_media[fieldKey] ?? []).filter((x) => x.id !== imageId) } }))
  }

  function fieldMediaList(fieldKey: string) {
    return fieldKey === "genericNotes" ? genericFieldMedia[fieldKey] ?? [] : home.field_media[fieldKey] ?? []
  }

  async function saveCurrentReport() {
    if (!quoteId || !userId || !picked) return
    try {
      setSaveError(null)
      const nowIso = new Date().toISOString()
      const reportId = `${quoteId}:${picked}`
      if (picked === "home_inspection") {
        const snap = { ...home, updatedAt: nowIso }
        await persistMetadata({ [META_KEY_HOME]: snap })
      } else {
        await persistMetadata({
          [`${META_KEY_GENERIC_PREFIX}${picked}`]: genericNotes,
          [`${META_KEY_GENERIC_MEDIA_PREFIX}${picked}`]: genericFieldMedia,
        })
      }
      const { data, error } = await supabase!.from("quotes").select("metadata").eq("id", quoteId).eq("user_id", userId).maybeSingle()
      if (error) throw error
      const prev = data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? { ...(data.metadata as Record<string, unknown>) } : {}
      const rows = parseSpecialtyReportRegistry(prev[SPECIALTY_REPORT_REGISTRY_KEY])
      const existingRow = rows.find((r) => r.id === reportId)
      prev[SPECIALTY_REPORT_REGISTRY_KEY] = upsertSpecialtyReportRegistryItem(rows, buildRegistryRow(existingRow, nowIso))
      const { error: upErr } = await supabase!.from("quotes").update({ metadata: prev, updated_at: nowIso }).eq("id", quoteId).eq("user_id", userId)
      if (upErr) throw upErr
      if (reportCustomerId.trim()) await syncQuoteCustomerLink(reportCustomerId)
      setSaveNote("Report saved.")
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  async function runAssistantCommand(
    raw: string,
    options?: { allowDefaultTarget?: boolean; voiceChunk?: boolean },
  ): Promise<boolean> {
    const text = raw.trim()
    if (!text || assistantProcessing) return false
    const fillCtx: SpecialtyReportFillContext = {
      accountDisplayName,
      propertyAddressHint: propertyAddressHint ?? "",
      customerLabel: customerLabel ?? "",
    }

    const lower = text.toLowerCase()
    if (/\btradesman\s+record\b/i.test(lower)) {
      const wakeParsed = parseTradesmanRecordIntent(raw)
      if (wakeParsed.consumed) {
        if (wakeParsed.hint) {
          setAssistantNote(wakeParsed.hint)
          return false
        }
        let chunk = (wakeParsed.body ?? "").trim()
        if (!wakeParsed.target && picked === "home_inspection" && chunk) {
          const parsed = parseSpecialtyReportFieldAssignments(chunk, fillCtx, {
            allowStructure: true,
            readFieldValue,
          })
          const { applied: wApplied, skipped: wSkip } = applyHomeInspectionParseResult(parsed)
          if (wApplied > 0 || wSkip > 0 || parsed.structuredSummary) {
            setAssistantNote(
              parsed.structuredSummary ??
                (wApplied > 0
                  ? `Recorded ${wApplied} field(s) from your note${wSkip ? ` (${wSkip} skipped — fields already had text).` : "."}`
                  : `${wSkip} line(s) skipped — fields already had text.`),
            )
            chunk = parsed.unmatched.join(" ").trim()
            if (wApplied > 0 && !chunk) {
              if (options?.voiceChunk) markOverallVoiceConsumed()
              else setAssistantText("")
              return true
            }
          } else {
            chunk = parsed.unmatched.join(" ").trim() || chunk
          }
        }
        const tgt = wakeParsed.target ?? aiTarget
        if (wakeParsed.target) setAiTarget(wakeParsed.target)
        if (chunk) {
          appendToTarget(tgt, chunk)
          setAssistantNote(`Recorded into ${labelForAiTarget(tgt)}.`)
        } else if (wakeParsed.target) {
          setAssistantNote(`Recording target: ${labelForAiTarget(wakeParsed.target)}. Add your note next.`)
        } else {
          setAssistantNote('Say a section after “Tradesman record” (scope, summary, media, …) or pick a field above.')
        }
        if (options?.voiceChunk) markOverallVoiceConsumed()
        else setAssistantText("")
        return true
      }
    }

    if (picked === "home_inspection") {
      const parsed = parseSpecialtyReportFieldAssignments(text, fillCtx, {
        allowStructure: true,
        readFieldValue,
      })
      const { applied, skipped } = applyHomeInspectionParseResult(parsed)
      if (applied > 0 || skipped > 0 || parsed.structuredSummary) {
        let note = parsed.structuredSummary ?? ""
        if (!note) {
          if (applied > 0 && skipped > 0) {
            note = `Updated ${applied} field(s) or rating(s). Skipped ${skipped} that already had text.`
          } else if (applied > 0) {
            note = `Updated ${applied} report field(s) or condition rating(s) from your voice/text.`
          } else {
            note = `${skipped} field(s) matched but already had text — clear a field to replace.`
          }
        }
        setAssistantNote(note)
        const tail = parsed.unmatched.join(" ").trim()
        if (applied > 0 && !tail) {
          if (options?.voiceChunk) markOverallVoiceConsumed()
          else setAssistantText("")
          return true
        }
        if (tail) {
          const more = await runAssistantCommand(tail, options)
          if (options?.voiceChunk && (applied > 0 || more)) markOverallVoiceConsumed()
          return applied > 0 || more
        }
        if (options?.voiceChunk && applied > 0) markOverallVoiceConsumed()
        return applied > 0
      }
    } else {
      const structured = parseStructuredFillAndNavCommands(text, fillCtx, false)
      if (structured?.patch.fieldKey && structured.patch.value) {
        writeFieldValue(structured.patch.fieldKey, structured.patch.value)
        setAssistantNote(structured.summary)
        if (options?.voiceChunk) markOverallVoiceConsumed()
        else setAssistantText("")
        return true
      }
    }

    const command = lower
    if (command === "next" || command === "next step") {
      goNextPhase()
      setAssistantNote("Moved to the next step.")
      return true
    }
    if (command === "back" || command === "previous" || command === "prev") {
      goBackPhase()
      setAssistantNote("Moved to the previous step.")
      return true
    }
    if (command.includes("go to findings")) {
      setPhase("home_findings")
      setAssistantNote("Opened findings.")
      return true
    }
    if (command.includes("go to header")) {
      setPhase("home_header")
      setAssistantNote("Opened header & scope.")
      return true
    }
    if (command.includes("go to media")) {
      setPhase("home_media")
      setAssistantNote("Opened media / integrations.")
      return true
    }
    if (command.includes("go to review") || command.includes("go to summary")) {
      setPhase("home_review")
      setAssistantNote("Opened review & summary.")
      return true
    }
    if (command.includes("go to scope")) {
      setPhase("home_header")
      setAssistantNote("Opened header & scope.")
      return true
    }

    const shouldTryAi = picked === "home_inspection" && text.length >= 8
    if (shouldTryAi) {
      setAssistantProcessing(true)
      setAssistantNote("Mapping your speech to report fields…")
      try {
        const tok = await getPlatformToolsAccessToken()
        if (!tok) {
          setAssistantNote("Sign in again to use AI field mapping.")
          return false
        }
        const { fills, note } = await fetchSpecialtyReportFieldFills(text, tok)
        if (fills.length > 0) {
          const { applied, skipped } = applyHomeInspectionParseResult({
            assignments: fills,
            skippedExisting: 0,
            unmatched: [],
            structuredPatches: [],
            structured: null,
            structuredSummary: null,
          })
          setAssistantNote(
            applied > 0
              ? `AI updated ${applied} field(s) or rating(s)${skipped ? ` (${skipped} skipped — already had text).` : "."}`
              : note ?? "Could not apply AI field mapping.",
          )
          if (options?.voiceChunk && applied > 0) markOverallVoiceConsumed()
          else if (applied > 0) setAssistantText("")
          return applied > 0
        }
        setAssistantNote(
          note?.trim() ||
            "AI could not map that text to report fields. Try “set inspector name to …” or “gutters: deficient”.",
        )
        return false
      } finally {
        setAssistantProcessing(false)
      }
    }

    if (utteranceLooksLikeFieldCommands(text)) {
      setAssistantNote(
        'Could not match fields. Try: "set inspector name to Joseph Snyder" · "weather: clear, 72°F" · or Label: value per line.',
      )
      return false
    }

    const allowDefaultTarget = options?.allowDefaultTarget !== false
    if (allowDefaultTarget && text.length <= 72) {
      appendToTarget(aiTarget, text)
      setAssistantNote(`Added text into ${labelForAiTarget(aiTarget)}.`)
      if (options?.voiceChunk) markOverallVoiceConsumed()
      return true
    }

    setAssistantNote(
      'Long note not auto-placed. Pick a target field above, use "Tradesman record summary …", or say "set [field] to [value]".',
    )
    return false
  }

  function startDictation(targetFieldKey?: string) {
    if (!speechSupported || typeof window === "undefined") {
      setAssistantNote("Voice dictation is not supported in this browser.")
      return
    }
    const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Ctor) {
      setAssistantNote("Voice dictation is not supported in this browser.")
      return
    }
    try {
      voiceOverallAssistRef.current = !targetFieldKey
      voiceKeepListeningRef.current = true
      activeVoiceFieldRef.current = targetFieldKey ?? null
      voiceSessionBaseRef.current = targetFieldKey ? readFieldValue(targetFieldKey) : assistantText
      voiceFinalSuffixRef.current = ""
      voiceConsumedLenRef.current = targetFieldKey ? 0 : assistantText.length
      voiceLastParserFinalsLenRef.current = 0
      voiceDisplayThrottleRef.current?.cancel()
      voiceLiveDisplayRef.current = voiceSessionBaseRef.current
      voiceDisplayThrottleRef.current = createThrottledSpeechDisplay((display) => {
        voiceLiveDisplayRef.current = display
        if (targetFieldKey) {
          writeFieldValue(targetFieldKey, display)
        } else {
          setAssistantText(display)
        }
      })
      const speechOpts = speechRecognitionOptionsForPlatform()
      const rec = new Ctor()
      recognitionRef.current = rec
      rec.continuous = speechOpts.continuous
      rec.interimResults = speechOpts.interimResults
      rec.lang = "en-US"
      rec.onresult = (ev: SpeechRecognitionEvent) => {
        const parsed = parseSpeechResultsList(ev.results)
        voiceFinalSuffixRef.current = parsed.finals
        const display = combineSpeechSessionDisplay(voiceSessionBaseRef.current, parsed)
        voiceDisplayThrottleRef.current?.schedule(display)
        if (targetFieldKey) {
          /* save note only on flush — avoid setState every 50ms */
        } else if (voiceOverallAssistRef.current) {
          scheduleOverallVoiceParser(parsed.finals)
        }
      }
      rec.onerror = () => {
        voiceKeepListeningRef.current = false
        setAssistantNote("Voice input failed. Check mic permissions and retry.")
      }
      rec.onend = () => {
        voiceDisplayThrottleRef.current?.flushNow()
        if (voiceParserDebounceRef.current) {
          clearTimeout(voiceParserDebounceRef.current)
          voiceParserDebounceRef.current = null
        }
        const fieldKey = activeVoiceFieldRef.current
        if (!fieldKey && voiceOverallAssistRef.current) {
          maybeRunOverallVoiceParser(voiceFinalSuffixRef.current)
        }
        if (targetFieldKey) setSaveNote("Voice text added to field.")
        const shouldRestart = voiceKeepListeningRef.current && !speechRecognitionOptionsForPlatform().continuous
        if (shouldRestart && recognitionRef.current) {
          window.setTimeout(() => {
            if (!voiceKeepListeningRef.current || !recognitionRef.current) return
            try {
              recognitionRef.current.start()
            } catch {
              voiceKeepListeningRef.current = false
              setAssistantListening(false)
              setVoiceFieldKey(null)
              activeVoiceFieldRef.current = null
              voiceOverallAssistRef.current = false
            }
          }, 280)
          return
        }
        setAssistantListening(false)
        activeVoiceFieldRef.current = null
        setVoiceFieldKey(null)
        voiceOverallAssistRef.current = false
        voiceKeepListeningRef.current = false
      }
      rec.start()
      setAssistantListening(true)
      setVoiceFieldKey(targetFieldKey ?? null)
      setAssistantNote(
        "Listening… Each phrase can target a different field. Examples: set inspector name to Jane · weather clear 72 · gutters deficient · roof covering satisfactory. Or “Tradesman record” + scope / summary.",
      )
    } catch {
      setAssistantListening(false)
      setAssistantNote("Could not start voice dictation.")
    }
  }

  function stopDictation() {
    voiceKeepListeningRef.current = false
    if (voiceParserDebounceRef.current) {
      clearTimeout(voiceParserDebounceRef.current)
      voiceParserDebounceRef.current = null
    }
    preserveOverallVoiceTranscriptInUi()
    voiceDisplayThrottleRef.current?.cancel()
    voiceDisplayThrottleRef.current = null
    recognitionRef.current?.stop()
    recognitionRef.current = null
    resetOverallVoiceSessionRefs()
    setAssistantListening(false)
    setVoiceFieldKey(null)
    activeVoiceFieldRef.current = null
    voiceOverallAssistRef.current = false
  }

  function FieldTools({ fieldKey }: { fieldKey: string }) {
    const media = fieldMediaList(fieldKey)
    return (
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => startDictation(fieldKey)}
            style={secondaryBtn}
            disabled={assistantListening && voiceFieldKey !== fieldKey}
          >
            {assistantListening && voiceFieldKey === fieldKey ? "Listening…" : "Voice"}
          </button>
          <label style={{ ...secondaryBtn, display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
            Upload photo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                void attachFieldImage(fieldKey, file)
                e.currentTarget.value = ""
              }}
            />
          </label>
        </div>
        {media.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {media.map((m) => (
              <span key={m.id} style={{ fontSize: 11, padding: "4px 6px", border: `1px solid ${theme.border}`, borderRadius: 6, background: "#f8fafc" }}>
                <a href={m.url} target="_blank" rel="noreferrer" style={{ color: "#0f172a", textDecoration: "none" }}>
                  {m.name}
                </a>
                <button
                  type="button"
                  onClick={() => removeFieldImage(fieldKey, m.id)}
                  style={{ marginLeft: 6, border: "none", background: "transparent", cursor: "pointer", color: "#991b1b" }}
                  aria-label="Remove image"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div role="presentation" onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 10052 }} />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          zIndex: 10053,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(720px, calc(100vw - 24px))",
          maxHeight: "min(92vh, 880px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 56px rgba(15,23,42,0.2)",
          padding: "20px 20px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em" }}>Specialty report (internal)</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 800, color: theme.text, lineHeight: 1.25 }}>
              {phase === "pick_type" ? "Choose report template" : headerLine}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              {customerLabel ? (
                <>
                  Linked estimate context: <strong style={{ color: "#334155" }}>{customerLabel}</strong>
                  {quoteId ? (
                    <>
                      {" "}
                      · <code style={{ fontSize: 11 }}>{quoteId.slice(0, 8)}…</code>
                    </>
                  ) : null}
                </>
              ) : quoteId ? (
                <>
                  Quote <code style={{ fontSize: 11 }}>{quoteId.slice(0, 8)}…</code>
                </>
              ) : (
                "Open an estimate row first."
              )}
            </p>
            {loadBusy ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>Loading saved draft…</p> : null}
            {saveError ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#b91c1c" }}>{saveError}</p> : null}
            {saveNote ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#047857" }}>{saveNote}</p> : null}
          </div>
          <button
            type="button"
            onClick={close}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              color: "#0f172a",
              fontWeight: 800,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {quoteId && phase !== "pick_type" && picked ? (
          <section
            style={{
              marginBottom: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.04em" }}>REPORT FILING</div>
            <label style={{ ...lbl, fontSize: 12 }}>
              Report name
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder={
                  picked ? `e.g. ${defaultSpecialtyReportTitle(picked)} — ${propertyAddressHint || "address or site"}` : "Name for search"
                }
                style={theme.formInput}
              />
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
                Shown at the top of this wizard and in Estimates → Reports / the customer profile so you can find it quickly.
              </span>
            </label>
            <label style={{ ...lbl, fontSize: 12 }}>
              Save to customer
              <select
                value={reportCustomerId}
                onChange={(e) => setReportCustomerId(e.target.value)}
                style={theme.formInput}
              >
                <option value="">— No customer —</option>
                {customerSelectOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {customerLabel && reportCustomerId && customerOptions.find((c) => c.id === reportCustomerId)?.label !== customerLabel ? (
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
                  Estimate context showed <strong>{customerLabel}</strong>; this report is filed under the customer you select here.
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
                  Links this report on the customer&apos;s profile. Saving also attaches this estimate to that customer when one is selected.
                </span>
              )}
            </label>
          </section>
        ) : null}

        {quoteId && varianceAssigneeSelectOptions.length > 0 ? (
          <section
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
            }}
          >
            <label style={{ ...lbl, fontSize: 12 }}>
              Assign variance/report to team member
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                style={{ ...theme.formInput, maxWidth: 340 }}
              >
                <option value="">Unassigned</option>
                {varianceAssigneeSelectOptions.map((opt) => (
                  <option key={opt.userId} value={opt.userId}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}

        {quoteId ? (
          <section
            style={{
              marginBottom: 14,
              padding: "12px 12px 10px",
              borderRadius: 10,
              border: "1px solid rgba(249,115,22,0.35)",
              background: "linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 13, color: "#9a3412" }}>Overall AI assist (voice + navigation)</strong>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={goBackPhase} style={secondaryBtn}>
                  ← Back
                </button>
                <button type="button" onClick={goNextPhase} style={primaryBtn}>
                  Next →
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <select value={aiTarget} onChange={(e) => setAiTarget(e.target.value as AiTargetField)} style={{ ...theme.formInput, maxWidth: 360 }}>
                {picked === "home_inspection" ? (
                  <>
                    <option value="header.inspectorName">Header: Inspector name</option>
                    <option value="header.licenseId">Header: License / cert ID</option>
                    <option value="header.inspectionReference">Header: Inspection / file ID</option>
                    <option value="header.inspectionDate">Header: Inspection date</option>
                    <option value="header.weather">Header: Weather / site</option>
                    <option value="header.propertyAddress">Header: Property address</option>
                    <option value="header.partiesPresent">Header: Parties present</option>
                  </>
                ) : null}
                <option value="scopeLimitations">Header: Scope & limitations</option>
                <option value="mediaWorkflowNotes">Media: Workflow notes</option>
                <option value="droneIntegrationNotes">Media: Drone / integration notes</option>
                <option value="summaryFindings">Review: Executive summary</option>
                <option value="genericNotes">Generic report notes</option>
                {HOME_INSPECTION_MAJOR_SECTIONS.flatMap((sec) =>
                  sec.subsections.map((sub) => (
                    <option key={sub.id} value={`sub:${sub.id}`}>
                      Findings: {sub.label}
                    </option>
                  )),
                )}
              </select>
              <textarea
                rows={2}
                value={assistantText}
                onChange={(e) => {
                  const v = e.target.value
                  setAssistantText(v)
                  globalAssistant?.setAssistantText(v)
                }}
                placeholder='Example: set inspector name to Joseph Snyder · weather: clear, 72°F · set condition for gutters to satisfactory'
                style={{ ...theme.formInput, resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void runAssistantCommand(assistantText)}
                  style={primaryBtn}
                  disabled={assistantProcessing}
                >
                  {assistantProcessing ? "Mapping fields…" : "Apply assistant input"}
                </button>
                {!assistantListening ? (
                  <button type="button" onClick={() => startDictation()} style={secondaryBtn} disabled={!speechSupported}>
                    {speechSupported ? "Start voice-to-text" : "Voice not available"}
                  </button>
                ) : (
                  <button type="button" onClick={stopDictation} style={secondaryBtn}>
                    Stop listening
                  </button>
                )}
                <button type="button" onClick={() => setAssistantText("")} style={secondaryBtn}>
                  Clear
                </button>
              </div>
              {globalAssistant?.voiceListening && globalAssistant.assistantNote ? (
                <p style={{ margin: 0, fontSize: 12, color: "#4338ca", lineHeight: 1.45 }}>{globalAssistant.assistantNote}</p>
              ) : null}
              {assistantNote ? <p style={{ margin: 0, fontSize: 12, color: "#7c2d12" }}>{assistantNote}</p> : null}
            </div>
          </section>
        ) : null}

        {previewOpen ? (
          <div style={{ display: "grid", gap: 10, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, background: "#f8fafc" }}>
            <h3 style={{ margin: 0, fontSize: 15, color: theme.text }}>Report preview</h3>
            {picked === "home_inspection" ? (
              <>
                <p style={{ margin: 0, fontSize: 13, color: "#334155" }}>{home.header.propertyAddress || "No address entered yet."}</p>
                <p style={{ margin: 0, fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{home.summaryFindings || "No summary entered yet."}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                  Subsection notes completed: {Object.values(home.subsections).filter((s) => String(s.notes ?? "").trim()).length}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                  Field photos attached: {Object.values(home.field_media).reduce((sum, items) => sum + items.length, 0)}
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{genericNotes || "No notes entered yet."}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                  Field photos attached: {Object.values(genericFieldMedia).reduce((sum, items) => sum + items.length, 0)}
                </p>
              </>
            )}
          </div>
        ) : !quoteId ? (
          <p style={{ fontSize: 13, color: "#b45309" }}>Select an estimate in the list to attach this report draft.</p>
        ) : phase === "pick_type" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
              Templates shown here match what you enabled under Advanced Options. More disciplines will plug into the same flow.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {enabledReportTypes.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => selectType(k)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `2px solid ${theme.primary}`,
                    background: "#fff7ed",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: "pointer",
                    color: "#0f172a",
                    textAlign: "left",
                    maxWidth: 320,
                  }}
                >
                  {SPECIALTY_REPORT_TYPE_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
        ) : picked === "home_inspection" ? (
          <>
            {phase === "home_header" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", maxWidth: "100%" }}>
                  <label style={lbl}>
                    Inspector name
                    <input
                      id={specialtyReportFieldDomId("header.inspectorName")}
                      value={home.header.inspectorName}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, inspectorName: e.target.value } }))}
                      style={theme.formInput}
                    />
                    <FieldTools fieldKey="header.inspectorName" />
                  </label>
                  <label style={lbl}>
                    License / cert ID
                    <input
                      id={specialtyReportFieldDomId("header.licenseId")}
                      value={home.header.licenseId}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, licenseId: e.target.value } }))}
                      style={theme.formInput}
                    />
                    <FieldTools fieldKey="header.licenseId" />
                  </label>
                  <label style={lbl}>
                    Inspection / file ID
                    <input
                      id={specialtyReportFieldDomId("header.inspectionReference")}
                      value={home.header.inspectionReference}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, inspectionReference: e.target.value } }))}
                      style={theme.formInput}
                      placeholder="Report or file reference"
                    />
                    <FieldTools fieldKey="header.inspectionReference" />
                  </label>
                  <label style={lbl}>
                    Inspection date
                    <input
                      id={specialtyReportFieldDomId("header.inspectionDate")}
                      type="date"
                      value={home.header.inspectionDate}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, inspectionDate: e.target.value } }))}
                      style={theme.formInput}
                    />
                    <FieldTools fieldKey="header.inspectionDate" />
                  </label>
                  <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                    Weather / site conditions
                    <input
                      id={specialtyReportFieldDomId("header.weather")}
                      value={home.header.weather}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, weather: e.target.value } }))}
                      style={theme.formInput}
                    />
                    <FieldTools fieldKey="header.weather" />
                  </label>
                </div>
                <label style={lbl}>
                  Property address
                  <input
                    id={specialtyReportFieldDomId("header.propertyAddress")}
                    value={home.header.propertyAddress}
                    onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, propertyAddress: e.target.value } }))}
                    style={theme.formInput}
                  />
                  <FieldTools fieldKey="header.propertyAddress" />
                </label>
                <label style={lbl}>
                  Parties present
                  <input
                    id={specialtyReportFieldDomId("header.partiesPresent")}
                    value={home.header.partiesPresent}
                    onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, partiesPresent: e.target.value } }))}
                    style={theme.formInput}
                  />
                  <FieldTools fieldKey="header.partiesPresent" />
                </label>
                <label style={lbl}>
                  Scope &amp; limitations (editable boilerplate)
                  <textarea
                    id={specialtyReportFieldDomId("scopeLimitations")}
                    rows={5}
                    value={home.scopeLimitations}
                    onChange={(e) => setHome((h) => ({ ...h, scopeLimitations: e.target.value }))}
                    style={{ ...theme.formInput, resize: "vertical" }}
                  />
                  <FieldTools fieldKey="scopeLimitations" />
                </label>
              </div>
            ) : null}

            {phase === "home_findings" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
                  Rate each subsection and capture narrative. This mirrors a full structure &amp; property style report — export/PDF wiring comes next.
                </p>
                {HOME_INSPECTION_MAJOR_SECTIONS.map((sec) => (
                  <details
                    key={sec.id}
                    open={findingSectionOpen[sec.id] === true}
                    onToggle={(ev) =>
                      setFindingSectionOpen((prev) => ({
                        ...prev,
                        [sec.id]: (ev.target as HTMLDetailsElement).open,
                      }))
                    }
                    style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 12px", background: "#fafafa" }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 14, color: theme.text }}>{sec.title}</summary>
                    <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                      {sec.subsections.map((sub) => {
                        const row = home.subsections[sub.id] ?? { condition: "not_inspected" as ConditionRating, notes: "" }
                        return (
                          <div key={sub.id} style={{ paddingBottom: 12, borderBottom: `1px dashed #e2e8f0` }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{sub.label}</div>
                            {sub.hint ? <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{sub.hint}</div> : null}
                            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                              <select
                                id={specialtyReportFieldDomId(`cond:sub:${sub.id}`)}
                                value={row.condition}
                                aria-label={`${sub.label} condition`}
                                onChange={(e) => {
                                  const condition = e.target.value as ConditionRating
                                  setHome((h) => ({
                                    ...h,
                                    subsections: {
                                      ...h.subsections,
                                      [sub.id]: { ...row, condition },
                                    },
                                  }))
                                }}
                                style={conditionRatingSelectStyle(row.condition, { ...theme.formInput, minWidth: 200 })}
                              >
                                {(Object.keys(CONDITION_RATING_LABELS) as ConditionRating[]).map((c) => (
                                  <option key={c} value={c}>
                                    {conditionRatingOptionLabel(c)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <textarea
                              id={specialtyReportFieldDomId(`sub:${sub.id}`)}
                              placeholder="Observations, locations, photos referenced…"
                              rows={2}
                              value={row.notes}
                              onChange={(e) => {
                                const notes = e.target.value
                                setHome((h) => ({
                                  ...h,
                                  subsections: {
                                    ...h.subsections,
                                    [sub.id]: { ...row, notes },
                                  },
                                }))
                              }}
                              style={{ ...theme.formInput, marginTop: 8, width: "100%", resize: "vertical" }}
                            />
                            <FieldTools fieldKey={`sub:${sub.id}`} />
                          </div>
                        )
                      })}
                    </div>
                  </details>
                ))}
              </div>
            ) : null}

            {phase === "home_media" ? (
              <div style={{ display: "grid", gap: 14 }}>
                <label style={lbl}>
                  Media workflow notes (link to quote uploads, shared drives, etc.)
                  <textarea
                    rows={3}
                    value={home.mediaWorkflowNotes}
                    onChange={(e) => setHome((h) => ({ ...h, mediaWorkflowNotes: e.target.value }))}
                    style={{ ...theme.formInput, resize: "vertical" }}
                  />
                  <FieldTools fieldKey="mediaWorkflowNotes" />
                </label>
                <label style={lbl}>
                  Drone / flight partner notes (flight IDs, pilot of record, partner URLs — API routing later)
                  <textarea
                    rows={3}
                    value={home.droneIntegrationNotes}
                    onChange={(e) => setHome((h) => ({ ...h, droneIntegrationNotes: e.target.value }))}
                    style={{ ...theme.formInput, resize: "vertical" }}
                  />
                  <FieldTools fieldKey="droneIntegrationNotes" />
                </label>
                <div style={{ padding: 12, borderRadius: 10, background: "#f1f5f9", border: `1px solid #cbd5e1` }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: theme.text }}>Drone platform radar (framework)</div>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
                    No live connections yet — we will map whichever APIs your ops standardize on (OAuth, webhooks, or manual ingest). Checking a vendor here is
                    only a visual reminder for the integration backlog.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                    {DRONE_PROVIDER_CATALOG.map((p) => (
                      <label
                        key={p.id}
                        style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#334155", cursor: "not-allowed", opacity: 0.85 }}
                      >
                        <input type="checkbox" disabled style={{ marginTop: 2 }} />
                        <span>
                          <strong>{p.name}</strong> — {p.notes}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {phase === "home_review" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ padding: 12, borderRadius: 10, background: "#ecfdf5", border: "1px solid #6ee7b7", fontSize: 13, color: "#065f46" }}>
                  Draft autosaves to this quote&apos;s metadata (
                  <code style={{ fontSize: 11 }}>{META_KEY_HOME}</code>). Deficient items flagged: <strong>{deficientCount}</strong>
                </div>
                <label style={lbl}>
                  Executive summary / closing commentary
                  <textarea
                    rows={5}
                    value={home.summaryFindings}
                    onChange={(e) => setHome((h) => ({ ...h, summaryFindings: e.target.value }))}
                    style={{ ...theme.formInput, resize: "vertical" }}
                  />
                  <FieldTools fieldKey="summaryFindings" />
                </label>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                  Next iterations: PDF packet, photo grids pulled from entity attachments, and guided deficiency tables for customer-safe exports.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
              Full structured templates for <strong>{picked ? SPECIALTY_REPORT_TYPE_LABELS[picked] : ""}</strong> are queued. Capture narrative notes now —
              they autosave on this quote.
            </p>
            <textarea
              rows={12}
              value={genericNotes}
              onChange={(e) => setGenericNotes(e.target.value)}
              placeholder="Findings, scope, recommendations, next steps…"
              style={{ ...theme.formInput, resize: "vertical" }}
            />
            <FieldTools fieldKey="genericNotes" />
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {phase !== "pick_type" && enabledReportTypes.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setPhase("pick_type")
                  setPicked(null)
                }}
                style={secondaryBtn}
              >
                Change template
              </button>
            ) : null}
            {picked === "home_inspection" && phase !== "home_header" ? (
              <button type="button" onClick={() => setPhase("home_header")} style={secondaryBtn}>
                ← Header &amp; scope
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_findings" ? null : picked === "home_inspection" && phase === "home_media" ? (
              <button type="button" onClick={() => setPhase("home_findings")} style={secondaryBtn}>
                ← Findings
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_review" ? (
              <button type="button" onClick={() => setPhase("home_media")} style={secondaryBtn}>
                ← Media &amp; drone notes
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {picked ? (
              <button type="button" onClick={() => void saveCurrentReport()} style={secondaryBtn}>
                Save report
              </button>
            ) : null}
            {picked ? (
              <button type="button" onClick={() => setPreviewOpen((v) => !v)} style={secondaryBtn}>
                {previewOpen ? "Close preview" : "Preview"}
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_header" ? (
              <button type="button" onClick={() => setPhase("home_findings")} style={primaryBtn}>
                Continue to findings →
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_findings" ? (
              <button type="button" onClick={() => setPhase("home_media")} style={primaryBtn}>
                Media / integrations →
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_media" ? (
              <button type="button" onClick={() => setPhase("home_review")} style={primaryBtn}>
                Review &amp; summary →
              </button>
            ) : null}
            {(picked && picked !== "home_inspection" && phase === "generic_notes") || (picked === "home_inspection" && phase === "home_review") ? (
              <button type="button" onClick={close} style={primaryBtn}>
                Done
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <SpecialtyReportVoiceFab
        visible={Boolean(quoteId && (globalAssistant?.speechSupported ?? speechSupported) && phase !== "pick_type")}
        listening={globalAssistant?.voiceListening ?? assistantListening}
        isMobile={isMobile}
        onToggle={() => {
          if (assistantListening) stopDictation()
          if (globalAssistant) {
            globalAssistant.toggleVoiceListening(assistantText || globalAssistant.assistantText || "")
            return
          }
          if (assistantListening) stopDictation()
          else startDictation()
        }}
      />
    </>
  )
}

const lbl: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#0f172a" }

const secondaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  color: "#475569",
}

const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
}

/** Stays fixed while the report modal scrolls — tap to start/stop overall voice assist. */
function SpecialtyReportVoiceFab({
  visible,
  listening,
  isMobile,
  onToggle,
}: {
  visible: boolean
  listening: boolean
  isMobile: boolean
  onToggle: () => void
}) {
  if (!visible) return null
  return (
    <>
      <style>{`
        @keyframes specialty-report-voice-fab-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.4), 0 8px 22px rgba(249, 115, 22, 0.45); }
          50% { box-shadow: 0 0 0 12px rgba(249, 115, 22, 0.12), 0 10px 28px rgba(249, 115, 22, 0.55); }
        }
        .specialty-report-voice-fab--active {
          animation: specialty-report-voice-fab-pulse 1.35s ease-in-out infinite;
        }
      `}</style>
      <button
        type="button"
        className={listening ? "specialty-report-voice-fab--active" : undefined}
        aria-label={listening ? "Stop platform assistant voice" : "Start platform assistant voice"}
        title={listening ? "Stop platform assistant" : "Platform assistant voice — stays on screen while you scroll"}
        onClick={onToggle}
        style={{
          position: "fixed",
          zIndex: 10060,
          right: isMobile ? 20 : "calc((100vw - min(720px, 100vw - 24px)) / 2 + 14px)",
          bottom: isMobile ? "max(20px, calc(12px + env(safe-area-inset-bottom, 0px)))" : 28,
          width: isMobile ? 56 : 52,
          height: isMobile ? 56 : 52,
          borderRadius: "50%",
          border: listening ? "2px solid #fff" : `2px solid ${theme.border}`,
          background: listening ? theme.primary : "#fff",
          color: listening ? "#fff" : theme.primary,
          cursor: "pointer",
          boxShadow: listening ? undefined : "0 4px 18px rgba(15, 23, 42, 0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          transition: "background 0.2s, color 0.2s, border-color 0.2s",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"
            fill="currentColor"
          />
          <path
            d="M19 11a7 7 0 01-14 0M12 18v3M8 21h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  )
}
