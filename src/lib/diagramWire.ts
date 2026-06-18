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
): string | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const n = nodes[i]
    if (canvasX >= n.x && canvasX <= n.x + nodeW && canvasY >= n.y && canvasY <= n.y + nodeH) {
      return n.id
    }
  }
  return null
}

export function canvasPointFromEvent(
  e: { clientX: number; clientY: number },
  canvas: HTMLElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
