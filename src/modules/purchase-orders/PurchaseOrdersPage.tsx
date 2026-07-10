import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import {
  createPurchaseOrder,
  generatePurchaseOrderNumber,
  loadPurchaseOrdersFromProfile,
  type PurchaseOrderRecord,
} from "../../lib/purchaseOrders"
import { consumePurchaseOrdersHighlightQuote } from "../../lib/workflowNavigation"
import { portalDashboardBackBtn } from "../../lib/portalNavButtons"
import { loadBusinessWorkflowFromMetadata, type BusinessWorkflowDoc } from "../../lib/businessWorkflow"
import WorkflowToolGuidanceBanner from "../../components/WorkflowToolGuidanceBanner"
import DocumentTemplateModal from "../../components/DocumentTemplateModal"
import DocumentPdfViewerModal from "../../components/DocumentPdfViewerModal"
import { PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "../../lib/purchaseOrderDocumentTemplate"
import { isTemplateItemVisible, mergeTemplateFormIntoMetadata, templateFormFromMetadata } from "../../lib/jobDocumentTemplate"
import { openPurchaseOrderDocumentPdf } from "../../lib/purchaseOrderPdfExport"
import { downloadPdfBlob } from "../../lib/documentPdf"
import { PurchaseOrderEditorModal } from "../../components/document-editors/PurchaseOrderEditorModal"

type Props = { setPage?: (page: string) => void; embedded?: boolean }

export default function PurchaseOrdersPage({ setPage, embedded }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [vendor, setVendor] = useState("")
  const [description, setDescription] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [busy, setBusy] = useState(false)
  const [workflow, setWorkflow] = useState<BusinessWorkflowDoc | null>(null)
  const [highlightQuoteId, setHighlightQuoteId] = useState<string | null>(null)
  const [templateFormValues, setTemplateFormValues] = useState<Record<string, string>>({})
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [docBusyId, setDocBusyId] = useState<string | null>(null)
  const [pdfViewer, setPdfViewer] = useState<{ url: string; title: string; poId: string } | null>(null)
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderRecord | null>(null)

  const isPoTemplateItemVisible = useCallback(
    (item: (typeof PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS)[number]) =>
      isTemplateItemVisible(item, PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS, templateFormValues),
    [templateFormValues],
  )

  const loadTemplateFromProfile = useCallback(async () => {
    if (!supabase || !userId) return
    const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    const meta =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {}
    setTemplateFormValues(templateFormFromMetadata(PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS, meta))
    setWorkflow(loadBusinessWorkflowFromMetadata(meta))
  }, [userId])

  useEffect(() => {
    void loadTemplateFromProfile()
  }, [loadTemplateFromProfile])

  useEffect(() => {
    const id = consumePurchaseOrdersHighlightQuote()
    if (id) setHighlightQuoteId(id)
  }, [])

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    setErr("")
    try {
      setOrders(await loadPurchaseOrdersFromProfile(supabase, userId))
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleCreate() {
    if (!supabase || !userId) return
    setBusy(true)
    setErr("")
    try {
      await createPurchaseOrder(supabase, userId, {
        po_number: poNumber.trim() || undefined,
        vendor_name: vendor,
        description,
      })
      setVendor("")
      setDescription("")
      setPoNumber("")
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

  async function viewPurchaseOrderDocument(order: PurchaseOrderRecord) {
    if (!supabase || !userId) return
    setDocBusyId(order.id)
    try {
      if (pdfViewer?.url) URL.revokeObjectURL(pdfViewer.url)
      const url = await openPurchaseOrderDocumentPdf(supabase, userId, order, templateFormValues)
      setPdfViewer({ url, title: `Purchase order ${order.po_number}`, poId: order.id })
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setDocBusyId(null)
    }
  }

  async function downloadCurrentPdf() {
    if (!supabase || !userId || !pdfViewer) return
    const order = orders.find((o) => o.id === pdfViewer.poId)
    if (!order) return
    setDocBusyId(order.id)
    try {
      const { buildPurchaseOrderDocumentPdf } = await import("../../lib/purchaseOrderPdfExport")
      const bytes = await buildPurchaseOrderDocumentPdf(supabase, userId, order, templateFormValues)
      downloadPdfBlob(bytes, `${order.po_number.replace(/[^\w.-]+/g, "_")}.pdf`)
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setDocBusyId(null)
    }
  }

  const preparedLabel = useMemo(() => {
    if (!pdfViewer) return null
    const o = orders.find((x) => x.id === pdfViewer.poId)
    return o ? new Date(o.created_at).toLocaleString() : null
  }, [pdfViewer, orders])

  return (
    <div style={{ maxWidth: 960, margin: embedded ? 0 : "0 auto", padding: embedded ? 0 : "16px 20px 40px" }}>
      {!embedded ? <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Purchase Orders</h1> : null}
      {!embedded ? (
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.55, maxWidth: 720 }}>
          Create purchase orders for parts and materials. Open a printable PO document focused on vendor, part lines, and
          quantities. Use <strong>Document fields</strong> to control what appears on the PDF.
        </p>
      ) : null}
      <WorkflowToolGuidanceBanner tool="purchase_order" workflow={workflow} />
      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      <section style={card}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>New purchase order</h2>
        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <label style={labelStyle}>
            Vendor
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} style={theme.formInput} />
          </label>
          <label style={labelStyle}>
            Description / parts list
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...theme.formInput, resize: "vertical" }}
              placeholder="One part per line, or leave blank to pull material lines from the linked estimate"
            />
          </label>
          <label style={labelStyle}>
            PO number (optional)
            <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder={generatePurchaseOrderNumber()} style={theme.formInput} />
          </label>
          <button type="button" disabled={busy || !vendor.trim()} onClick={() => void handleCreate()} style={primaryBtn}>
            {busy ? "Creating…" : "Create PO"}
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Purchase orders on file</h2>
          <button type="button" style={secondaryBtn} onClick={() => setTemplateModalOpen(true)}>
            Document fields…
          </button>
        </div>
        {loading ? (
          <p style={{ margin: 0, color: "#64748b" }}>Loading…</p>
        ) : orders.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b" }}>No purchase orders yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {orders.map((o) => {
              const highlighted = highlightQuoteId && o.quote_id === highlightQuoteId
              return (
                <div
                  key={o.id}
                  style={{
                    ...rowCard,
                    borderColor: highlighted ? theme.primary : theme.border,
                    boxShadow: highlighted ? `0 0 0 2px ${theme.primary}33` : undefined,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{o.po_number}</div>
                      <div style={{ fontSize: 13, color: "#64748b" }}>
                        {o.vendor_name}
                        {o.description ? ` · ${o.description}` : ""}
                      </div>
                      {o.estimate_title ? (
                        <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Estimate: {o.estimate_title}</div>
                      ) : null}
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        {o.status} · {new Date(o.created_at).toLocaleString()}
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
                        onClick={() => void viewPurchaseOrderDocument(o)}
                      >
                        {docBusyId === o.id ? "Opening…" : "View document"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {!embedded && setPage ? (
        <button type="button" onClick={() => setPage("dashboard")} style={{ ...portalDashboardBackBtn, marginTop: 16 }}>
          ← Dashboard
        </button>
      ) : null}

      <DocumentTemplateModal
        open={templateModalOpen}
        title="Purchase order document fields"
        subtitle="Choose vendor, part numbers, quantities, and other sections for your PO PDFs."
        items={PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS}
        formValues={templateFormValues}
        setFormValue={(id, value) => setTemplateFormValues((prev) => ({ ...prev, [id]: value }))}
        isItemVisible={isPoTemplateItemVisible}
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

      <PurchaseOrderEditorModal
        open={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        supabase={supabase}
        userId={userId ?? ""}
        purchaseOrder={editingOrder}
        poTemplate={templateFormValues}
        setPage={setPage}
        onSaved={(saved) => {
          setOrders((prev) => prev.map((row) => (row.id === saved.id ? saved : row)))
          setEditingOrder(null)
        }}
      />
    </div>
  )
}

const card: CSSProperties = { borderRadius: 12, border: `1px solid ${theme.border}`, background: "#f8fafc", padding: "16px 18px" }
const rowCard: CSSProperties = { border: `1px solid ${theme.border}`, borderRadius: 10, padding: "12px 14px", background: "#fff" }
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }
const primaryBtn: CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontWeight: 700, cursor: "pointer", justifySelf: "start" }
const secondaryBtn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, color: theme.text }
const accentBtn: CSSProperties = { ...secondaryBtn, borderColor: theme.primary, color: theme.primary, background: "#f5f3ff" }
