import { useEffect, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { formatUsdAmount } from "../../lib/customerDocumentStatus"
import { openWorkOrderDocumentPdf } from "../../lib/workOrderPdfExport"
import { updateWorkOrderInProfile, type WorkOrderRecord } from "../../lib/workOrders"
import { EditorModalShell, editorFieldLabel, editorReadOnlyBox } from "./EditorModalShell"
import { queueQuotesOpenQuote } from "../../lib/workflowNavigation"

type Props = {
  open: boolean
  onClose: () => void
  supabase: SupabaseClient | null
  userId: string
  workOrder: WorkOrderRecord | null
  woTemplate: Record<string, string>
  onSaved?: (record: WorkOrderRecord) => void
  setPage?: (page: string) => void
}

export function WorkOrderEditorModal({
  open,
  onClose,
  supabase,
  userId,
  workOrder,
  woTemplate,
  onSaved,
  setPage,
}: Props) {
  const [number, setNumber] = useState("")
  const [status, setStatus] = useState<WorkOrderRecord["status"]>("open")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (!open || !workOrder) return
    setNumber(workOrder.work_order_number)
    setStatus(workOrder.status)
    setNotice("")
  }, [open, workOrder])

  if (!open || !workOrder) return null

  async function handleSave() {
    if (!supabase) return
    setBusy(true)
    setNotice("")
    try {
      const saved = await updateWorkOrderInProfile(supabase, userId, workOrder!.id, {
        work_order_number: number,
        status,
      })
      onSaved?.(saved)
      setNotice("Work order saved.")
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
      const url = await openWorkOrderDocumentPdf(supabase, userId, workOrder!, woTemplate)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  function openEstimate() {
    queueQuotesOpenQuote(workOrder!.quote_id)
    setPage?.("quotes")
    onClose()
  }

  return (
    <EditorModalShell
      title="Edit work order"
      subtitle={workOrder.estimate_title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            onClick={() => void handlePreviewPdf()}
            disabled={busy}
            style={secondaryBtn}
          >
            Preview PDF
          </button>
          {setPage ? (
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
      <div style={editorReadOnlyBox}>
        <div style={{ fontWeight: 700, color: theme.text }}>{workOrder.customer_name}</div>
        <div style={{ marginTop: 4 }}>
          {formatUsdAmount(workOrder.estimate_total) ? `${formatUsdAmount(workOrder.estimate_total)} · ` : ""}
          WO #{workOrder.work_order_number}
        </div>
      </div>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={editorFieldLabel}>Work order number</span>
        <input value={number} onChange={(e) => setNumber(e.target.value)} style={theme.formInput} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={editorFieldLabel}>Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as WorkOrderRecord["status"])} style={theme.formInput}>
          <option value="open">Open</option>
          <option value="scheduled">Scheduled</option>
          <option value="complete">Complete</option>
        </select>
      </label>
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
