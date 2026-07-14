import { theme } from "../styles/theme"
import type { CSSProperties } from "react"
import type { BusinessWorkflowDoc } from "../lib/businessWorkflow"
import type { InferredCustomerWorkflowStep } from "../lib/inferCustomerWorkflowStep"
import type { CustomerWorkflowCalendarContext } from "../lib/customerWorkflowRollback"
import { listWorkflowRollbackTargets } from "../lib/customerWorkflowRollback"
import { formatCalendarEventShort } from "./CustomerWorkflowRollbackModal"
import type { CalendarEventProfileRow } from "../lib/calendarEventProfile"

type Props = {
  workflow: BusinessWorkflowDoc
  inferred: InferredCustomerWorkflowStep
  calendarContext: CustomerWorkflowCalendarContext
  onOpenWorkflowChart?: () => void
  onOpenCurrentItem?: () => void
  currentItemLabel?: string
  allowBypass?: boolean
  onBypassStep?: () => void
  bypassBusy?: boolean
  onMoveBack?: () => void
  onReschedule?: (ev?: CalendarEventProfileRow) => void
  rollbackBusy?: boolean
}

export function CustomerWorkflowStatusPanel({
  workflow,
  inferred,
  calendarContext,
  onOpenWorkflowChart,
  onOpenCurrentItem,
  currentItemLabel,
  allowBypass,
  onBypassStep,
  bypassBusy,
  onMoveBack,
  onReschedule,
  rollbackBusy,
}: Props) {
  const currentNode = inferred.currentNodeId
    ? workflow.nodes.find((n) => n.id === inferred.currentNodeId) ?? null
    : null

  const rollbackTargets = listWorkflowRollbackTargets(workflow, inferred.currentNodeId)
  const canMoveBack = rollbackTargets.length > 0 && Boolean(onMoveBack)

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "linear-gradient(180deg, #fff7ed 0%, #fff 48%)",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: 0.04 }}>
            Current job status
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: theme.text, marginTop: 6, lineHeight: 1.3 }}>
            {inferred.currentNodeLabel ?? "Status pending"}
          </div>
        </div>
        {onOpenWorkflowChart ? (
          <button type="button" onClick={onOpenWorkflowChart} style={linkBtnStyle}>
            Open workflow chart
          </button>
        ) : null}
      </div>

      {currentNode ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: `2px solid ${theme.primary}`,
            background: "#fff",
            fontSize: 13,
            fontWeight: 700,
            color: theme.text,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Active step: {currentNode.label}</span>
          {onOpenCurrentItem ? (
            <button type="button" onClick={onOpenCurrentItem} style={openItemBtnStyle}>
              Open {currentItemLabel ?? "current item"}
            </button>
          ) : null}
        </div>
      ) : null}

      {calendarContext.cancelled.length > 0 ? (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: "#991b1b" }}>
            {calendarContext.cancelled.length} cancelled appointment{calendarContext.cancelled.length === 1 ? "" : "s"}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "#7f1d1d", lineHeight: 1.45 }}>
            {calendarContext.cancelled.slice(0, 4).map((ev) => (
              <li key={ev.id}>{formatCalendarEventShort(ev)}</li>
            ))}
          </ul>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {canMoveBack ? (
              <button type="button" disabled={rollbackBusy} onClick={onMoveBack} style={warnBtnStyle}>
                {rollbackBusy ? "Working…" : "Move workflow back"}
              </button>
            ) : null}
            {onReschedule ? (
              <button type="button" onClick={() => onReschedule()} style={secondaryActionBtnStyle}>
                Schedule again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {calendarContext.upcoming.length > 0 && inferred.currentNodeId ? (
        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>
          {calendarContext.upcoming.length} upcoming job{calendarContext.upcoming.length === 1 ? "" : "s"} on the calendar
          {canMoveBack ? " — moving workflow back can remove them." : "."}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {canMoveBack ? (
          <button type="button" disabled={rollbackBusy} onClick={onMoveBack} style={primaryActionBtnStyle}>
            {rollbackBusy ? "Working…" : "Move back in workflow"}
          </button>
        ) : null}
        {onReschedule && calendarContext.upcoming.length === 0 && calendarContext.cancelled.length === 0 ? (
          <button type="button" onClick={() => onReschedule()} style={secondaryActionBtnStyle}>
            Open Scheduling
          </button>
        ) : null}
        {allowBypass && inferred.currentNodeId && onBypassStep ? (
          <button type="button" disabled={bypassBusy} onClick={onBypassStep} style={bypassBtnStyle}>
            {bypassBusy ? "Bypassing…" : "Bypass current approval (authorized)"}
          </button>
        ) : null}
      </div>
    </div>
  )
}

const linkBtnStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}

const openItemBtnStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 11,
  cursor: "pointer",
}

const primaryActionBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}

const secondaryActionBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}

const warnBtnStyle: CSSProperties = {
  ...secondaryActionBtnStyle,
  border: "1px solid #fca5a5",
  background: "#fff",
  color: "#991b1b",
}

const bypassBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #fdba74",
  background: "#fff7ed",
  color: "#9a3412",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}
