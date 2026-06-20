import { useEffect, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import type { WorkflowActionButton } from "../lib/estimateWorkflowRuntime"

type Props = {
  open: boolean
  action: WorkflowActionButton | null
  busy: boolean
  onClose: () => void
  onSubmit: (note: string) => void
}

export default function EstimateWorkflowNoteModal({ open, action, busy, onClose, onSubmit }: Props) {
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!open || !action) return
    setNote("")
  }, [open, action?.nodeId, action?.kind])

  if (!open || !action) return null

  const isDeny = action.kind === "deny_approval"

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }} />
      <div
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
        <h3 style={{ margin: "0 0 8px", fontSize: 17, color: theme.text }}>{action.label}</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
          {isDeny
            ? "Explain why this approval was denied. The estimator will see this in routing history."
            : "Describe what needs to change before this step can be approved."}
        </p>
        <label style={labelStyle}>
          Notes
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder={isDeny ? "Reason for denial…" : "Requested updates…"}
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !note.trim()}
            onClick={() => onSubmit(note.trim())}
            style={{ ...primaryBtn, background: isDeny ? "#dc2626" : theme.primary }}
          >
            {busy ? "Saving…" : isDeny ? "Deny approval" : "Request updates"}
          </button>
        </div>
      </div>
    </>
  )
}

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "#475569" }
const inputStyle: CSSProperties = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14 }
const secondaryBtn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontWeight: 600 }
const primaryBtn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", color: "#fff", cursor: "pointer", fontWeight: 700 }
