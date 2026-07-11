/**
 * Per-customer business workflow progress (manual step completion + estimate gates).
 */

import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import { sortedWorkflowNodes } from "./businessWorkflow"
import { parseCustomerHubKindExplicit, isCustomerManuallyArchived } from "./customerContactKind"
import { mergeCustomerWorkflowMeta, parseCustomerWorkflowMeta, resolveWorkflowNodeDepartmentKey } from "./customerWorkflowRouting"
import type { OrganizationChartDoc } from "./organizationChart"

export type SequentialWorkflowProgress = {
  currentNodeId: string | null
  currentNodeLabel: string | null
  completedNodeIds: string[]
}

export function resolveSequentialWorkflowProgress(
  workflow: BusinessWorkflowDoc,
  customerMetadata: unknown,
): SequentialWorkflowProgress {
  const nodes = sortedWorkflowNodes(workflow)
  const meta = parseCustomerWorkflowMeta(customerMetadata)
  const completed = new Set(meta?.completedNodeIds ?? [])

  let activeId = meta?.activeNodeId ?? null
  if (activeId && completed.has(activeId)) activeId = null
  if (!activeId) {
    activeId = nodes.find((n) => !completed.has(n.id))?.id ?? null
  }

  const active = activeId ? nodes.find((n) => n.id === activeId) : null
  const allDone = nodes.length > 0 && nodes.every((n) => completed.has(n.id))

  return {
    currentNodeId: activeId,
    currentNodeLabel: active?.label ?? (allDone ? "Completed" : null),
    completedNodeIds: nodes.filter((n) => completed.has(n.id)).map((n) => n.id),
  }
}

export function buildCustomerWorkflowStepCompleteUpdate(input: {
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  customerMetadata: unknown
  completedNodeIds: string[]
  nodeId: string
  quoteId?: string | null
}): { metadata: Record<string, unknown>; jobPipelineStatus: string; progress: SequentialWorkflowProgress } {
  const progress = applyManualWorkflowNodeComplete(input.workflow, input.completedNodeIds, input.nodeId)
  const nextNode = progress.currentNodeId
    ? input.workflow.nodes.find((n) => n.id === progress.currentNodeId) ?? null
    : null
  const departmentKey = nextNode ? resolveWorkflowNodeDepartmentKey(nextNode, input.orgChart) : null
  const metadata = mergeCustomerWorkflowMeta(input.customerMetadata, {
    quoteId: input.quoteId ?? null,
    activeNodeId: progress.currentNodeId,
    departmentKey,
    completedNodeIds: progress.completedNodeIds,
    pendingNodeIds: [],
  })
  return {
    metadata,
    jobPipelineStatus: progress.currentNodeLabel ?? "Completed",
    progress,
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
): { allowed: boolean; blockingStepLabel?: string } {
  const estimateNode = findFirstEstimateWorkflowNode(workflow)
  if (!estimateNode) return { allowed: true }

  const completed = new Set(parseCustomerWorkflowMeta(customerMetadata)?.completedNodeIds ?? [])
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
