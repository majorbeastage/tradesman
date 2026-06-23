import type { OrganizationChartDoc } from "./organizationChart"

/** Department / role label from the org chart node linked to this user (or demo persona id). */
export function orgDepartmentForLinkedUser(
  orgChart: OrganizationChartDoc | null | undefined,
  linkedUserId: string | null | undefined,
): string | null {
  const uid = linkedUserId?.trim()
  if (!orgChart || !uid) return null
  const node = orgChart.nodes.find((n) => n.linkedUserId === uid)
  if (!node) return null
  const label = node.label?.trim()
  if (label) return label
  const title = node.jobTitle?.trim()
  return title || null
}
