import type { OrganizationChartDoc } from "./organizationChart"
import type { PtoRequest } from "./timeClockPto"

/** Reporting managers for a linked user (walks org-chart edges upward). */
export function resolveOrgChartManagerUserIds(chart: OrganizationChartDoc, employeeUserId: string): string[] {
  if (!employeeUserId.trim()) return []
  const nodeById = new Map(chart.nodes.map((n) => [n.id, n]))
  const employeeNodes = chart.nodes.filter((n) => n.linkedUserId === employeeUserId)
  if (employeeNodes.length === 0) return []

  const managerIds = new Set<string>()
  const visited = new Set<string>()

  for (const start of employeeNodes) {
    const queue = [start.id]
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      for (const edge of chart.edges) {
        if (edge.toId !== nodeId) continue
        const parent = nodeById.get(edge.fromId)
        if (!parent) continue
        if (parent.linkedUserId && parent.linkedUserId !== employeeUserId) {
          managerIds.add(parent.linkedUserId)
        }
        queue.push(parent.id)
      }
    }
  }

  return [...managerIds]
}

/** True when approver may act on employee's PTO request (direct/indirect manager on chart). */
export function canApprovePtoForEmployee(
  chart: OrganizationChartDoc,
  approverUserId: string,
  employeeUserId: string,
): boolean {
  if (!approverUserId || !employeeUserId) return false
  if (approverUserId === employeeUserId) return false
  return resolveOrgChartManagerUserIds(chart, employeeUserId).includes(approverUserId)
}

/** Whether viewer may approve/deny a pending PTO request. */
export function canUserApprovePtoRequest(
  chart: OrganizationChartDoc | null,
  approverUserId: string,
  request: PtoRequest,
  opts: { isOrgManager: boolean },
): boolean {
  if (request.status !== "pending") return false
  const assigned = request.assignedApproverUserIds ?? []
  if (assigned.length > 0) {
    if (assigned.includes(approverUserId)) return true
    return opts.isOrgManager
  }
  if (chart && canApprovePtoForEmployee(chart, approverUserId, request.userId)) return true
  return opts.isOrgManager
}
