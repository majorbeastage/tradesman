import { type CSSProperties } from "react"
import { theme } from "../styles/theme"
import type { BusinessWorkflowDoc } from "../lib/businessWorkflow"
import { workflowProgressDisplaySteps } from "../lib/businessWorkflow"
import type { OrganizationChartDoc } from "../lib/organizationChart"
import { resolveWorkflowNodeAssignee } from "../lib/estimateWorkflowRuntime"
import type { ExternalContactsDoc } from "../lib/externalContacts"
import type { LinkableOrgUser } from "../lib/orgChartMembers"

type Props = {
  open: boolean
  onClose: () => void
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  externalContacts: ExternalContactsDoc
  linkableUsers: LinkableOrgUser[]
  completedNodeIds: string[]
  pendingNodeIds: string[]
  currentNodeId: string | null
  onCompleteStep?: (nodeId: string) => void
  completeBusy?: boolean
}

export default function CustomerWorkflowProgressViewer({
  open,
  onClose,
  workflow,
  orgChart,
  externalContacts,
  linkableUsers,
  completedNodeIds,
  pendingNodeIds,
  currentNodeId,
  onCompleteStep,
  completeBusy,
}: Props) {
  if (!open) return null

  const steps = workflowProgressDisplaySteps(workflow)
  const completed = new Set(completedNodeIds)
  const pending = new Set(pendingNodeIds)
  const activeId = currentNodeId ?? pendingNodeIds[0] ?? null

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10000 }}
      />
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "min(85vh, 720px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
          zIndex: 10001,
          padding: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: theme.text }}>Workflow progress</h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
              {workflow.title || "Company workflow"} — mark steps complete as you work the job. The active step drives Job status on the Customers list.
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            Close
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {steps.map(({ node, stepLabel }) => {
            const isDone = completed.has(node.id)
            const isPending = pending.has(node.id)
            const isActive = node.id === activeId || (isPending && !activeId)
            const assignee = resolveWorkflowNodeAssignee(node, orgChart, externalContacts, linkableUsers)
            const assigneeLabel =
              assignee.displayName?.trim() && !/unassigned/i.test(assignee.displayName)
                ? assignee.displayName.trim()
                : "Unassigned"

            return (
              <div
                key={node.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: isActive ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  background: isDone ? "#f1f5f9" : isActive ? "#fff7ed" : "#fff",
                  opacity: isDone ? 0.72 : 1,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 800,
                    background: isDone ? "#cbd5e1" : isActive ? theme.primary : "#e2e8f0",
                    color: isDone ? "#475569" : isActive ? "#fff" : "#64748b",
                  }}
                  aria-hidden
                >
                  {isDone ? "✓" : stepLabel}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: isDone ? "#64748b" : theme.text,
                      textDecoration: isDone ? "line-through" : "none",
                    }}
                  >
                    {node.label}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    {assigneeLabel}
                    {isDone ? " · Completed" : isPending ? " · Awaiting approval" : isActive ? " · Current step" : " · Not complete"}
                  </div>
                  {!isDone && onCompleteStep ? (
                    <button
                      type="button"
                      disabled={completeBusy}
                      onClick={() => onCompleteStep(node.id)}
                      style={{
                        marginTop: 8,
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: `1px solid ${theme.primary}`,
                        background: "#eff6ff",
                        color: theme.primary,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: completeBusy ? "wait" : "pointer",
                      }}
                    >
                      {completeBusy ? "Saving…" : "Mark step complete"}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

const closeBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  flexShrink: 0,
}
