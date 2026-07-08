/**
 * Infer what a workflow step is meant to accomplish from labels, edges, and tool context.
 * Used to drive primary action buttons across estimates, POs, work orders, invoices, etc.
 */

import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import type { QuoteInternalWorkflowState, WorkflowActionButton, WorkflowAssignee } from "./estimateWorkflowRuntime"
import { canSendEstimateToCustomer, computeEstimateWorkflowActions, isWorkflowApprovalSendAction } from "./estimateWorkflowRuntime"
import type { ExternalContactsDoc } from "./externalContacts"
import type { OrganizationChartDoc } from "./organizationChart"
import type { LinkableOrgUser } from "./orgChartMembers"

export type WorkflowToolKind = "estimate" | "purchase_order" | "work_order" | "invoice" | "scheduling" | "generic"

export type WorkflowStepIntention =
  | "send_to_approver"
  | "await_approval"
  | "send_to_customer"
  | "create_purchase_order"
  | "create_work_order"
  | "schedule_resources"
  | "complete_job"
  | "bill_customer"
  | "internal_handoff"
  | "unknown"

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export function inferWorkflowStepIntention(node: WorkflowNode, tool: WorkflowToolKind = "generic"): WorkflowStepIntention {
  const label = norm(node.label)

  if (/approval|approve|sign.?off|signoff|review/.test(label) && !/sent to customer|customer sign/.test(label)) {
    return "send_to_approver"
  }
  if (/sent to customer|send to customer|email to customer|deliver.*customer|customer delivery/.test(label)) {
    return "send_to_customer"
  }
  if (/purchase order|\bpo\b|parts department|parts dept|supplier|vendor order/.test(label)) {
    return tool === "estimate" ? "send_to_approver" : "create_purchase_order"
  }
  if (/work order|\bwo\b|field tech|technician dispatch/.test(label)) {
    return "create_work_order"
  }
  if (/schedule|calendar|dispatch|assign.*crew|resource/.test(label)) {
    return "schedule_resources"
  }
  if (/job complete|receipt|work order sent|close.?out/.test(label)) {
    return "complete_job"
  }
  if (/bill customer|invoice|accounting bill|billing/.test(label)) {
    return "bill_customer"
  }
  if (/signed by shop|shop manager sign|estimate signed/.test(label)) {
    return "await_approval"
  }
  if (/intake|reception|customer care|built|build estimate|estimate is built/.test(label)) {
    return "internal_handoff"
  }
  return "unknown"
}

export function intentionPrimaryButtonLabel(
  intention: WorkflowStepIntention,
  assignees: WorkflowAssignee[],
  nodeLabel?: string,
): string {
  const names = assignees
    .map((a) => a.displayName?.trim())
    .filter((n) => n && !/unassigned/i.test(n))
  const unique = [...new Set(names)]

  switch (intention) {
    case "send_to_approver":
    case "await_approval":
      if (unique.length === 0) return "Send to approver(s)"
      if (unique.length === 1) return `Send to ${unique[0]}`
      if (unique.length === 2) return `Send to ${unique[0]} & ${unique[1]}`
      return `Send to approver(s) (${unique.length})`
    case "send_to_customer":
      return "Email to customer"
    case "create_purchase_order":
      return nodeLabel ? `Create ${nodeLabel}` : "Create purchase order"
    case "create_work_order":
      return nodeLabel ? `Create work order` : "Create work order"
    case "schedule_resources":
      return "Schedule on calendar"
    case "complete_job":
      return "Complete job & receipt"
    case "bill_customer":
      return "Send to billing"
    case "internal_handoff":
      return nodeLabel ? `Complete ${nodeLabel}` : "Complete step"
    default:
      return nodeLabel ? `Complete ${nodeLabel}` : "Complete step"
  }
}

export function operationalHandoffButtonLabel(
  node: WorkflowNode,
  options?: { workOrderExists?: boolean; purchaseOrderExists?: boolean },
): string {
  const intention = inferWorkflowStepIntention(node, "estimate")
  if (intention === "create_work_order" && options?.workOrderExists) {
    return "Go to work order"
  }
  if (intention === "create_purchase_order" && options?.purchaseOrderExists) {
    return "Go to purchase order"
  }
  if (intention === "bill_customer") {
    return options?.purchaseOrderExists || options?.workOrderExists ? "Collect payment" : "Send to billing"
  }
  return intentionPrimaryButtonLabel(intention, [], node.label)
}

