import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import type { WorkflowRollbackTarget } from "../lib/customerWorkflowRollback"
import type { CalendarEventProfileRow } from "../lib/calendarEventProfile"
import { calendarEventDisplayStatus } from "../lib/calendarEventProfile"

export type CustomerWorkflowRollbackSubmit = {
  targetNodeId: string
  note: string
  removeUpcomingCalendar: boolean
  removeRecurringCalendar: boolean
}

type Props = {
  open: boolean
  busy: boolean
  currentStepLabel: string | null
  targets: WorkflowRollbackTarget[]
  initialTargetNodeId?: string | null
  upcomingEvents: CalendarEventProfileRow[]
  recurringEvents: CalendarEventProfileRow[]
  suggestRemoveCalendar?: boolean
  onClose: () => void
  onSubmit: (payload: CustomerWorkflowRollbackSubmit) => void
}

export default function CustomerWorkflowRollbackModal({
  open,
  busy,
  currentStepLabel,
  targets,
  initialTargetNodeId,
  upcomingEvents,
  recurringEvents,
  suggestRemoveCalendar = false,
  onClose,
  onSubmit,
}: Props) {
  const [targetNodeId, setTargetNodeId] = useState("")
  const [note, setNote] = useState("")
  const [removeUpcoming, setRemoveUpcoming] = useState(false)
  const [removeRecurring, setRemoveRecurring] = useState(false)

  const defaultTarget = useMemo(() => {
    if (initialTargetNodeId && targets.some((t) => t.nodeId === initialTargetNodeId)) return initialTargetNodeId
    return targets.length > 0 ? targets[targets.length - 1]!.nodeId : ""
  }, [initialTargetNodeId, targets])

  useEffect(() => {
    if (!open) return
    setTargetNodeId(defaultTarget)
    setNote("")
    setRemoveUpcoming(suggestRemoveCalendar && upcomingEvents.length > 0)
    setRemoveRecurring(false)
  }, [open, defaultTarget, suggestRemoveCalendar, upcomingEvents.length])

  if (!open) return null

  const selected = targets.find((t) => t.nodeId === targetNodeId)

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }} />
      <div
        role="dialog"
        aria-labelledby="workflow-rollback-title"
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "min(90vh, 720px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
          zIndex: 10001,
          padding: 20,
        }}
      >
        <h3 id="workflow-rollback-title" style={{ margin: "0 0 8px", fontSize: 17, color: theme.text }}>
          Move customer back in workflow
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          {currentStepLabel
            ? `Currently at “${currentStepLabel}”. Choose an earlier step to reopen. Estimate approvals, routing history, and customer status will update.`
            : "Choose an earlier workflow step to reopen for this customer."}
        </p>

        {targets.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>There are no earlier workflow steps to move back to.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Send back to</div>
            {targets.map((t) => (
              <label
                key={t.nodeId}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `2px solid ${targetNodeId === t.nodeId ? theme.primary : theme.border}`,
                  background: targetNodeId === t.nodeId ? "rgba(249,115,22,0.06)" : "#fff",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="rollback-target"
                  checked={targetNodeId === t.nodeId}
                  onChange={() => setTargetNodeId(t.nodeId)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: theme.text }}>{t.label}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 1.4 }}>{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {(upcomingEvents.length > 0 || recurringEvents.length > 0) && targets.length > 0 ? (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 8,
              border: "1px solid #fde68a",
              background: "#fffbeb",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#92400e" }}>Calendar</div>
            {upcomingEvents.length > 0 ? (
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={removeUpcoming}
                  onChange={(e) => setRemoveUpcoming(e.target.checked)}
                />
                <span>
                  Remove {upcomingEvents.length} upcoming appointment{upcomingEvents.length === 1 ? "" : "s"} from the
                  calendar
                  <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#78716c", marginTop: 2 }}>
                    {upcomingEvents.slice(0, 3).map((ev) => ev.title).join(" · ")}
                    {upcomingEvents.length > 3 ? ` · +${upcomingEvents.length - 3} more` : ""}
                  </span>
                </span>
              </label>
            ) : null}
            {recurringEvents.length > 0 ? (
              <label style={checkLabelStyle}>
                <input
                  type="checkbox"
                  checked={removeRecurring}
                  onChange={(e) => setRemoveRecurring(e.target.checked)}
                />
                <span>
                  Cancel recurring series ({recurringEvents.length} occurrence
                  {recurringEvents.length === 1 ? "" : "s"} in view)
                </span>
              </label>
            ) : null}
            <p style={{ margin: 0, fontSize: 11, color: "#78716c", lineHeight: 1.45 }}>
              Cancelled events stay on the profile for reference. Use Scheduling to reschedule after you move the
              workflow back.
            </p>
          </div>
        ) : null}

        <label style={labelStyle}>
          Reason (optional, saved in workflow history)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder={
              selected?.hint.includes("Scheduling")
                ? "e.g. Customer cancelled — need to re-quote before rescheduling"
                : "e.g. Sent back to estimator for revisions"
            }
          />
        </label>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !targetNodeId || targets.length === 0}
            onClick={() =>
              onSubmit({
                targetNodeId,
                note: note.trim(),
                removeUpcomingCalendar: removeUpcoming,
                removeRecurringCalendar: removeRecurring,
              })
            }
            style={primaryBtn}
          >
            {busy ? "Updating…" : "Move back to step"}
          </button>
        </div>
      </div>
    </>
  )
}

export function formatCalendarEventShort(ev: CalendarEventProfileRow): string {
  const status = calendarEventDisplayStatus(ev)
  const when = ev.start_at ? new Date(ev.start_at).toLocaleString() : "—"
  return `${ev.title} · ${status} · ${when}`
}

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "#475569" }
const checkLabelStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  fontSize: 12,
  fontWeight: 600,
  color: theme.text,
  lineHeight: 1.45,
}
const inputStyle: CSSProperties = { padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14 }
const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
}
const primaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
}
