import { useEffect, useState, useMemo, Fragment } from "react"
import { supabase, supabaseAnonKey, supabaseUrl } from "../../lib/supabase"
import { usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import PortalSettingItemsForm from "../../components/PortalSettingItemsForm"
import {
  getLeadsSettingsItemsForUser,
  getCustomActionButtonsForUser,
  getControlItemsForUser,
  getPageActionVisible,
  isPortalSettingDependencyVisible,
} from "../../types/portal-builder"
import { VoicemailRecordingBlock, VoicemailTranscriptBlock } from "../../components/VoicemailEventBlock"
import AttachmentStrip, { type AttachmentStripItem } from "../../components/AttachmentStrip"
import { loadAttachmentsByCommunicationEventIds } from "../../lib/communicationAttachments"
import type { PortalSettingItem } from "../../types/portal-builder"
import { useIsMobile } from "../../hooks/useIsMobile"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedAiAutomationsEnabled } from "../../hooks/useScopedAiAutomationsEnabled"
import { useLocale } from "../../i18n/LocaleContext"
import TabNotificationAlertsButton from "../../components/TabNotificationAlertsButton"
import CustomerCallButton from "../../components/CustomerCallButton"
import AiConsumerReplyApprovalCard from "../../components/AiConsumerReplyApprovalCard"
import { PENDING_AI_CONSUMER_REPLY_KEY, parsePendingAiConsumerReply } from "../../types/aiOutboundApproval"

type CustomerIdentifier = { type: string; value: string; is_primary: boolean }
type CustomerRow = { display_name: string | null; customer_identifiers: CustomerIdentifier[] | null }
const LEAD_STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Lost"] as const

type LeadFit = "hot" | "maybe" | "bad" | null

type LeadRow = {
  id: string
  title: string | null
  created_at?: string
  updated_at?: string | null
  description?: string | null
  status?: string | null
  customers: CustomerRow | null
  fit_classification?: LeadFit
  fit_confidence?: number | null
  fit_reason?: string | null
  fit_source?: string | null
  fit_manually_overridden?: boolean | null
  fit_evaluated_at?: string | null
}

type LeadsPageProps = { setPage?: (page: string) => void }

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

function formatAppError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>
    const msg = typeof o.message === "string" ? o.message : ""
    const details = typeof o.details === "string" ? o.details : ""
    const hint = typeof o.hint === "string" ? o.hint : ""
    const parts = [msg, details, hint].filter(Boolean)
    if (parts.length) return parts.join(" — ")
  }
  return String(err)
}

/** Lets /api/platform-tools validate the JWT when server env omits Supabase URL/anon (e.g. Vercel). */
function platformToolsJsonBody(payload: Record<string, unknown>): string {
  const url = supabaseUrl.trim() || String(import.meta.env.VITE_SUPABASE_URL ?? "").trim()
  const anon = supabaseAnonKey.trim() || String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim()
  return JSON.stringify({
    ...payload,
    ...(url ? { supabaseUrl: url } : {}),
    ...(anon ? { supabaseAnonKey: anon } : {}),
  })
}

function mergeLeadsSettingsFormDefaults(
  items: PortalSettingItem[],
  saved: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const item of items) {
    const s = saved[item.id]
    if (item.type === "checkbox") {
      out[item.id] = s === "checked" || s === "unchecked" ? s : item.defaultChecked ? "checked" : "unchecked"
    } else if (item.type === "dropdown" && item.options?.length) {
      out[item.id] = s && item.options.includes(s) ? s : item.options[0]
    } else {
      out[item.id] = s ?? ""
    }
  }
  return out
}

