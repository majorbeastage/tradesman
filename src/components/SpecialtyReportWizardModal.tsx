import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useAuth } from "../contexts/AuthContext"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { DRONE_PROVIDER_CATALOG } from "../lib/specialtyReports/droneIntegrationCatalog"
import {
  CONDITION_RATING_LABELS,
  HOME_INSPECTION_MAJOR_SECTIONS,
  type ConditionRating,
  type HomeInspectionReportV1,
  emptyHomeInspectionReport,
  parseHomeInspectionReport,
} from "../lib/specialtyReports/homeInspectionTemplate"
import { SPECIALTY_REPORT_TYPE_LABELS, type SpecialtyReportTypeKey } from "../lib/specialtyReports/reportTypeIds"
import {
  SPECIALTY_REPORT_REGISTRY_KEY,
  parseSpecialtyReportRegistry,
  upsertSpecialtyReportRegistryItem,
} from "../lib/specialtyReports/reportRecords"

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

function normAssistantPhrase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^(please|ok|okay)\s+/, "")
}

/** Major section id hints for voice / typed commands (Structure & property report). */
const MAJOR_SECTION_ALIASES: Record<string, string> = {
  admin: "admin_scope",
  administrative: "admin_scope",
  scope: "admin_scope",
  site: "site_exterior",
  exterior: "site_exterior",
  shell: "site_exterior",
  roof: "roof",
  structure: "structure",
  structural: "structure",
  electrical: "electrical",
  electric: "electrical",
  plumbing: "plumbing",
  hvac: "hvac",
  heating: "hvac",
  cooling: "hvac",
  interior: "interior",
  insulation: "insulation_energy",
  energy: "insulation_energy",
  attic: "insulation_energy",
}

function resolveMajorSectionIdFromPhrase(raw: string): string | null {
  const p = normAssistantPhrase(raw).replace(/\b(the|section|tab)\b/g, "").trim()
  if (!p) return null
  if (MAJOR_SECTION_ALIASES[p]) return MAJOR_SECTION_ALIASES[p]
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    if (sec.id === p || p === normAssistantPhrase(sec.title)) return sec.id
    const t = normAssistantPhrase(sec.title)
    if (t.includes(p) || p.includes(t.slice(0, 10))) return sec.id
  }
  return null
}

function majorIdContainingSubsection(subId: string): string | null {
  for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
    if (sec.subsections.some((s) => s.id === subId)) return sec.id
  }
  return null
}

function matchSubsectionIdFromPhrase(rest: string): string | null {
  const cleaned = normAssistantPhrase(rest)
  const words = cleaned.split(/\s+/).filter(Boolean)
  for (let take = Math.min(8, words.length); take >= 1; take -= 1) {
    const phrase = words.slice(0, take).join(" ")
    if (phrase.length < 3) continue
    for (const sec of HOME_INSPECTION_MAJOR_SECTIONS) {
      for (const sub of sec.subsections) {
        const L = normAssistantPhrase(sub.label)
        if (phrase === L || (phrase.length >= 4 && (L.includes(phrase) || phrase.includes(L)))) {
          return sub.id
        }
      }
    }
  }
  return null
}

function matchHeaderOrSubFieldKey(fieldPhrase: string): string | null {
  const f = normAssistantPhrase(fieldPhrase).replace(/^the\s+/, "").trim()
  const headerPairs: Array<[string[], string]> = [
    [["inspector name", "inspector"], "header.inspectorName"],
    [
      ["inspection id", "inspection number", "file id", "report id", "file number", "reference number", "trec id"],
      "header.inspectionReference",
    ],
    [["license id", "license number", "license", "cert id", "certification"], "header.licenseId"],
    [["inspection date", "report date"], "header.inspectionDate"],
    [["weather", "site conditions"], "header.weather"],
    [["property address", "job address", "site address"], "header.propertyAddress"],
    [["address"], "header.propertyAddress"],
    [["parties present", "parties"], "header.partiesPresent"],
  ]
  for (const [hints, key] of headerPairs) {
    for (const h of hints) {
      if (f === h || f.includes(h) || (h.length >= 6 && h.includes(f))) return key
    }
  }
  const subId = matchSubsectionIdFromPhrase(f)
  return subId ? `sub:${subId}` : null
}

