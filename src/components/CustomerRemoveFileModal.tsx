import type { CSSProperties } from "react"
import { theme } from "../styles/theme"

type Props = {
  open: boolean
  busy: boolean
  customerName: string
  onClose: () => void
  onConfirm: () => void
}

const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}

const dangerBtn: CSSProperties = {
  ...secondaryBtn,
  border: "none",
  background: "#b91c1c",
  color: "#fff",
  fontWeight: 700,
}

export default function CustomerRemoveFileModal({ open, busy, customerName, onClose, onConfirm }: Props) {
  if (!open) return null

  const label = customerName.trim() || "this customer"

  return (
    <>
      <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }} />
      <div
        role="dialog"
        aria-labelledby="customer-remove-file-title"
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(480px, calc(100vw - 32px))",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
          zIndex: 10001,
          padding: 20,
        }}
      >
        <h3 id="customer-remove-file-title" style={{ margin: "0 0 8px", fontSize: 17, color: theme.text }}>
          Remove customer file?
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
          This permanently removes <strong>{label}</strong> from your customer database. Estimates, messages, and calendar
          links tied to this profile may be deleted or unlinked. This cannot be undone.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy} style={secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} style={dangerBtn}>
            {busy ? "Removing…" : "Remove customer file"}
          </button>
        </div>
      </div>
    </>
  )
}
