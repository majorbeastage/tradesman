import { theme } from "../styles/theme"
import type { BusinessWorkflowDoc } from "../lib/businessWorkflow"
import type { CustomerWorkflowSnapshot } from "../lib/customerWorkflowRouting"
import { workflowProgressLabel } from "../lib/customerWorkflowRouting"

type Props = {
  workflow: BusinessWorkflowDoc
  snapshot: CustomerWorkflowSnapshot | null
  onOpenWorkflow?: () => void
  allowBypass?: boolean
  onBypassStep?: () => void
  bypassBusy?: boolean
}

export function CustomerWorkflowStatusPanel({
  workflow,
  snapshot,
  onOpenWorkflow,
  allowBypass,
  onBypassStep,
  bypassBusy,
}: Props) {
  const nodes = workflow.nodes
  const activeId = snapshot?.activeNodeId

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "linear-gradient(180deg, #f8fafc 0%, #fff 100%)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>Workflow position</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>{workflowProgressLabel(snapshot)}</div>
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {nodes.slice(0, 12).map((node) => {
          const completed = snapshot?.completedNodeIds.includes(node.id)
          const active = node.id === activeId
          const pending = snapshot?.pendingNodeIds.includes(node.id)
          const bg = completed ? "#dcfce7" : active ? "#ffedd5" : pending ? "#e0f2fe" : "#f1f5f9"
          const border = active ? theme.primary : completed ? "#86efac" : theme.border
          return (
            <span
              key={node.id}
              title={node.label}
              style={{
                fontSize: 11,
                fontWeight: active ? 800 : 600,
                padding: "4px 8px",
                borderRadius: 999,
                border: `1px solid ${border}`,
                background: bg,
                color: theme.text,
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {completed ? "✓ " : active ? "● " : ""}
              {node.label}
            </span>
          )
        })}
      </div>

      {allowBypass && activeId && onBypassStep ? (
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
