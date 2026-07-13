/**
 * Auto-share customer profiles with org assignees when workflow reaches their step.
 */
import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import type { OrganizationChartDoc } from "./organizationChart"
import type { ExternalContactsDoc } from "./externalContacts"
import { resolveWorkflowNodeAssignee } from "./estimateWorkflowRuntime"
import type { LinkableOrgUser } from "./orgChartMembers"
import { parseCustomerWorkflowMeta, CUSTOMER_WORKFLOW_META_KEY } from "./customerWorkflowRouting"
import { shareCustomerContactWithOrgMember } from "./shareCustomerContact"

export function workflowSharedUserIds(customerMetadata: unknown): Set<string> {
  const shared = parseCustomerWorkflowMeta(customerMetadata)?.sharedWithUserIds ?? []
  return new Set(shared.filter((id) => typeof id === "string" && id.trim()))
}

export function resolveWorkflowOrgAssigneeUserId(
  node: WorkflowNode | null,
  orgChart: OrganizationChartDoc,
  externalContacts: ExternalContactsDoc,
  linkableUsers: LinkableOrgUser[],
): string | null {
  if (!node) return null
  const assignee = resolveWorkflowNodeAssignee(node, orgChart, externalContacts, linkableUsers)
  if (assignee.kind !== "org_user" || !assignee.id || assignee.isDemo) return null
  return assignee.id
}

export function appendWorkflowSharedUserId(
  customerMetadata: unknown,
  userId: string,
): Record<string, unknown> {
  const base =
    customerMetadata && typeof customerMetadata === "object" && !Array.isArray(customerMetadata)
      ? { ...(customerMetadata as Record<string, unknown>) }
      : {}
  const prev = parseCustomerWorkflowMeta(customerMetadata) ?? { v: 1 as const }
  const shared = new Set([...(prev.sharedWithUserIds ?? []), userId])
  base[CUSTOMER_WORKFLOW_META_KEY] = {
    ...prev,
    v: 1,
    sharedWithUserIds: [...shared],
    updatedAt: new Date().toISOString(),
  }
  return base
}

/** Share customer with workflow step assignee if not already shared. Returns updated metadata when shared. */
export async function maybeAutoShareCustomerWithWorkflowAssignee(params: {
  customerId: string
  customerMetadata: unknown
  workflow: BusinessWorkflowDoc
  orgChart: OrganizationChartDoc
  externalContacts: ExternalContactsDoc
  linkableUsers: LinkableOrgUser[]
  activeNodeId: string | null
}): Promise<{ shared: boolean; metadata: Record<string, unknown> }> {
  const node = params.activeNodeId
    ? params.workflow.nodes.find((n) => n.id === params.activeNodeId) ?? null
    : null
  const recipientUserId = resolveWorkflowOrgAssigneeUserId(
    node,
    params.orgChart,
    params.externalContacts,
    params.linkableUsers,
  )
  if (!recipientUserId) return { shared: false, metadata: (params.customerMetadata as Record<string, unknown>) ?? {} }

  const already = workflowSharedUserIds(params.customerMetadata)
  if (already.has(recipientUserId)) return { shared: false, metadata: (params.customerMetadata as Record<string, unknown>) ?? {} }

  await shareCustomerContactWithOrgMember({
    recipientUserId,
    customerId: params.customerId,
  })
  return {
    shared: true,
    metadata: appendWorkflowSharedUserId(params.customerMetadata, recipientUserId),
  }
}
