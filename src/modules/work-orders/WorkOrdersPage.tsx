import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { formatUsdAmount, estimateDisplayStatus } from "../../lib/customerDocumentStatus"
import {
  createWorkOrderForCustomer,
  createWorkOrderFromQuote,
  generateWorkOrderNumber,
  loadQuotesForWorkOrders,
  loadWorkOrdersFromProfile,
  WORK_ORDER_NO_ESTIMATE,
  type SignedQuotePick,
  type WorkOrderRecord,
} from "../../lib/workOrders"
import {
  queueQuotesCustomerPrefill,
  consumeWorkOrdersHighlightQuote,
  consumeWorkOrdersCustomerPrefill,
} from "../../lib/workflowNavigation"
import { loadBusinessWorkflowFromMetadata, type BusinessWorkflowDoc } from "../../lib/businessWorkflow"
import WorkflowToolGuidanceBanner from "../../components/WorkflowToolGuidanceBanner"
import DocumentTemplateModal from "../../components/DocumentTemplateModal"
import DocumentPdfViewerModal from "../../components/DocumentPdfViewerModal"
import { WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "../../lib/workOrderDocumentTemplate"
import { isTemplateItemVisible, mergeTemplateFormIntoMetadata, templateFormFromMetadata } from "../../lib/jobDocumentTemplate"
import { openWorkOrderDocumentPdf } from "../../lib/workOrderPdfExport"
import { downloadPdfBlob } from "../../lib/documentPdf"
import { WorkOrderEditorModal } from "../../components/document-editors/WorkOrderEditorModal"
import PlatformFileSearchPanel from "../../components/PlatformFileSearchPanel"

type Props = {
  setPage?: (page: string) => void
  embedded?: boolean
}

export default function WorkOrdersPage({ setPage, embedded }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [orders, setOrders] = useState<WorkOrderRecord[]>([])
  const [quotes, setQuotes] = useState<SignedQuotePick[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [selectedQuoteId, setSelectedQuoteId] = useState("")
  const [filterCustomerId, setFilterCustomerId] = useState("")
  const [prefillCustomerName, setPrefillCustomerName] = useState("")
  const [customerOnlyJobTitle, setCustomerOnlyJobTitle] = useState("")
  const [woNumber, setWoNumber] = useState("")
  const [busy, setBusy] = useState(false)
  const [workflow, setWorkflow] = useState<BusinessWorkflowDoc | null>(null)
  const [highlightQuoteId, setHighlightQuoteId] = useState<string | null>(null)
  const [templateFormValues, setTemplateFormValues] = useState<Record<string, string>>({})
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [docBusyId, setDocBusyId] = useState<string | null>(null)
  const [pdfViewer, setPdfViewer] = useState<{ url: string; title: string; workOrderId: string } | null>(null)
  const [editingOrder, setEditingOrder] = useState<WorkOrderRecord | null>(null)

  const isWoTemplateItemVisible = useCallback(
    (item: (typeof WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS)[number]) =>
      isTemplateItemVisible(item, WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS, templateFormValues),
    [templateFormValues],
  )

  const loadTemplateFromProfile = useCallback(async () => {
    if (!supabase || !userId) return
    const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    const meta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    setTemplateFormValues(templateFormFromMetadata(WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS, meta))
    setWorkflow(loadBusinessWorkflowFromMetadata(meta))
  }, [userId])

  useEffect(() => {
    void loadTemplateFromProfile()
  }, [loadTemplateFromProfile])

  useEffect(() => {
    const id = consumeWorkOrdersHighlightQuote()
    if (id) setHighlightQuoteId(id)
    const customerId = consumeWorkOrdersCustomerPrefill()
    if (customerId) setFilterCustomerId(customerId)
  }, [])

  useEffect(() => {
    if (!highlightQuoteId) return
    const t = window.setTimeout(() => setHighlightQuoteId(null), 12000)
    return () => window.clearTimeout(t)
  }, [highlightQuoteId])

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    setErr("")
    try {
      const [o, q] = await Promise.all([
        loadWorkOrdersFromProfile(supabase, userId),
        loadQuotesForWorkOrders(supabase, userId, filterCustomerId || null),
      ])
      setOrders(o)
      setQuotes(q)
      if (filterCustomerId) {
        const match = q.find((x) => x.customer_id === filterCustomerId)
        if (match?.customer_name) setPrefillCustomerName(match.customer_name)
      }
      setSelectedQuoteId((prev) => {
        if (prev === WORK_ORDER_NO_ESTIMATE) return prev
        if (prev && q.some((x) => x.id === prev)) return prev
        return q[0]?.id ?? (filterCustomerId ? WORK_ORDER_NO_ESTIMATE : "")
      })
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [userId, filterCustomerId])

  useEffect(() => {
    if (!supabase || !filterCustomerId) return
    void supabase
      .from("customers")
      .select("display_name")
      .eq("id", filterCustomerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name?.trim()) setPrefillCustomerName(data.display_name.trim())
      })
  }, [filterCustomerId])

  const customerFilterOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of orders) {
      if (o.customer_id) map.set(o.customer_id, o.customer_name)
    }
    for (const q of quotes) {
      if (q.customer_id) map.set(q.customer_id, q.customer_name)
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [orders, quotes])

  const filteredOrders = useMemo(() => {
    if (!filterCustomerId) return orders
    return orders.filter((o) => o.customer_id === filterCustomerId)
  }, [orders, filterCustomerId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleCreate() {
    if (!supabase || !userId || !selectedQuoteId) return
    setBusy(true)
    setErr("")
    try {
      if (selectedQuoteId === WORK_ORDER_NO_ESTIMATE) {
        if (!filterCustomerId) {
          setErr("Select a customer filter before creating a work order without an estimate.")
          return
        }
        await createWorkOrderForCustomer(supabase, userId, {
          customerId: filterCustomerId,
          customerName: prefillCustomerName || customerFilterOptions.find((c) => c.id === filterCustomerId)?.name || "Customer",
          workOrderNumber: woNumber,
          jobTitle: customerOnlyJobTitle,
        })
      } else {
        const quote = quotes.find((q) => q.id === selectedQuoteId)
        if (!quote) return
        await createWorkOrderFromQuote(supabase, userId, quote, woNumber.trim() || generateWorkOrderNumber())
      }
      setWoNumber("")
      setCustomerOnlyJobTitle("")
      await reload()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveDocumentTemplate() {
    if (!supabase || !userId) return
    setTemplateSaving(true)
    try {
      const { data: row, error: loadErr } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
      if (loadErr) throw loadErr
      const prevMeta =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {}
      const { error } = await supabase
        .from("profiles")
        .update({ metadata: mergeTemplateFormIntoMetadata(prevMeta, templateFormValues) })
        .eq("id", userId)
      if (error) throw error
      setTemplateModalOpen(false)
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setTemplateSaving(false)
    }
  }

  async function viewWorkOrderDocument(order: WorkOrderRecord) {
    if (!supabase || !userId) return
    setDocBusyId(order.id)
    try {
      if (pdfViewer?.url) URL.revokeObjectURL(pdfViewer.url)
      const url = await openWorkOrderDocumentPdf(supabase, userId, order, templateFormValues)
      setPdfViewer({ url, title: `Work order ${order.work_order_number}`, workOrderId: order.id })
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setDocBusyId(null)
    }
  }

  async function downloadCurrentPdf() {
    if (!supabase || !userId || !pdfViewer) return
    const order = orders.find((o) => o.id === pdfViewer.workOrderId)
    if (!order) return
    setDocBusyId(order.id)
    try {
      const { buildWorkOrderDocumentPdf } = await import("../../lib/workOrderPdfExport")
      const bytes = await buildWorkOrderDocumentPdf(supabase, userId, order, templateFormValues)
      downloadPdfBlob(bytes, `${order.work_order_number.replace(/[^\w.-]+/g, "_")}.pdf`)
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setDocBusyId(null)
    }
  }

  const preparedLabel = useMemo(() => {
    if (!pdfViewer) return null
    const o = orders.find((x) => x.id === pdfViewer.workOrderId)
    return o ? new Date(o.created_at).toLocaleString() : null
  }, [pdfViewer, orders])

  return (
    <div style={{ maxWidth: 960, margin: embedded ? 0 : "0 auto", padding: embedded ? 0 : "16px 20px 40px" }}>
      {!embedded ? (
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: theme.text }}>Work Orders</h1>
      ) : null}
      {!embedded ? (
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 720 }}>
          Create work orders from signed estimates and open a printable document with customer details, schedule,
          materials, and estimate lines. Use <strong>Document fields</strong> to choose what appears on the PDF.
        </p>
      ) : null}

      <WorkflowToolGuidanceBanner tool="work_order" workflow={workflow} />

      {err ? <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{err}</p> : null}

      <section style={{ ...card, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Create work order</h2>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 12, maxWidth: 520 }}>
          <select
            value={filterCustomerId}
            onChange={(e) => setFilterCustomerId(e.target.value)}
            style={theme.formInput}
            aria-label="Customer"
          >
            <option value="">All customers</option>
            {customerFilterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {loading ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Loading estimates…</p>
        ) : !filterCustomerId && quotes.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
            Select a customer above, or add an estimate first. You can also create a customer-only work order after choosing a customer.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <select
              value={selectedQuoteId}
              onChange={(e) => setSelectedQuoteId(e.target.value)}
              style={theme.formInput}
              aria-label="Estimate or customer-only work order"
            >
                {filterCustomerId ? (
                  <option value={WORK_ORDER_NO_ESTIMATE}>No estimate — customer work order only</option>
                ) : null}
                {quotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.customer_name} — {q.title} ({estimateDisplayStatus(q.status, null)})
                    {q.total > 0 ? ` · ${formatUsdAmount(q.total)}` : ""}
                  </option>
                ))}
              </select>
            {selectedQuoteId === WORK_ORDER_NO_ESTIMATE ? (
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                Job title (optional)
                <input
                  value={customerOnlyJobTitle}
                  onChange={(e) => setCustomerOnlyJobTitle(e.target.value)}
                  placeholder="Describe the work order"
                  style={theme.formInput}
                />
              </label>
            ) : null}
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              Work order number (optional)
              <input
                value={woNumber}
                onChange={(e) => setWoNumber(e.target.value)}
                placeholder={generateWorkOrderNumber()}
                style={theme.formInput}
              />
            </label>
            <button type="button" disabled={busy || !selectedQuoteId} onClick={() => void handleCreate()} style={primaryBtn}>
              {busy ? "Creating…" : "Create work order"}
            </button>
          </div>
        )}
      </section>

      <section style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Work orders on file</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600 }}>
              Customer
              <select
                value={filterCustomerId}
                onChange={(e) => setFilterCustomerId(e.target.value)}
                style={{ ...theme.formInput, padding: "6px 10px", fontSize: 12, minWidth: 160 }}
              >
                <option value="">All customers</option>
                {customerFilterOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" style={secondaryBtn} onClick={() => setTemplateModalOpen(true)}>
              Document fields…
            </button>
          </div>
        </div>
        {loading ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Loading…</p>
        ) : filteredOrders.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
            {filterCustomerId ? "No work orders for this customer yet." : "No work orders yet."}
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredOrders.map((o) => (
              <div
                key={o.id}
                style={{
                  border: `2px solid ${highlightQuoteId === o.quote_id ? theme.primary : theme.border}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  background: highlightQuoteId === o.quote_id ? "#fff7ed" : "#fff",
                  boxShadow: highlightQuoteId === o.quote_id ? `0 0 0 2px ${theme.primary}33` : undefined,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: theme.text }}>{o.work_order_number}</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                      {o.customer_name} · {o.estimate_title}
                      {o.estimate_total != null ? ` · ${formatUsdAmount(o.estimate_total)}` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                      Created {new Date(o.created_at).toLocaleString()} · {o.status}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button
                      type="button"
                      style={secondaryBtn}
                      onClick={() => setEditingOrder(o)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={accentBtn}
                      disabled={docBusyId === o.id}
                      onClick={() => void viewWorkOrderDocument(o)}
                    >
                      {docBusyId === o.id ? "Opening…" : "View document"}
                    </button>
                    {o.customer_id ? (
                      <button
                        type="button"
                        style={secondaryBtn}
                        onClick={() => {
                          queueQuotesCustomerPrefill(o.customer_id!)
                          setPage?.("quotes")
                        }}
                      >
                        Open estimate
                      </button>
                    ) : null}
                    <button type="button" style={secondaryBtn} onClick={() => setPage?.("calendar")}>
                      Scheduling
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <PlatformFileSearchPanel
        workOrders={orders}
        estimates={quotes.map((q) => ({
          id: q.id,
          customer_name: q.customer_name,
          title: q.title,
          status: q.status,
          total: q.total,
          customer_id: q.customer_id,
        }))}
        onOpenWorkOrder={(order) => void viewWorkOrderDocument(order)}
        onOpenEstimate={(quoteId, customerId) => {
          if (customerId) queueQuotesCustomerPrefill(customerId)
          setPage?.("quotes")
          void quoteId
        }}
      />

      <DocumentTemplateModal
        open={templateModalOpen}
        title="Work order document fields"
        subtitle="Choose which sections appear on every work order PDF. Your choices are saved to your account."
        items={WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS}
        formValues={templateFormValues}
        setFormValue={(id, value) => setTemplateFormValues((prev) => ({ ...prev, [id]: value }))}
        isItemVisible={isWoTemplateItemVisible}
        saving={templateSaving}
        onClose={() => setTemplateModalOpen(false)}
        onSave={() => void saveDocumentTemplate()}
      />

      {pdfViewer ? (
        <DocumentPdfViewerModal
          title={pdfViewer.title}
          pdfUrl={pdfViewer.url}
          preparedAtLabel={preparedLabel}
          onClose={() => {
            URL.revokeObjectURL(pdfViewer.url)
            setPdfViewer(null)
          }}
        />
      ) : null}

      {pdfViewer ? (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 13001, display: "flex", gap: 8 }}>
          <button type="button" style={primaryBtn} onClick={() => void downloadCurrentPdf()}>
            Download PDF
          </button>
          <button type="button" style={secondaryBtn} onClick={() => setTemplateModalOpen(true)}>
            Customize fields
          </button>
        </div>
      ) : null}

      <WorkOrderEditorModal
        open={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        supabase={supabase}
        userId={userId ?? ""}
        workOrder={editingOrder}
        woTemplate={templateFormValues}
        setPage={setPage}
        onSaved={(saved) => {
          setOrders((prev) => prev.map((row) => (row.id === saved.id ? saved : row)))
          setEditingOrder(null)
        }}
      />
    </div>
  )
}

const card: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
  padding: "16px 18px",
}

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  justifySelf: "start",
}

const secondaryBtn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  color: theme.text,
}

const accentBtn: CSSProperties = {
  ...secondaryBtn,
  borderColor: theme.primary,
  color: theme.primary,
  background: "#fff7ed",
}
