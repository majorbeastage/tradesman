import { useEffect, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import type { WorkflowActionButton } from "../lib/estimateWorkflowRuntime"

type Props = {
  open: boolean
  action: WorkflowActionButton | null
  busy: boolean
  onClose: () => void
  onSend: (payload: { to: string; cc: string; bcc: string; note: string }) => void
}

export default function EstimateWorkflowRouteModal({ open, action, busy, onClose, onSend }: Props) {
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!open || !action) return
    setTo(action.assignee?.email?.trim() ?? "")
    setCc("")
    setBcc("")
    setNote("")
  }, [open, action?.nodeId, action?.assignee?.email])

  if (!open || !action) return null

  const unassigned = action.assignee?.kind === "unassigned" || !to.trim()

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }}
      />
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
          {action.detail}
          {unassigned
            ? " Enter the department contact email below, or assign someone on My Business Workflow / Org chart."
            : ""}
        </p>
        <label style={labelStyle}>
          To
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} placeholder="approver@company.com" />
        </label>
        <label style={labelStyle}>
          CC
          <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} style={inputStyle} placeholder="Optional — comma separated" />
        </label>
        <label style={labelStyle}>
          BCC
          <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} style={inputStyle} placeholder="Optional" />
        </label>
        <label style={labelStyle}>
          Note for approver
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Scope, urgency, or what you need approved…" />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !to.trim()}
            onClick={() => onSend({ to: to.trim(), cc: cc.trim(), bcc: bcc.trim(), note: note.trim() })}
            style={primaryBtn}
          >
            {busy ? "Sending…" : "Send for approval"}
          </button>
        </div>
      </div>
    </>
  )
}

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 10 }
const inputStyle: CSSProperties = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14 }
const secondaryBtn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", cursor: "pointer", fontWeight: 600 }
const primaryBtn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", cursor: "pointer", fontWeight: 700 }