/** "Weather is clear", "set inspector to Jane", "inspector = Jane" → same routing as Label: value lines. */
function tryImplicitFieldKeyValue(line: string): { left: string; valueRaw: string } | null {
  const t = line.trim()
  if (!t) return null
  const setTo = t.match(/^set\s+(.+?)\s+to\s+(.+)$/i)
  if (setTo?.[1]?.trim() && setTo[2]?.trim()) return { left: setTo[1].trim(), valueRaw: setTo[2].trim() }
  const isForm = t.match(/^(.+?)\s+is\s+(.+)$/is)
  if (isForm?.[1]?.trim() && isForm[2]?.trim()) return { left: isForm[1].trim(), valueRaw: isForm[2].trim() }
  const eq = t.match(/^(.+?)\s*=\s*(.+)$/)
  if (eq?.[1]?.trim() && eq[2]?.trim()) {
    const L = eq[1].trim()
    const R = eq[2].trim()
    if (L.length >= 2 && L.length <= 72 && !/^https?:\/\//i.test(R)) return { left: L, valueRaw: R }
  }
  return null
}

function parseConditionRating(word: string): ConditionRating | null {
  const w = normAssistantPhrase(word).replace(/[^a-z0-9/\s_-]/g, "")
  const map: Record<string, ConditionRating> = {
    satisfactory: "satisfactory",
    marginal: "marginal",
    monitor: "marginal",
    deficient: "deficient",
    repair: "deficient",
    na: "na",
    "n/a": "na",
    none: "na",
    "not inspected": "not_inspected",
    unchecked: "not_inspected",
  }
  return map[w] ?? null
}

type FillContext = { accountDisplayName: string; propertyAddressHint: string; customerLabel: string }

function resolveFillLiteral(valueRaw: string, ctx: FillContext): string {
  const v = valueRaw.trim().replace(/^["']|["']$/g, "").trim()
  const n = normAssistantPhrase(v)
  if (
    n === "my name" ||
    n === "me" ||
    n === "myself" ||
    n === "account name" ||
    n === "the account name" ||
    (n.includes("my name") && n.length < 24)
  ) {
    return ctx.accountDisplayName
  }
  if (n === "today's date" || n === "todays date" || n === "today" || n === "today date") {
    return new Date().toISOString().slice(0, 10)
  }
  if (
    n === "estimate address" ||
    n === "job address" ||
    n === "service address" ||
    n === "from estimate" ||
    n === "the estimate address"
  ) {
    return ctx.propertyAddressHint.trim()
  }
  if (n === "customer name" || n === "client name" || n === "the customer name" || n === "linked customer") {
    return ctx.customerLabel.trim()
  }
  return v
}

type StructuredAssistantPatch = {
  fieldKey?: string
  value?: string
  setCondition?: { subId: string; condition: ConditionRating }
  openMajorSection?: string
  phase?: WizardPhase
  focusSubId?: string
}

/** Typed / voice commands: fill header & findings fields, navigate, open sections, set condition dropdowns. */
function parseStructuredFillAndNavCommands(
  raw: string,
  ctx: FillContext,
  allowStructure: boolean,
): { handled: boolean; summary: string; clearInput: boolean; patch: StructuredAssistantPatch } | null {
  const text = raw.trim()
  if (!text || !allowStructure) return null

  const copyEstimateAddress = /\b(copy|pull|fill|use)\s+(?:the\s+)?(?:estimate|job)\s+address\s+(?:into|to|for)\s+(?:the\s+)?(?:property\s+)?address\b/i.test(raw)
  if (copyEstimateAddress && ctx.propertyAddressHint.trim()) {
    return {
      handled: true,
      summary: "Property address filled from estimate service address.",
      clearInput: true,
      patch: { fieldKey: "header.propertyAddress", value: ctx.propertyAddressHint.trim() },
    }
  }

  const copyCustomerToParties =
    /\b(copy|pull|fill|use)\s+(?:the\s+)?(?:customer|client)\s+name\s+(?:into|to|for)\s+(?:parties\s+present|parties)\b/i.test(raw)
  if (copyCustomerToParties && ctx.customerLabel.trim()) {
    return {
      handled: true,
      summary: 'Parties present filled with customer name from estimate.',
      clearInput: true,
      patch: { fieldKey: "header.partiesPresent", value: ctx.customerLabel.trim() },
    }
  }

  const useMyNameFor = text.match(/\b(?:use|put|apply)\s+my\s+name\s+(?:for|on|in|as)\s+(.+)$/i)
  if (useMyNameFor?.[1] && ctx.accountDisplayName.trim()) {
    const fieldKey = matchHeaderOrSubFieldKey(useMyNameFor[1].trim())
    if (fieldKey?.startsWith("header.")) {
      return {
        handled: true,
        summary: `Set ${fieldKey.replace("header.", "").replaceAll(".", " ")} to your account name.`,
        clearInput: true,
        patch: { fieldKey, value: ctx.accountDisplayName.trim() },
      }
    }
  }

  let fillM = text.match(/^(?:please\s+)?(?:fill\s+in\s+|fill\s+|set\s+|put\s+)(?:the\s+)?(.+?)\s+(?:with)\s+(.+)$/is)
  if (!fillM) {
    fillM = text.match(/^(?:please\s+)?(?:fill\s+in\s+|fill\s+|put\s+)(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  }
  const m = fillM ?? text.match(/^(?:please\s+)?set\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/is)
  if (m?.[1] && m[2]) {
    const left = normAssistantPhrase(m[1])
    if (!left.includes("condition") && !/^condition\b/.test(left)) {
      const fieldKey = matchHeaderOrSubFieldKey(m[1])
      const value = resolveFillLiteral(m[2], ctx)
      if (fieldKey && value) {
        return {
          handled: true,
          summary: `Updated ${fieldKey.startsWith("sub:") ? "findings" : "header"} field.`,
          clearInput: true,
          patch: { fieldKey, value },
        }
      }
    }
  }

  const condM = text.match(/\b(?:set|change)\s+condition\s+(?:for|on)?\s*(.+?)\s+to\s+(.+)$/i)
  if (condM?.[1] && condM[2]) {
    const subId = matchSubsectionIdFromPhrase(condM[1].trim())
    const rating = parseConditionRating(condM[2].trim())
    if (subId && rating) {
      return {
        handled: true,
        summary: `Set findings condition (${subId}) to ${CONDITION_RATING_LABELS[rating]}.`,
        clearInput: true,
        patch: { setCondition: { subId, condition: rating } },
      }
    }
  }

  const openMajor =
    text.match(/\b(?:open|show|expand)\s+(?:the\s+)?(.+?)(?:\s+section|\s+tab)?$/i) ??
    text.match(/\b(?:go\s+to|jump\s+to)\s+(?:the\s+)?(.+?)\s+(?:section|category)\s*$/i)
  if (openMajor?.[1]) {
    const mid = resolveMajorSectionIdFromPhrase(openMajor[1])
    if (mid) {
      return {
        handled: true,
        summary: `Opened ${HOME_INSPECTION_MAJOR_SECTIONS.find((s) => s.id === mid)?.title ?? "findings"} section.`,
        clearInput: true,
        patch: { openMajorSection: mid, phase: "home_findings" as const },
      }
    }
  }

  const goSub = text.match(/\b(?:go\s+to|open|show)\s+(?:subsection\s+)?(.+)$/i)
  if (goSub?.[1]) {
    const rest = goSub[1].trim()
    const restTab = normAssistantPhrase(rest)
    if (
      ["header", "findings", "media", "review", "summary", "scope", "notes", "the header", "the findings"].some(
        (w) => restTab === w || restTab.startsWith(`${w} `),
      )
    ) {
      /* wizard tab navigation handled elsewhere */
    } else if (!/\b(findings|header|media|review)\b/i.test(rest) || rest.length > 14) {
      const subId = matchSubsectionIdFromPhrase(rest)
      if (subId) {
        const majorId = majorIdContainingSubsection(subId)
        return {
          handled: true,
          summary: `Findings → ${HOME_INSPECTION_MAJOR_SECTIONS.flatMap((s) => s.subsections).find((s) => s.id === subId)?.label ?? subId}`,
          clearInput: true,
          patch: { openMajorSection: majorId ?? undefined, phase: "home_findings" as const, focusSubId: subId },
        }
      }
    }
  }

  return null
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
  const { user } = useAuth()
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
  const [assistantListening, setAssistantListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [aiTarget, setAiTarget] = useState<AiTargetField>("scopeLimitations")
  const [voiceFieldKey, setVoiceFieldKey] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [genericFieldMedia, setGenericFieldMedia] = useState<Record<string, FieldMediaItem[]>>({})
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [assignedUserId, setAssignedUserId] = useState<string>("")
  /** False until loadDraftForType finishes — blocks autosave from wiping metadata before hydration. */
  const [draftHydrated, setDraftHydrated] = useState(false)
  /** Ctrl / voice: expand `<details>` for major findings sections. */
  const [findingSectionOpen, setFindingSectionOpen] = useState<Record<string, boolean>>({})
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  /** Snapshot + appended finals + interim (Web Speech fires overlapping interim finals). */
  const voiceSessionBaseRef = useRef("")
  const voiceFinalSuffixRef = useRef("")

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
        } else {
          setAssignedUserId("")
        }
        setDraftHydrated(true)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e))
        setDraftHydrated(false)
      } finally {
        setLoadBusy(false)
      }
    },
    [quoteId, userId, propertyAddressHint],
  )

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

  const persistRegistryAssignmentOnly = useCallback(async () => {
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
      prev[SPECIALTY_REPORT_REGISTRY_KEY] = upsertSpecialtyReportRegistryItem(rows, {
        id: reportId,
        report_type: picked,
        quote_id: quoteId,
        customer_id: customerId,
        assigned_user_id: assignedUserId.trim() || null,
        title:
          existing?.title ??
          (picked === "home_inspection" ? "Structure & property inspection" : SPECIALTY_REPORT_TYPE_LABELS[picked]),
        status: existing?.status === "ready" ? "ready" : "draft",
        updated_at: nowIso,
      })
      const { error: upErr } = await supabase
        .from("quotes")
        .update({ metadata: prev, updated_at: nowIso })
        .eq("id", quoteId)
        .eq("user_id", userId)
      if (upErr) throw upErr
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }, [quoteId, userId, picked, customerId, assignedUserId])

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
      void persistRegistryAssignmentOnly()
    }, 450)
    return () => window.clearTimeout(t)
  }, [assignedUserId, draftHydrated, open, persistRegistryAssignmentOnly, picked, quoteId])

  const varianceAssigneeSelectOptions = useMemo(() => {
    const opts = [...varianceAssigneeOptions]
    const aid = assignedUserId.trim()
    if (aid && !opts.some((o) => o.userId === aid)) {
      opts.unshift({ userId: aid, label: `Saved assignee (${aid.slice(0, 8)}…)` })
    }
    return opts
  }, [varianceAssigneeOptions, assignedUserId])

  const headerLine = useMemo(() => {
    if (picked && picked !== "home_inspection") return SPECIALTY_REPORT_TYPE_LABELS[picked]
    return "Structure & property inspection"
  }, [picked])

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

  /** Apply `Label: value` lines to header or findings fields; return leftover text for other assistant commands. */
  function consumeColonLinesFromAssistantInput(raw: string, fillCtx: FillContext): { applied: number; skipped: number; remainder: string } {
    if (picked !== "home_inspection") {
      return { applied: 0, skipped: 0, remainder: raw }
    }
    const unmatched: string[] = []
    let applied = 0
    let skipped = 0
    const lines = raw
      .split(/\r?\n|;\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const toScan = lines.length ? lines : [raw.trim()].filter(Boolean)
    for (const line of toScan) {
      const colon = line.indexOf(":")
      let left = ""
      let valueRaw = ""
      if (colon > 0) {
        left = line.slice(0, colon).trim()
        valueRaw = line.slice(colon + 1).trim()
      } else {
        const implicit = tryImplicitFieldKeyValue(line)
        if (implicit) {
          left = implicit.left
          valueRaw = implicit.valueRaw
        } else {
          const md = line.match(/^(.+?)\s*[–—]\s*(.+)$/)
          if (!md?.[1] || !md[2]) {
            unmatched.push(line)
            continue
          }
          left = md[1].trim()
          valueRaw = md[2].trim()
        }
      }
      const fieldKey = matchHeaderOrSubFieldKey(left)
      if (!fieldKey) {
        unmatched.push(line)
        continue
      }
      if (fieldKey.startsWith("sub:")) {
        if (phase !== "home_findings" && phase !== "home_review") {
          unmatched.push(line)
          continue
        }
      }
      const value = (resolveFillLiteral(valueRaw, fillCtx) || valueRaw).trim()
      if (!value) {
        unmatched.push(line)
        continue
      }
      const cur = readFieldValue(fieldKey).trim()
      if (cur && cur !== value) {
        skipped += 1
        continue
      }
      writeFieldValue(fieldKey, value)
      applied += 1
      if (fieldKey.startsWith("header.")) {
        setPhase("home_header")
        window.setTimeout(() => document.getElementById(specialtyReportFieldDomId(fieldKey))?.focus?.(), 120)
      }
      if (fieldKey.startsWith("sub:")) {
        const sid = fieldKey.slice(4)
        const maj = majorIdContainingSubsection(sid)
        if (maj) setFindingSectionOpen((prev) => ({ ...prev, [maj]: true }))
        setPhase("home_findings")
        setAiTarget(`sub:${sid}` as AiTargetField)
        window.setTimeout(() => document.getElementById(specialtyReportFieldDomId(fieldKey))?.focus?.(), 120)
      }
    }
    return { applied, skipped, remainder: unmatched.join("\n") }
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
      prev[SPECIALTY_REPORT_REGISTRY_KEY] = upsertSpecialtyReportRegistryItem(rows, {
        id: reportId,
        report_type: picked,
        quote_id: quoteId,
        customer_id: customerId,
        assigned_user_id: assignedUserId || null,
        title:
          existingRow?.title ??
          (picked === "home_inspection" ? "Structure & property inspection" : SPECIALTY_REPORT_TYPE_LABELS[picked]),
        status: existingRow?.status === "ready" ? "ready" : "draft",
        updated_at: nowIso,
      })
      const { error: upErr } = await supabase!.from("quotes").update({ metadata: prev, updated_at: nowIso }).eq("id", quoteId).eq("user_id", userId)
      if (upErr) throw upErr
      setSaveNote("Report saved.")
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  function runAssistantCommand(raw: string) {
    let text = raw.trim()
    if (!text) return
    const fillCtx: FillContext = {
      accountDisplayName,
      propertyAddressHint: propertyAddressHint ?? "",
      customerLabel: customerLabel ?? "",
    }
    if (picked === "home_inspection" && !/\btradesman\s+record\b/i.test(raw)) {
      let { applied, skipped, remainder } = consumeColonLinesFromAssistantInput(raw, fillCtx)
      const tail0 = remainder.trim()
      if (tail0 && !tail0.includes("\n") && tail0.includes(":")) {
        const expanded = tail0.replace(/\.\s+(?=\S[\s\S]{0,120}:)/g, ".\n")
        if (expanded !== tail0) {
          const sec = consumeColonLinesFromAssistantInput(expanded, fillCtx)
          applied += sec.applied
          skipped += sec.skipped
          remainder = sec.remainder
        }
      }
      if (applied > 0 || skipped > 0) {
        let colonNote = ""
        if (applied > 0 && skipped > 0) {
          colonNote = `Filled ${applied} empty field(s) from Label: value lines. Skipped ${skipped} that already had text.`
        } else if (applied > 0) {
          colonNote = `Filled ${applied} field(s) from Label: value lines.`
        } else {
          colonNote = `${skipped} line(s) matched known fields but those fields already had text — clear a field to replace, or use a different label.`
        }
        setAssistantNote(colonNote)
      }
      const tail = remainder.trim()
      if (applied > 0 && !tail) {
        setAssistantText("")
        return
      }
      text = tail || text
    }
    if (!text.trim()) return
    const structured = parseStructuredFillAndNavCommands(text, fillCtx, picked === "home_inspection")
    if (structured?.handled && structured.patch) {
      const p = structured.patch
      if (p.phase) setPhase(p.phase)
      if (p.openMajorSection)
        setFindingSectionOpen((prev) => ({
          ...prev,
          [p.openMajorSection!]: true,
        }))
      if (p.fieldKey && p.value != null && String(p.value).length > 0) {
        writeFieldValue(p.fieldKey, String(p.value))
        if (p.fieldKey.startsWith("header.")) setPhase("home_header")
        if (p.fieldKey.startsWith("sub:")) {
          const sid = p.fieldKey.slice(4)
          const maj = majorIdContainingSubsection(sid)
          if (maj) setFindingSectionOpen((prev) => ({ ...prev, [maj]: true }))
          setPhase("home_findings")
          setAiTarget(`sub:${sid}` as AiTargetField)
        }
        window.setTimeout(() => {
          document.getElementById(specialtyReportFieldDomId(p.fieldKey!))?.focus?.()
        }, 200)
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
        setAiTarget(`sub:${subId}` as AiTargetField)
        window.setTimeout(() => {
          document.getElementById(specialtyReportFieldDomId(`cond:sub:${subId}`))?.focus?.()
        }, 200)
      }
      if (p.focusSubId && !p.fieldKey && !p.setCondition) {
        const maj = majorIdContainingSubsection(p.focusSubId)
        if (maj) setFindingSectionOpen((prev) => ({ ...prev, [maj]: true }))
        setPhase("home_findings")
        setAiTarget(`sub:${p.focusSubId}` as AiTargetField)
        window.setTimeout(() => {
          document.getElementById(specialtyReportFieldDomId(`sub:${p.focusSubId}`))?.focus?.()
        }, 220)
      }
      setAssistantNote(structured.summary)
      if (structured.clearInput) setAssistantText("")
      return
    }
    const lower = text.toLowerCase()
    if (/\btradesman\s+record\b/i.test(lower)) {
      const wakeParsed = parseTradesmanRecordIntent(raw)
      if (wakeParsed.consumed) {
        if (wakeParsed.hint) {
          setAssistantNote(wakeParsed.hint)
          return
        }
        let chunk = (wakeParsed.body ?? "").trim()
        if (!wakeParsed.target && picked === "home_inspection" && chunk) {
          const { applied: wApplied, skipped: wSkip, remainder: wRem } = consumeColonLinesFromAssistantInput(chunk, fillCtx)
          if (wApplied > 0 || wSkip > 0) {
            setAssistantNote(
              wApplied > 0
                ? `Recorded ${wApplied} field(s) from your note${wSkip ? ` (${wSkip} skipped — fields already had text).` : "."}`
                : `${wSkip} line(s) skipped — fields already had text.`,
            )
            if (wApplied > 0 && !wRem.trim()) {
              setAssistantText("")
              return
            }
          }
          chunk = wRem.trim()
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
        setAssistantText("")
        return
      }
    }
    const command = lower
    if (command === "next" || command === "next step") {
      goNextPhase()
      setAssistantNote("Moved to the next step.")
      return
    }
    if (command === "back" || command === "previous" || command === "prev") {
      goBackPhase()
      setAssistantNote("Moved to the previous step.")
      return
    }
    if (command.includes("go to findings")) {
      setPhase("home_findings")
      setAssistantNote("Opened findings.")
      return
    }
    if (command.includes("go to header")) {
      setPhase("home_header")
      setAssistantNote("Opened header & scope.")
      return
    }
    if (command.includes("go to media")) {
      setPhase("home_media")
      setAssistantNote("Opened media / integrations.")
      return
    }
    if (command.includes("go to review") || command.includes("go to summary")) {
      setPhase("home_review")
      setAssistantNote("Opened review & summary.")
      return
    }
    if (command.includes("go to scope")) {
      setPhase("home_header")
      setAssistantNote("Opened header & scope.")
      return
    }
    appendToTarget(aiTarget, text)
    setAssistantNote("Added text into the selected report field.")
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
      voiceSessionBaseRef.current = targetFieldKey ? readFieldValue(targetFieldKey) : assistantText
      voiceFinalSuffixRef.current = ""
      const rec = new Ctor()
      recognitionRef.current = rec
      rec.continuous = true
      rec.interimResults = true
      rec.lang = "en-US"
      rec.onresult = (ev: SpeechRecognitionEvent) => {
        const ri = typeof ev.resultIndex === "number" ? ev.resultIndex : 0
        for (let i = ri; i < ev.results.length; i += 1) {
          const item = ev.results[i]
          const piece = item?.[0]?.transcript
          if (!piece) continue
          if (item.isFinal) {
            voiceFinalSuffixRef.current += piece
          }
        }
        let interim = ""
        for (let i = ri; i < ev.results.length; i += 1) {
          const item = ev.results[i]
          const piece = item?.[0]?.transcript
          if (!piece || item.isFinal) continue
          interim += piece
        }
        const display = `${voiceSessionBaseRef.current}${voiceFinalSuffixRef.current}${interim}`
        if (targetFieldKey) {
          writeFieldValue(targetFieldKey, display)
          setSaveNote("Voice text added to field.")
        } else {
          setAssistantText(display)
        }
      }
      rec.onerror = () => setAssistantNote("Voice input failed. Check mic permissions and retry.")
      rec.onend = () => {
        setAssistantListening(false)
        setVoiceFieldKey(null)
      }
      rec.start()
      setAssistantListening(true)
      setVoiceFieldKey(targetFieldKey ?? null)
      setAssistantNote(
        "Listening… Commands: fill inspector name with my name · copy estimate address to property address · set condition for gutters to satisfactory · open electrical section · go to roof covering. Or “Tradesman record” + scope / summary / a findings label.",
      )
    } catch {
      setAssistantListening(false)
      setAssistantNote("Could not start voice dictation.")
    }
  }

  function stopDictation() {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    voiceSessionBaseRef.current = ""
    voiceFinalSuffixRef.current = ""
    setAssistantListening(false)
    setVoiceFieldKey(null)
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
                onChange={(e) => setAssistantText(e.target.value)}
                placeholder='Example: Tradesman record summary Customer wants flashing replaced. Also: next step, go to findings.'
                style={{ ...theme.formInput, resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => runAssistantCommand(assistantText)} style={primaryBtn}>
                  Apply assistant input
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
                                style={{ ...theme.formInput, minWidth: 200 }}
                              >
                                {(Object.keys(CONDITION_RATING_LABELS) as ConditionRating[]).map((c) => (
                                  <option key={c} value={c}>
                                    {CONDITION_RATING_LABELS[c]}
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
