/**
 * Customer ↔ business workflow routing — which department/user owns the active step.
 * Used for customer list filtering, upcoming/processed folders, and send-to gates.
 */

import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import type { OrganizationChartDoc } from "./organizationChart"
import type { QuoteInternalWorkflowState } from "./estimateWorkflowRuntime"
import { loadAccountWorkflowBundleFromMetadata } from "./estimateWorkflowRuntime"

export type CustomerWorkflowSnapshot = {
  quoteId: string | null
  activeNodeId: string | null
  activeNodeLabel: string | null
  departmentKey: string | null
  assignedUserId: string | null
  completedNodeIds: string[]
  pendingNodeIds: string[]
}

export type CustomerWorkflowMetaV1 = {
  v: 1
  quoteId?: string | null
  activeNodeId?: string | null
  departmentKey?: string | null
  updatedAt?: string
}

export const CUSTOMER_WORKFLOW_META_KEY = "customer_workflow_v1"

function nodeDepartmentKey(node: WorkflowNode, orgChart: OrganizationChartDoc): string | null {
  if (node.orgChartNodeId) {
    const org = orgChart.nodes.find((n) => n.id === node.orgChartNodeId)
    if (org?.label?.trim()) return org.label.trim().toLowerCase()
  }
  const label = node.label.toLowerCase()
  if (label.includes("parts")) return "parts"
  if (label.includes("accounting")) return "accounting"
  if (label.includes("shop")) return "shop"
  if (label.includes("field")) return "field"
  if (label.includes("reception")) return "reception"
  if (label.includes("estimate")) return "estimates"
  return null
}

export function parseCustomerWorkflowMeta(metadata: unknown): CustomerWorkflowMetaV1 | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_WORKFLOW_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  return {
    v: 1,
    quoteId: typeof o.quoteId === "string" ? o.quoteId : null,
    activeNodeId: typeof o.activeNodeId === "string" ? o.activeNodeId : null,
    departmentKey: typeof o.departmentKey === "string" ? o.departmentKey : null,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  }
}

export function snapshotFromQuoteWorkflow(
  workflow: BusinessWorkflowDoc,
  orgChart: OrganizationChartDoc,
  quoteId: string,
  state: QuoteInternalWorkflowState,
): CustomerWorkflowSnapshot {
  const pending = state.pendingNodeIds.filter(Boolean)
  const activeId = pending[0] ?? null
  const activeNode = activeId ? workflow.nodes.find((n) => n.id === activeId) ?? null : null
  return {
    quoteId,
    activeNodeId: activeId,
    activeNodeLabel: activeNode?.label ?? null,
    departmentKey: activeNode ? nodeDepartmentKey(activeNode, orgChart) : null,
    assignedUserId: activeNode?.assignedUserId ?? null,
    completedNodeIds: [...state.completedNodeIds],
    pendingNodeIds: [...pending],
  }
}

export function loadCustomerWorkflowSnapshotFromProfile(
  profileMetadata: unknown,
  quoteId: string | null,
  quoteWorkflowState: QuoteInternalWorkflowState | null,
): CustomerWorkflowSnapshot | null {
  if (!quoteId || !quoteWorkflowState) {
    const cached = parseCustomerWorkflowMeta(profileMetadata)
    if (!cached?.activeNodeId) return null
    const bundle = loadAccountWorkflowBundleFromMetadata(profileMetadata)
    const node = bundle.workflow.nodes.find((n) => n.id === cached.activeNodeId) ?? null
    return {
      quoteId: cached.quoteId ?? null,
      activeNodeId: cached.activeNodeId,
      activeNodeLabel: node?.label ?? null,
      departmentKey: cached.departmentKey ?? (node ? nodeDepartmentKey(node, bundle.orgChart) : null),
      assignedUserId: node?.assignedUserId ?? null,
      completedNodeIds: [],
      pendingNodeIds: cached.activeNodeId ? [cached.activeNodeId] : [],
    }
  }
  const bundle = loadAccountWorkflowBundleFromMetadata(profileMetadata)
  return snapshotFromQuoteWorkflow(bundle.workflow, bundle.orgChart, quoteId, quoteWorkflowState)
}

/** Match user department / assignee against active workflow step. */
export function customerMatchesWorkflowScope(
  snapshot: CustomerWorkflowSnapshot | null,
  opts: {
    userId: string
    departmentLabel?: string | null
    workflowOnlyCustomers?: boolean
  },
): boolean {
  if (!opts.workflowOnlyCustomers) return true
  if (!snapshot?.activeNodeId) return false
  if (snapshot.assignedUserId && snapshot.assignedUserId === opts.userId) return true
  const dept = (opts.departmentLabel ?? "").trim().toLowerCase()
  const stepDept = (snapshot.departmentKey ?? "").trim().toLowerCase()
  if (dept && stepDept && (stepDept.includes(dept) || dept.includes(stepDept))) return true
  return false
}

export function workflowProgressLabel(snapshot: CustomerWorkflowSnapshot | null): string {
  if (!snapshot?.activeNodeLabel) return "No active workflow step"
  const done = snapshot.completedNodeIds.length
  const pending = snapshot.pendingNodeIds.length
  return `Active: ${snapshot.activeNodeLabel}${done + pending > 0 ? ` (${done} done · ${pending} pending)` : ""}`
}

export function mergeCustomerWorkflowMeta(
  customerMetadata: unknown,
  patch: Partial<CustomerWorkflowMetaV1>,
): Record<string, unknown> {
  const base =
    customerMetadata && typeof customerMetadata === "object" && !Array.isArray(customerMetadata)
      ? { ...(customerMetadata as Record<string, unknown>) }
      : {}
  const prev = parseCustomerWorkflowMeta(customerMetadata) ?? { v: 1 as const }
  base[CUSTOMER_WORKFLOW_META_KEY] = {
    ...prev,
    ...patch,
    v: 1,
    updatedAt: new Date().toISOString(),
  }
  return base
}
