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
  completedNodeIds?: string[]
  pendingNodeIds?: string[]
  sharedWithUserIds?: string[]
  rollbackNote?: string | null
  updatedAt?: string
}

export const CUSTOMER_WORKFLOW_META_KEY = "customer_workflow_v1"

export function resolveWorkflowNodeDepartmentKey(node: WorkflowNode, orgChart: OrganizationChartDoc): string | null {
  return nodeDepartmentKey(node, orgChart)
}

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
    completedNodeIds: Array.isArray(o.completedNodeIds)
      ? o.completedNodeIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined,
    pendingNodeIds: Array.isArray(o.pendingNodeIds)
      ? o.pendingNodeIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined,
    sharedWithUserIds: Array.isArray(o.sharedWithUserIds)
      ? o.sharedWithUserIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined,
    rollbackNote: typeof o.rollbackNote === "string" ? o.rollbackNote : null,
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
  customerMetadata?: unknown,
): CustomerWorkflowSnapshot | null {
  const bundle = loadAccountWorkflowBundleFromMetadata(profileMetadata)
  const customerMeta = parseCustomerWorkflowMeta(customerMetadata)

  if (quoteId && quoteWorkflowState && quoteWorkflowState.pendingNodeIds.length > 0) {
    return snapshotFromQuoteWorkflow(bundle.workflow, bundle.orgChart, quoteId, quoteWorkflowState)
  }

  if (customerMeta?.activeNodeId) {
    const node = bundle.workflow.nodes.find((n) => n.id === customerMeta.activeNodeId) ?? null
    if (node) {
      return {
        quoteId: customerMeta.quoteId ?? quoteId,
        activeNodeId: customerMeta.activeNodeId,
        activeNodeLabel: node.label,
        departmentKey: customerMeta.departmentKey ?? nodeDepartmentKey(node, bundle.orgChart),
        assignedUserId: node.assignedUserId ?? null,
        completedNodeIds: customerMeta.completedNodeIds ?? [],
        pendingNodeIds: customerMeta.pendingNodeIds ?? [],
      }
    }
  }

  if (quoteId && quoteWorkflowState) {
    return snapshotFromQuoteWorkflow(bundle.workflow, bundle.orgChart, quoteId, quoteWorkflowState)
  }

  return null
}

function departmentMatches(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return x.includes(y) || y.includes(x)
}

/** Match user department / assignee against active or pending workflow steps. */
export function customerMatchesWorkflowScope(
  snapshot: CustomerWorkflowSnapshot | null,
  opts: {
    userId: string
    departmentLabel?: string | null
    workflowOnlyCustomers?: boolean
    workflow?: BusinessWorkflowDoc | null
    orgChart?: OrganizationChartDoc | null
  },
): boolean {
  if (!opts.workflowOnlyCustomers) return true
  if (!snapshot) return false

  const dept = (opts.departmentLabel ?? "").trim().toLowerCase()
  const workflow = opts.workflow
  const orgChart = opts.orgChart

  const nodeMatchesUser = (nodeId: string | null | undefined): boolean => {
    if (!nodeId) return false
    if (workflow && orgChart) {
      const node = workflow.nodes.find((n) => n.id === nodeId)
      if (node?.assignedUserId && node.assignedUserId === opts.userId) return true
      if (node && dept) {
        const stepDept = nodeDepartmentKey(node, orgChart)
        if (stepDept && departmentMatches(stepDept, dept)) return true
      }
    }
    if (snapshot.activeNodeId === nodeId && snapshot.assignedUserId === opts.userId) return true
    if (
      snapshot.activeNodeId === nodeId &&
      dept &&
      snapshot.departmentKey &&
      departmentMatches(snapshot.departmentKey, dept)
    ) {
      return true
    }
    return false
  }

  if (snapshot.pendingNodeIds.some((id) => nodeMatchesUser(id))) return true
  return nodeMatchesUser(snapshot.activeNodeId)
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
