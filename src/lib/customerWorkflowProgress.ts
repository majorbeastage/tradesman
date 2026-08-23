/**
 * Per-customer business workflow progress (manual step completion + estimate gates).
 * Live account workflow is authoritative; stored node IDs are remapped via labels / orphan credit.
 */

import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import { sortedWorkflowNodes } from "./businessWorkflow"
import { parseCustomerHubKindExplicit, isCustomerManuallyArchived } from "./customerContactKind"
import { mergeCustomerWorkflowMeta, parseCustomerWorkflowMeta, resolveWorkflowNodeDepartmentKey } from "./customerWorkflowRouting"
import type { OrganizationChartDoc } from "./organizationChart"
import type { ExternalContactsDoc } from "./externalContacts"
import type { LinkableOrgUser } from "./orgChartMembers"
import { resolveWorkflowOrgAssigneeUserId } from "./workflowStepAutoShare"
import { resolveLiveCompletedNodeIds } from "./workflowProgressResilience"

export type SequentialWorkflowProgress = {
  currentNodeId: string | null
  currentNodeLabel: string | null
  completedNodeIds: string[]
}

function completionHintsFromCustomerMetadata(customerMetadata: unknown) {
  const meta = parseCustomerWorkflowMeta(customerMetadata)
  return {
    completedNodeIds: meta?.completedNodeIds ?? [],
    completedNodeLabels: meta?.completedNodeLabels ?? [],
  }
}

export function resolveSequentialWorkflowProgress(
  workflow: BusinessWorkflowDoc,
  customerMetadata: unknown,
): SequentialWorkflowProgress {
  const nodes = sortedWorkflowNodes(workflow)
  const liveCompleted = new Set(
    resolveLiveCompletedNodeIds(workflow, completionHintsFromCustomerMetadata(customerMetadata)),
  )
  const meta = parseCustomerWorkflowMeta(customerMetadata)

  let activeId = meta?.activeNodeId ?? null
  if (activeId && liveCompleted.has(activeId)) activeId = null
  if (activeId && !nodes.some((n) => n.id === activeId)) activeId = null
  if (!activeId) {
    activeId = nodes.find((n) => !liveCompleted.has(n.id))?.id ?? null
  }

  const active = activeId ? nodes.find((n) => n.id === activeId) : null
  const allDone = nodes.length > 0 && nodes.every((n) => liveCompleted.has(n.id))

  return {
    currentNodeId: activeId,
    currentNodeLabel: active?.label ?? (allDone ? "Completed" : null),
    completedNodeIds: nodes.filter((n) => liveCompleted.has(n.id)).map((n) => n.id),
  }
}

export function buildCustomerWorkflowStepCompleteUpdate(input: {
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  externalContacts: ExternalContactsDoc
  linkableUsers: LinkableOrgUser[]
  customerMetadata: unknown
  completedNodeIds: string[]
  nodeId: string
  quoteId?: string | null
}): {
  metadata: Record<string, unknown>
  jobPipelineStatus: string
  progress: SequentialWorkflowProgress
  autoShareUserId: string | null
} {
  const progress = applyManualWorkflowNodeComplete(input.workflow, input.completedNodeIds, input.nodeId)
  const nextNode = progress.currentNodeId
    ? input.workflow.nodes.find((n) => n.id === progress.currentNodeId) ?? null
    : null
  const departmentKey = nextNode ? resolveWorkflowNodeDepartmentKey(nextNode, input.orgChart) : null
  const autoShareUserId = resolveWorkflowOrgAssigneeUserId(
    nextNode,
    input.orgChart,
    input.externalContacts,
    input.linkableUsers,
  )
  const completedNode = input.workflow.nodes.find((n) => n.id === input.nodeId)
  const prevMeta = parseCustomerWorkflowMeta(input.customerMetadata)
  const prevLabels = [...(prevMeta?.completedNodeLabels ?? [])]
  if (
    completedNode?.label?.trim() &&
    !prevLabels.some((l) => l.trim().toLowerCase() === completedNode.label.trim().toLowerCase())
  ) {
    prevLabels.push(completedNode.label.trim())
  }
  const metadata = mergeCustomerWorkflowMeta(input.customerMetadata, {
    quoteId: input.quoteId ?? null,
    activeNodeId: progress.currentNodeId,
    departmentKey,
    completedNodeIds: progress.completedNodeIds,
    completedNodeLabels: prevLabels,
    pendingNodeIds: [],
  })
  return {
    metadata,
    jobPipelineStatus: progress.currentNodeLabel ?? "Completed",
    progress,
    autoShareUserId,
  }
}

export function applyManualWorkflowNodeComplete(
  workflow: BusinessWorkflowDoc,
  completedNodeIds: string[],
  nodeId: string,
): SequentialWorkflowProgress {
  const nodes = sortedWorkflowNodes(workflow)
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) throw new Error("Workflow step not found.")

  const completed = new Set(completedNodeIds)
  completed.add(nodeId)
  const completedArr = nodes.filter((n) => completed.has(n.id)).map((n) => n.id)
  const next = nodes.find((n) => !completed.has(n.id)) ?? null

  return {
    completedNodeIds: completedArr,
    currentNodeId: next?.id ?? null,
    currentNodeLabel: next?.label ?? "Completed",
  }
}

export function findFirstEstimateWorkflowNode(workflow: BusinessWorkflowDoc): WorkflowNode | null {
  const nodes = sortedWorkflowNodes(workflow)
  return (
    nodes.find((n) => {
      const l = n.label.toLowerCase()
      return /estimate|quote|bid|proposal/.test(l) && !/work order|\bwo\b/.test(l)
    }) ?? null
  )
}

/** Block creating a new estimate until earlier workflow steps are marked complete. */
export function canStartEstimateForCustomer(
  workflow: BusinessWorkflowDoc,
  customerMetadata: unknown,
  opts?: { bypass?: boolean },
): { allowed: boolean; blockingStepLabel?: string } {
  if (opts?.bypass) return { allowed: true }

  const estimateNode = findFirstEstimateWorkflowNode(workflow)
  if (!estimateNode) return { allowed: true }

  const completed = new Set(
    resolveLiveCompletedNodeIds(workflow, completionHintsFromCustomerMetadata(customerMetadata)),
  )
  const nodes = sortedWorkflowNodes(workflow)
  for (const node of nodes) {
    if (node.order >= estimateNode.order) break
    if (!completed.has(node.id)) {
      return { allowed: false, blockingStepLabel: node.label }
    }
  }
  return { allowed: true }
}

export function customerHubJobStatusLabel(
  customer: { metadata?: unknown; job_pipeline_status?: string | null },
  section: "active" | "in_process" | "archived" | "promotions",
  workflow: BusinessWorkflowDoc | null,
  defaultActiveLabel: string,
): string {
  if (section === "promotions") {
    return parseCustomerHubKindExplicit(customer.metadata) === "promotional" ? "Manually Flagged" : "System Flagged"
  }
  if (section === "archived") {
    const js = String(customer.job_pipeline_status ?? "").trim().toLowerCase()
    if (js === "completed") return "Completed"
    if (isCustomerManuallyArchived(customer.metadata)) return "Archived"
    return "Closed"
  }
  if (workflow) {
    const progress = resolveSequentialWorkflowProgress(workflow, customer.metadata)
    if (progress.currentNodeLabel) return progress.currentNodeLabel
  }
  return customer.job_pipeline_status?.trim() || defaultActiveLabel
}
