import { theme } from "../styles/theme"
import type { BusinessWorkflowDoc } from "../lib/businessWorkflow"
import { resolveToolWorkflowGuidance, type WorkflowToolKind } from "../lib/workflowStepIntention"

type Props = {
  tool: WorkflowToolKind
  workflow: BusinessWorkflowDoc | null | undefined
}

/** Lightweight banner when a tool should follow account workflow routing. */
export default function WorkflowToolGuidanceBanner({ tool, workflow }: Props) {
  if (!workflow) return null
  const guidance = resolveToolWorkflowGuidance({ tool, workflow })
  if (!guidance) return null

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "linear-gradient(180deg, #f0f9ff 0%, #fff 100%)",
        fontSize: 13,
        lineHeight: 1.5,
        color: theme.text,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{guidance.headline}</div>
      <div style={{ color: "#64748b" }}>{guidance.body}</div>
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: theme.primary }}>
        Suggested action: {guidance.suggestedLabel}
      </div>
    </div>
  )
}
