import type { OrganizationChartDoc } from "./organizationChart"
import { sandboxDemoMemberById, type SandboxDemoTeamMember } from "./sandboxDemoTeam"

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

/** Org chart first, then sandbox demo team department/title. */
export function resolveTeamMemberDepartmentLabel(
  orgChart: OrganizationChartDoc | null | undefined,
  userId: string,
  demoTeam?: SandboxDemoTeamMember[],
): string | null {
  const fromOrg = orgDepartmentForLinkedUser(orgChart, userId)
  if (fromOrg) return fromOrg
  const member = sandboxDemoMemberById(demoTeam ?? [], userId)
  if (member?.department?.trim()) return member.department.trim()
  if (member?.title?.trim()) return member.title.trim()
  return null
}
