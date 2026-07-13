import { useCallback, useEffect, useMemo, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../../styles/theme"
import { loadCustomerProfileBundle, type CustomerProfileBundle } from "../../lib/customerProfileData"
import { formatAppError } from "../../lib/formatAppError"
import { estimateDisplayStatus, formatUsdAmount, receiptDisplayStatus } from "../../lib/customerDocumentStatus"
import { openEstimatePdfForProfile } from "../../lib/estimatePdfExport"
import { openWorkOrderDocumentPdf } from "../../lib/workOrderPdfExport"
import { openPurchaseOrderDocumentPdf } from "../../lib/purchaseOrderPdfExport"
import { parseQuoteInternalWorkflow, loadAccountWorkflowBundleFromMetadata } from "../../lib/estimateWorkflowRuntime"
import { templateFormFromMetadata } from "../../lib/jobDocumentTemplate"
import { WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "../../lib/workOrderDocumentTemplate"
import { PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "../../lib/purchaseOrderDocumentTemplate"
import { customReceiptDraftToFormState, loadReceiptTemplateSettings, buildCustomReceiptPdfBytes } from "../../lib/customReceipt"
import { downloadPdfBlob } from "../../lib/documentPdf"
import DocumentPdfViewerModal from "../DocumentPdfViewerModal"
import CustomerWorkflowProgressViewer from "../CustomerWorkflowProgressViewer"
import { loadCustomerWorkflowSnapshotFromProfile } from "../../lib/customerWorkflowRouting"
import { buildCustomerWorkflowStepCompleteUpdate } from "../../lib/customerWorkflowProgress"
import type { WorkOrderRecord } from "../../lib/workOrders"
import type { PurchaseOrderRecord } from "../../lib/purchaseOrders"
import type { PaymentRequestRow } from "../../lib/paymentRequests"
import { inferCustomerWorkflowStep } from "../../lib/inferCustomerWorkflowStep"
import { loadLinkableOrgUsers, type LinkableOrgUser } from "../../lib/orgChartMembers"
import {
  queueQuotesOpenQuote,
  queueOpenCustomReceiptModal,
} from "../../lib/workflowNavigation"
import { WorkOrderEditorModal } from "../document-editors/WorkOrderEditorModal"
import { PurchaseOrderEditorModal } from "../document-editors/PurchaseOrderEditorModal"
import { PaymentRequestEditorModal } from "../document-editors/PaymentRequestEditorModal"
import type { CustomerQuickViewTabId } from "./customerQuickViewTabs"
import type { CommunicationUrgency } from "../../lib/customerUrgency"
import CustomerCoiQuickActions from "../CustomerCoiQuickActions"
import { CustomerQuickViewTabVisibilityEditor } from "./CustomerQuickViewTabVisibilityEditor"
import {
  buildCustomerTabVisibilityPayload,
  CUSTOMER_QUICK_VIEW_TAB_VISIBILITY_META_KEY,
  defaultCustomerQuickViewTabVisibility,
  parseCustomerQuickViewPrefs,
  resolveEffectiveTabVisibility,
  type CustomerQuickViewPrefs,
  type CustomerQuickViewTabVisibility,
} from "../../lib/customerQuickViewPrefs"
import { calendarEventDisplayStatus } from "../../lib/calendarEventProfile"
import { queueSchedulingCustomerPrefill, queueSchedulingEventView } from "../../lib/workflowNavigation"
import { useSandboxTrainingMode } from "../../lib/sandboxTrainingUi"

type CustomerRowLite = {
  id: string
  display_name: string | null
  customer_identifiers?: { type: string; value: string }[] | null
  metadata?: unknown
}

type ContactForm = {
  customerName: string
  phone: string
  email: string
  serviceAddress: string
  serviceLat: string
  serviceLng: string
  bestContact: string
  jobStatus: string
  urgency: CommunicationUrgency
}

type Props = {
  tab: CustomerQuickViewTabId
  customer: CustomerRowLite
  supabase: SupabaseClient | null
  userId: string
  profileMetadata: Record<string, unknown> | null
  globalQuickViewPrefs: CustomerQuickViewPrefs
  setPage?: (page: string) => void
  onOpenFullProfile: () => void
  contactForm: ContactForm
  setContactForm: React.Dispatch<React.SetStateAction<ContactForm>>
  onSaveContact: () => void
  contactSaving: boolean
  onCustomerMetadataUpdated?: (metadata: unknown) => void
  onRequestCustomerPayment?: () => void
  showCustomerPayments?: boolean
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

export function CustomerQuickViewSidePane({
  tab,
  customer,
  supabase,
  userId,
  profileMetadata,
  globalQuickViewPrefs,
  setPage,
  onOpenFullProfile,
  contactForm,
  setContactForm,
  onSaveContact,
  contactSaving,
  onCustomerMetadataUpdated,
  onRequestCustomerPayment,
  showCustomerPayments,
}: Props) {
  const sandboxTraining = useSandboxTrainingMode()
  const [bundle, setBundle] = useState<CustomerProfileBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  const [linkableUsers, setLinkableUsers] = useState<LinkableOrgUser[]>([])
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrderRecord | null>(null)
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<PurchaseOrderRecord | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<PaymentRequestRow | null>(null)
  const [customerSettingsDraft, setCustomerSettingsDraft] = useState<CustomerQuickViewTabVisibility>(
    defaultCustomerQuickViewTabVisibility(),
  )
  const [customerSettingsSaving, setCustomerSettingsSaving] = useState(false)
  const [workflowStepCompleteBusy, setWorkflowStepCompleteBusy] = useState(false)
  const [estimatePdfView, setEstimatePdfView] = useState<{
    quoteId: string
    url: string
    title: string
    preparedAtLabel?: string | null
    revokeOnClose: boolean
  } | null>(null)

  const woTemplate = useMemo(
    () => templateFormFromMetadata(WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS, profileMetadata ?? {}),
    [profileMetadata],
  )
  const poTemplate = useMemo(
    () => templateFormFromMetadata(PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS, profileMetadata ?? {}),
    [profileMetadata],
  )

  const loadBundle = useCallback(async () => {
    if (!supabase || !userId || !customer.id) return
    setLoading(true)
    setError("")
    try {
      const data = await loadCustomerProfileBundle(supabase, userId, customer.id)
      setBundle(data)
    } catch (e) {
      setError(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [supabase, userId, customer.id])

  useEffect(() => {
    if (tab === "contact" || tab === "workflow" || tab === "communications" || tab === "customer_settings") {
      return
    }
    void loadBundle()
  }, [tab, loadBundle])

  useEffect(() => {
    if (tab !== "customer_settings") return
    setCustomerSettingsDraft(resolveEffectiveTabVisibility(globalQuickViewPrefs, customer.metadata))
  }, [tab, globalQuickViewPrefs, customer.metadata])

  useEffect(() => {
    if (!supabase || !userId || tab !== "workflow") return
    void loadBundle()
    void loadLinkableOrgUsers(supabase, userId).then(setLinkableUsers)
  }, [supabase, userId, tab, loadBundle, customer.id, customer.metadata, profileMetadata])

  if (
    loading &&
    !bundle &&
    tab !== "contact" &&
    tab !== "workflow" &&
    tab !== "communications" &&
    tab !== "customer_settings" &&
    tab !== "insurance_coi"
  ) {
    return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Loading…</p>
  }
  if (error && !bundle) {
    return <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p>
  }

  if (tab === "contact") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          Contact and job fields for this customer. Save updates the record used across Tradesman.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <Field label="Customer name" value={contactForm.customerName} onChange={(v) => setContactForm((f) => ({ ...f, customerName: v }))} />
          <Field label="Phone" value={contactForm.phone} onChange={(v) => setContactForm((f) => ({ ...f, phone: v }))} />
          <Field label="Email" value={contactForm.email} onChange={(v) => setContactForm((f) => ({ ...f, email: v }))} />
          <Field label="Best contact" value={contactForm.bestContact} onChange={(v) => setContactForm((f) => ({ ...f, bestContact: v }))} />
          <Field label="Job status" value={contactForm.jobStatus} onChange={(v) => setContactForm((f) => ({ ...f, jobStatus: v }))} />
          <Field label="Service address" value={contactForm.serviceAddress} onChange={(v) => setContactForm((f) => ({ ...f, serviceAddress: v }))} multiline />
        </div>
        <button
          type="button"
          disabled={contactSaving}
          onClick={onSaveContact}
          style={{
            justifySelf: "start",
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: contactSaving ? "wait" : "pointer",
          }}
        >
          {contactSaving ? "Saving…" : "Save contact"}
        </button>
      </div>
    )
  }

  if (tab === "full_profile") {
    const c = bundle?.customer
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          Summary for this customer. Open the full profile for calendar events, reports, lead history, and advanced workflow tools.
        </p>
        <button
          type="button"
          onClick={onOpenFullProfile}
          style={{
            justifySelf: "start",
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: theme.charcoal,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Open full profile page
        </button>
        {c ? (
          <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155" }}>
            <div>
              <strong>Pipeline:</strong> {c.job_pipeline_status?.trim() || "—"}
            </div>
            <div>
              <strong>Urgency:</strong> {c.communication_urgency?.trim() || "—"}
            </div>
            <div>
              <strong>Estimates:</strong> {bundle?.quotes.length ?? 0} · <strong>Work orders:</strong> {bundle?.workOrders.length ?? 0} ·{" "}
              <strong>POs:</strong> {bundle?.purchaseOrders.length ?? 0}
            </div>
            {c.notes?.trim() ? (
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, padding: 12, borderRadius: 8, background: "#fff", border: `1px solid ${theme.border}` }}>
                {c.notes.trim()}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  if (tab === "insurance_coi") {
    return (
      <CustomerCoiQuickActions
        userId={userId}
        customerId={customer.id}
        customerName={customer.display_name ?? undefined}
        customerMetadata={customer.metadata}
        calendarEvents={(bundle?.calendarEvents ?? []).map((ev) => ({
          id: ev.id,
          title: ev.title,
          quote_id: ev.quote_id,
        }))}
        onUpdated={() => void loadBundle()}
      />
    )
  }

  if (tab === "scheduling") {
    const events = bundle?.calendarEvents ?? []
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          Calendar events linked to this customer. Use Schedule in the tab menu to add a new appointment.
        </p>
        {events.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>No calendar events linked yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {events.map((ev) => {
              const when = ev.start_at
                ? new Date(ev.start_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                : "—"
              const status = calendarEventDisplayStatus(ev)
              return (
                <div
                  key={ev.id}
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>{ev.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {when} · {status}
                    {ev.quote_id ? " · From estimate" : ""}
                  </div>
                  {setPage ? (
                    <button
                      type="button"
                      onClick={() => {
                        queueSchedulingEventView(ev.id)
                        queueSchedulingCustomerPrefill(customer.id)
                        setPage("calendar")
                      }}
                      style={{
                        marginTop: 8,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        background: "#fff",
                        color: "#0f172a",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Open in scheduling
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (tab === "customer_settings") {
    async function saveCustomerSettings() {
      if (!supabase || !userId) return
      setCustomerSettingsSaving(true)
      try {
        const { data, error: fetchErr } = await supabase
          .from("customers")
          .select("metadata")
          .eq("id", customer.id)
          .eq("user_id", userId)
          .maybeSingle()
        if (fetchErr) throw fetchErr
        const prevMeta =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? { ...(data.metadata as Record<string, unknown>) }
            : {}
        prevMeta[CUSTOMER_QUICK_VIEW_TAB_VISIBILITY_META_KEY] = buildCustomerTabVisibilityPayload(customerSettingsDraft)
        const { error } = await supabase
          .from("customers")
          .update({ metadata: prevMeta, updated_at: new Date().toISOString() })
          .eq("id", customer.id)
          .eq("user_id", userId)
        if (error) throw error
        onCustomerMetadataUpdated?.(prevMeta)
      } catch (e) {
        alert(formatAppError(e))
      } finally {
        setCustomerSettingsSaving(false)
      }
    }

    const globalPrefs = parseCustomerQuickViewPrefs(profileMetadata)
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          Override which tabs are visible for <strong>{customer.display_name?.trim() || "this customer"}</strong> only.
          Defaults come from the main Settings button next to Alerts.
        </p>
        <CustomerQuickViewTabVisibilityEditor
          visibility={customerSettingsDraft}
          onChange={setCustomerSettingsDraft}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            onClick={() =>
              setCustomerSettingsDraft(resolveEffectiveTabVisibility(globalPrefs, undefined))
            }
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f1f5f9",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              color: "#0f172a",
            }}
          >
            Reset to account defaults
          </button>
          <button
            type="button"
            disabled={customerSettingsSaving}
            onClick={() => void saveCustomerSettings()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: customerSettingsSaving ? "wait" : "pointer",
            }}
          >
            {customerSettingsSaving ? "Saving…" : "Save for this customer"}
          </button>
        </div>
      </div>
    )
  }

  if (tab === "workflow") {
    const workflowBundle = profileMetadata ? loadAccountWorkflowBundleFromMetadata(profileMetadata) : null
    const quoteForWorkflow =
      bundle?.quotes.find((q) => parseQuoteInternalWorkflow(q.metadata).pendingNodeIds.length > 0) ?? bundle?.quotes[0] ?? null
    const quoteWorkflowState = quoteForWorkflow ? parseQuoteInternalWorkflow(quoteForWorkflow.metadata) : null
    const workflowSnapshot =
      profileMetadata != null
        ? loadCustomerWorkflowSnapshotFromProfile(profileMetadata, quoteForWorkflow?.id ?? null, quoteWorkflowState, bundle?.customer.metadata ?? customer.metadata)
        : null
    const inferred =
      bundle && workflowBundle ? inferCustomerWorkflowStep(workflowBundle.workflow, bundle, workflowSnapshot) : null
    const activeNodeId = inferred?.currentNodeId ?? workflowSnapshot?.activeNodeId ?? null

    async function completeWorkflowStep(nodeId: string) {
      if (!supabase || !userId || !workflowBundle || !inferred) return
      setWorkflowStepCompleteBusy(true)
      try {
        const update = buildCustomerWorkflowStepCompleteUpdate({
          workflow: workflowBundle.workflow,
          orgChart: workflowBundle.orgChart,
          customerMetadata: bundle?.customer.metadata ?? customer.metadata,
          completedNodeIds: inferred.completedNodeIds,
          nodeId,
          quoteId: quoteForWorkflow?.id ?? null,
        })
        const nowIso = new Date().toISOString()
        const { error: custErr } = await supabase
          .from("customers")
          .update({
            metadata: update.metadata,
            job_pipeline_status: update.jobPipelineStatus,
            updated_at: nowIso,
          })
          .eq("id", customer.id)
          .eq("user_id", userId)
        if (custErr) throw custErr
        onCustomerMetadataUpdated?.(update.metadata)
        await loadBundle()
      } catch (e) {
        alert(formatAppError(e))
      } finally {
        setWorkflowStepCompleteBusy(false)
      }
    }

    if (!workflowBundle) {
      return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No company workflow configured yet.</p>
    }

    if (loading && !bundle) {
      return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Loading workflow…</p>
    }

    return (
      <CustomerWorkflowProgressViewer
        variant="inline"
        open
        onClose={() => {}}
        workflow={workflowBundle.workflow}
        orgChart={workflowBundle.orgChart}
        externalContacts={workflowBundle.externalContacts}
        linkableUsers={linkableUsers}
        completedNodeIds={inferred?.completedNodeIds ?? workflowSnapshot?.completedNodeIds ?? []}
        pendingNodeIds={quoteWorkflowState?.pendingNodeIds ?? []}
        currentNodeId={activeNodeId}
        onCompleteStep={(nodeId) => void completeWorkflowStep(nodeId)}
        completeBusy={workflowStepCompleteBusy}
      />
    )
  }

  const docTab = tab as "estimates" | "work_orders" | "purchase_orders" | "invoices" | "receipts"

  async function viewEstimate(quoteId: string) {
    if (!supabase) return
    setPdfBusy(`q-${quoteId}`)
    try {
      const view = await openEstimatePdfForProfile(supabase, userId, quoteId)
      const q = bundle?.quotes.find((row) => row.id === quoteId)
      setEstimatePdfView({
        quoteId,
        url: view.url,
        title: q?.title?.trim() || `Estimate ${quoteId.slice(0, 8).toUpperCase()}`,
        preparedAtLabel: view.preparedAtLabel ?? undefined,
        revokeOnClose: view.url.startsWith("blob:"),
      })
    } catch (e) {
      alert(formatAppError(e))
    } finally {
      setPdfBusy(null)
    }
  }

  async function downloadEstimate(quoteId: string) {
    if (!supabase) return
    setPdfBusy(`q-${quoteId}`)
    try {
      const view = await openEstimatePdfForProfile(supabase, userId, quoteId)
      const res = await fetch(view.url)
      const blob = await res.blob()
      const bytes = new Uint8Array(await blob.arrayBuffer())
      downloadPdfBlob(bytes, `estimate-${quoteId.slice(0, 8)}.pdf`)
      if (view.url.startsWith("blob:")) URL.revokeObjectURL(view.url)
    } catch (e) {
      alert(formatAppError(e))
    } finally {
      setPdfBusy(null)
    }
  }

  async function viewWorkOrder(order: WorkOrderRecord) {
    if (!supabase) return
    setPdfBusy(`wo-${order.id}`)
    try {
      await openWorkOrderDocumentPdf(supabase, userId, order, woTemplate)
    } catch (e) {
      alert(formatAppError(e))
    } finally {
      setPdfBusy(null)
    }
  }

  async function viewPurchaseOrder(order: PurchaseOrderRecord) {
    if (!supabase) return
    setPdfBusy(`po-${order.id}`)
    try {
      await openPurchaseOrderDocumentPdf(supabase, userId, order, poTemplate)
    } catch (e) {
      alert(formatAppError(e))
    } finally {
      setPdfBusy(null)
    }
  }

  async function downloadReceipt(receiptId: string) {
    if (!supabase || !bundle) return
    const draft = bundle.receipts.find((r) => r.id === receiptId)
    if (!draft) return
    setPdfBusy(`r-${receiptId}`)
    try {
      const template = await loadReceiptTemplateSettings(supabase, userId)
      const form = customReceiptDraftToFormState(draft)
      const bytes = await buildCustomReceiptPdfBytes(form, template, { sandboxWatermark: sandboxTraining })
      downloadPdfBlob(bytes, `receipt-${receiptId.slice(0, 8)}.pdf`)
    } catch (e) {
      alert(formatAppError(e))
    } finally {
      setPdfBusy(null)
    }
  }

  function editEstimate(quoteId: string) {
    queueQuotesOpenQuote(quoteId)
    setPage?.("quotes")
  }

  function editWorkOrder(order: WorkOrderRecord) {
    setEditingWorkOrder(order)
  }

  function editPurchaseOrder(order: PurchaseOrderRecord) {
    setEditingPurchaseOrder(order)
  }

  function editInvoice(inv: PaymentRequestRow) {
    setEditingInvoice(inv)
  }

  const documentEditors = (
    <>
      <WorkOrderEditorModal
        open={!!editingWorkOrder}
        onClose={() => setEditingWorkOrder(null)}
        supabase={supabase}
        userId={userId}
        workOrder={editingWorkOrder}
        woTemplate={woTemplate}
        setPage={setPage}
        onSaved={() => void loadBundle()}
      />
      <PurchaseOrderEditorModal
        open={!!editingPurchaseOrder}
        onClose={() => setEditingPurchaseOrder(null)}
        supabase={supabase}
        userId={userId}
        purchaseOrder={editingPurchaseOrder}
        poTemplate={poTemplate}
        setPage={setPage}
        onSaved={() => void loadBundle()}
      />
      <PaymentRequestEditorModal
        open={!!editingInvoice}
        onClose={() => setEditingInvoice(null)}
        userId={userId}
        paymentRequest={editingInvoice}
        onSaved={() => void loadBundle()}
      />
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
            editEstimate(quoteId)
          }}
        />
      ) : null}
    </>
  )

  function editReceipt() {
    queueOpenCustomReceiptModal()
    setPage?.("calendar")
  }

  if (tab === "customer_payments") {
    const rows = bundle?.invoices ?? []
    return (
      <>
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            Payment requests and invoice links sent to this customer.
          </p>
          {showCustomerPayments && onRequestCustomerPayment ? (
            <button
              type="button"
              onClick={onRequestCustomerPayment}
              style={{
                justifySelf: "start",
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Request customer payment
            </button>
          ) : null}
          <DocList
            empty="No payment requests for this customer yet."
            rows={rows.map((inv) => ({
              key: inv.id,
              title: inv.description?.trim() || "Payment request",
              meta: `${inv.status} · ${formatUsdAmount(inv.amount) ?? "—"} · ${formatWhen(inv.created_at)}`,
              busy: false,
              onView: inv.payment_url ? () => window.open(inv.payment_url!, "_blank", "noopener") : undefined,
              onEdit: () => editInvoice(inv),
            }))}
          />
        </div>
        {documentEditors}
      </>
    )
  }

  if (docTab === "estimates") {
    const rows = bundle?.quotes ?? []
    return (
      <>
        <DocList
          empty="No estimates for this customer yet."
          rows={rows.map((q) => ({
            key: q.id,
            title: q.title?.trim() || `Estimate ${q.id.slice(0, 8)}`,
            meta: `${estimateDisplayStatus(q.status, q.metadata)}${formatUsdAmount(q.total) ? ` · ${formatUsdAmount(q.total)}` : ""} · ${formatWhen(q.updated_at ?? q.created_at)}`,
            busy: pdfBusy === `q-${q.id}`,
            onView: () => void viewEstimate(q.id),
            onDownload: () => void downloadEstimate(q.id),
            onEdit: () => editEstimate(q.id),
          }))}
        />
        {documentEditors}
      </>
    )
  }

  if (docTab === "work_orders") {
    const rows = bundle?.workOrders ?? []
    return (
      <>
        <DocList
          empty="No work orders linked to this customer yet."
          rows={rows.map((w) => ({
            key: w.id,
            title: w.work_order_number,
            meta: `${w.status} · ${formatWhen(w.updated_at)}`,
            busy: pdfBusy === `wo-${w.id}`,
            onView: () => void viewWorkOrder(w),
            onDownload: () => void viewWorkOrder(w),
            onEdit: () => editWorkOrder(w),
          }))}
        />
        {documentEditors}
      </>
    )
  }

  if (docTab === "purchase_orders") {
    const rows = bundle?.purchaseOrders ?? []
    return (
      <>
        <DocList
          empty="No purchase orders on file for this customer yet."
          rows={rows.map((p) => ({
            key: p.id,
            title: p.po_number,
            meta: `${p.status} · ${p.vendor_name} · ${formatWhen(p.updated_at)}`,
            busy: pdfBusy === `po-${p.id}`,
            onView: () => void viewPurchaseOrder(p),
            onDownload: () => void viewPurchaseOrder(p),
            onEdit: () => editPurchaseOrder(p),
          }))}
        />
        {documentEditors}
      </>
    )
  }

  if (docTab === "invoices") {
    const rows = bundle?.invoices ?? []
    return (
      <>
        <DocList
          empty="No invoices or payment requests for this customer yet."
          rows={rows.map((inv) => ({
            key: inv.id,
            title: inv.description?.trim() || "Payment request",
            meta: `${inv.status} · ${formatUsdAmount(inv.amount) ?? "—"} · ${formatWhen(inv.created_at)}`,
            busy: false,
            onView: inv.payment_url ? () => window.open(inv.payment_url!, "_blank", "noopener") : undefined,
            onEdit: () => editInvoice(inv),
          }))}
        />
        {documentEditors}
      </>
    )
  }

  if (docTab === "receipts") {
    const rows = bundle?.receipts ?? []
    return (
      <DocList
        empty="No saved custom receipts on this profile."
        rows={rows.map((r) => ({
          key: r.id,
          title: r.job_title?.trim() || "Custom receipt",
          meta: receiptDisplayStatus(r),
          busy: pdfBusy === `r-${r.id}`,
          onView: () => void downloadReceipt(r.id),
          onDownload: () => void downloadReceipt(r.id),
          onEdit: () => editReceipt(),
        }))}
      />
    )
  }

  return null
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: theme.text }}>
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={{ ...theme.formInput, resize: "vertical" }} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={theme.formInput} />
      )}
    </label>
  )
}

function DocList({
  empty,
  rows,
}: {
  empty: string
  rows: {
    key: string
    title: string
    meta: string
    busy?: boolean
    onView?: () => void
    onDownload?: () => void
    onEdit?: () => void
  }[]
}) {
  if (rows.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>{empty}</p>
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: "10px 12px",
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>{row.title}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{row.meta}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {row.onView ? (
              <MiniBtn label={row.busy ? "Opening…" : "View"} onClick={row.onView} disabled={row.busy} />
            ) : null}
            {row.onDownload ? <MiniBtn label="Download" onClick={row.onDownload} disabled={row.busy} /> : null}
            {row.onEdit ? <MiniBtn label="Edit" onClick={row.onEdit} primary /> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function MiniBtn({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: primary ? "none" : `1px solid ${theme.border}`,
        background: primary ? theme.primary : "#f8fafc",
        color: primary ? "#fff" : theme.text,
        fontSize: 11,
        fontWeight: 700,
        cursor: disabled ? "wait" : "pointer",
      }}
    >
      {label}
    </button>
  )
}
