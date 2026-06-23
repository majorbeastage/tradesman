import { theme } from "../styles/theme"
import type { BusinessWorkflowDoc } from "../lib/businessWorkflow"
import type { InferredCustomerWorkflowStep } from "../lib/inferCustomerWorkflowStep"

type Props = {
  workflow: BusinessWorkflowDoc
  inferred: InferredCustomerWorkflowStep
  onOpenWorkflow?: () => void
  allowBypass?: boolean
  onBypassStep?: () => void
  bypassBusy?: boolean
}

export function CustomerWorkflowStatusPanel({
  workflow,
  inferred,
  onOpenWorkflow,
  allowBypass,
  onBypassStep,
  bypassBusy,
}: Props) {
  const currentNode = inferred.currentNodeId
    ? workflow.nodes.find((n) => n.id === inferred.currentNodeId) ?? null
    : null

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
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 1.45 }}>{inferred.reason}</div>
        </div>
        {onOpenWorkflow ? (
          <button
            type="button"
            onClick={onOpenWorkflow}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              color: theme.text,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
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
          }}
        >
          Active step: {currentNode.label}
        </div>
      ) : null}

      {inferred.completedNodeIds.length > 0 ? (
        <div style={{ fontSize: 11, color: "#64748b" }}>
          {inferred.completedNodeIds.length} earlier step{inferred.completedNodeIds.length === 1 ? "" : "s"} completed
        </div>
      ) : null}

      {allowBypass && inferred.currentNodeId && onBypassStep ? (
        <button
          type="button"
          disabled={bypassBusy}
          onClick={onBypassStep}
          style={{
            justifySelf: "start",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #fdba74",
            background: "#fff7ed",
            color: "#9a3412",
            fontWeight: 700,
            fontSize: 12,
            cursor: bypassBusy ? "wait" : "pointer",
          }}
        >
          {bypassBusy ? "Bypassing…" : "Bypass current approval (authorized)"}
        </button>
      ) : null}
    </div>
  )
}