export default function LeadsPage({ setPage }: LeadsPageProps) {
  const userId = useScopedUserId()
  const { session } = useAuth()
  const { t } = useLocale()
  const portalConfig = usePortalConfigForPage()
  const isMobile = useIsMobile()
  const [showForm, setShowForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [leadCommEvents, setLeadCommEvents] = useState<any[]>([])
  const [leadAttachmentsByEvent, setLeadAttachmentsByEvent] = useState<Record<string, AttachmentStripItem[]>>({})
  const [voicemailProfileDisplay, setVoicemailProfileDisplay] = useState<string>("use_channel")
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")
  const [leadsProfileSettings, setLeadsProfileSettings] = useState<Record<string, string>>({})
  /** Profile columns for embed form (not stored in metadata.leadsSettingsValues). */
  const [leadEmbedProfile, setLeadEmbedProfile] = useState<{ enabled: boolean; slug: string } | null>(null)
  const [detailEditMode, setDetailEditMode] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailForm, setDetailForm] = useState({
    customerName: "",
    phone: "",
    email: "",
    title: "",
    description: "",
    status: "New",
  })
  const [leadReplySms, setLeadReplySms] = useState("")
  const [leadSmsSending, setLeadSmsSending] = useState(false)
  const [leadEmailTo, setLeadEmailTo] = useState("")
  const [leadEmailSubject, setLeadEmailSubject] = useState("")
  const [leadEmailBody, setLeadEmailBody] = useState("")
  const [leadEmailSending, setLeadEmailSending] = useState(false)
  const [leadAiBusy, setLeadAiBusy] = useState(false)
  const [leadSoftWarnings, setLeadSoftWarnings] = useState<string[]>([])
  const [leadPendingAiBusy, setLeadPendingAiBusy] = useState(false)
  const [showLeadFilterPrefs, setShowLeadFilterPrefs] = useState(false)
  const [leadFilterSaveBusy, setLeadFilterSaveBusy] = useState(false)
  const [leadFilterPrefs, setLeadFilterPrefs] = useState({
    accepted_job_types: "",
    minimum_job_size: "",
    service_radius_miles: "",
    use_account_service_radius: true,
    availability: "flexible" as "asap" | "flexible",
    enable_auto_filter: false,
    use_ai_for_unclear: true,
  })
  const [leadFitLogs, setLeadFitLogs] = useState<
    { id: string; action_type: string; action_summary: string | null; metadata: unknown; created_at: string }[]
  >([])
  const [fitOverrideBusy, setFitOverrideBusy] = useState(false)
  const [fitReRunBusy, setFitReRunBusy] = useState(false)
  const [manualFitChoice, setManualFitChoice] = useState<"hot" | "maybe" | "bad" | "">("")
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(userId)

  const leadsSettingsItems = useMemo(
    () => getLeadsSettingsItemsForUser(portalConfig, { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const conversationPortalDefaults = useMemo(() => {
    const items = getControlItemsForUser(portalConfig, "conversations", "conversation_settings", { aiAutomationsEnabled })
    const out: Record<string, string> = {}
    for (const item of items) {
      if (item.type === "checkbox") out[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) out[item.id] = item.options[0]
    }
    return out
  }, [portalConfig, aiAutomationsEnabled])
  const customActionButtons = useMemo(() => getCustomActionButtonsForUser(portalConfig, "leads"), [portalConfig])
  const createLeadPortalItems = useMemo(
    () => getControlItemsForUser(portalConfig, "leads", "create_lead", { aiAutomationsEnabled }),
    [portalConfig, aiAutomationsEnabled],
  )
  const [createLeadPortalValues, setCreateLeadPortalValues] = useState<Record<string, string>>({})
  const showCreateLead = getPageActionVisible(portalConfig, "leads", "create_lead")

  useEffect(() => {
    if (!showForm) return
    if (createLeadPortalItems.length === 0) {
      setCreateLeadPortalValues({})
      return
    }
    const next: Record<string, string> = {}
    for (const item of createLeadPortalItems) {
      try {
        const s = localStorage.getItem(`leads_create_${item.id}`)
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
    setCreateLeadPortalValues(next)
  }, [showForm, createLeadPortalItems])

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("metadata, embed_lead_enabled, embed_lead_slug")
        .eq("id", userId)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) return
      const row = data as { embed_lead_enabled?: boolean; embed_lead_slug?: string | null; metadata?: unknown }
      setLeadEmbedProfile({
        enabled: row.embed_lead_enabled === true,
        slug: String(row.embed_lead_slug ?? "").trim(),
      })
      const meta = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? (row.metadata as Record<string, unknown>) : {}
      const raw = meta.leadsSettingsValues
      const saved =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? Object.fromEntries(
              Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]),
            )
          : {}
      delete saved.embed_lead_enabled
      delete saved.embed_lead_slug
      setLeadsProfileSettings(saved)

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
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!showSettings || leadsSettingsItems.length === 0) return
    const base = mergeLeadsSettingsFormDefaults(leadsSettingsItems, leadsProfileSettings)
    if (leadEmbedProfile) {
      base.embed_lead_enabled = leadEmbedProfile.enabled ? "checked" : "unchecked"
      base.embed_lead_slug = leadEmbedProfile.slug
    }
    setSettingsFormValues(base)
  }, [showSettings, leadsSettingsItems, leadsProfileSettings, leadEmbedProfile])

  function setSettingValue(itemId: string, value: string) {
    setSettingsFormValues((prev) => ({ ...prev, [itemId]: value }))
  }

  function isSettingItemVisible(item: PortalSettingItem, items: PortalSettingItem[], formValues: Record<string, string>): boolean {
    return isPortalSettingDependencyVisible(item, items, formValues)
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

  // New lead form state
  const [customerName, setCustomerName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [leadTitle, setLeadTitle] = useState("")
  const [leadDescription, setLeadDescription] = useState("")
  const [initialMessage, setInitialMessage] = useState("")

  async function loadLeads() {
    if (!userId || !supabase) {
      if (!supabase) console.error("Supabase not configured. Add .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }
    const selectFull =
      "id, title, description, status, created_at, updated_at, customer_id, user_id, converted_at, removed_at, fit_classification, fit_confidence, fit_reason, fit_source, fit_manually_overridden, fit_evaluated_at"
    const selectMinimal =
      "id, title, description, created_at, customer_id, fit_classification, fit_confidence, fit_reason, fit_source, fit_manually_overridden, fit_evaluated_at"
    const resFull = await supabase.from("leads").select(selectFull).order("created_at", { ascending: false })
    let rawData: any[] = []
    if (resFull.error) {
      const resMin = await supabase.from("leads").select(selectMinimal).order("created_at", { ascending: false })
      if (resMin.error) {
        console.error("loadLeads error:", resMin.error.message)
        setLeads([])
        return
      }
      rawData = resMin.data || []
    } else {
      rawData = resFull.data || []
    }

    const raw = rawData as any[]
    const rows = raw
      .filter((r) => {
        if (r.user_id != null && r.user_id !== userId) return false
        if (r.converted_at != null) return false
        if (r.removed_at != null) return false
        return true
      })
      .map((r) => ({
        ...r,
        user_id: r.user_id ?? null,
        converted_at: r.converted_at ?? null,
        removed_at: r.removed_at ?? null,
        customers: r.customers ?? { display_name: null, customer_identifiers: null },
      }))

    const customerIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))]
    if (customerIds.length > 0) {
      const { data: custData } = await supabase
        .from("customers")
        .select("id, display_name, customer_identifiers(type, value, is_primary)")
        .in("id", customerIds)
      const custMap = new Map((custData || []).map((c: any) => [c.id, c]))
      rows.forEach((r: any) => {
        if (r.customer_id && custMap.has(r.customer_id)) r.customers = custMap.get(r.customer_id)
      })
    }

    setLeads(rows)
  }

  function leadFitBadgeEl(fit: LeadFit) {
    if (!fit) return <span style={{ color: "#6b7280", fontSize: 12 }}>—</span>
    const colors: Record<string, { bg: string; fg: string; b: string }> = {
      hot: { bg: "#fef2f2", fg: "#b91c1c", b: "#fecaca" },
      maybe: { bg: "#fffbeb", fg: "#b45309", b: "#fde68a" },
      bad: { bg: "#f3f4f6", fg: "#374151", b: "#d1d5db" },
    }
    const c = colors[fit] ?? colors.bad
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "3px 8px",
          borderRadius: 999,
          background: c.bg,
          color: c.fg,
          border: `1px solid ${c.b}`,
          textTransform: "capitalize",
          whiteSpace: "nowrap",
        }}
      >
        {fit}
      </span>
    )
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

  async function applyManualFitOverride() {
    if (!supabase || !userId || !selectedLead?.id || !manualFitChoice) return
    setFitOverrideBusy(true)
    try {
      const now = new Date().toISOString()
      const { error: uErr } = await supabase
        .from("leads")
        .update({
          fit_classification: manualFitChoice,
          fit_confidence: null,
          fit_reason: "Updated manually from the Leads screen.",
          fit_source: "manual",
          fit_manually_overridden: true,
          fit_evaluated_at: now,
        })
        .eq("id", selectedLead.id)
        .eq("user_id", userId)
      if (uErr) {
        alert(uErr.message)
        return
      }
      const { error: lErr } = await supabase.from("lead_automation_logs").insert({
        lead_id: selectedLead.id,
        user_id: userId,
        action_type: "lead_fit_manual_override",
        action_summary: `Set fit to ${manualFitChoice}`,
        metadata: {},
      })
      if (lErr) console.warn(lErr)
      setSelectedLead((prev: any) =>
        prev
          ? {
              ...prev,
              fit_classification: manualFitChoice,
              fit_reason: "Updated manually from the Leads screen.",
              fit_source: "manual",
              fit_manually_overridden: true,
              fit_evaluated_at: now,
            }
          : null,
      )
      loadLeads()
      void openLead(selectedLead.id)
    } finally {
      setFitOverrideBusy(false)
    }
  }

  async function reRunLeadFit() {
    if (!session?.access_token || !selectedLead?.id) return
    setFitReRunBusy(true)
    try {
      const res = await fetch("/api/platform-tools?__route=lead-evaluate-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: platformToolsJsonBody({ leadId: selectedLead.id, force: true }),
      })
      const raw = await res.text()
      if (!res.ok) {
        alert(formatFetchApiError(res, raw))
        return
      }
      void openLead(selectedLead.id)
      loadLeads()
    } finally {
      setFitReRunBusy(false)
    }
  }

  useEffect(() => {
    loadLeads()
  }, [userId])

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

  function toggleLeadRow(leadId: string) {
    if (selectedLeadId === leadId) {
      setSelectedLeadId(null)
      setSelectedLead(null)
      setMessages([])
      setLeadCommEvents([])
      setLeadAttachmentsByEvent({})
      setDetailEditMode(false)
      setLeadSoftWarnings([])
      setLeadFitLogs([])
      setManualFitChoice("")
    } else {
      void openLead(leadId)
    }
  }

  async function persistLeadsSettingsAndClose() {
    if (!supabase || !userId) {
      setShowSettings(false)
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
    const { embed_lead_enabled: _ee, embed_lead_slug: _es, ...valuesForMeta } = settingsFormValues
    prevMeta.leadsSettingsValues = { ...valuesForMeta }
    const slugClean = String(settingsFormValues.embed_lead_slug ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 64)
    const { error } = await supabase
      .from("profiles")
      .update({
        metadata: prevMeta,
        embed_lead_enabled: settingsFormValues.embed_lead_enabled === "checked",
        embed_lead_slug: slugClean || null,
      })
      .eq("id", userId)
    if (error) {
      alert(error.message)
      return
    }
    const nextMeta = { ...valuesForMeta }
    setLeadsProfileSettings(nextMeta)
    setLeadEmbedProfile({
      enabled: settingsFormValues.embed_lead_enabled === "checked",
      slug: slugClean,
    })
    setShowSettings(false)
  }

  function applyDetailFormFromLeadRow(data: any) {
    const idents: CustomerIdentifier[] = Array.isArray(data.customers?.customer_identifiers) ? data.customers.customer_identifiers : []
    const phone = idents.find((i) => i.type === "phone")?.value ?? ""
    const email = idents.find((i) => i.type === "email")?.value ?? ""
    const st = String(data.status ?? "").trim() || "New"
    setDetailForm({
      customerName: data.customers?.display_name ?? "",
      phone,
      email,
      title: data.title ?? "",
      description: data.description ?? "",
      status: st,
    })
    setLeadEmailTo(email)
    setLeadEmailSubject(data.title?.trim() ? `Re: ${String(data.title).trim()}` : "Re: Your request")
    setLeadEmailBody("")
    setLeadReplySms("")
    setDetailEditMode(false)
    setLeadSoftWarnings([])
  }

  async function saveLeadDetail() {
    if (!supabase || !userId || !selectedLead?.id || !selectedLead.customer_id) return
    setDetailSaving(true)
    try {
      const cid = selectedLead.customer_id as string
      const phoneT = detailForm.phone.trim()
      const emailT = detailForm.email.trim().toLowerCase()
      const nameT = detailForm.customerName.trim()

      const { error: custErr } = await supabase
        .from("customers")
        .update({ display_name: nameT || null })
        .eq("id", cid)
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

      const nowIso = new Date().toISOString()
      const leadUp: Record<string, unknown> = {
        title: detailForm.title.trim() || "New Lead",
        description: detailForm.description.trim() || null,
        status: detailForm.status,
        updated_at: nowIso,
      }
      const { error: leadErr } = await supabase.from("leads").update(leadUp).eq("id", selectedLead.id).eq("user_id", userId)
      if (leadErr) {
        const { error: fbErr } = await supabase
          .from("leads")
          .update({
            title: detailForm.title.trim() || "New Lead",
            description: detailForm.description.trim() || null,
          })
          .eq("id", selectedLead.id)
          .eq("user_id", userId)
        if (fbErr) throw leadErr
      }

      await openLead(selectedLead.id)
      await loadLeads()
      setDetailEditMode(false)
    } catch (err) {
      alert(formatAppError(err))
    } finally {
      setDetailSaving(false)
    }
  }

  async function sendLeadSms() {
    if (!userId || !selectedLead?.id || !selectedLead.customer_id) return
    const trimmed = leadReplySms.trim()
    const to =
      detailForm.phone.trim() ||
      (selectedLead.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value?.trim?.() ?? "")
    if (!trimmed) {
      alert("Enter a message to send.")
      return
    }
    if (!to) {
      alert("Add a phone number on this lead before sending SMS.")
      return
    }
    setLeadSmsSending(true)
    try {
      const response = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          body: trimmed,
          userId,
          leadId: selectedLead.id,
          customerId: selectedLead.customer_id,
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      setLeadReplySms("")
      await openLead(selectedLead.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setLeadSmsSending(false)
    }
  }

  async function sendLeadEmail() {
    if (!userId || !selectedLead?.id || !selectedLead.customer_id) return
    const to = leadEmailTo.trim()
    const subject = leadEmailSubject.trim()
    const body = leadEmailBody.trim()
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
    setLeadEmailSending(true)
    try {
      const response = await fetch("/api/outbound-messages?__channel=email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body,
          userId,
          leadId: selectedLead.id,
          customerId: selectedLead.customer_id,
        }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      setLeadEmailBody("")
      await openLead(selectedLead.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setLeadEmailSending(false)
    }
  }

  const pendingLeadAiReply = useMemo(
    () => parsePendingAiConsumerReply(selectedLead?.metadata?.[PENDING_AI_CONSUMER_REPLY_KEY]),
    [selectedLead?.metadata, selectedLead?.id],
  )

  async function mergeLeadMetadata(
    leadId: string,
    mutator: (prev: Record<string, unknown>) => Record<string, unknown>,
  ) {
    if (!supabase || !userId) return
    const { data: row } = await supabase.from("leads").select("metadata").eq("id", leadId).eq("user_id", userId).maybeSingle()
    const prev =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    const next = mutator(prev)
    const { error } = await supabase.from("leads").update({ metadata: next }).eq("id", leadId).eq("user_id", userId)
    if (error) throw error
    setSelectedLead((L: any) => (L && L.id === leadId ? { ...L, metadata: next } : L))
  }

  async function approveLeadPendingAi(finalBody: string) {
    if (!userId || !selectedLead?.id || !selectedLead.customer_id || !pendingLeadAiReply) return
    setLeadPendingAiBusy(true)
    try {
      if (pendingLeadAiReply.channel === "sms") {
        const response = await fetch("/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: pendingLeadAiReply.to,
            body: finalBody,
            userId,
            leadId: selectedLead.id,
            customerId: selectedLead.customer_id,
          }),
        })
        const raw = await response.text()
        if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      } else {
        const subj = pendingLeadAiReply.subject?.trim() || "Message from us"
        const response = await fetch("/api/outbound-messages?__channel=email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: pendingLeadAiReply.to,
            subject: subj,
            body: finalBody,
            userId,
            leadId: selectedLead.id,
            customerId: selectedLead.customer_id,
          }),
        })
        const raw = await response.text()
        if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      }
      await mergeLeadMetadata(selectedLead.id, (prev) => {
        const n = { ...prev }
        delete n[PENDING_AI_CONSUMER_REPLY_KEY]
        return n
      })
      await openLead(selectedLead.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setLeadPendingAiBusy(false)
    }
  }

  async function retryLeadPendingAi() {
    if (!selectedLead?.id || !session?.access_token) {
      alert("Sign in to regenerate this draft.")
      return
    }
    setLeadPendingAiBusy(true)
    try {
      const response = await fetch("/api/platform-tools?__route=ai-regenerate-lead-consumer-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: platformToolsJsonBody({ leadId: selectedLead.id }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      const j = JSON.parse(raw) as { body?: string }
      const newBody = typeof j.body === "string" ? j.body.trim() : ""
      if (!newBody) throw new Error("No draft text returned.")
      await mergeLeadMetadata(selectedLead.id, (prev) => {
        const cur = parsePendingAiConsumerReply(prev[PENDING_AI_CONSUMER_REPLY_KEY])
        if (!cur) return prev
        return {
          ...prev,
          [PENDING_AI_CONSUMER_REPLY_KEY]: {
            ...cur,
            body: newBody.slice(0, cur.channel === "email" ? 12000 : 1500),
          },
        }
      })
      await openLead(selectedLead.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setLeadPendingAiBusy(false)
    }
  }

  async function dismissLeadPendingAi() {
    if (!selectedLead?.id) return
    setLeadPendingAiBusy(true)
    try {
      await mergeLeadMetadata(selectedLead.id, (prev) => {
        const n = { ...prev }
        delete n[PENDING_AI_CONSUMER_REPLY_KEY]
        return n
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setLeadPendingAiBusy(false)
    }
  }

  async function runLeadAiAssist() {
    if (!selectedLead?.id || !session?.access_token) {
      alert("Sign in and enable Allow AI automations under My T (Account).")
      return
    }
    setLeadAiBusy(true)
    setLeadSoftWarnings([])
    try {
      const response = await fetch("/api/platform-tools?__route=ai-lead-assist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: platformToolsJsonBody({ leadId: selectedLead.id }),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(formatFetchApiError(response, raw))
      const j = JSON.parse(raw) as {
        suggestedTitle?: string
        suggestedDescription?: string
        suggestedStatus?: string
        suggestedCustomerName?: string
        suggestedPhone?: string
        suggestedEmail?: string
        softWarnings?: string[]
      }
      setDetailForm((prev) => ({
        ...prev,
        title: j.suggestedTitle ?? prev.title,
        description: j.suggestedDescription ?? prev.description,
        status:
          j.suggestedStatus && (LEAD_STATUS_OPTIONS as readonly string[]).includes(j.suggestedStatus)
            ? j.suggestedStatus
            : prev.status,
        customerName: j.suggestedCustomerName?.trim() ? j.suggestedCustomerName : prev.customerName,
        phone: j.suggestedPhone?.trim() ? j.suggestedPhone : prev.phone,
        email: j.suggestedEmail?.trim() ? j.suggestedEmail : prev.email,
      }))
      if (Array.isArray(j.softWarnings) && j.softWarnings.length) setLeadSoftWarnings(j.softWarnings.map((s) => String(s)))
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setLeadAiBusy(false)
    }
  }

  async function moveLeadToConversations() {
    if (!supabase || !selectedLead?.id) return
    const customerId = selectedLead.customer_id ?? selectedLead.customers?.id
    if (!customerId) {
      alert("No customer linked to this lead.")
      return
    }
    const { data: existingConvo } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!existingConvo?.id) {
      const { error: convoErr } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          customer_id: customerId,
          channel: "sms",
          status: "open",
        })
      if (convoErr) {
        alert("Could not create conversation: " + convoErr.message)
        return
      }
    }
    const { error } = await supabase
      .from("leads")
      .update({ converted_at: new Date().toISOString() })
      .eq("id", selectedLead.id)
      .eq("user_id", userId)
    if (error) {
      alert("Lead moved to Conversations but could not mark as converted: " + error.message)
    }
    setLeads((prev) => prev.filter((l: any) => l.id !== selectedLead.id))
    setSelectedLead(null)
    setSelectedLeadId(null)
    setMessages([])
    setLeadCommEvents([])
    setLeadAttachmentsByEvent({})
    if (setPage) setPage("conversations")
  }

  async function openLead(leadId: string) {
    setSelectedLeadId(leadId)
    if (!supabase || !userId) return

    const { data, error } = await supabase
      .from("leads")
      .select(`
        id,
        title,
        description,
        status,
        updated_at,
        customer_id,
        metadata,
        fit_classification,
        fit_confidence,
        fit_reason,
        fit_source,
        fit_manually_overridden,
        fit_evaluated_at,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        )
      `)
      .eq("id", leadId)
      .single()

    if (error) {
      console.error(error)
      return
    }

    setSelectedLead(data)
    applyDetailFormFromLeadRow(data)
    const fc = (data as { fit_classification?: string | null }).fit_classification
    setManualFitChoice(fc === "hot" || fc === "maybe" || fc === "bad" ? fc : "")

    const { data: logRows } = await supabase
      .from("lead_automation_logs")
      .select("id, action_type, action_summary, metadata, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(25)
    setLeadFitLogs((logRows ?? []) as typeof leadFitLogs)

    const { data: convo } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("customer_id", data.customer_id)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (convo?.id) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: true })

      setMessages(msgs || [])
    } else {
      setMessages([])
    }

    const cid = data.customer_id as string
    const orFilter = `lead_id.eq.${leadId},and(customer_id.eq.${cid},conversation_id.is.null)`
    const { data: evs } = await supabase
      .from("communication_events")
      .select(
        "id, event_type, subject, body, direction, created_at, metadata, recording_url, transcript_text, summary_text, lead_id, conversation_id",
      )
      .eq("user_id", userId)
      .or(orFilter)
      .order("created_at", { ascending: true })
      .limit(200)

    const evRows = evs || []
    setLeadCommEvents(evRows)
    const eventIds = evRows.map((e: { id?: string }) => e.id).filter(Boolean) as string[]
    const attMap = await loadAttachmentsByCommunicationEventIds(eventIds)
    setLeadAttachmentsByEvent(attMap)
  }

  async function createLeadFlow() {
    if (!supabase) {
      alert("Supabase not configured. Add .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }
    setLoading(true)
    try {
      let customerId: string | null = null

      // If phone or email provided, reuse existing customer with that identifier (avoids unique_identifier_per_user violation)
      if (phone.trim() || email.trim()) {
        if (phone.trim()) {
          const { data: byPhone } = await supabase.from("customer_identifiers").select("customer_id").eq("user_id", userId).eq("type", "phone").eq("value", phone.trim()).limit(1).maybeSingle()
          if (byPhone?.customer_id) customerId = byPhone.customer_id as string
        }
        if (!customerId && email.trim()) {
          const { data: byEmail } = await supabase.from("customer_identifiers").select("customer_id").eq("user_id", userId).eq("type", "email").eq("value", email.trim()).limit(1).maybeSingle()
          if (byEmail?.customer_id) customerId = byEmail.customer_id as string
        }
      }

      if (!customerId) {
        // 1) Create new customer
        const displayName =
          customerName.trim() ||
          (phone.trim() ? `Unknown (${phone.trim()})` : "Unknown")

        const { data: customer, error: customerErr } = await supabase
          .from("customers")
          .insert({
            user_id: userId,
            display_name: displayName,
            notes: null,
          })
          .select("id")
          .single()

        if (customerErr) throw customerErr
        customerId = customer.id as string

        // 2) Add identifiers only for new customer (avoids duplicate key on same phone/email per user)
        const identifiers: Array<{ type: string; value: string; is_primary: boolean }> = []

        if (phone.trim()) identifiers.push({ type: "phone", value: phone.trim(), is_primary: true })
        if (email.trim()) identifiers.push({ type: "email", value: email.trim(), is_primary: identifiers.length === 0 })
        if (customerName.trim()) identifiers.push({ type: "name", value: customerName.trim(), is_primary: false })

        if (identifiers.length > 0) {
          const { error: identErr } = await supabase
            .from("customer_identifiers")
            .insert(
              identifiers.map((i) => ({
                user_id: userId,
                customer_id: customerId,
                type: i.type,
                value: i.value,
                is_primary: i.is_primary,
                verified: false,
              }))
            )

          if (identErr) throw identErr
        }
      }

      if (!customerId) throw new Error("Could not resolve or create customer.")

      // 3) Create Lead (sends to Leads box only; no conversation)
      const defaultStatus = (leadsProfileSettings.default_lead_status as string) || "New"
      const nowIso = new Date().toISOString()
      let lead: { id: string } | null = null
      let leadErr: { message: string } | null = null
      const insFull = await supabase
        .from("leads")
        .insert({
          user_id: userId,
          customer_id: customerId,
          status_id: null,
          title: leadTitle.trim() || "New Lead",
          description: leadDescription.trim() || null,
          estimated_value: null,
          status: defaultStatus,
          updated_at: nowIso,
        })
        .select("id")
        .single()
      if (insFull.error) {
        const insMin = await supabase
          .from("leads")
          .insert({
            user_id: userId,
            customer_id: customerId,
            status_id: null,
            title: leadTitle.trim() || "New Lead",
            description: leadDescription.trim() || null,
            estimated_value: null,
          })
          .select("id")
          .single()
        lead = insMin.data as { id: string } | null
        leadErr = insMin.error
      } else {
        lead = insFull.data as { id: string }
        leadErr = insFull.error
      }

      if (leadErr || !lead) throw leadErr || new Error("Could not create lead")

      // 4) Log activity (non-blocking)
      void supabase.from("activities").insert({
        user_id: userId,
        customer_id: customerId,
        type: "lead_created",
        reference_table: "leads",
        reference_id: lead.id,
        summary: `Job description: ${leadTitle.trim() || "New"}`,
        metadata: {},
      })

      const displayName = customerName.trim() || (phone.trim() ? `Unknown (${phone.trim()})` : "Unknown")
      const newLeadRow = {
        id: lead.id,
        title: leadTitle.trim() || "New Lead",
        description: leadDescription.trim() || null,
        status: insFull.error ? "New" : defaultStatus,
        created_at: new Date().toISOString(),
        updated_at: insFull.error ? null : nowIso,
        customer_id: customerId,
        converted_at: null,
        removed_at: null,
        customers: { display_name: displayName, customer_identifiers: [{ type: "phone", value: phone.trim(), is_primary: true }].filter((x) => x.value) },
      }

      setLeads((prev) => [newLeadRow as any, ...prev])
      setCustomerName("")
      setPhone("")
      setEmail("")
      setLeadTitle("")
      setLeadDescription("")
      setInitialMessage("")
      setShowForm(false)
      if (setPage) setPage("leads")
      if (session?.access_token) {
        void fetch("/api/platform-tools?__route=lead-evaluate-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: platformToolsJsonBody({ leadId: lead.id, force: false }),
        })
          .then(() => loadLeads())
          .catch(() => loadLeads())
      } else {
        loadLeads()
      }
    } catch (err: any) {
      console.error(err)
      const msg = err?.message ?? err?.error_description ?? String(err)
      alert(`❌ Failed to create lead:\n\n${msg}\n\nIf you see "row-level security" or "policy", enable RLS policies in Supabase that allow insert (e.g. for anon or your user_id).`)
    } finally {
      setLoading(false)
    }
  }

  const filteredLeads = leads.filter((lead: any) => {
    const name = (lead.customers?.display_name || "").toLowerCase()
    const phone = lead.customers?.customer_identifiers
      ?.find((i: any) => i.type === "phone")?.value || ""
    const desc = String(lead.description || "").toLowerCase()
    const titleS = String(lead.title || "").toLowerCase()
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    const matchesName = !searchLower || name.includes(searchLower) || desc.includes(searchLower) || titleS.includes(searchLower)
    const matchesPhone = !phoneFilter || phone.includes(phoneFilter)
    return matchesName && matchesPhone
  })

  const sortedLeads = [...filteredLeads].sort((a: any, b: any) => {
    let aVal = ""
    let bVal = ""

    if (sortField === "name") {
      aVal = a.customers?.display_name || ""
      bVal = b.customers?.display_name || ""
    }

    if (sortField === "title") {
      aVal = (a.title || "").toLowerCase()
      bVal = (b.title || "").toLowerCase()
    }

    if (sortField === "created_at") {
      aVal = a.created_at || ""
      bVal = b.created_at || ""
    }

    if (sortField === "updated_at") {
      aVal = a.updated_at || a.created_at || ""
      bVal = b.updated_at || b.created_at || ""
    }

    if (sortField === "status") {
      aVal = (a.status || "").toLowerCase()
      bVal = (b.status || "").toLowerCase()
    }

    if (sortField === "description") {
      aVal = (a.description || "").toLowerCase()
      bVal = (b.description || "").toLowerCase()
    }

    if (sortAsc) {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })

  const leadActivityItems = useMemo(() => {
    const items: { sortMs: number; key: string; kind: "msg" | "ev"; payload: any }[] = []
    for (const m of messages) {
      const t = m.created_at ? Date.parse(m.created_at) : 0
      items.push({ sortMs: t, key: `m-${m.id}`, kind: "msg", payload: m })
    }
    for (const e of leadCommEvents) {
      const t = e.created_at ? Date.parse(e.created_at) : 0
      items.push({ sortMs: t, key: `e-${e.id}`, kind: "ev", payload: e })
    }
    items.sort((a, b) => a.sortMs - b.sortMs)
    return items
  }, [messages, leadCommEvents])

  const selectedRowText = theme.text

  return (
    <div style={{ display: "flex", position: "relative", minWidth: 0 }}>
      <div style={{ width: "100%", minWidth: 0 }}>

        <h1>Leads</h1>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "16px",
        flexWrap: "wrap",
        gap: "10px"
      }}>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>

          {showCreateLead && (
            <button
              onClick={() => setShowForm(true)}
              style={{
                background: "#F97316",
                color: "white",
                padding: "8px 14px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer"
              }}
            >
              + Create Lead
            </button>
          )}

          <button
            onClick={() => setShowSettings(true)}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
              color: theme.text
            }}
          >
            Settings
          </button>
          {userId ? <TabNotificationAlertsButton tab="leads" profileUserId={userId} /> : null}
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
            }}
          >
            Lead Filter Preferences
          </button>
          {customActionButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setOpenCustomButtonId(btn.id)}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                background: "white",
                cursor: "pointer",
                color: theme.text
              }}
            >
              {btn.label}
            </button>
          ))}

        </div>

      </div>

      {showLeadFilterPrefs && (
        <>
          <div
            onClick={() => setShowLeadFilterPrefs(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }}
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
              zIndex: 9999,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: 18 }}>Lead Filter Preferences</h3>
              <button
                type="button"
                onClick={() => setShowLeadFilterPrefs(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: theme.text }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
              Optional automation scores new leads as <strong>Hot</strong>, <strong>Maybe</strong>, or <strong>Bad</strong> using your rules first.
              Uncertain leads stay <strong>Maybe</strong> — nothing is deleted or auto-rejected.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                Job types you want (one per line or commas)
                <textarea
                  value={leadFilterPrefs.accepted_job_types}
                  onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, accepted_job_types: e.target.value }))}
                  rows={3}
                  placeholder="e.g. roofing, plumbing, HVAC"
                  style={{ ...theme.formInput, marginTop: 6, resize: "vertical", width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                Minimum job size (USD, optional)
                <input
                  value={leadFilterPrefs.minimum_job_size}
                  onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, minimum_job_size: e.target.value }))}
                  placeholder="e.g. 500"
                  style={{ ...theme.formInput, marginTop: 6, maxWidth: 200 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={leadFilterPrefs.use_account_service_radius}
                  onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, use_account_service_radius: e.target.checked }))}
                />
                Use service radius from Account (when set)
              </label>
              {!leadFilterPrefs.use_account_service_radius ? (
                <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                  Service radius (miles) for filtering
                  <input
                    value={leadFilterPrefs.service_radius_miles}
                    onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, service_radius_miles: e.target.value }))}
                    style={{ ...theme.formInput, marginTop: 6, maxWidth: 200 }}
                  />
                </label>
              ) : null}
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: "block", marginBottom: 6 }}>{t("leads.timingTitle")}</span>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#111827",
                    fontWeight: 500,
                  }}
                >
                  <input
                    type="radio"
                    name="lf_avail"
                    checked={leadFilterPrefs.availability === "asap"}
                    onChange={() => setLeadFilterPrefs((p) => ({ ...p, availability: "asap" }))}
                  />
                  {t("leads.asap")}
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#111827",
                    fontWeight: 500,
                  }}
                >
                  <input
                    type="radio"
                    name="lf_avail"
                    checked={leadFilterPrefs.availability === "flexible"}
                    onChange={() => setLeadFilterPrefs((p) => ({ ...p, availability: "flexible" }))}
                  />
                  {t("leads.flexible")}
                </label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={leadFilterPrefs.enable_auto_filter}
                  onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, enable_auto_filter: e.target.checked }))}
                />
                Enable auto filter on new leads
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={leadFilterPrefs.use_ai_for_unclear}
                  onChange={(e) => setLeadFilterPrefs((p) => ({ ...p, use_ai_for_unclear: e.target.checked }))}
                  disabled={!aiAutomationsEnabled}
                />
                Use interpretation for unclear leads (never auto-rejects alone; requires OPENAI on server)
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={leadFilterSaveBusy}
                onClick={() => void saveLeadFilterPreferences()}
                style={{
                  padding: "10px 16px",
                  background: theme.primary,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: leadFilterSaveBusy ? "wait" : "pointer",
                  fontWeight: 600,
                }}
              >
                {leadFilterSaveBusy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowLeadFilterPrefs(false)}
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

      {showForm && (
        <>
          <div
            onClick={() => setShowForm(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 9998
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: "480px",
              maxHeight: "90vh",
              overflow: "auto",
              background: "white",
              borderRadius: "8px",
              padding: "24px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              zIndex: 9999
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0 }}>Create Lead</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ ...theme.formInput }} />
              <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...theme.formInput }} />
              <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...theme.formInput }} />
              <label style={{ fontSize: "12px", fontWeight: 600, color: theme.text }}>Job description</label>
              <input placeholder="e.g. Roof Leak" value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} style={{ ...theme.formInput }} />
              <textarea placeholder="Lead description (optional)" value={leadDescription} onChange={(e) => setLeadDescription(e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} />
              <textarea placeholder='Initial message (optional)' value={initialMessage} onChange={(e) => setInitialMessage(e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} />
              {createLeadPortalItems.length > 0 && (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: theme.text, margin: "0 0 8px" }}>Options (from portal config)</p>
                  <PortalSettingItemsForm
                    items={createLeadPortalItems}
                    formValues={createLeadPortalValues}
                    setFormValue={(id, v) => {
                      setCreateLeadPortalValues((prev) => ({ ...prev, [id]: v }))
                      try {
                        localStorage.setItem(`leads_create_${id}`, v)
                      } catch {
                        /* ignore */
                      }
                    }}
                    isItemVisible={(item) => isSettingItemVisible(item, createLeadPortalItems, createLeadPortalValues)}
                  />
                </div>
              )}
              <button onClick={createLeadFlow} disabled={loading} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                {loading ? "Creating..." : "Create Lead"}
              </button>
              <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {showSettings && (
        <>
          <div
            onClick={() => setShowSettings(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 9998
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: "480px",
              background: "white",
              borderRadius: "8px",
              padding: "24px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              zIndex: 9999
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>Leads Settings</h3>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
            </div>
            {(() => {
              const embedItem = leadsSettingsItems.find((i) => i.id === "embed_lead_enabled")
              const embedShown =
                embedItem && isSettingItemVisible(embedItem, leadsSettingsItems, settingsFormValues)
              if (!embedShown) return null
              return (
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 14px", lineHeight: 1.5 }}>
                  <strong style={{ color: theme.text }}>Website lead form:</strong> This is not a separate product. When turned on below, the form lives{" "}
                  <em>on this same Tradesman site</em> at <code style={{ fontSize: 11 }}>/embed/lead/…</code>. You put that link on your contractor website
                  or send it to customers; submissions create leads in your account.
                </p>
              )
            })()}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: theme.text }}>
              {leadsSettingsItems.length === 0 && (
                <p style={{ fontSize: "14px", color: theme.text, opacity: 0.8 }}>No settings configured. Your admin can add items in the portal config.</p>
              )}
              {leadsSettingsItems.map((item) => {
                if (!isSettingItemVisible(item, leadsSettingsItems, settingsFormValues)) return null
                if (item.type === "checkbox") {
                  const checked = settingsFormValues[item.id] === "checked"
                  return (
                    <div key={item.id}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: theme.text, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setSettingValue(item.id, e.target.checked ? "checked" : "unchecked")}
                        />
                        <span>{item.label}</span>
                      </label>
                    </div>
                  )
                }
                if (item.type === "dropdown" && item.options?.length) {
                  const value = settingsFormValues[item.id] ?? item.options[0]
                  return (
                    <div key={item.id}>
                      <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "6px" }}>{item.label}</label>
                      <select
                        value={value}
                        onChange={(e) => setSettingValue(item.id, e.target.value)}
                        style={{ ...theme.formInput }}
                      >
                        {item.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )
                }
                if (item.type === "custom_field") {
                  const value = settingsFormValues[item.id] ?? ""
                  const isTextarea = item.customFieldSubtype === "textarea"
                  return (
                    <div key={item.id}>
                      <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "6px" }}>{item.label}</label>
                      {isTextarea ? (
                        <textarea
                          value={value}
                          onChange={(e) => setSettingValue(item.id, e.target.value)}
                          rows={3}
                          style={{ ...theme.formInput, resize: "vertical" }}
                        />
                      ) : (
                        <input
                          value={value}
                          onChange={(e) => setSettingValue(item.id, e.target.value)}
                          style={{ ...theme.formInput }}
                        />
                      )}
                    </div>
                  )
                }
                return null
              })}
              {(() => {
                const origin = typeof window !== "undefined" ? window.location.origin : ""
                const slug = String(settingsFormValues.embed_lead_slug ?? "")
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "")
                  .slice(0, 64)
                if (!slug || settingsFormValues.embed_lead_enabled !== "checked") return null
                const url = `${origin}/embed/lead/${encodeURIComponent(slug)}`
                return (
                  <p style={{ margin: 0, fontSize: 12, color: "#4b5563", wordBreak: "break-all" }}>
                    <strong>Your public form link (this app):</strong>{" "}
                    <a href={url} style={{ color: theme.primary }} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  </p>
                )
              })()}
            </div>
            <button
              type="button"
              onClick={() => void persistLeadsSettingsAndClose()}
              style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer", fontWeight: 600 }}
            >
              Done
            </button>
          </div>
        </>
      )}

      {openCustomButtonId && (() => {
        const btn = customActionButtons.find((b) => b.id === openCustomButtonId)
        if (!btn) return null
        const items = btn.items ?? []
        const formValues = customButtonFormValues
        const setFormValue = (itemId: string, value: string) =>
          setCustomButtonFormValues((prev) => ({ ...prev, [itemId]: value }))
        return (
          <>
            <div onClick={() => setOpenCustomButtonId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "90%",
                maxWidth: "480px",
                maxHeight: "90vh",
                overflow: "auto",
                background: "white",
                borderRadius: "8px",
                padding: "24px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                zIndex: 9999
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>{btn.label}</h3>
                <button onClick={() => setOpenCustomButtonId(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: theme.text }}>
                {items.length === 0 && <p style={{ fontSize: "14px", opacity: 0.8 }}>No options configured.</p>}
                {items.map((item) => {
                  if (!isSettingItemVisible(item, items, formValues)) return null
                  if (item.type === "checkbox") {
                    const checked = formValues[item.id] === "checked"
                    return (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={(e) => setFormValue(item.id, e.target.checked ? "checked" : "unchecked")} />
                        <span>{item.label}</span>
                      </label>
                    )
                  }
                  if (item.type === "dropdown" && item.options?.length) {
                    const value = formValues[item.id] ?? item.options[0]
                    return (
                      <div key={item.id}>
                        <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                        <select value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }}>
                          {item.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    )
                  }
                  if (item.type === "custom_field") {
                    const value = formValues[item.id] ?? ""
                    const isTextarea = item.customFieldSubtype === "textarea"
                    return (
                      <div key={item.id}>
                        <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                        {isTextarea ? (
                          <textarea value={value} onChange={(e) => setFormValue(item.id, e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} />
                        ) : (
                          <input value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }} />
                        )}
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
              style={{ ...theme.formInput, padding: "6px 10px", width: isMobile ? "100%" : "160px" }}
            />
            <input
              type="text"
              placeholder="By phone..."
              value={filterPhone}
              onChange={(e) => setFilterPhone(e.target.value)}
              style={{ ...theme.formInput, padding: "6px 10px", width: isMobile ? "100%" : "160px" }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Sort by</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{ ...theme.formInput, padding: "6px 10px", cursor: "pointer" }}
            >
              <option value="name">Name</option>
              <option value="title">Title</option>
              <option value="description">Job description</option>
              <option value="status">Status</option>
              <option value="updated_at">Last update</option>
              <option value="created_at">Created</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              style={{ ...theme.formInput, padding: "6px 10px", cursor: "pointer" }}
            >
              {sortAsc ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: isMobile ? "1000px" : "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: "15%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "10%" }} />
            <col />
          </colgroup>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th
                onClick={() => {
                  setSortField("name")
                  setSortAsc(!sortAsc)
                }}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Name
              </th>
              <th style={{ padding: "8px" }}>Phone</th>
              <th
                onClick={() => {
                  setSortField("title")
                  setSortAsc(!sortAsc)
                }}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Title
              </th>
              <th
                onClick={() => {
                  setSortField("description")
                  setSortAsc(!sortAsc)
                }}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Job description
              </th>
              <th
                onClick={() => {
                  setSortField("status")
                  setSortAsc(!sortAsc)
                }}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Status
              </th>
              <th style={{ padding: "8px" }}>Fit</th>
              <th
                onClick={() => {
                  setSortField("updated_at")
                  setSortAsc(!sortAsc)
                }}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Last update
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedLeads.map((lead) => {
              const phone = lead.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value || ""
              const lastUp = lead.updated_at || lead.created_at
              const isRowSelected = selectedLeadId === lead.id
              const cellBase = {
                padding: "8px" as const,
                color: isRowSelected ? selectedRowText : undefined,
                fontWeight: isRowSelected ? (600 as const) : (400 as const),
              }
              return (
                <Fragment key={lead.id}>
                  <tr
                    onClick={() => toggleLeadRow(lead.id)}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid #eee",
                      background: isRowSelected ? "#bae6fd" : "transparent",
                    }}
                  >
                    <td style={cellBase}>{lead.customers?.display_name}</td>
                    <td style={cellBase}>{phone}</td>
                    <td style={cellBase}>{lead.title ?? "—"}</td>
                    <td style={{ ...cellBase, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={lead.description ?? ""}>
                      {(lead.description ?? "").trim() ? `${String(lead.description).slice(0, 80)}${String(lead.description).length > 80 ? "…" : ""}` : "—"}
                    </td>
                    <td style={cellBase}>{lead.status ?? "—"}</td>
                    <td style={{ ...cellBase, verticalAlign: "middle" }}>
                      {leadFitBadgeEl((lead.fit_classification as LeadFit) ?? null)}
                    </td>
                    <td style={cellBase}>
                      {lastUp ? new Date(lastUp).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                  </tr>
                  {isRowSelected && selectedLead?.id === lead.id ? (
                    <tr>
                      <td
                        colSpan={7}
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
                              <h3 style={{ margin: 0, fontSize: 18, color: theme.text }}>
                                {selectedLead.customers?.display_name ?? "Lead"}
                              </h3>
                              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>
                                Click the same list row again to collapse. Job: {selectedLead.title ?? "—"}
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-label="Close lead detail"
                              onClick={() => toggleLeadRow(lead.id)}
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

                          <div style={{ fontSize: 14, color: theme.text, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 700, color: theme.text }}>Lead details</div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setNotesCustomerId(selectedLead.customer_id ?? null)
                                    setNotesCustomerName(detailForm.customerName || (selectedLead.customers?.display_name ?? ""))
                                  }}
                                  style={{
                                    padding: "4px 10px",
                                    fontSize: "12px",
                                    background: theme.primary,
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Notes
                                </button>
                                {aiAutomationsEnabled ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void runLeadAiAssist()
                                    }}
                                    disabled={leadAiBusy}
                                    style={{
                                      padding: "4px 10px",
                                      fontSize: "12px",
                                      border: `1px solid ${theme.border}`,
                                      borderRadius: "6px",
                                      background: "#fff",
                                      cursor: leadAiBusy ? "wait" : "pointer",
                                      color: theme.text,
                                    }}
                                  >
                                    {leadAiBusy ? "AI…" : "Fill with AI"}
                                  </button>
                                ) : null}
                                {detailEditMode ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        void saveLeadDetail()
                                      }}
                                      disabled={detailSaving}
                                      style={{
                                        padding: "4px 10px",
                                        fontSize: "12px",
                                        background: theme.primary,
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        cursor: detailSaving ? "wait" : "pointer",
                                      }}
                                    >
                                      {detailSaving ? "Saving…" : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        applyDetailFormFromLeadRow(selectedLead)
                                      }}
                                      style={{
                                        padding: "4px 10px",
                                        fontSize: "12px",
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: "6px",
                                        background: "#fff",
                                        cursor: "pointer",
                                        color: theme.text,
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDetailEditMode(true)
                                    }}
                                    style={{
                                      padding: "4px 10px",
                                      fontSize: "12px",
                                      border: `1px solid ${theme.border}`,
                                      borderRadius: "6px",
                                      background: "#fff",
                                      cursor: "pointer",
                                      color: theme.text,
                                    }}
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            </div>

                            {leadSoftWarnings.length > 0 ? (
                              <div
                                role="status"
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 8,
                                  background: "#fffbeb",
                                  border: "1px solid #fcd34d",
                                  fontSize: 13,
                                  color: "#92400e",
                                }}
                              >
                                <strong>Heads up:</strong>
                                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                  {leadSoftWarnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                padding: "12px 14px",
                                borderRadius: 8,
                                border: `1px solid ${theme.border}`,
                                background: "#fff",
                                marginBottom: 12,
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, marginBottom: 8 }}>Lead fit</div>
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                {leadFitBadgeEl((selectedLead.fit_classification as LeadFit) ?? null)}
                                {selectedLead.fit_confidence != null && typeof selectedLead.fit_confidence === "number" ? (
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                                    Confidence: {Math.round(selectedLead.fit_confidence * 100)}%
                                  </span>
                                ) : null}
                                {selectedLead.fit_source ? (
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>Source: {selectedLead.fit_source}</span>
                                ) : null}
                                {selectedLead.fit_manually_overridden ? (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed" }}>Manual override</span>
                                ) : null}
                              </div>
                              {selectedLead.fit_reason ? (
                                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.45 }}>{selectedLead.fit_reason}</p>
                              ) : (
                                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>
                                  No score yet. Turn on <strong>Enable auto filter</strong> in Lead Filter Preferences, or run a check below.
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
                                  onClick={() => void applyManualFitOverride()}
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
                                  disabled={fitReRunBusy || !session?.access_token}
                                  onClick={() => void reRunLeadFit()}
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
                              {leadFitLogs.length > 0 ? (
                                <div style={{ marginTop: 12 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 6 }}>Activity</div>
                                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#4b5563" }}>
                                    {leadFitLogs.map((log) => (
                                      <li key={log.id} style={{ marginBottom: 6 }}>
                                        <span style={{ color: "#9ca3af" }}>
                                          {log.created_at ? new Date(log.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : ""}
                                        </span>
                                        {" · "}
                                        {log.action_summary || log.action_type}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>

                            {pendingLeadAiReply ? (
                              <AiConsumerReplyApprovalCard
                                key={`${selectedLead.id}-${pendingLeadAiReply.created_at}-${pendingLeadAiReply.body.length}`}
                                pending={pendingLeadAiReply}
                                contextLabel="Lead auto-reply"
                                busy={leadPendingAiBusy}
                                onApprove={(text) => void approveLeadPendingAi(text)}
                                onRetry={() => void retryLeadPendingAi()}
                                onDiscard={() => void dismissLeadPendingAi()}
                              />
                            ) : null}

                            {detailEditMode ? (
                              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Customer name</label>
                                <input
                                  value={detailForm.customerName}
                                  onChange={(e) => setDetailForm((p) => ({ ...p, customerName: e.target.value }))}
                                  style={{ ...theme.formInput }}
                                />
                                <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Phone</label>
                                <input
                                  value={detailForm.phone}
                                  onChange={(e) => setDetailForm((p) => ({ ...p, phone: e.target.value }))}
                                  style={{ ...theme.formInput }}
                                />
                                <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Email</label>
                                <input
                                  value={detailForm.email}
                                  onChange={(e) => setDetailForm((p) => ({ ...p, email: e.target.value }))}
                                  style={{ ...theme.formInput }}
                                />
                                <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Title</label>
                                <input
                                  value={detailForm.title}
                                  onChange={(e) => setDetailForm((p) => ({ ...p, title: e.target.value }))}
                                  style={{ ...theme.formInput }}
                                />
                                <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Job description</label>
                                <textarea
                                  value={detailForm.description}
                                  onChange={(e) => setDetailForm((p) => ({ ...p, description: e.target.value }))}
                                  rows={4}
                                  style={{ ...theme.formInput, resize: "vertical" }}
                                />
                                <label style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>Status</label>
                                <select
                                  value={detailForm.status}
                                  onChange={(e) => setDetailForm((p) => ({ ...p, status: e.target.value }))}
                                  style={{ ...theme.formInput }}
                                >
                                  {(() => {
                                    const opts: string[] = [...LEAD_STATUS_OPTIONS]
                                    if (!opts.includes(detailForm.status)) opts.push(detailForm.status)
                                    return opts.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))
                                  })()}
                                </select>
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <p style={{ margin: 0 }}>
                                  <strong>Name:</strong> {detailForm.customerName || "—"}
                                </p>
                                <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                                  <span>
                                    <strong>Phone:</strong> {detailForm.phone || "—"}
                                  </span>
                                  {detailForm.phone?.trim() ? <CustomerCallButton phone={detailForm.phone} compact /> : null}
                                </p>
                                <p style={{ margin: 0 }}>
                                  <strong>Email:</strong> {detailForm.email || "—"}
                                </p>
                                <p style={{ margin: 0 }}>
                                  <strong>Title:</strong> {detailForm.title || "—"}
                                </p>
                                <p style={{ margin: 0 }}>
                                  <strong>Job description:</strong> {detailForm.description || "—"}
                                </p>
                                <p style={{ margin: 0 }}>
                                  <strong>Status:</strong> {detailForm.status || "—"}
                                </p>
                              </div>
                            )}

                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                borderTop: `1px solid ${theme.border}`,
                                paddingTop: 14,
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                              }}
                            >
                              <div style={{ fontWeight: 700, color: theme.text }}>Reach out</div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>SMS</span>
                              </div>
                              <textarea
                                placeholder="Text message to customer…"
                                value={leadReplySms}
                                onChange={(e) => setLeadReplySms(e.target.value)}
                                rows={2}
                                style={{ ...theme.formInput, resize: "vertical", maxWidth: 560 }}
                              />
                              <button
                                type="button"
                                onClick={() => void sendLeadSms()}
                                disabled={leadSmsSending}
                                style={{
                                  alignSelf: "flex-start",
                                  padding: "8px 14px",
                                  background: theme.primary,
                                  color: "white",
                                  border: "none",
                                  borderRadius: "6px",
                                  cursor: leadSmsSending ? "wait" : "pointer",
                                  fontWeight: 600,
                                }}
                              >
                                {leadSmsSending ? "Sending…" : "Send text"}
                              </button>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginTop: 4 }}>Email</div>
                              <input
                                placeholder="To"
                                value={leadEmailTo}
                                onChange={(e) => setLeadEmailTo(e.target.value)}
                                style={{ ...theme.formInput, maxWidth: 560 }}
                              />
                              <input
                                placeholder="Subject"
                                value={leadEmailSubject}
                                onChange={(e) => setLeadEmailSubject(e.target.value)}
                                style={{ ...theme.formInput, maxWidth: 560 }}
                              />
                              <textarea
                                placeholder="Email body…"
                                value={leadEmailBody}
                                onChange={(e) => setLeadEmailBody(e.target.value)}
                                rows={4}
                                style={{ ...theme.formInput, resize: "vertical", maxWidth: 560 }}
                              />
                              <button
                                type="button"
                                onClick={() => void sendLeadEmail()}
                                disabled={leadEmailSending}
                                style={{
                                  alignSelf: "flex-start",
                                  padding: "8px 14px",
                                  background: theme.primary,
                                  color: "white",
                                  border: "none",
                                  borderRadius: "6px",
                                  cursor: leadEmailSending ? "wait" : "pointer",
                                  fontWeight: 600,
                                }}
                              >
                                {leadEmailSending ? "Sending…" : "Send email"}
                              </button>
                              <button
                                type="button"
                                disabled
                                title="Call from app — coming soon"
                                style={{
                                  alignSelf: "flex-start",
                                  padding: "8px 14px",
                                  border: `1px solid ${theme.border}`,
                                  borderRadius: "6px",
                                  background: "#f3f4f6",
                                  color: "#9ca3af",
                                  cursor: "not-allowed",
                                  fontWeight: 600,
                                }}
                              >
                                Call from app (soon)
                              </button>
                            </div>
                          </div>

                          <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: theme.text }}>Activity</h4>
                          <div
                            style={{
                              border: `1px solid ${theme.border}`,
                              padding: 12,
                              borderRadius: 8,
                              background: "#fff",
                              minHeight: 72,
                              maxHeight: "min(42vh, 380px)",
                              overflow: "auto",
                              boxSizing: "border-box",
                            }}
                          >
                            {leadActivityItems.length === 0 ? (
                              <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                                No thread messages or logged events yet. Inbound SMS, calls, and voicemails appear here while this contact is still in Leads (before you add them to Conversations).
                              </p>
                            ) : (
                              leadActivityItems.map((item) => {
                                if (item.kind === "msg") {
                                  const msg = item.payload
                                  return (
                                    <div
                                      key={item.key}
                                      style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}
                                    >
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
                                  <div
                                    key={item.key}
                                    style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}
                                  >
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
                                        {ev.subject?.trim() ? (
                                          <p style={{ margin: "0 0 6px", fontWeight: 700 }}>{ev.subject.trim()}</p>
                                        ) : null}
                                        <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{ev.body || "—"}</p>
                                      </>
                                    ) : (
                                      <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{ev.body || "—"}</p>
                                    )}
                                    <AttachmentStrip items={leadAttachmentsByEvent[ev.id] ?? []} compact />
                                  </div>
                                )
                              })
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={moveLeadToConversations}
                            style={{
                              marginTop: 20,
                              padding: "10px 16px",
                              background: theme.primary,
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            Add Lead to my Conversations
                          </button>

                          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!supabase || !selectedLead?.id) return
                                if (!confirm("Remove this lead? It can be recalled from Customers later.")) return
                                const { error } = await supabase
                                  .from("leads")
                                  .update({ removed_at: new Date().toISOString() })
                                  .eq("id", selectedLead.id)
                                if (error) {
                                  alert(error.message)
                                  return
                                }
                                setSelectedLead(null)
                                setSelectedLeadId(null)
                                setMessages([])
                                setLeadCommEvents([])
                                setLeadAttachmentsByEvent({})
                                loadLeads()
                              }}
                              style={{
                                padding: "8px 14px",
                                borderRadius: "6px",
                                background: "#b91c1c",
                                color: "white",
                                border: "none",
                                cursor: "pointer",
                                fontSize: "14px",
                              }}
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
