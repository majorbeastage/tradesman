/**
 * Runtime engine: business workflow diagram → estimate action buttons.
 * Coordinates workflow nodes with organization chart links and external contacts.
 */

import type { BusinessWorkflowDoc, WorkflowEdge, WorkflowNode } from "./businessWorkflow"
import {
  loadBusinessWorkflowFromMetadata,
  BUSINESS_WORKFLOW_META_KEY,
  sortedWorkflowNodes,
} from "./businessWorkflow"
import { inferWorkflowStepIntention, intentionPrimaryButtonLabel } from "./workflowStepIntention"
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
import { canBypassWorkflowProcessGates, resolveLiveCompletedNodeIds } from "./workflowProgressResilience"

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
    action: "send_for_approval" | "mark_approved" | "request_updates" | "deny_approval" | "bypass_approval" | "note" | "rollback"
    nodeId: string
    nodeLabel: string
    byUserId?: string | null
    note?: string
  }>
}

export type WorkflowActionKind =
  | "send_for_approval"
  | "mark_approved"
  | "request_updates"
  | "deny_approval"
  | "bypass_approval"
  | "send_to_customer"

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
      if (action !== "send_for_approval" && action !== "mark_approved" && action !== "request_updates" && action !== "deny_approval" && action !== "bypass_approval" && action !== "note" && action !== "rollback") continue
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

function quoteLiveCompletedIds(doc: BusinessWorkflowDoc, state: QuoteInternalWorkflowState): Set<string> {
  return new Set(
    resolveLiveCompletedNodeIds(doc, {
      completedNodeIds: state.completedNodeIds,
      historyLabels: state.history.map((h) => h.nodeLabel).filter(Boolean),
    }),
  )
}

