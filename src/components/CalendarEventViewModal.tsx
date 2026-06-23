import { useMemo, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import { calendarEventDisplayStatus, type CalendarEventProfileRow } from "../lib/calendarEventProfile"
import { formatDisplayText } from "../lib/formatDisplayText"

type Props = {
  event: CalendarEventProfileRow
  assigneeLabel?: string | null
  onClose: () => void
  /** Open this event in Scheduling for editing (upcoming jobs only). */
  onEditInCalendar?: () => void
  onViewPdf?: () => void
  pdfBusy?: boolean
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function statusStyle(status: ReturnType<typeof calendarEventDisplayStatus>): CSSProperties {
  const base: CSSProperties = { fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 999 }
  switch (status) {
    case "Complete":
      return { ...base, background: "#dcfce7", color: "#166534" }
    case "Cancelled":
      return { ...base, background: "#fee2e2", color: "#991b1b" }
    case "Upcoming":
      return { ...base, background: "#dbeafe", color: "#1d4ed8" }
    case "Recurring":
      return { ...base, background: "#ede9fe", color: "#5b21b6" }
    case "Past — no status":
      return { ...base, background: "#fef3c7", color: "#92400e" }
    default:
      return { ...base, background: "#f1f5f9", color: "#475569" }
  }
}

export default function CalendarEventViewModal({
  event,
  assigneeLabel,
  onClose,
  onEditInCalendar,
  onViewPdf,
  pdfBusy,
}: Props) {
  const status = useMemo(() => calendarEventDisplayStatus(event), [event])
  const canEdit = status === "Upcoming" || status === "Recurring"
  const notes = formatDisplayText(event.notes, "")

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="calendar-event-view-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          maxHeight: "min(88vh, 720px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,0.18)",
          padding: "18px 20px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 id="calendar-event-view-title" style={{ margin: 0, fontSize: 18, color: theme.text }}>
              {formatDisplayText(event.title, "Scheduled job")}
            </h2>
            {event.customer_name ? (
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>{event.customer_name}</p>
            ) : null}
          </div>
          <span style={statusStyle(status)}>{status}</span>
        </div>

        <dl style={{ margin: "16px 0 0", display: "grid", gap: 10, fontSize: 13 }}>
          <div>
            <dt style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>Starts</dt>
            <dd style={{ margin: "2px 0 0", color: theme.text }}>{formatWhen(event.start_at)}</dd>
          </div>
          <div>
            <dt style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>Ends</dt>
            <dd style={{ margin: "2px 0 0", color: theme.text }}>{formatWhen(event.end_at)}</dd>
          </div>
          {event.job_type_name ? (
            <div>
              <dt style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>Job type</dt>
              <dd style={{ margin: "2px 0 0", color: theme.text }}>{event.job_type_name}</dd>
            </div>
          ) : null}
          {assigneeLabel ? (
            <div>
              <dt style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>Assigned to</dt>
              <dd style={{ margin: "2px 0 0", color: theme.text }}>{assigneeLabel}</dd>
            </div>
          ) : null}
          {event.quote_id ? (
            <div>
              <dt style={{ margin: 0, color: "#64748b", fontWeight: 600 }}>Estimate</dt>
              <dd style={{ margin: "2px 0 0", color: theme.text }}>Linked to an estimate</dd>
            </div>
          ) : null}
        </dl>

        {notes ? (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{notes}</div>
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          {canEdit && onEditInCalendar ? (
            <button
              type="button"
              onClick={onEditInCalendar}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Edit in Scheduling
            </button>
          ) : null}
          {status === "Complete" && onViewPdf ? (
            <button
              type="button"
              disabled={pdfBusy}
              onClick={onViewPdf}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: theme.text,
                fontWeight: 600,
                fontSize: 13,
                cursor: pdfBusy ? "wait" : "pointer",
              }}
            >
              {pdfBusy ? "Opening PDF…" : "View PDF summary"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              color: theme.text,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
