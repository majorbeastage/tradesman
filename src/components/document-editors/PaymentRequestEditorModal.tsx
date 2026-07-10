import { useEffect, useState } from "react"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import { formatUsdAmount } from "../../lib/customerDocumentStatus"
import {
  formatPaymentAmount,
  paymentStatusLabel,
  updatePaymentRequest,
  type PaymentRequestRow,
} from "../../lib/paymentRequests"
import { EditorModalShell, editorFieldLabel, editorReadOnlyBox } from "./EditorModalShell"

type Props = {
  open: boolean
  onClose: () => void
  userId: string
  paymentRequest: PaymentRequestRow | null
  onSaved?: () => void
}

export function PaymentRequestEditorModal({ open, onClose, userId, paymentRequest, onSaved }: Props) {
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")

  const readOnly = paymentRequest?.status === "paid" || paymentRequest?.status === "canceled"

  useEffect(() => {
    if (!open || !paymentRequest) return
    setDescription(paymentRequest.description ?? "")
    setAmount(formatPaymentAmount(paymentRequest.amount))
    setNotice("")
  }, [open, paymentRequest])

  if (!open || !paymentRequest) return null

  async function handleSave() {
    setBusy(true)
    setNotice("")
    try {
      const parsed = Number(amount)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Enter a valid amount.")
      await updatePaymentRequest(userId, paymentRequest!.id, {
        description,
        amount: readOnly ? undefined : parsed,
      })
      onSaved?.()
      setNotice("Invoice / payment request saved.")
    } catch (e) {
      setNotice(formatAppError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <EditorModalShell
      title="Edit invoice"
      subtitle={`${paymentStatusLabel(paymentRequest.status)} · ${formatUsdAmount(paymentRequest.amount) ?? "—"}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {paymentRequest.payment_url ? (
            <button
              type="button"
              onClick={() => window.open(paymentRequest.payment_url!, "_blank", "noopener")}
              disabled={busy}
              style={secondaryBtn}
            >
              Open payment link
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={busy} style={secondaryBtn}>
            Cancel
          </button>
          {!readOnly ? (
            <button type="button" onClick={() => void handleSave()} disabled={busy} style={primaryBtn}>
              {busy ? "Saving…" : "Save"}
            </button>
          ) : null}
        </>
      }
    >
      <div style={editorReadOnlyBox}>
        Status: <strong>{paymentStatusLabel(paymentRequest.status)}</strong>
        {paymentRequest.provider ? ` · ${paymentRequest.provider}` : ""}
      </div>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={editorFieldLabel}>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={readOnly}
          style={{ ...theme.formInput, resize: "vertical", opacity: readOnly ? 0.75 : 1 }}
        />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={editorFieldLabel}>Amount ($)</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          disabled={readOnly}
          style={{ ...theme.formInput, opacity: readOnly ? 0.75 : 1 }}
        />
      </label>
      {!readOnly && paymentRequest.status === "sent" ? (
        <p style={{ margin: 0, fontSize: 12, color: "#b45309", lineHeight: 1.45 }}>
          This request was already sent. Changing the amount does not update the customer&apos;s payment link — resend from Payments if needed.
        </p>
      ) : null}
      {readOnly ? (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Paid and canceled requests cannot be edited.</p>
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
