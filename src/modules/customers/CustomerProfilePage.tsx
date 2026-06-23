import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { usePortalViewOptional } from "../../contexts/PortalViewContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useScopedAiAutomationsEnabled } from "../../hooks/useScopedAiAutomationsEnabled"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import CommunicationUrgencyBadge from "../../components/CommunicationUrgencyBadge"
import { consumeQueuedCustomerProfile, queueCustomerFocus, queueCustomerProfile } from "../../lib/customerNavigation"
import { setCustomerProfileReturn } from "../../lib/customerProfileReturn"
import {
  queueCustomReceiptCustomerPrefill,
  queueQuotesCustomerPrefill,
  queueSchedulingCustomerPrefill,
  queueSchedulingEventView,
  queueQuotesOpenQuote,
} from "../../lib/workflowNavigation"
import CalendarEventViewModal, { type CalendarEventLinkedDoc } from "../../components/CalendarEventViewModal"
import DocumentPdfViewerModal from "../../components/DocumentPdfViewerModal"
import { calendarEventAssigneeUserId } from "../../lib/calendarAssignee"
import { DEFAULT_SANDBOX_DEMO_TEAM, sandboxDemoMemberById, parseSandboxDemoTeam, filterRealUserIds, isSandboxDemoUserId } from "../../lib/sandboxDemoTeam"
import { resolveDemoTeamPolicyFromOwnerMetadata } from "../../lib/sandboxDemoTeamPolicies"
import { loadCustomerProfileBundle, type CustomerProfileBundle } from "../../lib/customerProfileData"
import { formatAppError } from "../../lib/formatAppError"
import { formatDisplayText } from "../../lib/formatDisplayText"
import { formatCommEventEmailAddressSummary } from "../../lib/communicationEmailAddresses"
import CustomerContactSplitMergeModal from "../../components/CustomerContactSplitMergeModal"
import { geocodeAddressToLatLng } from "../../lib/jobSiteLocation"
import { useIsMobile } from "../../hooks/useIsMobile"
import { estimateDisplayStatus, formatUsdAmount, receiptDisplayStatus } from "../../lib/customerDocumentStatus"
import { calendarEventDisplayStatus, exportCalendarEventDetailPdf, openCalendarEventSummaryPdf, type CalendarEventProfileRow } from "../../lib/calendarEventProfile"
import { openEstimatePdfForProfile } from "../../lib/estimatePdfExport"
import {
  buildCustomReceiptPdfBytes,
  customReceiptDraftToFormState,
  formatCustomReceiptLineItems,
  loadReceiptTemplateSettings,
} from "../../lib/customReceipt"
import { downloadPdfBlob } from "../../lib/documentPdf"
import CustomerCoiQuickActions, { CustomerEventCoiButton } from "../../components/CustomerCoiQuickActions"
import { leadFitBadgeEl } from "../../lib/leadFitUi"
import { getFreshAccessToken, forceRefreshAccessToken } from "../../lib/authPlatformApi"
import { platformToolsJsonBody } from "../../lib/platformToolsJsonBody"
import { loadAccountWorkflowBundleFromMetadata, parseQuoteInternalWorkflow } from "../../lib/estimateWorkflowRuntime"
import { loadCustomerWorkflowSnapshotFromProfile } from "../../lib/customerWorkflowRouting"
import { CustomerWorkflowStatusPanel } from "../../components/CustomerWorkflowStatusPanel"
import { inferCustomerWorkflowStep } from "../../lib/inferCustomerWorkflowStep"
import { parseOmCalendarPolicy } from "../../lib/teamCalendarPolicy"

type Props = {
  setPage: (page: string) => void
}

const DEFAULT_BEST_CONTACT_OPTIONS = ["Phone call", "Text message", "Email", "Other"] as const

type ContactFormState = {
  customerName: string
  phones: string[]
  emails: string[]
  serviceAddress: string
  serviceLat: string
  serviceLng: string
  bestContact: string
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

function parseProfileNotesPast(raw: unknown): { id: string; text: string; saved_at: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { id: string; text: string; saved_at: string }[] = []
  raw.forEach((x, i) => {
    const text = formatDisplayText(x && typeof x === "object" && !Array.isArray(x) ? (x as { text?: unknown }).text : x, "")
    if (!text) return
    const o = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
    const saved_at = typeof o.saved_at === "string" ? o.saved_at : ""
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `note-${i}`
    out.push({ id, text, saved_at })
  })
  return out.sort((a, b) => (b.saved_at || "").localeCompare(a.saved_at || ""))
}

function ActivityHistoryTabs({ events }: { events: CustomerProfileBundle["commEvents"] }) {
  const [tab, setTab] = useState<"phone" | "sms" | "email" | "notes">("phone")
  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: tab === id ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
        background: tab === id ? "#fff7ed" : "#fff",
        fontWeight: tab === id ? 800 : 600,
        fontSize: 12,
        cursor: "pointer",
        color: theme.text,
      }}
    >
      {label}
    </button>
  )
  const filtered = events.filter((ev) => {
    const t = (ev.event_type ?? "").toLowerCase()
    if (tab === "phone") return t === "call" || t === "voicemail" || t.includes("call")
    if (tab === "sms") return t === "sms"
    if (tab === "email") return t === "email"
    return t === "note" || t === "internal_note"
  })
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tabBtn("phone", "Phone calls")}
        {tabBtn("sms", "SMS")}
        {tabBtn("email", "Emails")}
        {tabBtn("notes", "Notes")}
      </div>
      {filtered.length === 0 ? (
        <Empty text={`No ${tab === "phone" ? "phone" : tab} activity logged yet.`} />
      ) : (
        <Timeline
          rows={filtered.slice(0, 40).map((ev) => {
            const emailAddr = ev.event_type === "email" ? formatCommEventEmailAddressSummary(ev) : null
            const metaParts = [formatDisplayText(ev.direction, ""), emailAddr, formatWhen(ev.created_at)].filter(Boolean)
            return {
              key: ev.id,
              title: formatDisplayText(ev.subject, "") || formatDisplayText(ev.event_type, "Event"),
              meta: metaParts.join(" · "),
              body: formatDisplayText(ev.body, ""),
            }
          })}
        />
      )}
    </div>
  )
}

