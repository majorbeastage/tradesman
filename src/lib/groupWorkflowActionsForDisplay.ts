import type { WorkflowActionButton } from "./estimateWorkflowRuntime"
import { isWorkflowApprovalSendAction } from "./estimateWorkflowRuntime"
import type { BusinessWorkflowDoc } from "./businessWorkflow"

export type DisplayWorkflowAction =
  | { kind: "single"; action: WorkflowActionButton }
  | { kind: "send_all"; actions: WorkflowActionButton[]; label: string; detail: string }
  | { kind: "review_pending"; actions: WorkflowActionButton[]; label: string; detail: string }

/** Collapse parallel approval buttons into cleaner groups for the estimate workflow panel. */
export function groupWorkflowActionsForDisplay(
  actions: WorkflowActionButton[],
  workflow?: BusinessWorkflowDoc,
): DisplayWorkflowAction[] {
  const sendable = actions.filter(
    (a) =>
      a.kind === "send_for_approval" &&
      !a.disabled &&
      (!workflow || isWorkflowApprovalSendAction(a, workflow)),
  )
  const operationalSends = actions.filter(
    (a) =>
      a.kind === "send_for_approval" &&
      !a.disabled &&
      workflow &&
      !isWorkflowApprovalSendAction(a, workflow),
  )
  const pendingReview = actions.filter(
    (a) => (a.kind === "mark_approved" || a.kind === "request_updates" || a.kind === "deny_approval") && !a.disabled,
  )
  const others = actions.filter(
    (a) =>
      a.kind !== "send_for_approval" &&
      a.kind !== "mark_approved" &&
      a.kind !== "request_updates" &&
      a.kind !== "deny_approval" &&
      !a.disabled,
  )

  const out: DisplayWorkflowAction[] = []

  if (sendable.length > 1) {
    const names = [...new Set(sendable.map((a) => a.assignee?.displayName?.trim()).filter(Boolean))]
    out.push({
      kind: "send_all",
      actions: sendable,
      label: `Send to all approvers (${sendable.length})`,
      detail:
        names.length > 0
          ? names.slice(0, 4).join(", ") + (names.length > 4 ? ` +${names.length - 4} more` : "")
          : sendable.map((a) => a.detail).slice(0, 2).join(" · "),
    })
  } else if (sendable.length === 1) {
    out.push({ kind: "single", action: sendable[0]! })
  }

  for (const a of operationalSends) {
    out.push({ kind: "single", action: a })
  }

  const pendingNodes = new Set(pendingReview.filter((a) => a.kind === "mark_approved").map((a) => a.nodeId))
  if (pendingNodes.size > 1) {
    out.push({
      kind: "review_pending",
      actions: pendingReview.filter((a) => a.kind === "mark_approved"),
      label: `Review pending approvals (${pendingNodes.size})`,
      detail: "Open each approval step from Estimates or approve individually below.",
    })
  } else {
    for (const a of pendingReview) {
      out.push({ kind: "single", action: a })
    }
  }

  for (const a of others) {
    out.push({ kind: "single", action: a })
  }

  return out
}
