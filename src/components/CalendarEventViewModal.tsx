import { useMemo, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import { calendarEventDisplayStatus, type CalendarEventProfileRow } from "../lib/calendarEventProfile"
import { formatDisplayText } from "../lib/formatDisplayText"

export type CalendarEventLinkedDoc = {
  label: string
  value: string
  onOpen?: () => void
}

type Props = {
  event: CalendarEventProfileRow
  assigneeLabel?: string | null
  scopeOfWork?: string | null
  materialsUsed?: string | null
  linkedDocs?: CalendarEventLinkedDoc[]
  onClose: () => void
  onEditInCalendar?: () => void
  onViewPdf?: () => void
  onExportPdf?: () => void
  onShareContact?: () => void
  pdfBusy?: boolean
  exportBusy?: boolean
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
  scopeOfWork,
  materialsUsed,
  linkedDocs = [],
  onClose,
  onEditInCalendar,
  onViewPdf,
  onExportPdf,
  onShareContact,
  pdfBusy,
  exportBusy,
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
          width: "min(640px, 100%)",
          maxHeight: "min(90vh, 820px)",
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
        </dl>

        {notes ? (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{notes}</div>
          </div>
        ) : null}

        {scopeOfWork?.trim() ? (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Scope of work</div>
            <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{scopeOfWork.trim()}</div>
          </div>
        ) : null}

        {materialsUsed?.trim() ? (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Materials used / planned</div>
            <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{materialsUsed.trim()}</div>
          </div>
        ) : null}

        {linkedDocs.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Linked paperwork</div>
            <div style={{ display: "grid", gap: 6 }}>
              {linkedDocs.map((doc) => (
                <div
                  key={`${doc.label}-${doc.value}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: theme.text }}>{doc.label}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>{doc.value}</div>
                  </div>
                  {doc.onOpen ? (
                    <button
                      type="button"
                      onClick={doc.onOpen}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: `1px solid ${theme.border}`,
                        background: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Open
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          {onShareContact ? (
            <button type="button" onClick={onShareContact} style={primaryBtn}>
              Share contact
            </button>
          ) : null}
          {canEdit && onEditInCalendar ? (
            <button type="button" onClick={onEditInCalendar} style={primaryBtn}>
              Edit in Scheduling
            </button>
          ) : null}
          {onExportPdf ? (
            <button type="button" disabled={exportBusy} onClick={onExportPdf} style={secondaryBtn}>
              {exportBusy ? "Exporting…" : "Export to PDF"}
            </button>
          ) : null}
          {status === "Complete" && onViewPdf ? (
            <button type="button" disabled={pdfBusy} onClick={onViewPdf} style={secondaryBtn}>
              {pdfBusy ? "Opening PDF…" : "View job summary PDF"}
            </button>
          ) : null}
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const primaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
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