export type EstimatePrimaryDeliveryAction = {
  mode: "customer_email" | "workflow_approval" | "workflow_review" | "blocked"
  buttonLabel: string
  detail: string
  workflowAction: WorkflowActionButton | null
  /** All parallel send-for-approval actions when multiple approvers are required. */
  batchSendActions: WorkflowActionButton[]
  /** Parallel operational handoffs (work order, PO, scheduling, etc.) ready now. */
  parallelHandoffActions: WorkflowActionButton[]
  pendingApprovers: WorkflowAssignee[]
  customerSendAllowed: boolean
  customerBlockReason?: string
}

export function resolveEstimatePrimaryDeliveryAction(input: {
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  externalContacts: ExternalContactsDoc
  linkableUsers: LinkableOrgUser[]
  state: QuoteInternalWorkflowState
  quoteHasLineItems: boolean
  canBypassApprovals?: boolean
}): EstimatePrimaryDeliveryAction {
  const actions = computeEstimateWorkflowActions(input)
  const parallelHandoffActions = actions.filter(
    (a) => a.kind === "send_for_approval" && !a.disabled && !isWorkflowApprovalSendAction(a, input.workflow),
  )
  const customerGate = canSendEstimateToCustomer(input.workflow, input.state)

  const sendApproval = actions.find(
    (a) => a.kind === "send_for_approval" && !a.disabled && isWorkflowApprovalSendAction(a, input.workflow),
  )
  if (sendApproval) {
    const pendingSends = actions.filter(
      (a) => a.kind === "send_for_approval" && !a.disabled && isWorkflowApprovalSendAction(a, input.workflow),
    )
    const assignees = pendingSends.map((a) => a.assignee).filter((a): a is WorkflowAssignee => a != null)
    const node = input.workflow.nodes.find((n) => n.id === sendApproval.nodeId)
    const intention = node ? inferWorkflowStepIntention(node, "estimate") : "send_to_approver"
    return {
      mode: "workflow_approval",
      buttonLabel: intentionPrimaryButtonLabel(intention, assignees, node?.label),
      detail: sendApproval.detail,
      workflowAction: sendApproval,
      batchSendActions: pendingSends,
      parallelHandoffActions,
      pendingApprovers: assignees,
      customerSendAllowed: false,
      customerBlockReason: customerGate.reason,
    }
  }

  const markApproval = actions.find((a) => a.kind === "mark_approved" && !a.disabled)
  if (markApproval) {
    const pendingMarks = actions.filter((a) => a.kind === "mark_approved" && !a.disabled)
    const assignees = pendingMarks.map((a) => a.assignee).filter((a): a is WorkflowAssignee => a != null)
    return {
      mode: "workflow_review",
      buttonLabel: assignees.length > 1 ? "Review pending approvals" : markApproval.label,
      detail: markApproval.detail,
      workflowAction: markApproval,
      batchSendActions: [],
      parallelHandoffActions,
      pendingApprovers: assignees,
      customerSendAllowed: false,
      customerBlockReason: customerGate.reason,
    }
  }

  if (!customerGate.allowed) {
    return {
      mode: "blocked",
      buttonLabel: "Complete workflow first",
      detail: customerGate.reason ?? "Internal workflow steps must finish before customer delivery.",
      workflowAction: null,
      batchSendActions: [],
      parallelHandoffActions,
      pendingApprovers: [],
      customerSendAllowed: false,
      customerBlockReason: customerGate.reason,
    }
  }

  return {
    mode: "customer_email",
    buttonLabel: "Email to customer",
    detail: "Internal approvals complete — send the estimate to your customer.",
    workflowAction: null,
    batchSendActions: [],
    parallelHandoffActions,
    pendingApprovers: [],
    customerSendAllowed: true,
  }
}

/** Guidance for PO / WO / invoice tools based on account workflow (no per-record state yet). */
export function resolveToolWorkflowGuidance(input: {
  tool: WorkflowToolKind
  workflow: BusinessWorkflowDoc
}): { headline: string; body: string; suggestedLabel: string } | null {
  const { tool, workflow } = input
  const patterns: Record<WorkflowToolKind, RegExp> = {
    purchase_order: /purchase order|parts department|parts dept|supplier|vendor/i,
    work_order: /work order|field|technician|dispatch/i,
    invoice: /bill customer|invoice|accounting bill|billing/i,
    scheduling: /schedule|calendar|resource/i,
    estimate: /estimate|approval|customer/i,
    generic: /.*/,
  }
  const re = patterns[tool]
  const matches = workflow.nodes.filter((n) => re.test(n.label))
  if (!matches.length) return null

  const node = matches[0]
  const intention = inferWorkflowStepIntention(node, tool)
  const label = intentionPrimaryButtonLabel(intention, [], node.label)
  return {
    headline: "Workflow routing",
    body: `Your business workflow includes “${node.label}”. Use org-chart assignees and the workflow chart to route ${tool.replace("_", " ")} steps to the right department.`,
    suggestedLabel: label,
  }
}
