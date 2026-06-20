/**
 * Runtime engine: business workflow diagram → estimate action buttons.
 * Coordinates workflow nodes with organization chart links and external contacts.
 */

import type { BusinessWorkflowDoc, WorkflowEdge, WorkflowNode } from "./businessWorkflow"
import {
  loadBusinessWorkflowFromMetadata,
  BUSINESS_WORKFLOW_META_KEY,
} from "./businessWorkflow"
import type { ExternalContactsDoc } from "./externalContacts"
import {
  externalContactById,
  loadExternalContactsFromMetadata,
  EXTERNAL_CONTACTS_META_KEY,
} from "./externalContacts"
import type { OrganizationChartDoc, OrgChartNode } from "./organizationChart"
import {
  loadOrganizationChartFromMetadata,
  ORG_CHART_META_KEY,
} from "./organizationChart"
import type { LinkableOrgUser } from "./orgChartMembers"

export const QUOTE_INTERNAL_WORKFLOW_META_KEY = "internal_workflow_v1"

export type WorkflowAssignee = {
  kind: "org_user" | "external_contact" | "unassigned"
  id: string | null
  displayName: string
  email: string | null
  phone: string | null
  isDemo?: boolean
}

export type QuoteInternalWorkflowState = {
  v: 1
  completedNodeIds: string[]
  pendingNodeIds: string[]
  history: Array<{
    at: string
    action: "send_for_approval" | "mark_approved" | "note"
    nodeId: string
    nodeLabel: string
    byUserId?: string | null
    note?: string
  }>
}

export type WorkflowActionKind = "send_for_approval" | "mark_approved" | "send_to_customer"

export type WorkflowActionButton = {
  kind: WorkflowActionKind
  nodeId: string
  label: string
  detail: string
  assignee: WorkflowAssignee | null
  primary?: boolean
  disabled?: boolean
  disabledReason?: string
}

export type AccountWorkflowBundle = {
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  externalContacts: ExternalContactsDoc
}

export function loadAccountWorkflowBundleFromMetadata(metadata: unknown): AccountWorkflowBundle {
  return {
    workflow: loadBusinessWorkflowFromMetadata(metadata),
    orgChart: loadOrganizationChartFromMetadata(metadata),
    externalContacts: loadExternalContactsFromMetadata(metadata),
  }
}

export function accountWorkflowMetadataKeys(): string[] {
  return [BUSINESS_WORKFLOW_META_KEY, ORG_CHART_META_KEY, EXTERNAL_CONTACTS_META_KEY]
}

export function emptyQuoteInternalWorkflowState(): QuoteInternalWorkflowState {
  return { v: 1, completedNodeIds: [], pendingNodeIds: [], history: [] }
}

export function parseQuoteInternalWorkflow(metadata: unknown): QuoteInternalWorkflowState {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return emptyQuoteInternalWorkflowState()
  }
  const raw = (metadata as Record<string, unknown>)[QUOTE_INTERNAL_WORKFLOW_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyQuoteInternalWorkflowState()
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return emptyQuoteInternalWorkflowState()
  const completedNodeIds = Array.isArray(o.completedNodeIds)
    ? o.completedNodeIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : []
  const pendingNodeIds = Array.isArray(o.pendingNodeIds)
    ? o.pendingNodeIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : []
  const history: QuoteInternalWorkflowState["history"] = []
  if (Array.isArray(o.history)) {
    for (const row of o.history) {
      if (!row || typeof row !== "object") continue
      const h = row as Record<string, unknown>
      const action = h.action
      if (action !== "send_for_approval" && action !== "mark_approved" && action !== "note") continue
      const nodeId = typeof h.nodeId === "string" ? h.nodeId : ""
      const nodeLabel = typeof h.nodeLabel === "string" ? h.nodeLabel : ""
      if (!nodeId) continue
      history.push({
        at: typeof h.at === "string" ? h.at : new Date().toISOString(),
        action,
        nodeId,
        nodeLabel,
        byUserId: typeof h.byUserId === "string" ? h.byUserId : null,
        note: typeof h.note === "string" ? h.note : undefined,
      })
    }
  }
  return { v: 1, completedNodeIds, pendingNodeIds, history }
}

