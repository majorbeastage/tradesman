import { type CSSProperties } from "react"
import { theme } from "../styles/theme"
import type { WorkflowActionButton, QuoteInternalWorkflowState } from "../lib/estimateWorkflowRuntime"
import { workflowProgressSummary } from "../lib/estimateWorkflowRuntime"
import type { BusinessWorkflowDoc } from "../lib/businessWorkflow"
import { groupWorkflowActionsForDisplay } from "../lib/groupWorkflowActionsForDisplay"

type Props = {
  workflow: BusinessWorkflowDoc
  workflowState: QuoteInternalWorkflowState
  actions: WorkflowActionButton[]
  busy: boolean
  onAction: (action: WorkflowActionButton) => void
  onSendAll?: (actions: WorkflowActionButton[]) => void
  onOpenWorkflow?: () => void
  onOpenOrgChart?: () => void
}

export default function EstimateWorkflowActionsPanel({
  workflow,
  workflowState,
  actions,
  busy,
  onAction,
  onSendAll,
  onOpenWorkflow,
  onOpenOrgChart,
}: Props) {
  const sendActions = actions.filter(
    (a) =>
      a.kind === "send_for_approval" ||
      a.kind === "mark_approved" ||
      a.kind === "request_updates" ||
      a.kind === "deny_approval" ||
      a.kind === "bypass_approval",
  )
  const customerReady = actions.find((a) => a.kind === "send_to_customer")
  const progress = workflowProgressSummary(workflow, workflowState)
  const grouped = groupWorkflowActionsForDisplay(sendActions)

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "linear-gradient(180deg, #f0f9ff 0%, #fff 100%)",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>Company workflow routing</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>
            {progress}
            {workflow.title ? ` · ${workflow.title}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {onOpenWorkflow ? (
            <button type="button" onClick={onOpenWorkflow} style={linkBtnStyle}>
              Edit workflow
            </button>
          ) : null}
          {onOpenOrgChart ? (
            <button type="button" onClick={onOpenOrgChart} style={linkBtnStyle}>
              Org chart
            </button>
          ) : null}
        </div>
      </div>

      {grouped.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
          Add line items to activate internal routing, or configure approval steps in My Business Workflow.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {grouped.map((group) => {
            if (group.kind === "send_all") {
              return (
                <button
                  key="send-all"
                  type="button"
                  disabled={busy}
                  title={group.detail}
                  onClick={() => (onSendAll ? onSendAll(group.actions) : onAction(group.actions[0]!))}
                  style={primaryActionStyle(false, "send_for_approval")}
                >
                  <span style={{ display: "block" }}>{group.label}</span>
                  <span style={detailStyle}>{group.detail}</span>
                </button>
              )
            }
            if (group.kind === "review_pending") {
              return (
                <div
                  key="review-pending"
                  style={{
                    flex: "1 1 100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13, color: theme.text }}>{group.label}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, marginBottom: 8 }}>{group.detail}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {group.actions.map((action) => (
                      <button
                        key={`${action.kind}-${action.nodeId}`}
                        type="button"
                        disabled={busy || action.disabled}
                        onClick={() => onAction(action)}
                        style={{
                          ...primaryActionStyle(action.disabled, action.kind),
                          maxWidth: "none",
                          padding: "8px 12px",
                        }}
                      >
                        {action.label.replace(/^Mark approved — /i, "Approve: ")}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }
            const action = group.action
            return (
              <button
                key={`${action.kind}-${action.nodeId}`}
                type="button"
                disabled={busy || action.disabled}
                title={action.disabledReason ?? action.detail}
                onClick={() => onAction(action)}
                style={primaryActionStyle(action.disabled, action.kind, action.primary)}
              >
                <span style={{ display: "block" }}>{action.label}</span>
                <span style={detailStyle}>{action.detail}</span>
              </button>
            )
          })}
        </div>
      )}

      {customerReady ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${customerReady.disabled ? "#fecaca" : "#86efac"}`,
            background: customerReady.disabled ? "#fef2f2" : "#f0fdf4",
            fontSize: 12,
            color: customerReady.disabled ? "#991b1b" : "#166534",
            lineHeight: 1.45,
          }}
        >
          <strong>{customerReady.label}:</strong> {customerReady.detail}
        </div>
      ) : null}

      {workflowState.history.length > 0 ? (
        <details style={{ fontSize: 12, color: "#64748b" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: theme.text }}>Routing history</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
            {[...workflowState.history].reverse().slice(0, 8).map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {new Date(h.at).toLocaleString()} —{" "}
                {h.action === "mark_approved"
                  ? "Approved"
                  : h.action === "request_updates"
                    ? "Updates requested"
                    : h.action === "deny_approval"
                      ? "Denied"
                      : h.action === "bypass_approval"
                        ? "Bypassed"
                        : h.action === "rollback"
                          ? "Moved back"
                          : "Sent"}
                : {h.nodeLabel}
                {h.note ? ` — ${h.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function primaryActionStyle(
  disabled: boolean | undefined,
  kind: WorkflowActionButton["kind"],
  primary?: boolean,
): CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 8,
    border:
      kind === "mark_approved"
        ? `2px solid #16a34a`
        : kind === "deny_approval"
          ? `2px solid #dc2626`
          : kind === "bypass_approval"
            ? `2px solid #7c3aed`
            : `1px solid ${theme.border}`,
    background: disabled
      ? "#f1f5f9"
      : kind === "deny_approval"
        ? "#fef2f2"
        : kind === "bypass_approval"
          ? "#faf5ff"
          : primary || kind === "send_for_approval"
            ? theme.primary
            : "#fff",
    color: disabled
      ? "#94a3b8"
      : (primary || kind === "send_for_approval") && kind !== "deny_approval" && kind !== "bypass_approval"
        ? "#fff"
        : theme.text,
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "left",
    maxWidth: 320,
  }
}

const detailStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 500,
  opacity: 0.85,
  marginTop: 2,
}

const linkBtnStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  color: theme.text,
}
