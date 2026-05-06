import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
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
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  /** Snapshot + appended finals + interim (Web Speech fires overlapping interim finals). */
  const voiceSessionBaseRef = useRef("")
  const voiceFinalSuffixRef = useRef("")

  const loadDraftForType = useCallback(
    async (reportType: SpecialtyReportTypeKey | null) => {
      if (!quoteId || !supabase || !userId) return
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
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e))
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
    if (!open || !quoteId || phase === "pick_type" || picked !== "home_inspection") return
    const t = window.setTimeout(() => {
      const snap = { ...home, updatedAt: new Date().toISOString() }
      void persistMetadata({ [META_KEY_HOME]: snap }).catch((e) => setSaveError(e instanceof Error ? e.message : String(e)))
    }, 700)
    return () => window.clearTimeout(t)
  }, [home, open, quoteId, phase, picked, persistMetadata])

  useEffect(() => {
    if (!open || !quoteId || picked == null || picked === "home_inspection") return
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
  }, [genericNotes, genericFieldMedia, open, quoteId, picked, phase, persistMetadata])

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
    }
  }, [phase, enabledReportTypes.length])

  const setDefaultTargetForPhase = useCallback((nextPhase: WizardPhase) => {
    if (nextPhase === "home_header") setAiTarget("scopeLimitations")
    else if (nextPhase === "home_media") setAiTarget("mediaWorkflowNotes")
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
      prev[SPECIALTY_REPORT_REGISTRY_KEY] = upsertSpecialtyReportRegistryItem(rows, {
        id: reportId,
        report_type: picked,
        quote_id: quoteId,
        customer_id: customerId,
        assigned_user_id: assignedUserId || null,
        title: picked === "home_inspection" ? "Structure & property inspection" : SPECIALTY_REPORT_TYPE_LABELS[picked],
        status: "draft",
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
    const text = raw.trim()
    if (!text) return
    const lower = text.toLowerCase()
    if (/\btradesman\s+record\b/i.test(lower)) {
      const wakeParsed = parseTradesmanRecordIntent(raw)
      if (wakeParsed.consumed) {
        if (wakeParsed.hint) {
          setAssistantNote(wakeParsed.hint)
          return
        }
        const tgt = wakeParsed.target ?? aiTarget
        if (wakeParsed.target) setAiTarget(wakeParsed.target)
        const chunk = (wakeParsed.body ?? "").trim()
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
    if (command.includes("go to review")) {
      setPhase("home_review")
      setAssistantNote("Opened review & summary.")
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
        "Listening… Say “Tradesman record” plus scope / summary / media / a findings label, then your note. Or use navigation: next step, go to findings.",
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
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {quoteId && varianceAssigneeOptions.length > 0 ? (
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
                {varianceAssigneeOptions.map((opt) => (
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
            <p style={{ margin: "8px 0 10px", fontSize: 12, color: "#7c2d12", lineHeight: 1.5 }}>
              Voice keeps adding text (no more single-line overwrite). Say <strong>Tradesman record</strong> then a section (scope, summary, media, drone, generic, or a findings label like “roof covering”) and your note — or pick the field first and apply.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <select value={aiTarget} onChange={(e) => setAiTarget(e.target.value as AiTargetField)} style={{ ...theme.formInput, maxWidth: 360 }}>
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
                      value={home.header.inspectorName}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, inspectorName: e.target.value } }))}
                      style={theme.formInput}
                    />
                    <FieldTools fieldKey="header.inspectorName" />
                  </label>
                  <label style={lbl}>
                    License / cert ID
                    <input
                      value={home.header.licenseId}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, licenseId: e.target.value } }))}
                      style={theme.formInput}
                    />
                    <FieldTools fieldKey="header.licenseId" />
                  </label>
                  <label style={lbl}>
                    Inspection date
                    <input
                      type="date"
                      value={home.header.inspectionDate}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, inspectionDate: e.target.value } }))}
                      style={theme.formInput}
                    />
                    <FieldTools fieldKey="header.inspectionDate" />
                  </label>
                  <label style={lbl}>
                    Weather / site conditions
                    <input
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
                    value={home.header.propertyAddress}
                    onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, propertyAddress: e.target.value } }))}
                    style={theme.formInput}
                  />
                  <FieldTools fieldKey="header.propertyAddress" />
                </label>
                <label style={lbl}>
                  Parties present
                  <input
                    value={home.header.partiesPresent}
                    onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, partiesPresent: e.target.value } }))}
                    style={theme.formInput}
                  />
                  <FieldTools fieldKey="header.partiesPresent" />
                </label>
                <label style={lbl}>
                  Scope &amp; limitations (editable boilerplate)
                  <textarea
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
