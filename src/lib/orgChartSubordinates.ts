import type { OrganizationChartDoc } from "./organizationChart"

/** Linked user IDs on org-chart nodes that report up to `managerUserId` (direct + indirect). */
export function collectOrgSubordinateUserIds(
  orgChart: OrganizationChartDoc | null | undefined,
  managerUserId: string,
): string[] {
  if (!orgChart?.nodes?.length || !managerUserId) return []

  const nodesById = new Map(orgChart.nodes.map((n) => [n.id, n]))
  const childIdsByNode = new Map<string, string[]>()
  for (const edge of orgChart.edges) {
    const list = childIdsByNode.get(edge.fromId) ?? []
    list.push(edge.toId)
    childIdsByNode.set(edge.fromId, list)
  }

  const managerNodeIds = orgChart.nodes.filter((n) => n.linkedUserId === managerUserId).map((n) => n.id)
  if (!managerNodeIds.length) return []

  const out = new Set<string>()
  const queue = [...managerNodeIds]
  const seenNodes = new Set<string>()

  while (queue.length) {
    const nodeId = queue.shift()!
    if (seenNodes.has(nodeId)) continue
    seenNodes.add(nodeId)

    for (const childId of childIdsByNode.get(nodeId) ?? []) {
      const child = nodesById.get(childId)
      if (child?.linkedUserId && child.linkedUserId !== managerUserId) {
        out.add(child.linkedUserId)
      }
      queue.push(childId)
    }
  }

  return [...out]
}

/** When the account owner is not linked on the chart, allow assigning to any linked team member. */
export function collectOrgChartLinkedUserIds(orgChart: OrganizationChartDoc | null | undefined): string[] {
  if (!orgChart?.nodes?.length) return []
  const ids = new Set<string>()
  for (const n of orgChart.nodes) {
    if (n.linkedUserId?.trim()) ids.add(n.linkedUserId.trim())
  }
  return [...ids]
}