function prerequisitesMet(
  doc: BusinessWorkflowDoc,
  targetNodeId: string,
  state: QuoteInternalWorkflowState,
): boolean {
  const incoming = incomingEdges(doc, targetNodeId)
  if (incoming.length === 0) return true

  const completed = quoteLiveCompletedIds(doc, state)
  const multi = incoming.filter((e) => e.approval === "needs_multiple_approvals")
  if (multi.length > 0) {
    return multi.every((e) => completed.has(e.fromId))
  }

  for (const edge of incoming) {
    if (completed.has(edge.fromId)) continue
    if (edge.approval === "approved") {
      return false
    }
    if (edge.approval === "needs_approval" || edge.approval === "needs_multiple_approvals") {
      const fromNode = nodeById(doc, edge.fromId)
      if (fromNode && isApprovalStepNode(fromNode)) return false
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

function isApprovalStepNode(node: WorkflowNode): boolean {
  const l = norm(node.label)
  if (isCustomerSendNode(node)) return false
  const intention = inferWorkflowStepIntention(node, "estimate")
  if (
    intention === "create_work_order" ||
    intention === "create_purchase_order" ||
    intention === "schedule_resources" ||
    intention === "bill_customer" ||
    intention === "complete_job"
  ) {
    return false
  }
  return (
    l.includes("approval") ||
    l.includes("approve") ||
    isShopSignoffNode(node) ||
    l.includes("sign-off") ||
    l.includes("signoff") ||
    intention === "send_to_approver" ||
    intention === "await_approval"
  )
}

export function isOperationalHandoffNode(node: WorkflowNode): boolean {
  const intention = inferWorkflowStepIntention(node, "estimate")
  return (
    intention === "create_work_order" ||
    intention === "create_purchase_order" ||
    intention === "schedule_resources" ||
    intention === "bill_customer" ||
    intention === "complete_job" ||
    intention === "internal_handoff"
  )
}

/** Hide estimate actions for steps the customer already finished or hasn't reached yet. */
export function isEstimateActionVisibleForCustomerProgress(
  workflow: BusinessWorkflowDoc,
  nodeId: string,
  customerCompletedNodeIds: string[],
  pendingOnQuote: boolean,
): boolean {
  if (pendingOnQuote) return true
  if (customerCompletedNodeIds.includes(nodeId)) return false
  const nodes = sortedWorkflowNodes(workflow)
  const firstOpen = nodes.find((n) => !customerCompletedNodeIds.includes(n.id))
  if (!firstOpen) return false
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return false
  return node.order <= firstOpen.order
}

export function isWorkflowProcessOverseer(
  userId: string | null | undefined,
  workflow: BusinessWorkflowDoc,
  profileRole?: string | null,
  accountOwnerUserId?: string | null,
): boolean {
  if (!userId) return false
  if (canBypassWorkflowProcessGates(profileRole, {
    userId,
    accountOwnerUserId: accountOwnerUserId ?? userId,
    processOverseerUserIds: workflow.processOverseerUserIds ?? null,
  })) {
    return true
  }
  return (workflow.processOverseerUserIds ?? []).includes(userId)
}

export function userMayInitiateWorkflowHandoff(
  state: QuoteInternalWorkflowState,
  node: WorkflowNode,
  workflow: BusinessWorkflowDoc,
  userId: string | null | undefined,
  isOverseer: boolean,
): boolean {
  if (isOverseer) return true
  if (!userId) return false
  const inc = incomingEdges(workflow, node.id)
  if (inc.length === 0) return true
  for (const edge of inc) {
    if (!state.completedNodeIds.includes(edge.fromId)) continue
    const drove = state.history.some(
      (h) =>
        h.nodeId === edge.fromId &&
        h.byUserId === userId &&
        (h.action === "mark_approved" || h.action === "send_for_approval"),
    )
    if (drove) return true
  }
  return false
}

export function isWorkflowApprovalSendAction(action: WorkflowActionButton, workflow: BusinessWorkflowDoc): boolean {
  if (action.kind !== "send_for_approval") return false
  const node = workflow.nodes.find((n) => n.id === action.nodeId)
  if (!node) return true
  const intention = inferWorkflowStepIntention(node, "estimate")
  return intention === "send_to_approver" || intention === "await_approval"
}

export function filterWorkflowActionsForUser(
  actions: WorkflowActionButton[],
  input: {
    workflow: BusinessWorkflowDoc
    state: QuoteInternalWorkflowState
    userId: string | null | undefined
    profileRole?: string | null
    canBypassApprovals?: boolean
  },
): WorkflowActionButton[] {
  const isOverseer = isWorkflowProcessOverseer(input.userId, input.workflow, input.profileRole)
  if (isOverseer) return actions
  return actions.filter((action) => {
    if (action.kind === "send_to_customer") return true
    if (action.kind === "bypass_approval") return input.canBypassApprovals === true
    const node = input.workflow.nodes.find((n) => n.id === action.nodeId)
    if (!node) return false
    if (action.kind === "send_for_approval") {
      return userMayInitiateWorkflowHandoff(input.state, node, input.workflow, input.userId, false)
    }
    if (action.kind === "mark_approved" || action.kind === "request_updates" || action.kind === "deny_approval") {
      const assignee = node.assignedUserId
      return !assignee || assignee === input.userId
    }
    return true
  })
}

export function canSendEstimateToCustomer(
  workflow: BusinessWorkflowDoc,
  state: QuoteInternalWorkflowState,
  opts?: { bypass?: boolean },
): { allowed: boolean; reason?: string } {
  if (opts?.bypass) return { allowed: true }

  const liveCompleted = new Set(
    resolveLiveCompletedNodeIds(workflow, {
      completedNodeIds: state.completedNodeIds,
      historyLabels: state.history.map((h) => h.nodeLabel).filter(Boolean),
    }),
  )
  // Drop pending IDs that no longer exist on the live workflow (legacy lock).
  const livePending = state.pendingNodeIds.filter((id) => workflow.nodes.some((n) => n.id === id))

  const signoff = findWorkflowNodeByLabelPatterns(workflow, [
    "estimate signed by shop manager",
    "signed by shop manager",
  ])
  if (signoff && !liveCompleted.has(signoff.id)) {
    const pending = livePending.includes(signoff.id)
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
      if (edge.approval !== "approved" && !liveCompleted.has(edge.fromId)) {
        const fromNode = nodeById(workflow, edge.fromId)
        return {
          allowed: false,
          reason: `Complete “${fromNode?.label ?? "prior step"}” before customer delivery.`,
        }
      }
    }
  }

  if (livePending.length > 0) {
    const labels = livePending.map((id) => nodeById(workflow, id)?.label ?? id).join(", ")
    return { allowed: false, reason: `Pending approval: ${labels}` }
  }

  return { allowed: true }
}

export function canBypassEstimateApprovals(
  profileRole: string | null | undefined,
  metadata: unknown,
  opts?: { userId?: string | null; accountOwnerUserId?: string | null; workflow?: BusinessWorkflowDoc | null },
): boolean {
  let estimateBypassEnabled = false
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const raw = (metadata as Record<string, unknown>).estimate_approval_bypass_v1
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      estimateBypassEnabled = (raw as Record<string, unknown>).enabled === true
    }
  }
  return canBypassWorkflowProcessGates(profileRole, {
    userId: opts?.userId,
    accountOwnerUserId: opts?.accountOwnerUserId,
    processOverseerUserIds: opts?.workflow?.processOverseerUserIds ?? null,
    estimateBypassEnabled,
  })
}

