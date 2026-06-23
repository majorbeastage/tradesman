import { useEffect, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import type { WorkflowActionButton } from "../lib/estimateWorkflowRuntime"

type Props = {
  open: boolean
  action: WorkflowActionButton | null
  batchActions?: WorkflowActionButton[] | null
  busy: boolean
  onClose: () => void
  onSend: (payload: { to: string; cc: string; bcc: string; note: string }) => void
  onSendAll?: (payload: { note: string }) => void
}

export default function EstimateWorkflowRouteModal({
  open,
  action,
  batchActions,
  busy,
  onClose,
  onSend,
  onSendAll,
}: Props) {
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [note, setNote] = useState("")

  const batch = batchActions && batchActions.length > 1 ? batchActions : null
  const active = batch?.[0] ?? action

  useEffect(() => {
    if (!open || !active) return
    if (batch) {
      setTo("")
      setCc("")
      setBcc("")
      setNote("")
      return
    }
    setTo(active.assignee?.email?.trim() ?? "")
    setCc("")
    setBcc("")
    setNote("")
  }, [open, active?.nodeId, active?.assignee?.email, batch])

  if (!open || !active) return null

  const unassigned = !batch && (active.assignee?.kind === "unassigned" || !to.trim())

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
          width: "min(520px, calc(100vw - 32px))",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
          zIndex: 10001,
          padding: 20,
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 17, color: theme.text }}>
          {batch ? `Send to all approvers (${batch.length})` : active.label}
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
          {batch
            ? "Each approver receives their own routing request. Unassigned steps are skipped — assign contacts on My Business Workflow / Org chart first."
            : active.detail}
          {!batch && unassigned
            ? " Enter the department contact email below, or assign someone on My Business Workflow / Org chart."
            : ""}
        </p>

        {batch ? (
          <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
            {batch.map((a) => (
              <li key={a.nodeId}>
                <strong>{a.detail || a.label}</strong>
                {a.assignee?.email?.trim() ? ` · ${a.assignee.email.trim()}` : " · email not set"}
              </li>
            ))}
          </ul>
        ) : (
          <>
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
          </>
        )}

        <label style={labelStyle}>
          Note for approver{batch ? "s" : ""}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder="Scope, urgency, or what you need approved…"
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (!batch && !to.trim())}
            onClick={() =>
              batch && onSendAll
                ? onSendAll({ note: note.trim() })
                : onSend({ to: to.trim(), cc: cc.trim(), bcc: bcc.trim(), note: note.trim() })
            }
            style={primaryBtn}
          >
            {busy ? "Sending…" : batch ? "Send to all approvers" : "Send for approval"}
          </button>
        </div>
      </div>
    </>
  )
}

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 10 }
const inputStyle: CSSProperties = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14 }
const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid #64748b`,
  background: "#f1f5f9",
  color: "#0f172a",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
}
const primaryBtn: CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", cursor: "pointer", fontWeight: 700 }
