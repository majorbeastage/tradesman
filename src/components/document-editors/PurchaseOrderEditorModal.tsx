import { useEffect, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { formatUsdAmount } from "../../lib/customerDocumentStatus"
import { openPurchaseOrderDocumentPdf } from "../../lib/purchaseOrderPdfExport"
import { updatePurchaseOrderInProfile, type PurchaseOrderRecord } from "../../lib/purchaseOrders"
import { EditorModalShell, editorFieldLabel, editorReadOnlyBox } from "./EditorModalShell"
import { queueQuotesOpenQuote } from "../../lib/workflowNavigation"

type Props = {
  open: boolean
  onClose: () => void
  supabase: SupabaseClient | null
  userId: string
  purchaseOrder: PurchaseOrderRecord | null
  poTemplate: Record<string, string>
  onSaved?: (record: PurchaseOrderRecord) => void
  setPage?: (page: string) => void
}

export function PurchaseOrderEditorModal({
  open,
  onClose,
  supabase,
  userId,
  purchaseOrder,
  poTemplate,
  onSaved,
  setPage,
}: Props) {
  const [poNumber, setPoNumber] = useState("")
  const [vendor, setVendor] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<PurchaseOrderRecord["status"]>("draft")
  const [total, setTotal] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (!open || !purchaseOrder) return
    setPoNumber(purchaseOrder.po_number)
    setVendor(purchaseOrder.vendor_name)
    setDescription(purchaseOrder.description)
    setStatus(purchaseOrder.status)
    setTotal(purchaseOrder.total != null ? String(purchaseOrder.total) : "")
    setNotice("")
  }, [open, purchaseOrder])

  if (!open || !purchaseOrder) return null

  async function handleSave() {
    if (!supabase) return
    setBusy(true)
    setNotice("")
    try {
      const parsedTotal = total.trim() ? Number(total) : null
      if (total.trim() && (!Number.isFinite(parsedTotal) || parsedTotal! < 0)) {
        throw new Error("Total must be a valid number.")
      }
      const saved = await updatePurchaseOrderInProfile(supabase, userId, purchaseOrder!.id, {
        po_number: poNumber,
        vendor_name: vendor,
        description,
        status,
        total: parsedTotal,
      })
      onSaved?.(saved)
      setNotice("Purchase order saved.")
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handlePreviewPdf() {
    if (!supabase) return
    setBusy(true)
    setNotice("")
    try {
      const url = await openPurchaseOrderDocumentPdf(supabase, userId, purchaseOrder!, poTemplate)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  function openEstimate() {
    if (!purchaseOrder?.quote_id) return
    queueQuotesOpenQuote(purchaseOrder.quote_id)
    setPage?.("quotes")
    onClose()
  }

  return (
    <EditorModalShell
      title="Edit purchase order"
      subtitle={purchaseOrder.estimate_title?.trim() || purchaseOrder.po_number}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={() => void handlePreviewPdf()} disabled={busy} style={secondaryBtn}>
            Preview PDF
          </button>
          {setPage && purchaseOrder.quote_id ? (
            <button type="button" onClick={openEstimate} disabled={busy} style={secondaryBtn}>
              Open estimate
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={busy} style={secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={busy} style={primaryBtn}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {purchaseOrder.estimate_title ? (
        <div style={editorReadOnlyBox}>
          Linked estimate: <strong>{purchaseOrder.estimate_title}</strong>
        </div>
      ) : null}
      <label style={{ display: "grid", gap: 6 }}>
        <span style={editorFieldLabel}>PO number</span>
        <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} style={theme.formInput} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={editorFieldLabel}>Vendor</span>
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} style={theme.formInput} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={editorFieldLabel}>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={editorFieldLabel}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as PurchaseOrderRecord["status"])} style={theme.formInput}>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="received">Received</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={editorFieldLabel}>Total ($)</span>
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" style={theme.formInput} placeholder="0.00" />
        </label>
      </div>
      {purchaseOrder.total != null ? (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Current total: {formatUsdAmount(purchaseOrder.total) ?? "—"}</p>
      ) : null}
      {notice ? <p style={{ margin: 0, fontSize: 13, color: notice.includes("saved") ? "#059669" : "#b91c1c" }}>{notice}</p> : null}
    </EditorModalShell>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
}

const secondaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}