function CollapsibleProfileSection({
  title,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  badge,
  headerActions,
  children,
}: {
  title: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  badge?: string | number
  headerActions?: ReactNode
  children: ReactNode
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  return (
    <section
      style={{
        marginBottom: 16,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderBottom: open ? `1px solid ${theme.border}` : "none",
        }}
      >
        <button
          type="button"
          onClick={() => {
            const next = !open
            onOpenChange?.(next)
            if (controlledOpen === undefined) setInternalOpen(next)
          }}
          aria-expanded={open}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            minWidth: 0,
          }}
        >
          <span style={{ color: "#64748b", fontSize: 13, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#475569" }}>{title}</span>
          {badge != null && badge !== "" && badge !== 0 ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                background: "#f1f5f9",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              {badge}
            </span>
          ) : null}
        </button>
        {headerActions ? <div style={{ flexShrink: 0 }}>{headerActions}</div> : null}
      </div>
      {open ? <div style={{ padding: 16 }}>{children}</div> : null}
    </section>
  )
}

function formatFetchApiError(response: Response, raw: string): string {
  try {
    const j = JSON.parse(raw) as { error?: string; message?: string }
    return j.error || j.message || raw.slice(0, 200) || response.statusText
  } catch {
    return raw.slice(0, 200) || response.statusText
  }
}