export function computeEstimateWorkflowActions(input: {
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  externalContacts: ExternalContactsDoc
  linkableUsers: LinkableOrgUser[]
  state: QuoteInternalWorkflowState
  quoteHasLineItems: boolean
  canBypassApprovals?: boolean
  customerCompletedNodeIds?: string[]
}): WorkflowActionButton[] {
  const { workflow, orgChart, externalContacts, linkableUsers, state, quoteHasLineItems, canBypassApprovals } = input
  const customerCompleted = input.customerCompletedNodeIds ?? []
  const actions: WorkflowActionButton[] = []
  const completed = quoteLiveCompletedIds(workflow, state)
  const pending = new Set(state.pendingNodeIds.filter((id) => workflow.nodes.some((n) => n.id === id)))

  if (!quoteHasLineItems) return actions

  for (const node of workflow.nodes) {
    if (completed.has(node.id) || isCustomerSendNode(node)) continue
    if (
      !isEstimateActionVisibleForCustomerProgress(workflow, node.id, customerCompleted, pending.has(node.id))
    ) {
      continue
    }

    if (pending.has(node.id)) {
      const assignee = resolveWorkflowNodeAssignee(node, orgChart, externalContacts, linkableUsers)
      actions.push({
        kind: "mark_approved",
        nodeId: node.id,
        label: `Approve “${node.label}”`,
        detail: assignee.displayName,
        assignee,
        primary: true,
      })
      actions.push({
        kind: "request_updates",
        nodeId: node.id,
        label: `Request updates — ${node.label}`,
        detail: "Send back to estimator with notes",
        assignee,
      })
      actions.push({
        kind: "deny_approval",
        nodeId: node.id,
        label: `Deny — ${node.label}`,
        detail: "Reject this approval step with notes",
        assignee,
      })
      continue
    }

    const inc = incomingEdges(workflow, node.id)
    const needsApprovalPath = inc.some((e) => e.approval !== "approved")
    const operational = isOperationalHandoffNode(node)
    if (!needsApprovalPath && !isShopSignoffNode(node) && !operational) continue
    if (!prerequisitesMet(workflow, node.id, state)) continue

    const assignee = resolveWorkflowNodeAssignee(node, orgChart, externalContacts, linkableUsers)
    const intention = inferWorkflowStepIntention(node, "estimate")
    const approverLabel =
      assignee.kind === "unassigned"
        ? "approver(s)"
        : assignee.kind === "external_contact"
          ? assignee.displayName
          : assignee.displayName
    const sendLabel =
      operational || intention !== "send_to_approver"
        ? intentionPrimaryButtonLabel(intention, [assignee], node.label)
        : nodeLabelMatches(node, ["approval", "approve", "sign"])
          ? `Send to ${approverLabel}`
          : `Send to ${node.label}`
    actions.push({
      kind: "send_for_approval",
      nodeId: node.id,
      label: sendLabel,
      detail:
        assignee.kind === "unassigned"
          ? "Choose approver email — or set assignee on workflow / org chart"
          : assignee.kind === "external_contact"
            ? `External: ${assignee.displayName}`
            : assignee.displayName,
      assignee,
      primary: true,
    })
  }

  const customerGate = canSendEstimateToCustomer(workflow, state, { bypass: Boolean(canBypassApprovals) })
  const customerNode = findWorkflowNodeByLabelPatterns(workflow, ["sent to customer", "send to customer"])
  if (canBypassApprovals && !customerGate.allowed && pending.size > 0) {
    actions.push({
      kind: "bypass_approval",
      nodeId: state.pendingNodeIds[0] ?? "bypass",
      label: "Bypass pending approvals",
      detail: "Leadership override — mark all pending steps complete",
      assignee: null,
    })
  }
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
    const order = (k: WorkflowActionKind) => {
      if (k === "send_for_approval") return 0
      if (k === "mark_approved") return 1
      if (k === "request_updates") return 2
      if (k === "deny_approval") return 3
      if (k === "bypass_approval") return 4
      return 5
    }
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

export function applyRequestUpdates(
  state: QuoteInternalWorkflowState,
  node: WorkflowNode,
  byUserId: string | null,
  note: string,
): QuoteInternalWorkflowState {
  return {
    ...state,
    pendingNodeIds: state.pendingNodeIds.filter((id) => id !== node.id),
    history: [
      ...state.history,
      {
        at: new Date().toISOString(),
        action: "request_updates",
        nodeId: node.id,
        nodeLabel: node.label,
        byUserId,
        note: note.trim() || undefined,
      },
    ],
  }
}

export function applyDenyApproval(
  state: QuoteInternalWorkflowState,
  node: WorkflowNode,
  byUserId: string | null,
  note: string,
): QuoteInternalWorkflowState {
  return {
    ...state,
    completedNodeIds: state.completedNodeIds.filter((id) => id !== node.id),
    pendingNodeIds: state.pendingNodeIds.filter((id) => id !== node.id),
    history: [
      ...state.history,
      {
        at: new Date().toISOString(),
        action: "deny_approval",
        nodeId: node.id,
        nodeLabel: node.label,
        byUserId,
        note: note.trim() || undefined,
      },
    ],
  }
}

export function applyBypassAllApprovals(
  state: QuoteInternalWorkflowState,
  workflow: BusinessWorkflowDoc,
  byUserId: string | null,
): QuoteInternalWorkflowState {
  const approvalNodeIds = workflow.nodes
    .filter((n) => !isCustomerSendNode(n) && incomingEdges(workflow, n.id).some((e) => e.approval !== "approved"))
    .map((n) => n.id)
  const completedNodeIds = [...new Set([...state.completedNodeIds, ...state.pendingNodeIds, ...approvalNodeIds])]
  return {
    ...state,
    completedNodeIds,
    pendingNodeIds: [],
    history: [
      ...state.history,
      {
        at: new Date().toISOString(),
        action: "bypass_approval",
        nodeId: approvalNodeIds[0] ?? "bypass",
        nodeLabel: "All pending approvals",
        byUserId,
        note: "Leadership bypass",
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