export function mergeQuoteInternalWorkflowMetadata(
  prevMeta: Record<string, unknown>,
  state: QuoteInternalWorkflowState,
): Record<string, unknown> {
  return {
    ...prevMeta,
    [QUOTE_INTERNAL_WORKFLOW_META_KEY]: { ...state, v: 1 },
  }
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function nodeLabelMatches(node: WorkflowNode, patterns: string[]): boolean {
  const l = norm(node.label)
  return patterns.some((p) => l.includes(norm(p)))
}

export function findWorkflowNodeByLabelPatterns(
  doc: BusinessWorkflowDoc,
  patterns: string[],
): WorkflowNode | null {
  for (const n of doc.nodes) {
    if (nodeLabelMatches(n, patterns)) return n
  }
  return null
}

function findOrgChartNodeForWorkflowNode(
  workflowNode: WorkflowNode,
  orgChart: OrganizationChartDoc,
): OrgChartNode | null {
  if (workflowNode.orgChartNodeId) {
    return orgChart.nodes.find((n) => n.id === workflowNode.orgChartNodeId) ?? null
  }
  const wl = norm(workflowNode.label)
  for (const n of orgChart.nodes) {
    const ol = norm(n.label)
    if (ol === wl || wl.includes(ol) || ol.includes(wl)) return n
  }
  return null
}

export function resolveWorkflowNodeAssignee(
  node: WorkflowNode,
  orgChart: OrganizationChartDoc,
  externalContacts: ExternalContactsDoc,
  linkableUsers: LinkableOrgUser[],
): WorkflowAssignee {
  if (node.externalContactId) {
    const ext = externalContactById(externalContacts, node.externalContactId)
    if (ext) {
      return {
        kind: "external_contact",
        id: ext.id,
        displayName: ext.displayName,
        email: ext.email ?? null,
        phone: ext.phone ?? null,
      }
    }
  }

  const orgNode = findOrgChartNodeForWorkflowNode(node, orgChart)
  if (orgNode?.externalContactId) {
    const ext = externalContactById(externalContacts, orgNode.externalContactId)
    if (ext) {
      return {
        kind: "external_contact",
        id: ext.id,
        displayName: ext.displayName,
        email: ext.email ?? null,
        phone: ext.phone ?? null,
      }
    }
  }

  const userId = node.assignedUserId ?? orgNode?.linkedUserId ?? null
  if (userId) {
    const u = linkableUsers.find((r) => r.id === userId)
    if (u) {
      return {
        kind: "org_user",
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        phone: null,
        isDemo: u.isDemo,
      }
    }
    return {
      kind: "org_user",
      id: userId,
      displayName: userId.slice(0, 8) + "…",
      email: null,
      phone: null,
    }
  }

  return {
    kind: "unassigned",
    id: null,
    displayName: "Unassigned — set assignee on workflow or org chart",
    email: null,
    phone: null,
  }
}

function incomingEdges(doc: BusinessWorkflowDoc, nodeId: string): WorkflowEdge[] {
  return doc.edges.filter((e) => e.toId === nodeId)
}

function nodeById(doc: BusinessWorkflowDoc, id: string): WorkflowNode | null {
  return doc.nodes.find((n) => n.id === id) ?? null
}

function prerequisitesMet(
  doc: BusinessWorkflowDoc,
  targetNodeId: string,
  state: QuoteInternalWorkflowState,
): boolean {
  const incoming = incomingEdges(doc, targetNodeId)
  if (incoming.length === 0) return true
  for (const edge of incoming) {
    if (state.completedNodeIds.includes(edge.fromId)) continue
    if (edge.approval === "approved") {
      if (!state.completedNodeIds.includes(edge.fromId)) return false
      continue
    }
    return false
  }
  return true
}

function isCustomerSendNode(node: WorkflowNode): boolean {
  return nodeLabelMatches(node, ["sent to customer", "send to customer", "signed estimate sent"])
}

function isShopSignoffNode(node: WorkflowNode): boolean {
  return nodeLabelMatches(node, ["signed by shop manager", "shop manager sign", "estimate signed"])
}

export function canSendEstimateToCustomer(
  workflow: BusinessWorkflowDoc,
  state: QuoteInternalWorkflowState,
): { allowed: boolean; reason?: string } {
  const signoff = findWorkflowNodeByLabelPatterns(workflow, [
    "estimate signed by shop manager",
    "signed by shop manager",
  ])
  if (signoff && !state.completedNodeIds.includes(signoff.id)) {
    const pending = state.pendingNodeIds.includes(signoff.id)
    return {
      allowed: false,
      reason: pending
        ? `Awaiting approval at “${signoff.label}” before sending to the customer.`
        : `Complete internal approvals (including “${signoff.label}”) before sending to the customer.`,
    }
  }

  const customerNode = findWorkflowNodeByLabelPatterns(workflow, ["sent to customer", "send to customer"])
  if (customerNode) {
    const inc = incomingEdges(workflow, customerNode.id)
    for (const edge of inc) {
      if (edge.approval !== "approved" && !state.completedNodeIds.includes(edge.fromId)) {
        const fromNode = nodeById(workflow, edge.fromId)
        return {
          allowed: false,
          reason: `Complete “${fromNode?.label ?? "prior step"}” before customer delivery.`,
        }
      }
    }
  }

  if (state.pendingNodeIds.length > 0) {
    const labels = state.pendingNodeIds
      .map((id) => nodeById(workflow, id)?.label ?? id)
      .join(", ")
    return { allowed: false, reason: `Pending approval: ${labels}` }
  }

  return { allowed: true }
}

export function computeEstimateWorkflowActions(input: {
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  externalContacts: ExternalContactsDoc
  linkableUsers: LinkableOrgUser[]
  state: QuoteInternalWorkflowState
  quoteHasLineItems: boolean
}): WorkflowActionButton[] {
  const { workflow, orgChart, externalContacts, linkableUsers, state, quoteHasLineItems } = input
  const actions: WorkflowActionButton[] = []
  const completed = new Set(state.completedNodeIds)
  const pending = new Set(state.pendingNodeIds)

  if (!quoteHasLineItems) return actions

  for (const node of workflow.nodes) {
    if (completed.has(node.id) || isCustomerSendNode(node)) continue

    if (pending.has(node.id)) {
      const assignee = resolveWorkflowNodeAssignee(node, orgChart, externalContacts, linkableUsers)
      actions.push({
        kind: "mark_approved",
        nodeId: node.id,
        label: `Mark “${node.label}” approved`,
        detail: assignee.displayName,
        assignee,
        primary: true,
      })
      continue
    }

    const inc = incomingEdges(workflow, node.id)
    const needsApprovalPath = inc.some((e) => e.approval !== "approved")
    if (!needsApprovalPath && !isShopSignoffNode(node)) continue
    if (!prerequisitesMet(workflow, node.id, state)) continue

    const assignee = resolveWorkflowNodeAssignee(node, orgChart, externalContacts, linkableUsers)
    const unassigned = assignee.kind === "unassigned"
    actions.push({
      kind: "send_for_approval",
      nodeId: node.id,
      label: `Send to ${node.label}`,
      detail: unassigned
        ? "Assign a team member or external contact on the workflow step"
        : assignee.kind === "external_contact"
          ? `External: ${assignee.displayName}`
          : assignee.displayName,
      assignee,
      primary: !unassigned,
      disabled: unassigned,
      disabledReason: unassigned ? "Set an assignee on this workflow step or matching org chart role." : undefined,
    })
  }

  const customerGate = canSendEstimateToCustomer(workflow, state)
  const customerNode = findWorkflowNodeByLabelPatterns(workflow, ["sent to customer", "send to customer"])
  actions.push({
    kind: "send_to_customer",
    nodeId: customerNode?.id ?? "customer-send",
    label: "Ready for customer send",
    detail: customerGate.allowed
      ? "Internal approvals complete — use Email to Customer below."
      : customerGate.reason ?? "Complete workflow steps first.",
    assignee: null,
    disabled: !customerGate.allowed,
    disabledReason: customerGate.reason,
  })

  return actions.sort((a, b) => {
    const order = (k: WorkflowActionKind) =>
      k === "send_for_approval" ? 0 : k === "mark_approved" ? 1 : 2
    return order(a.kind) - order(b.kind)
  })
}

export function applySendForApproval(
  state: QuoteInternalWorkflowState,
  node: WorkflowNode,
  byUserId: string | null,
): QuoteInternalWorkflowState {
  const pendingNodeIds = state.pendingNodeIds.includes(node.id)
    ? state.pendingNodeIds
    : [...state.pendingNodeIds, node.id]
  return {
    ...state,
    pendingNodeIds,
    history: [
      ...state.history,
      {
        at: new Date().toISOString(),
        action: "send_for_approval",
        nodeId: node.id,
        nodeLabel: node.label,
        byUserId,
      },
    ],
  }
}

export function applyMarkApproved(
  state: QuoteInternalWorkflowState,
  node: WorkflowNode,
  byUserId: string | null,
): QuoteInternalWorkflowState {
  const completedNodeIds = state.completedNodeIds.includes(node.id)
    ? state.completedNodeIds
    : [...state.completedNodeIds, node.id]
  const pendingNodeIds = state.pendingNodeIds.filter((id) => id !== node.id)
  return {
    ...state,
    completedNodeIds,
    pendingNodeIds,
    history: [
      ...state.history,
      {
        at: new Date().toISOString(),
        action: "mark_approved",
        nodeId: node.id,
        nodeLabel: node.label,
        byUserId,
      },
    ],
  }
}

export function workflowProgressSummary(
  workflow: BusinessWorkflowDoc,
  state: QuoteInternalWorkflowState,
): string {
  const approvalNodes = workflow.nodes.filter(
    (n) =>
      incomingEdges(workflow, n.id).some((e) => e.approval !== "approved") &&
      !isCustomerSendNode(n),
  )
  const done = approvalNodes.filter((n) => state.completedNodeIds.includes(n.id)).length
  const pending = state.pendingNodeIds.length
  if (approvalNodes.length === 0) return "No internal approval steps in workflow."
  if (pending > 0) return `${done}/${approvalNodes.length} approvals complete · ${pending} awaiting sign-off`
  return `${done}/${approvalNodes.length} internal approvals complete`
}
