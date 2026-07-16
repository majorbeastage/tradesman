import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { formatAppError } from "../lib/formatAppError"
import { formatUsdAmount, estimateDisplayStatus } from "../lib/customerDocumentStatus"
import {
  loadQuotesForWorkOrders,
  loadWorkOrdersFromProfile,
  type SignedQuotePick,
  type WorkOrderRecord,
} from "../lib/workOrders"
import { loadPurchaseOrdersFromProfile, type PurchaseOrderRecord } from "../lib/purchaseOrders"
import { loadPaymentRequests, paymentStatusLabel, type PaymentRequestRow } from "../lib/paymentRequests"
import { templateFormFromMetadata } from "../lib/jobDocumentTemplate"
import { WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "../lib/workOrderDocumentTemplate"
import { PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS } from "../lib/purchaseOrderDocumentTemplate"
import { openWorkOrderDocumentPdf } from "../lib/workOrderPdfExport"
import { openPurchaseOrderDocumentPdf } from "../lib/purchaseOrderPdfExport"
import { queueQuotesOpenQuote } from "../lib/workflowNavigation"
import DocumentPdfViewerModal from "./DocumentPdfViewerModal"
import { WorkOrderEditorModal } from "./document-editors/WorkOrderEditorModal"
import { PurchaseOrderEditorModal } from "./document-editors/PurchaseOrderEditorModal"

type DocKind = "work_order" | "purchase_order" | "invoice" | "estimate"

type Props = {
  userId: string | null
  setPage?: (page: string) => void
}

type DocHit = {
  kind: DocKind
  id: string
  docNumber: string
  name: string
  detail: string
  status: string
  total: number | null
  createdAt: string
  quoteId?: string | null
  customerId?: string | null
}

const KIND_META: Record<DocKind, { label: string; plural: string; color: string }> = {
  work_order: { label: "WORK ORDER", plural: "Work orders", color: "#0ea5e9" },
  purchase_order: { label: "PURCHASE ORDER", plural: "Purchase orders", color: "#8b5cf6" },
  invoice: { label: "INVOICE", plural: "Invoices", color: "#16a34a" },
  estimate: { label: "ESTIMATE", plural: "Estimates", color: "#f59e0b" },
}

export default function OperationsDocumentSearchPanel({ userId, setPage }: Props) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([])
  const [estimates, setEstimates] = useState<SignedQuotePick[]>([])
  const [invoices, setInvoices] = useState<PaymentRequestRow[]>([])
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({})
  const [woTemplate, setWoTemplate] = useState<Record<string, string>>({})
  const [poTemplate, setPoTemplate] = useState<Record<string, string>>({})

  const [query, setQuery] = useState("")
  const [kindFilter, setKindFilter] = useState<"all" | DocKind>("all")
  const [docBusyId, setDocBusyId] = useState<string | null>(null)
  const [pdfViewer, setPdfViewer] = useState<{ url: string; title: string } | null>(null)
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrderRecord | null>(null)
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<PurchaseOrderRecord | null>(null)

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    setLoading(true)
    setErr("")
    try {
      const [wo, po, quotes, pays, profileRow] = await Promise.all([
        loadWorkOrdersFromProfile(supabase, userId),
        loadPurchaseOrdersFromProfile(supabase, userId),
        loadQuotesForWorkOrders(supabase, userId, null),
        loadPaymentRequests(userId, 200),
        supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle(),
      ])
      setWorkOrders(wo)
      setPurchaseOrders(po)
      setEstimates(quotes)
      setInvoices(pays)

      const meta =
        profileRow.data?.metadata && typeof profileRow.data.metadata === "object" && !Array.isArray(profileRow.data.metadata)
          ? (profileRow.data.metadata as Record<string, unknown>)
          : {}
      setWoTemplate(templateFormFromMetadata(WORK_ORDER_DOCUMENT_TEMPLATE_ITEMS, meta))
      setPoTemplate(templateFormFromMetadata(PURCHASE_ORDER_DOCUMENT_TEMPLATE_ITEMS, meta))

      const invoiceCustomerIds = [...new Set(pays.map((p) => p.customer_id).filter(Boolean))]
      if (invoiceCustomerIds.length > 0) {
        const { data: custRows } = await supabase
          .from("customers")
          .select("id, display_name")
          .in("id", invoiceCustomerIds)
        const map: Record<string, string> = {}
        for (const row of custRows ?? []) {
          const r = row as { id: string; display_name: string | null }
          if (r.id) map[r.id] = r.display_name?.trim() || "Customer"
        }
        setCustomerNames(map)
      } else {
        setCustomerNames({})
      }
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const allHits = useMemo<DocHit[]>(() => {
    const out: DocHit[] = []
    for (const o of workOrders) {
      out.push({
        kind: "work_order",
        id: o.id,
        docNumber: o.work_order_number,
        name: o.customer_name,
        detail: o.estimate_title,
        status: o.status,
        total: o.estimate_total ?? null,
        createdAt: o.created_at,
        quoteId: o.quote_id,
        customerId: o.customer_id,
      })
    }
    for (const o of purchaseOrders) {
      out.push({
        kind: "purchase_order",
        id: o.id,
        docNumber: o.po_number,
        name: o.vendor_name,
        detail: o.estimate_title || o.description || "",
        status: o.status,
        total: o.total ?? null,
        createdAt: o.created_at,
      })
    }
    for (const e of estimates) {
      out.push({
        kind: "estimate",
        id: e.id,
        docNumber: `EST-${e.id.slice(0, 8).toUpperCase()}`,
        name: e.customer_name,
        detail: e.title,
        status: estimateDisplayStatus(e.status, null),
        total: e.total ?? null,
        createdAt: "",
        quoteId: e.id,
        customerId: e.customer_id,
      })
    }
    for (const inv of invoices) {
      out.push({
        kind: "invoice",
        id: inv.id,
        docNumber: `INV-${inv.id.slice(0, 8).toUpperCase()}`,
        name: customerNames[inv.customer_id] ?? "Customer",
        detail: inv.description || "",
        status: paymentStatusLabel(inv.status),
        total: typeof inv.amount === "number" ? inv.amount : null,
        createdAt: inv.created_at,
        customerId: inv.customer_id,
      })
    }
    return out
  }, [workOrders, purchaseOrders, estimates, invoices, customerNames])

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allHits
      .filter((h) => kindFilter === "all" || h.kind === kindFilter)
      .filter((h) => {
        if (!q) return true
        return [h.docNumber, h.name, h.detail, h.status, KIND_META[h.kind].label].join(" ").toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt)
        return a.name.localeCompare(b.name)
      })
      .slice(0, 60)
  }, [allHits, query, kindFilter])

  const counts = useMemo(() => {
    const c = { work_order: 0, purchase_order: 0, invoice: 0, estimate: 0 } as Record<DocKind, number>
    for (const h of allHits) c[h.kind] += 1
    return c
  }, [allHits])

  async function openHit(hit: DocHit) {
    if (hit.kind === "estimate") {
      if (hit.quoteId) queueQuotesOpenQuote(hit.quoteId)
      setPage?.("quotes")
      return
    }
    if (hit.kind === "invoice") {
      setPage?.("payments")
      return
    }
    if (!supabase || !userId) return
    setDocBusyId(hit.id)
    try {
      if (pdfViewer?.url) URL.revokeObjectURL(pdfViewer.url)
      if (hit.kind === "work_order") {
        const order = workOrders.find((o) => o.id === hit.id)
        if (!order) return
        const url = await openWorkOrderDocumentPdf(supabase, userId, order, woTemplate)
        setPdfViewer({ url, title: `Work order ${order.work_order_number}` })
      } else if (hit.kind === "purchase_order") {
        const order = purchaseOrders.find((o) => o.id === hit.id)
        if (!order) return
        const url = await openPurchaseOrderDocumentPdf(supabase, userId, order, poTemplate)
        setPdfViewer({ url, title: `Purchase order ${order.po_number}` })
      }
    } catch (e: unknown) {
      alert(formatAppError(e))
    } finally {
      setDocBusyId(null)
    }
  }

  return (
    <section style={{ borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff", padding: "16px 18px" }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: theme.text }}>Document search</h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          Search every work order, purchase order, invoice, and estimate on file from one place.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {(["all", "work_order", "purchase_order", "invoice", "estimate"] as const).map((k) => {
          const active = kindFilter === k
          const label = k === "all" ? `All (${allHits.length})` : `${KIND_META[k].plural} (${counts[k]})`
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: active ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                background: active ? "#eff6ff" : "#fff",
                color: theme.text,
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: "0.02em",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by customer or vendor name, document number, title, or status…"
        style={{ ...theme.formInput, width: "100%", boxSizing: "border-box", marginBottom: 12 }}
      />

      {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}

      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Loading documents…</p>
      ) : hits.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
          {allHits.length === 0 ? "No documents on file yet." : "No documents match that search."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {hits.map((hit) => {
            const meta = KIND_META[hit.kind]
            const editable = hit.kind === "work_order" || hit.kind === "purchase_order"
            return (
              <div
                key={`${hit.kind}-${hit.id}`}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                }}
              >
                <button
                  type="button"
                  disabled={docBusyId === hit.id}
                  onClick={() => void openHit(hit)}
                  style={{
                    textAlign: "left",
                    display: "grid",
                    gap: 3,
                    flex: "1 1 auto",
                    minWidth: 0,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: meta.color, letterSpacing: "0.05em" }}>{meta.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{hit.docNumber}</span>
                    {docBusyId === hit.id ? <span style={{ fontSize: 11, color: "#64748b" }}>Opening…</span> : null}
                  </span>
                  <span style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>{hit.name}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {[hit.detail, hit.status, hit.total != null && hit.total > 0 ? formatUsdAmount(hit.total) : ""]
                      .filter(Boolean)
                      .join(" · ")}
                    {hit.createdAt ? ` · ${new Date(hit.createdAt).toLocaleDateString()}` : ""}
                  </span>
                </button>
                {editable ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (hit.kind === "work_order") {
                        const order = workOrders.find((o) => o.id === hit.id)
                        if (order) setEditingWorkOrder(order)
                      } else {
                        const order = purchaseOrders.find((o) => o.id === hit.id)
                        if (order) setEditingPurchaseOrder(order)
                      }
                    }}
                    style={{
                      flex: "0 0 auto",
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      color: theme.text,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {pdfViewer ? (
        <DocumentPdfViewerModal
          title={pdfViewer.title}
          pdfUrl={pdfViewer.url}
          preparedAtLabel={null}
          onClose={() => {
            URL.revokeObjectURL(pdfViewer.url)
            setPdfViewer(null)
          }}
        />
      ) : null}

      <WorkOrderEditorModal
        open={!!editingWorkOrder}
        onClose={() => setEditingWorkOrder(null)}
        supabase={supabase}
        userId={userId ?? ""}
        workOrder={editingWorkOrder}
        woTemplate={woTemplate}
        setPage={setPage}
        onSaved={(saved) => {
          setWorkOrders((prev) => prev.map((row) => (row.id === saved.id ? saved : row)))
          setEditingWorkOrder(null)
        }}
      />

      <PurchaseOrderEditorModal
        open={!!editingPurchaseOrder}
        onClose={() => setEditingPurchaseOrder(null)}
        supabase={supabase}
        userId={userId ?? ""}
        purchaseOrder={editingPurchaseOrder}
        poTemplate={poTemplate}
        setPage={setPage}
        onSaved={(saved) => {
          setPurchaseOrders((prev) => prev.map((row) => (row.id === saved.id ? saved : row)))
          setEditingPurchaseOrder(null)
        }}
      />
    </section>
  )
}