export default function CustomerProfilePage({ setPage }: Props) {
  const { user, session } = useAuth()
  const portalView = usePortalViewOptional()
  const viewAsDemoId =
    portalView?.showViewBar && isSandboxDemoUserId(portalView.targetUserId) ? portalView.targetUserId : null
  const userId = useScopedUserId() ?? user?.id ?? null
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(userId)
  const isMobile = useIsMobile()
  const [customerId] = useState<string | null>(() => consumeQueuedCustomerProfile())
  const [bundle, setBundle] = useState<CustomerProfileBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [contactEditMode, setContactEditMode] = useState(false)
  const [contactSectionOpen, setContactSectionOpen] = useState(false)
  const [contactSaving, setContactSaving] = useState(false)
  const [serviceGeocodeBusy, setServiceGeocodeBusy] = useState(false)
  const [contactForm, setContactForm] = useState<ContactFormState>({
    customerName: "",
    phones: [""],
    emails: [""],
    serviceAddress: "",
    serviceLat: "",
    serviceLng: "",
    bestContact: DEFAULT_BEST_CONTACT_OPTIONS[0],
  })
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null)
  const [contactSplitMergeOpen, setContactSplitMergeOpen] = useState(false)
  const [contactSplitMergeMode, setContactSplitMergeMode] = useState<"separate" | "merge">("separate")
  const [manualFitChoice, setManualFitChoice] = useState<"hot" | "maybe" | "bad" | "">("")
  const [fitOverrideBusy, setFitOverrideBusy] = useState(false)
  const [fitReRunBusy, setFitReRunBusy] = useState(false)
  const [profileMetadata, setProfileMetadata] = useState<unknown>(null)
  const [eventView, setEventView] = useState<CalendarEventProfileRow | null>(null)
  const [eventExportBusy, setEventExportBusy] = useState(false)
  const [estimatePdfView, setEstimatePdfView] = useState<{
    quoteId: string
    url: string
    title: string
    preparedAtLabel: string | null
    revokeOnClose: boolean
  } | null>(null)
  const [assigneeLabelById, setAssigneeLabelById] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    if (!supabase || !userId || !customerId) return
    setLoading(true)
    setErr("")
    try {
      const [data, profRes] = await Promise.all([
        loadCustomerProfileBundle(supabase, userId, customerId),
        supabase.from("profiles").select("metadata").eq("id", user?.id ?? userId).maybeSingle(),
      ])
      setBundle(data)
      const profMeta = profRes.data?.metadata
      if (viewAsDemoId) {
        setProfileMetadata({ om_calendar_policy: resolveDemoTeamPolicyFromOwnerMetadata(profMeta, viewAsDemoId) })
      } else {
        setProfileMetadata(profMeta ?? null)
      }

      const labelMap: Record<string, string> = {}
      for (const m of parseSandboxDemoTeam(
        profMeta && typeof profMeta === "object" && !Array.isArray(profMeta)
          ? (profMeta as Record<string, unknown>).sandbox_demo_team
          : null,
      )) {
        if (m.id && m.label?.trim()) labelMap[m.id] = m.label.trim()
      }
      for (const m of DEFAULT_SANDBOX_DEMO_TEAM) {
        if (m.id && m.label?.trim()) labelMap[m.id] = m.label.trim()
      }
      const assigneeIds = filterRealUserIds(
        (data?.calendarEvents ?? [])
          .map((ev) => calendarEventAssigneeUserId(ev))
          .filter(Boolean),
      )
      if (assigneeIds.length > 0) {
        const { data: profRows } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", assigneeIds)
        for (const row of profRows ?? []) {
          const id = String((row as { id?: string }).id ?? "")
          const dn = (row as { display_name?: string | null }).display_name
          const em = (row as { email?: string | null }).email
          const label = (typeof dn === "string" && dn.trim()) || (typeof em === "string" && em.trim()) || ""
          if (id && label) labelMap[id] = label
        }
      }
      setAssigneeLabelById(labelMap)
    } catch (e: unknown) {
      setErr(formatAppError(e))
      setBundle(null)
    } finally {
      setLoading(false)
    }
  }, [userId, customerId, user?.id, viewAsDemoId])

  const leaveProfileTo = useCallback(
    (nextPage: string, run?: () => void) => {
      const c = bundle?.customer
      if (c?.id) {
        setCustomerProfileReturn({
          customerId: c.id,
          customerName: formatDisplayText(c.display_name, "Customer"),
        })
      }
      run?.()
      setPage(nextPage)
    },
    [bundle?.customer, setPage],
  )

  function assigneeLabelForEvent(ev: CalendarEventProfileRow): string {
    const assigneeId = calendarEventAssigneeUserId(ev)
    if (!assigneeId) return "Unassigned"
    const cached = assigneeLabelById[assigneeId]
    if (cached?.trim()) return cached.trim()
    const demo = sandboxDemoMemberById(DEFAULT_SANDBOX_DEMO_TEAM, assigneeId)
    if (demo?.label) return demo.label
    return "Team member"
  }

  function linkedDocsForEvent(ev: CalendarEventProfileRow): CalendarEventLinkedDoc[] {
    if (!bundle) return []
    const docs: CalendarEventLinkedDoc[] = []
    if (ev.quote_id) {
      const q = bundle.quotes.find((row) => row.id === ev.quote_id)
      docs.push({
        label: "Estimate",
        value: formatDisplayText(q?.title, ev.quote_id.slice(0, 8).toUpperCase()),
        onOpen: () => void openEstimatePdf(ev.quote_id!),
      })
    }
    for (const w of bundle.workOrders.filter((w) => !ev.quote_id || w.quote_id === ev.quote_id)) {
      docs.push({
        label: "Work order",
        value: w.work_order_number,
        onOpen: () => leaveProfileTo("operations-work_orders"),
      })
    }
    for (const p of bundle.purchaseOrders.slice(0, 3)) {
      docs.push({
        label: "Purchase order",
        value: p.po_number,
        onOpen: () => leaveProfileTo("operations-purchase_orders"),
      })
    }
    for (const inv of bundle.invoices.filter((i) => !ev.quote_id || i.quote_id === ev.quote_id).slice(0, 3)) {
      docs.push({
        label: "Invoice / payment",
        value: formatUsdAmount(inv.amount) ?? inv.description ?? inv.id.slice(0, 8),
        onOpen: () => leaveProfileTo("payments"),
      })
    }
    for (const r of bundle.receipts.slice(0, 2)) {
      docs.push({
        label: "Receipt",
        value: formatDisplayText(r.job_title, r.id.slice(0, 8).toUpperCase()),
        onOpen: () => leaveProfileTo("calendar"),
      })
    }
    return docs
  }

  function scopeOfWorkForEvent(ev: CalendarEventProfileRow): string | null {
    const meta =
      ev.metadata && typeof ev.metadata === "object" && !Array.isArray(ev.metadata)
        ? (ev.metadata as Record<string, unknown>)
        : {}
    const scheduled =
      typeof meta.scheduled_scope_of_work === "string" ? meta.scheduled_scope_of_work.trim() : ""
    if (scheduled) return scheduled
    const fromMeta = typeof meta.scope_of_work === "string" ? meta.scope_of_work.trim() : ""
    if (fromMeta) return fromMeta
    if (ev.quote_id && bundle?.quoteScopeByQuoteId[ev.quote_id]) {
      const q = bundle.quotes.find((row) => row.id === ev.quote_id)
      const title = formatDisplayText(q?.title, "")
      const lines = bundle.quoteScopeByQuoteId[ev.quote_id]
      return title ? `${title}\n\n${lines}` : lines
    }
    if (ev.quote_id && bundle) {
      const q = bundle.quotes.find((row) => row.id === ev.quote_id)
      const title = formatDisplayText(q?.title, "")
      if (title) return title
    }
    return ev.job_type_name?.trim() || null
  }

  function materialsForEvent(ev: CalendarEventProfileRow): string | null {
    const meta =
      ev.metadata && typeof ev.metadata === "object" && !Array.isArray(ev.metadata)
        ? (ev.metadata as Record<string, unknown>)
        : {}
    const scheduled =
      typeof meta.scheduled_materials_list === "string" ? meta.scheduled_materials_list.trim() : ""
    if (scheduled) return scheduled
    return ev.materials_list?.trim() || ev.job_type_materials_list?.trim() || null
  }

  async function openEstimatePdf(quoteId: string) {
    if (!supabase || !userId) return
    setPdfBusyId(`q-${quoteId}`)
    try {
      const view = await openEstimatePdfForProfile(supabase, userId, quoteId)
      const q = bundle?.quotes.find((row) => row.id === quoteId)
      setEstimatePdfView({
        quoteId,
        url: view.url,
        title: formatDisplayText(q?.title, `Estimate ${quoteId.slice(0, 8).toUpperCase()}`),
        preparedAtLabel: view.preparedAtLabel,
        revokeOnClose: view.url.startsWith("blob:"),
      })
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setPdfBusyId(null)
    }
  }

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const fc = bundle?.customer.fit_classification
    setManualFitChoice(fc === "hot" || fc === "maybe" || fc === "bad" ? fc : "")
  }, [bundle?.customer.id, bundle?.customer.fit_classification])

  async function applyManualCustomerFit() {
    if (!supabase || !userId || !customerId || !manualFitChoice) return
    setFitOverrideBusy(true)
    try {
      const now = new Date().toISOString()
      const { error: uErr } = await supabase
        .from("customers")
        .update({
          fit_classification: manualFitChoice,
          fit_confidence: null,
          fit_reason: "Updated manually from the customer profile.",
          fit_source: "manual",
          fit_manually_overridden: true,
          fit_evaluated_at: now,
        })
        .eq("id", customerId)
        .eq("user_id", userId)
      if (uErr) {
        alert(uErr.message)
        return
      }
      await reload()
    } finally {
      setFitOverrideBusy(false)
    }
  }

  async function reRunCustomerFit() {
    if (!supabase || !customerId || !session) return
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
          body: platformToolsJsonBody({ customerId, force: true }),
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
      await reload()
    } finally {
      setFitReRunBusy(false)
    }
  }

  useEffect(() => {
    if (!bundle) return
    const c = bundle.customer
    const bc = formatDisplayText(c.best_contact_method, "")
    const best = (DEFAULT_BEST_CONTACT_OPTIONS as readonly string[]).includes(bc) ? bc : DEFAULT_BEST_CONTACT_OPTIONS[0]
    setContactForm({
      customerName: formatDisplayText(c.display_name, ""),
      phones: bundle.phones.length > 0 ? bundle.phones : bundle.phone ? [bundle.phone] : [""],
      emails: bundle.emails.length > 0 ? bundle.emails : bundle.email ? [bundle.email] : [""],
      serviceAddress: formatDisplayText(c.service_address, ""),
      serviceLat: c.service_lat != null && Number.isFinite(Number(c.service_lat)) ? String(c.service_lat) : "",
      serviceLng: c.service_lng != null && Number.isFinite(Number(c.service_lng)) ? String(c.service_lng) : "",
      bestContact: best,
    })
  }, [bundle])

  function backToCustomers() {
    if (customerId) queueCustomerFocus(customerId)
    setPage("customers")
  }

  async function geocodeServiceAddress() {
    const q = contactForm.serviceAddress.trim()
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
      setContactForm((p) => ({ ...p, serviceLat: String(coords.lat), serviceLng: String(coords.lng) }))
    } catch (e) {
      alert(formatAppError(e))
    } finally {
      setServiceGeocodeBusy(false)
    }
  }

  async function saveContactJobSite() {
    if (!supabase || !userId || !customerId || !bundle) return
    setContactSaving(true)
    setErr("")
    try {
      const phoneValues = contactForm.phones.map((p) => p.trim()).filter(Boolean)
      const emailValues = [
        ...new Set(contactForm.emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
      ]
      const nameT = contactForm.customerName.trim()
      const latRaw = contactForm.serviceLat.trim()
      const lngRaw = contactForm.serviceLng.trim()
      const latN = latRaw ? Number.parseFloat(latRaw) : Number.NaN
      const lngN = lngRaw ? Number.parseFloat(lngRaw) : Number.NaN
      const nowIso = new Date().toISOString()

      const custPatch: Record<string, unknown> = {
        display_name: nameT || null,
        service_address: contactForm.serviceAddress.trim() || null,
        service_lat: Number.isFinite(latN) ? latN : null,
        service_lng: Number.isFinite(lngN) ? lngN : null,
        best_contact_method: contactForm.bestContact.trim() || null,
        last_activity_at: nowIso,
      }

      let { error: custErr } = await supabase.from("customers").update(custPatch).eq("id", customerId).eq("user_id", userId)
      if (custErr && String(custErr.message || "").toLowerCase().match(/service_|best_contact|last_activity/)) {
        const { best_contact_method: _bc, last_activity_at: _la, ...rest } = custPatch
        const r = await supabase.from("customers").update(rest).eq("id", customerId).eq("user_id", userId)
        custErr = r.error
      }
      if (custErr) throw custErr

      const { error: delPhoneErr } = await supabase
        .from("customer_identifiers")
        .delete()
        .eq("customer_id", customerId)
        .eq("user_id", userId)
        .in("type", ["phone", "additional_phone"])
      if (delPhoneErr) throw delPhoneErr
      if (phoneValues.length > 0) {
        const { error: insPhoneErr } = await supabase.from("customer_identifiers").insert(
          phoneValues.map((value, i) => ({
            user_id: userId,
            customer_id: customerId,
            type: i === 0 ? "phone" : "phone",
            value,
            is_primary: i === 0,
            verified: false,
          })),
        )
        if (insPhoneErr) throw insPhoneErr
      }

      const { error: delEmailErr } = await supabase
        .from("customer_identifiers")
        .delete()
        .eq("customer_id", customerId)
        .eq("user_id", userId)
        .in("type", ["email", "additional_email"])
      if (delEmailErr) throw delEmailErr
      if (emailValues.length > 0) {
        const { error: insEmailErr } = await supabase.from("customer_identifiers").insert(
          emailValues.map((value, i) => ({
            user_id: userId,
            customer_id: customerId,
            type: "email",
            value,
            is_primary: i === 0,
            verified: false,
          })),
        )
        if (insEmailErr) throw insEmailErr
      }

      const { error: delNameErr } = await supabase
        .from("customer_identifiers")
        .delete()
        .eq("customer_id", customerId)
        .eq("user_id", userId)
        .eq("type", "name")
      if (delNameErr) throw delNameErr
      if (nameT) {
        const { error: insNameErr } = await supabase.from("customer_identifiers").insert({
          user_id: userId,
          customer_id: customerId,
          type: "name",
          value: nameT,
          is_primary: false,
          verified: false,
        })
        if (insNameErr) throw insNameErr
      }

      setContactEditMode(false)
      await reload()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setContactSaving(false)
    }
  }

  async function openCalendarEventPdf(eventId: string) {
    if (!supabase || !userId || !bundle) return
    const ev = bundle.calendarEvents.find((row) => row.id === eventId)
    if (!ev) return
    setPdfBusyId(`ev-${eventId}`)
    try {
      await openCalendarEventSummaryPdf(supabase, userId, ev)
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setPdfBusyId(null)
    }
  }

  async function openReceiptPdf(receiptId: string) {
    if (!supabase || !userId || !bundle) return
    const draft = bundle.receipts.find((r) => r.id === receiptId)
    if (!draft) return
    setPdfBusyId(`r-${receiptId}`)
    try {
      const template = await loadReceiptTemplateSettings(supabase, userId)
      const form = customReceiptDraftToFormState(draft)
      const bytes = await buildCustomReceiptPdfBytes(form, template)
      const slug = receiptId.slice(0, 8)
      downloadPdfBlob(bytes, `receipt-${slug}.pdf`)
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setPdfBusyId(null)
    }
  }

  function updateContactList(kind: "phones" | "emails", index: number, value: string) {
    setContactForm((prev) => {
      const next = [...prev[kind]]
      next[index] = value
      return { ...prev, [kind]: next }
    })
  }

  function addContactListRow(kind: "phones" | "emails") {
    setContactForm((prev) => ({ ...prev, [kind]: [...prev[kind], ""] }))
  }

  function removeContactListRow(kind: "phones" | "emails", index: number) {
    setContactForm((prev) => {
      const next = prev[kind].filter((_, i) => i !== index)
      return { ...prev, [kind]: next.length > 0 ? next : [""] }
    })
  }

  if (!customerId) {
    return (
      <div style={{ maxWidth: 720, padding: isMobile ? 16 : 24 }}>
        <button type="button" onClick={() => setPage("customers")} style={backBtnStyle}>
          ← Back to Customers
        </button>
        <p style={{ color: "#64748b", marginTop: 16 }}>No customer selected. Open a profile from the Customers list.</p>
      </div>
    )
  }

  const c = bundle?.customer
  const notesPast = c ? parseProfileNotesPast(c.notes_past) : []
  const hasMultipleContacts = bundle ? bundle.phones.length > 1 || bundle.emails.length > 1 : false
  const workflowBundle = bundle && profileMetadata ? loadAccountWorkflowBundleFromMetadata(profileMetadata) : null
  const quoteForWorkflow =
    bundle?.quotes.find((q) => parseQuoteInternalWorkflow(q.metadata).pendingNodeIds.length > 0) ?? bundle?.quotes[0] ?? null
  const quoteWorkflowState = quoteForWorkflow ? parseQuoteInternalWorkflow(quoteForWorkflow.metadata) : null
  const workflowSnapshot =
    profileMetadata != null
      ? loadCustomerWorkflowSnapshotFromProfile(profileMetadata, quoteForWorkflow?.id ?? null, quoteWorkflowState)
      : null
  const inferredWorkflow =
    bundle && workflowBundle
      ? inferCustomerWorkflowStep(workflowBundle.workflow, bundle, workflowSnapshot)
      : null
  const selfOmPolicy = parseOmCalendarPolicy(profileMetadata)
  const allowWorkflowBypass = selfOmPolicy.allow_bypass_workflow_approval === true

  const contactHeaderActions = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {contactEditMode ? (
        <>
          <button type="button" disabled={contactSaving} onClick={() => void saveContactJobSite()} style={primaryBtnStyle}>
            {contactSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={contactSaving}
            onClick={() => {
              setContactEditMode(false)
              if (bundle) {
                const row = bundle.customer
                const bc = formatDisplayText(row.best_contact_method, "")
                const best = (DEFAULT_BEST_CONTACT_OPTIONS as readonly string[]).includes(bc) ? bc : DEFAULT_BEST_CONTACT_OPTIONS[0]
                setContactForm({
                  customerName: formatDisplayText(row.display_name, ""),
                  phones: bundle.phones.length > 0 ? bundle.phones : bundle.phone ? [bundle.phone] : [""],
                  emails: bundle.emails.length > 0 ? bundle.emails : bundle.email ? [bundle.email] : [""],
                  serviceAddress: formatDisplayText(row.service_address, ""),
                  serviceLat: row.service_lat != null && Number.isFinite(Number(row.service_lat)) ? String(row.service_lat) : "",
                  serviceLng: row.service_lng != null && Number.isFinite(Number(row.service_lng)) ? String(row.service_lng) : "",
                  bestContact: best,
                })
              }
            }}
            style={backBtnStyle}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          {hasMultipleContacts ? (
            <button
              type="button"
              onClick={() => {
                setContactSplitMergeMode("separate")
                setContactSplitMergeOpen(true)
              }}
              style={backBtnStyle}
            >
              Separate contacts
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setContactSplitMergeMode("merge")
              setContactSplitMergeOpen(true)
            }}
            style={backBtnStyle}
          >
            Merge contacts
          </button>
          <button
            type="button"
            onClick={() => {
              setContactSectionOpen(true)
              setContactEditMode(true)
            }}
            style={backBtnStyle}
          >
            Edit
          </button>
        </>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: isMobile ? "12px 12px 32px" : "8px 24px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button type="button" onClick={backToCustomers} style={backBtnStyle}>
          ← Customers
        </button>
        <button type="button" onClick={() => void reload()} disabled={loading} style={backBtnStyle}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {err ? <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p> : null}
      {loading && !bundle ? <p style={{ color: "#64748b" }}>Loading customer profile…</p> : null}

      {bundle && c ? (
        <>
          <header
            style={{
              marginBottom: 20,
              padding: isMobile ? 16 : 20,
              borderRadius: 14,
              border: `1px solid ${theme.border}`,
              background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 55%)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? "1.35rem" : "1.75rem", fontWeight: 800, color: theme.text }}>
                  {formatDisplayText(c.display_name, "Customer profile")}
                </h1>
                <p style={{ margin: "8px 0 0", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
                  {formatDisplayText(bundle.contactLine, "—")}
                </p>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <CommunicationUrgencyBadge
                    level={
                      typeof c.communication_urgency === "string"
                        ? c.communication_urgency
                        : formatDisplayText(c.communication_urgency, "") || null
                    }
                  />
                  {formatDisplayText(c.job_pipeline_status, "") ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                      {formatDisplayText(c.job_pipeline_status)}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    Last update: {formatWhen(typeof c.last_activity_at === "string" ? c.last_activity_at : null)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    queueSchedulingCustomerPrefill(c.id)
                    setPage("calendar")
                  }}
                  style={secondaryBtnStyle}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => {
                    queueQuotesCustomerPrefill(c.id)
                    setPage("quotes")
                  }}
                  style={secondaryBtnStyle}
                >
                  Open estimate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    queueCustomReceiptCustomerPrefill(c.id)
                    setPage("calendar")
                  }}
                  style={secondaryBtnStyle}
                >
                  Custom receipt
                </button>
              </div>
            </div>
          </header>

          <CollapsibleProfileSection
            title="Contact & job site"
            open={contactSectionOpen || contactEditMode}
            onOpenChange={setContactSectionOpen}
            headerActions={contactHeaderActions}
          >
            {bundle.orgGroupLabel ? (
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
                {bundle.orgGroupLabel} — addresses on the same business domain are grouped here by default. Use <strong>Separate contacts</strong> to
                split phones or emails into their own customer without merging them back.
              </p>
            ) : null}
            {contactEditMode ? (
              <div style={{ display: "grid", gap: 12, fontSize: 14, maxWidth: 520 }}>
                <Field label="Name">
                  <input
                    value={contactForm.customerName}
                    onChange={(e) => setContactForm((p) => ({ ...p, customerName: e.target.value }))}
                    style={{ ...theme.formInput, width: "100%" }}
                  />
                </Field>
                <Field label="Phone numbers">
                  <div style={{ display: "grid", gap: 8 }}>
                    {contactForm.phones.map((phone, i) => (
                      <div key={`phone-${i}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          value={phone}
                          onChange={(e) => updateContactList("phones", i, e.target.value)}
                          style={{ ...theme.formInput, flex: 1 }}
                          placeholder={i === 0 ? "Primary phone" : "Additional phone"}
                        />
                        {contactForm.phones.length > 1 ? (
                          <button type="button" onClick={() => removeContactListRow("phones", i)} style={backBtnStyle}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button type="button" onClick={() => addContactListRow("phones")} style={backBtnStyle}>
                      + Add phone
                    </button>
                  </div>
                </Field>
                <Field label="Email addresses">
                  <div style={{ display: "grid", gap: 8 }}>
                    {contactForm.emails.map((email, i) => (
                      <div key={`email-${i}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => updateContactList("emails", i, e.target.value)}
                          style={{ ...theme.formInput, flex: 1 }}
                          placeholder={i === 0 ? "Primary email" : "Additional email"}
                        />
                        {contactForm.emails.length > 1 ? (
                          <button type="button" onClick={() => removeContactListRow("emails", i)} style={backBtnStyle}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button type="button" onClick={() => addContactListRow("emails")} style={backBtnStyle}>
                      + Add email
                    </button>
                  </div>
                </Field>
                <Field label="Best contact">
                  <select
                    value={contactForm.bestContact}
                    onChange={(e) => setContactForm((p) => ({ ...p, bestContact: e.target.value }))}
                    style={{ ...theme.formInput, width: "100%", maxWidth: 280 }}
                  >
                    {DEFAULT_BEST_CONTACT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Service address">
                  <textarea
                    value={contactForm.serviceAddress}
                    onChange={(e) => setContactForm((p) => ({ ...p, serviceAddress: e.target.value }))}
                    rows={3}
                    style={{ ...theme.formInput, width: "100%", resize: "vertical" }}
                  />
                </Field>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <button type="button" disabled={serviceGeocodeBusy} onClick={() => void geocodeServiceAddress()} style={backBtnStyle}>
                    {serviceGeocodeBusy ? "Looking up…" : "Look up coordinates"}
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Latitude">
                    <input
                      value={contactForm.serviceLat}
                      onChange={(e) => setContactForm((p) => ({ ...p, serviceLat: e.target.value }))}
                      style={{ ...theme.formInput, width: "100%" }}
                    />
                  </Field>
                  <Field label="Longitude">
                    <input
                      value={contactForm.serviceLng}
                      onChange={(e) => setContactForm((p) => ({ ...p, serviceLng: e.target.value }))}
                      style={{ ...theme.formInput, width: "100%" }}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                {bundle.phones.length > 1 ? (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.04 }}>
                      Phone numbers
                    </div>
                    <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                      {bundle.phones.map((ph) => (
                        <div key={ph} style={{ fontWeight: 600, color: theme.text }}>
                          {ph}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ProfileRow label="Phone" value={formatDisplayText(bundle.phone, "—")} />
                )}
                {bundle.emails.length > 1 ? (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.04 }}>
                      Email addresses
                    </div>
                    <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
                      {bundle.emails.map((addr) => (
                        <div
                          key={addr}
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: `1px solid ${theme.border}`,
                            background: "#f8fafc",
                          }}
                        >
                          <span style={{ fontWeight: 600, color: theme.text, wordBreak: "break-all" }}>{addr}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ProfileRow label="Email" value={formatDisplayText(bundle.email, "—")} />
                )}
                <ProfileRow label="Best contact" value={formatDisplayText(c.best_contact_method, "—")} />
                <ProfileRow label="Service address" value={formatDisplayText(c.service_address, "—")} />
                {c.service_lat != null && c.service_lng != null ? (
                  <ProfileRow label="Coordinates" value={`${c.service_lat}, ${c.service_lng}`} />
                ) : null}
              </div>
            )}
          </CollapsibleProfileSection>

          {c ? (
            <CustomerContactSplitMergeModal
              open={contactSplitMergeOpen}
              mode={contactSplitMergeMode}
              onClose={() => setContactSplitMergeOpen(false)}
              userId={userId}
              customerId={c.id}
              customerName={c.display_name ?? undefined}
              phones={bundle.phones}
              emails={bundle.emails}
              onComplete={({ newCustomerId }) => {
                if (newCustomerId) {
                  queueCustomerProfile(newCustomerId)
                  setPage("customer-profile")
                } else {
                  void reload()
                }
              }}
            />
          ) : null}

          {formatDisplayText(c.notes) || notesPast.length > 0 ? (
            <CollapsibleProfileSection title="Notes">
              {formatDisplayText(c.notes) ? (
                <p style={{ margin: notesPast.length > 0 ? "0 0 12px" : 0, fontSize: 14, color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {formatDisplayText(c.notes)}
                </p>
              ) : null}
              {notesPast.length > 0 ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {notesPast.map((n) => (
                    <div
                      key={n.id}
                      style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${theme.border}`, background: "#f8fafc" }}
                    >
                      {n.saved_at ? (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>{formatWhen(n.saved_at)}</div>
                      ) : null}
                      <div style={{ fontSize: 14, color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{n.text}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CollapsibleProfileSection>
          ) : null}

          <CustomerCoiQuickActions
            userId={userId}
            customerId={c.id}
            customerName={c.display_name ?? undefined}
            customerMetadata={c.metadata}
            calendarEvents={bundle.calendarEvents.map((ev) => ({
              id: ev.id,
              title: formatDisplayText(ev.title, "Untitled job"),
              quote_id: ev.quote_id,
            }))}
            onUpdated={() => void reload()}
          />

          {workflowBundle && inferredWorkflow ? (
            <div style={{ marginBottom: 16 }}>
              <CustomerWorkflowStatusPanel
                workflow={workflowBundle.workflow}
                inferred={inferredWorkflow}
                allowBypass={allowWorkflowBypass}
                onOpenWorkflow={() => setPage("business-workflow")}
              />
            </div>
          ) : null}

          <CollapsibleProfileSection title="Job paperwork" defaultOpen>
            <Timeline
              rows={[
                ...bundle.quotes.map((q) => ({
                  key: `est-${q.id}`,
                  title: `Estimate · ${formatDisplayText(q.title, q.id.slice(0, 8))}`,
                  meta: `${estimateDisplayStatus(q.status, q.metadata)} · ${formatUsdAmount(q.total) ?? "—"} · ${formatWhen(q.updated_at ?? q.created_at)}`,
                  body: `Document ID: EST-${q.id.slice(0, 8).toUpperCase()}`,
                  onClick: () => void openEstimatePdf(q.id),
                })),
                ...bundle.workOrders.map((w) => ({
                  key: `wo-${w.id}`,
                  title: `Work order · ${w.work_order_number}`,
                  meta: `${w.status} · ${formatWhen(w.updated_at)}`,
                  body: w.estimate_title,
                  onClick: () => leaveProfileTo("operations-work_orders"),
                })),
                ...bundle.purchaseOrders.map((p) => ({
                  key: `po-${p.id}`,
                  title: `Purchase order · ${p.po_number}`,
                  meta: `${p.status} · ${formatWhen(p.updated_at)}`,
                  body: p.description,
                  onClick: () => leaveProfileTo("operations-purchase_orders"),
                })),
                ...bundle.invoices.map((inv) => ({
                  key: `inv-${inv.id}`,
                  title: `Invoice / payment · ${formatUsdAmount(inv.amount) ?? "—"}`,
                  meta: `${inv.status} · ${formatWhen(inv.created_at)}`,
                  body: inv.description,
                  onClick: () => leaveProfileTo("payments"),
                })),
                ...bundle.receipts.map((r) => ({
                  key: `rcpt-${r.id}`,
                  title: `Receipt · ${formatDisplayText(r.job_title, "Custom receipt")}`,
                  meta: receiptDisplayStatus(r),
                  body: `Document ID: RCPT-${r.id.slice(0, 8).toUpperCase()}`,
                  onClick: () => leaveProfileTo("calendar", () => queueCustomReceiptCustomerPrefill(c.id)),
                })),
              ].slice(0, 40)}
            />
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Activity history" badge={bundle.commEvents.length || undefined}>
            <ActivityHistoryTabs events={bundle.commEvents} />
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Calendar events" badge={bundle.calendarEvents.length || undefined}>
            {bundle.calendarEvents.length === 0 ? (
              <Empty text="No scheduled jobs linked to this customer." />
            ) : (
              <Timeline
                rows={bundle.calendarEvents.map((ev) => {
                  const status = calendarEventDisplayStatus(ev)
                  const jobTypeLabel = ev.job_type_name?.trim() || (ev.job_type_id ? "Job type selected" : null)
                  const metaParts = [
                    status,
                    formatWhen(ev.start_at),
                    jobTypeLabel ? `Job type: ${jobTypeLabel}` : null,
                    ev.quote_id ? "From estimate" : null,
                  ].filter(Boolean)
                  return {
                    key: ev.id,
                    title: formatDisplayText(ev.title, "Untitled job"),
                    meta: metaParts.join(" · "),
                    body: formatDisplayText(ev.notes, ""),
                    onClick: () => setEventView(ev),
                    actions: (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        <MiniBtn label="View details" onClick={() => setEventView(ev)} />
                        {(status === "Upcoming" || status === "Recurring") ? (
                          <MiniBtn
                            label="Edit in Scheduling"
                            onClick={() => {
                              queueSchedulingEventView(ev.id)
                              setPage("calendar")
                            }}
                          />
                        ) : null}
                        {status === "Complete" ? (
                          <MiniBtn
                            label={pdfBusyId === `ev-${ev.id}` ? "Opening PDF…" : "View PDF summary"}
                            onClick={() => void openCalendarEventPdf(ev.id)}
                          />
                        ) : null}
                        <CustomerEventCoiButton
                          userId={userId}
                          customerId={c.id}
                          customerMetadata={c.metadata}
                          eventId={ev.id}
                          quoteId={ev.quote_id ?? null}
                          onUpdated={() => void reload()}
                        />
                      </div>
                    ),
                  }
                })}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Estimates" badge={bundle.quotes.length || undefined}>
            {bundle.quotes.length === 0 ? (
              <Empty text="No estimates for this customer yet." />
            ) : (
              <Timeline
                rows={bundle.quotes.map((q) => {
                  const status = estimateDisplayStatus(q.status, q.metadata)
                  const totalLabel = formatUsdAmount(q.total)
                  return {
                    key: q.id,
                    title: formatDisplayText(q.title, "") || `Estimate ${q.id.slice(0, 8)}`,
                    meta: `${status}${totalLabel ? ` · ${totalLabel}` : ""} · Updated ${formatWhen(q.updated_at ?? q.created_at)}`,
                    body: "",
                    actions: (
                      <MiniBtn
                        label={pdfBusyId === `q-${q.id}` ? "Opening PDF…" : "View PDF"}
                        onClick={() => void openEstimatePdf(q.id)}
                      />
                    ),
                  }
                })}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Work orders" badge={bundle.workOrders.length || undefined}>
            {bundle.workOrders.length === 0 ? (
              <Empty text="No work orders linked to this customer yet." />
            ) : (
              <Timeline
                rows={bundle.workOrders.map((w) => ({
                  key: w.id,
                  title: w.work_order_number,
                  meta: `${w.status} · ${formatWhen(w.updated_at)}`,
                  body: w.estimate_title,
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Purchase orders" badge={bundle.purchaseOrders.length || undefined}>
            {bundle.purchaseOrders.length === 0 ? (
              <Empty text="No purchase orders on file for this customer yet." />
            ) : (
              <Timeline
                rows={bundle.purchaseOrders.map((p) => ({
                  key: p.id,
                  title: p.po_number,
                  meta: `${p.status} · ${formatWhen(p.updated_at)}`,
                  body: `${p.vendor_name} — ${p.description}`,
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Invoices" badge={bundle.invoices.length || undefined}>
            {bundle.invoices.length === 0 ? (
              <Empty text="No invoices or payment requests for this customer yet." />
            ) : (
              <Timeline
                rows={bundle.invoices.map((inv) => ({
                  key: inv.id,
                  title: formatDisplayText(inv.description, "Payment request"),
                  meta: `${inv.status} · ${formatUsdAmount(inv.amount) ?? "—"} · ${formatWhen(inv.created_at)}`,
                  body: inv.payment_url ? `Pay link on file` : "",
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Receipts" badge={bundle.receipts.length || undefined}>
            {bundle.receipts.length === 0 ? (
              <Empty text="No saved custom receipts on this profile." />
            ) : (
              <Timeline
                rows={bundle.receipts.map((r) => {
                  const status = receiptDisplayStatus(r)
                  const { subtotal } = formatCustomReceiptLineItems(r.line_items)
                  const amount = r.manual_amount != null && Number.isFinite(r.manual_amount) ? r.manual_amount : subtotal
                  return {
                    key: r.id,
                    title: formatDisplayText(r.job_title, "Custom receipt"),
                    meta: `${status}${amount > 0 ? ` · ${formatUsdAmount(amount)}` : ""} · ${formatWhen(r.updated_at ?? r.created_at)} · ${r.line_items.length} line(s)`,
                    body: formatDisplayText(r.notes, ""),
                    actions: (
                      <MiniBtn
                        label={pdfBusyId === `r-${r.id}` ? "Opening PDF…" : "View PDF"}
                        onClick={() => void openReceiptPdf(r.id)}
                      />
                    ),
                  }
                })}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Reports" badge={bundle.reports.length || undefined}>
            {bundle.reports.length === 0 ? (
              <Empty text="No specialty reports saved for this customer." />
            ) : (
              <Timeline
                rows={bundle.reports.map((r) => ({
                  key: r.id,
                  title: formatDisplayText(r.title, "Report"),
                  meta: `Updated ${formatWhen(r.updated_at)}`,
                  body: "",
                  actions: (
                    <MiniBtn
                      label="Open in Estimates"
                      onClick={() => {
                        queueQuotesCustomerPrefill(c.id)
                        setPage("quotes")
                      }}
                    />
                  ),
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Lead history" badge={bundle.leads.length || undefined}>
            {bundle.leads.length === 0 ? (
              <Empty text="No leads linked to this customer." />
            ) : (
              <Timeline
                rows={bundle.leads.map((l) => ({
                  key: l.id,
                  title: formatDisplayText(l.title, "") || "Lead",
                  meta: `${formatDisplayText(l.status, "—")} · ${formatWhen(l.created_at)}`,
                  body: "",
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Lead score" defaultOpen>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
                {leadFitBadgeEl((c.fit_classification as "hot" | "maybe" | "bad" | null) ?? null)}
                {c.fit_confidence != null && typeof c.fit_confidence === "number" ? (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Confidence: {Math.round(c.fit_confidence * 100)}%</span>
                ) : null}
                {c.fit_source ? <span style={{ fontSize: 12, color: "#6b7280" }}>Source: {c.fit_source}</span> : null}
                {c.fit_manually_overridden ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed" }}>Manual override</span>
                ) : null}
              </div>
              {formatDisplayText(c.fit_reason) ? (
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                  {formatDisplayText(c.fit_reason)}
                </p>
              ) : (
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>
                  No score yet — run auto scoring or set manually below.
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <select
                  value={manualFitChoice}
                  onChange={(e) => setManualFitChoice(e.target.value as "hot" | "maybe" | "bad" | "")}
                  style={{ padding: "6px 10px", fontSize: 13, maxWidth: 160, borderRadius: 8, border: `1px solid ${theme.border}` }}
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
            </div>
          </CollapsibleProfileSection>
        </>
      ) : null}

      {eventView ? (
        <CalendarEventViewModal
          event={eventView}
          assigneeLabel={assigneeLabelForEvent(eventView)}
          scopeOfWork={scopeOfWorkForEvent(eventView)}
          materialsUsed={materialsForEvent(eventView)}
          linkedDocs={linkedDocsForEvent(eventView)}
          onClose={() => setEventView(null)}
          onEditInCalendar={
            calendarEventDisplayStatus(eventView) === "Upcoming" ||
            calendarEventDisplayStatus(eventView) === "Recurring"
              ? () => {
                  leaveProfileTo("calendar", () => queueSchedulingEventView(eventView.id))
                  setEventView(null)
                }
              : undefined
          }
          onViewPdf={
            eventView.completed_at
              ? () => {
                  const ev = bundle?.calendarEvents.find((e) => e.id === eventView.id) ?? eventView
                  void openCalendarEventSummaryPdf(supabase!, userId!, ev).catch((e: unknown) =>
                    alert(formatAppError(e)),
                  )
                }
              : undefined
          }
          onExportPdf={() => {
            if (!supabase || !userId) return
            setEventExportBusy(true)
            const linkedSummary = linkedDocsForEvent(eventView)
              .map((d) => `${d.label}: ${d.value}`)
              .join("\n")
            void exportCalendarEventDetailPdf(supabase, userId, eventView, {
              assigneeLabel: assigneeLabelForEvent(eventView),
              scopeOfWork: scopeOfWorkForEvent(eventView),
              materialsUsed: materialsForEvent(eventView),
              linkedSummary,
            })
              .catch((e: unknown) => alert(formatAppError(e)))
              .finally(() => setEventExportBusy(false))
          }}
          pdfBusy={pdfBusyId === `ev-${eventView.id}`}
          exportBusy={eventExportBusy}
        />
      ) : null}

      {estimatePdfView ? (
        <DocumentPdfViewerModal
          title={estimatePdfView.title}
          pdfUrl={estimatePdfView.url}
          preparedAtLabel={estimatePdfView.preparedAtLabel}
          onClose={() => {
            if (estimatePdfView.revokeOnClose) URL.revokeObjectURL(estimatePdfView.url)
            setEstimatePdfView(null)
          }}
          onEditEstimate={() => {
            const quoteId = estimatePdfView.quoteId
            if (estimatePdfView.revokeOnClose) URL.revokeObjectURL(estimatePdfView.url)
            setEstimatePdfView(null)
            leaveProfileTo("quotes", () => {
              queueQuotesCustomerPrefill(customerId)
              queueQuotesOpenQuote(quoteId)
            })
          }}
        />
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.04, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.04 }}>
        {label}
      </div>
      <div style={{ marginTop: 2, color: theme.text, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>{text}</p>
}

function Timeline({
  rows,
}: {
  rows: { key: string; title: string; meta: string; body: string; actions?: ReactNode; onClick?: () => void }[]
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div
          key={row.key}
          role={row.onClick ? "button" : undefined}
          tabIndex={row.onClick ? 0 : undefined}
          onClick={row.onClick}
          onKeyDown={
            row.onClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    row.onClick?.()
                  }
                }
              : undefined
          }
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: "#f8fafc",
            cursor: row.onClick ? "pointer" : "default",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, color: theme.text }}>{row.title}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{row.meta}</div>
          {row.body ? <div style={{ fontSize: 13, color: "#475569", marginTop: 6, whiteSpace: "pre-wrap" }}>{row.body}</div> : null}
          {row.actions ? (
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {row.actions}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function MiniBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={miniBtnStyle}>
      {label}
    </button>
  )
}

const backBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
  color: theme.text,
}

const primaryBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
  color: "#fff",
}

const secondaryBtnStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
}

const miniBtnStyle: CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  color: theme.text,
}
