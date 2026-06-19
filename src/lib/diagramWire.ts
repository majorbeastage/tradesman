/** Shared helpers for drag-to-connect diagram lines (workflow + org chart). */

export type WireDragState =
  | { kind: "new"; fromId: string; anchorX: number; anchorY: number; x: number; y: number }
  | { kind: "reconnect"; edgeId: string; end: "from" | "to"; anchorX: number; anchorY: number; x: number; y: number }

export function connectorOut(node: { x: number; y: number }, nodeW: number, nodeH: number): { x: number; y: number } {
  return { x: node.x + nodeW / 2, y: node.y + nodeH }
}

export function connectorIn(node: { x: number; y: number }, nodeW: number): { x: number; y: number } {
  return { x: node.x + nodeW / 2, y: node.y }
}

export function hitTestDiagramNode(
  nodes: Array<{ id: string; x: number; y: number }>,
  canvasX: number,
  canvasY: number,
  nodeW: number,
  nodeH: number,
  padding = 18,
): string | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const n = nodes[i]
    if (
      canvasX >= n.x - padding &&
      canvasX <= n.x + nodeW + padding &&
      canvasY >= n.y - padding &&
      canvasY <= n.y + nodeH + padding
    ) {
      return n.id
    }
  }
  return null
}

/** Snap to the nearest box when the pointer is close — forgiving for human hands. */
export function nearestDiagramNode(
  nodes: Array<{ id: string; x: number; y: number }>,
  canvasX: number,
  canvasY: number,
  nodeW: number,
  nodeH: number,
  maxDistance = 72,
): string | null {
  let best: { id: string; dist: number } | null = null
  for (const n of nodes) {
    const closestX = Math.max(n.x, Math.min(canvasX, n.x + nodeW))
    const closestY = Math.max(n.y, Math.min(canvasY, n.y + nodeH))
    const dist = Math.hypot(canvasX - closestX, canvasY - closestY)
    if (dist <= maxDistance && (!best || dist < best.dist)) {
      best = { id: n.id, dist }
    }
  }
  return best?.id ?? null
}

export function resolveWireDropTarget(
  nodes: Array<{ id: string; x: number; y: number }>,
  canvasX: number,
  canvasY: number,
  nodeW: number,
  nodeH: number,
  isAllowed?: (nodeId: string) => boolean,
): string | null {
  const direct = hitTestDiagramNode(nodes, canvasX, canvasY, nodeW, nodeH, 24)
  const candidate = direct ?? nearestDiagramNode(nodes, canvasX, canvasY, nodeW, nodeH, 80)
  if (!candidate) return null
  if (isAllowed && !isAllowed(candidate)) return null
  return candidate
}

export function canvasPointFromEvent(
  e: { clientX: number; clientY: number },
  canvas: HTMLElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
