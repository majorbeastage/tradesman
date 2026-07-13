/** Business workflow flowchart — stored on profiles.metadata.business_workflow_v1 */

export type WorkflowNode = {
  id: string
  label: string
  x: number
  y: number
  order: number
  /** Box fill / border preset (default white). */
  boxColor?: WorkflowNodeColor
  /** Org user assigned to this step (approval / routing). */
  assignedUserId?: string | null
  /** External vendor / contractor contact (see external_contacts_v1). */
  externalContactId?: string | null
  /** Optional link to organization chart node for assignee fallback. */
  orgChartNodeId?: string | null
}

export type WorkflowNodeColor =
  | "default"
  | "blue"
  | "green"
  | "yellow"
  | "red"
  | "purple"
  | "orange"
  | "slate"
  | "teal"

export const WORKFLOW_NODE_COLORS: WorkflowNodeColor[] = [
  "default",
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
  "orange",
  "slate",
  "teal",
]

export const WORKFLOW_NODE_COLOR_META: Record<
  WorkflowNodeColor,
  { fill: string; border: string; text: string; label: string }
> = {
  default: { fill: "#ffffff", border: "#cbd5e1", text: "#0f172a", label: "White" },
  blue: { fill: "#eff6ff", border: "#93c5fd", text: "#1e3a8a", label: "Blue" },
  green: { fill: "#f0fdf4", border: "#86efac", text: "#14532d", label: "Green" },
  yellow: { fill: "#fefce8", border: "#fde047", text: "#713f12", label: "Yellow" },
  red: { fill: "#fef2f2", border: "#fca5a5", text: "#7f1d1d", label: "Red" },
  purple: { fill: "#faf5ff", border: "#d8b4fe", text: "#581c87", label: "Purple" },
  orange: { fill: "#fff7ed", border: "#fdba74", text: "#7c2d12", label: "Orange" },
  slate: { fill: "#f8fafc", border: "#94a3b8", text: "#1e293b", label: "Slate" },
  teal: { fill: "#f0fdfa", border: "#5eead4", text: "#134e4a", label: "Teal" },
}

/** Arrow / approval routing between steps. */
export type WorkflowEdgeApproval = "approved" | "needs_approval" | "needs_multiple_approvals"

export type WorkflowEdge = {
  id: string
  fromId: string
  toId: string
  approval: WorkflowEdgeApproval
  /** Optional label shown on the arrow (e.g. Estimate approval, PO approval). */
  requirement?: string
}

export const WORKFLOW_REQUIREMENT_SUGGESTIONS = [
  "Estimate approval",
  "Purchase order approval",
  "Work order approval",
  "Shop manager approval",
  "Accounting approval",
  "Parts department approval",
  "Customer signature",
  "Multiple department approvals",
  "Scheduling approval",
  "Receipt / billing",
] as const

export type BusinessWorkflowDoc = {
  v: 1
  title: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  updated_at: string
  shared_with_admin_at?: string | null
  /** Org users who may act on any step (receptionist / process overseer). */
  processOverseerUserIds?: string[]
}

export const BUSINESS_WORKFLOW_META_KEY = "business_workflow_v1"

export const WORKFLOW_EDGE_META: Record<
  WorkflowEdgeApproval,
  { stroke: string; label: string; shortLabel: string }
> = {
  approved: {
    stroke: "#16a34a",
    label: "Approved — step complete",
    shortLabel: "Green · Approved",
  },
  needs_approval: {
    stroke: "#dc2626",
    label: "Requires approval from the step this arrow points to",
    shortLabel: "Red · Needs approval",
  },
  needs_multiple_approvals: {
    stroke: "#ca8a04",
    label: "Requires multiple approvals before continuing",
    shortLabel: "Yellow · Multiple approvals",
  },
}

const NODE_W = 240
const NODE_H = 72

const SVG_PAD = 28
const SVG_HEADER_H = 44
const SVG_LEGEND_H = 36
const SVG_DIAGRAM_TOP = SVG_HEADER_H + SVG_LEGEND_H + 20

const EXAMPLE_LABELS = [
  "Customer Intake",
  "Reception / Customer Care contacts",
  "Job Estimate is built",
  "Estimate Approval — Parts Department",
  "Estimate Approval — Accounting",
  "Estimate Approval — Shop Manager",
  "Estimate Signed by Shop Manager",
  "Signed Estimate sent to Customer",
  "Customer Signs Estimate",
  "Work Order Created",
  "Customer Care schedules resources",
  "Job Complete — Receipt & Work Order sent",
  "Accounting bills Customer",
]

export function workflowEdgeStroke(approval: WorkflowEdgeApproval): string {
  return WORKFLOW_EDGE_META[approval].stroke
}

export function parseWorkflowNodeColor(raw: unknown): WorkflowNodeColor {
  if (typeof raw === "string" && (WORKFLOW_NODE_COLORS as readonly string[]).includes(raw)) {
    return raw as WorkflowNodeColor
  }
  return "default"
}

export function workflowNodePresentation(node: WorkflowNode) {
  const key = node.boxColor ?? "default"
  return WORKFLOW_NODE_COLOR_META[key] ?? WORKFLOW_NODE_COLOR_META.default
}

export function newWorkflowEdge(
  fromId: string,
  toId: string,
  approval: WorkflowEdgeApproval = "needs_approval",
  requirement = "",
): WorkflowEdge {
  const req = requirement.trim()
  return {
    id: `edge-${crypto.randomUUID().slice(0, 8)}`,
    fromId,
    toId,
    approval,
    requirement: req || undefined,
  }
}

function parseEdges(raw: unknown, nodeIds: Set<string>): WorkflowEdge[] {
  if (!Array.isArray(raw)) return []
  const out: WorkflowEdge[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    if (typeof o.fromId !== "string" || typeof o.toId !== "string") continue
    if (!nodeIds.has(o.fromId) || !nodeIds.has(o.toId) || o.fromId === o.toId) continue
    const approval =
      o.approval === "approved" || o.approval === "needs_approval" || o.approval === "needs_multiple_approvals"
        ? o.approval
        : "needs_approval"
    out.push({
      id: typeof o.id === "string" ? o.id : `edge-${crypto.randomUUID().slice(0, 8)}`,
      fromId: o.fromId,
      toId: o.toId,
      approval,
      requirement: typeof o.requirement === "string" && o.requirement.trim() ? o.requirement.trim() : undefined,
    })
  }
  return out
}

/** Legacy workflows without edges: one green arrow per sequential step. */
export function deriveSequentialEdges(nodes: WorkflowNode[], approval: WorkflowEdgeApproval = "approved"): WorkflowEdge[] {
  const sorted = [...nodes].sort((a, b) => a.order - b.order)
  const out: WorkflowEdge[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    out.push({
      id: `edge-${a.id}-${b.id}`,
      fromId: a.id,
      toId: b.id,
      approval,
    })
  }
  return out
}

function buildExampleEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  const byLabel = new Map(nodes.map((n) => [n.label, n.id]))
  const id = (label: string) => byLabel.get(label) ?? ""
  const edges: WorkflowEdge[] = []

  const seq = (from: string, to: string, approval: WorkflowEdgeApproval, requirement = "") => {
    const f = id(from)
    const t = id(to)
    if (f && t) {
      const req = requirement.trim()
      edges.push({
        id: `edge-${f}-${t}-${approval}-${req || "plain"}`,
        fromId: f,
        toId: t,
        approval,
        requirement: req || undefined,
      })
    }
  }

  seq("Customer Intake", "Reception / Customer Care contacts", "approved")
  seq("Reception / Customer Care contacts", "Job Estimate is built", "approved")
  seq("Job Estimate is built", "Estimate Approval — Parts Department", "needs_approval", "Estimate approval — Parts")
  seq("Job Estimate is built", "Estimate Approval — Accounting", "needs_approval", "Estimate approval — Accounting")
  seq("Job Estimate is built", "Estimate Approval — Shop Manager", "needs_approval", "Estimate approval — Shop Manager")
  seq("Estimate Approval — Parts Department", "Estimate Signed by Shop Manager", "needs_multiple_approvals", "Multiple estimate approvals")
  seq("Estimate Approval — Accounting", "Estimate Signed by Shop Manager", "needs_multiple_approvals", "Multiple estimate approvals")
  seq("Estimate Approval — Shop Manager", "Estimate Signed by Shop Manager", "needs_multiple_approvals", "Multiple estimate approvals")
  seq("Estimate Signed by Shop Manager", "Signed Estimate sent to Customer", "approved", "Customer delivery")
  seq("Signed Estimate sent to Customer", "Customer Signs Estimate", "approved", "Customer signature")
  seq("Customer Signs Estimate", "Work Order Created", "approved", "Work order created")
  seq("Work Order Created", "Customer Care schedules resources", "approved", "Scheduling")
  seq("Customer Care schedules resources", "Job Complete — Receipt & Work Order sent", "approved", "Job complete")
  seq("Job Complete — Receipt & Work Order sent", "Accounting bills Customer", "approved", "Receipt / billing")

  return edges
}

/** Default workflow seeded at signup and used when no chart is saved yet. */
export const DEFAULT_SIGNUP_WORKFLOW_LABELS = [
  "Customer Intake",
  "Build Estimate",
  "Customer Approves",
  "Schedule Job",
  "Complete Calendar Event",
  "Customer Payment Received",
  "Send Receipt",
] as const

function defaultNodeColor(label: string, index: number, total: number): WorkflowNodeColor {
  if (index === 0) return "blue"
  if (index === total - 1) return "green"
  if (/approv|payment|receipt/i.test(label)) return "teal"
  if (/schedule|calendar/i.test(label)) return "purple"
  return "default"
}

export function createDefaultBusinessWorkflow(): BusinessWorkflowDoc {
  const nodes: WorkflowNode[] = DEFAULT_SIGNUP_WORKFLOW_LABELS.map((label, i) => ({
    id: `default-step-${i + 1}`,
    label,
    x: 40 + (i % 2) * 280,
    y: 24 + i * 88,
    order: i,
    boxColor: defaultNodeColor(label, i, DEFAULT_SIGNUP_WORKFLOW_LABELS.length),
  }))
  return {
    v: 1,
    title: "Customer job lifecycle",
    nodes,
    edges: deriveSequentialEdges(nodes),
    updated_at: new Date().toISOString(),
  }
}

function exampleNodeColor(label: string): WorkflowNodeColor {
  if (label.includes("Approval")) return "yellow"
  if (label.includes("Customer")) return "blue"
  if (label.includes("Accounting")) return "teal"
  if (label.includes("Work Order")) return "purple"
  if (label.includes("Signed") || label.includes("Complete")) return "green"
  if (label.includes("Estimate is built")) return "slate"
  return "default"
}

export function createExampleBusinessWorkflow(): BusinessWorkflowDoc {
  const nodes: WorkflowNode[] = EXAMPLE_LABELS.map((label, i) => ({
    id: `step-${i + 1}`,
    label,
    x: 40 + (i % 2) * 280,
    y: 24 + i * 88,
    order: i,
    boxColor: exampleNodeColor(label),
  }))
  return {
    v: 1,
    title: "Customer intake → billing",
    nodes,
    edges: buildExampleEdges(nodes),
    updated_at: new Date().toISOString(),
  }
}

export function parseBusinessWorkflow(raw: unknown): BusinessWorkflowDoc | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1 || !Array.isArray(o.nodes)) return null
  const nodes: WorkflowNode[] = []
  for (const n of o.nodes) {
    if (!n || typeof n !== "object") continue
    const row = n as Record<string, unknown>
    if (typeof row.id !== "string" || typeof row.label !== "string") continue
    nodes.push({
      id: row.id,
      label: row.label,
      x: typeof row.x === "number" && Number.isFinite(row.x) ? row.x : 40,
      y: typeof row.y === "number" && Number.isFinite(row.y) ? row.y : 40,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : nodes.length,
      boxColor: parseWorkflowNodeColor(row.boxColor),
      assignedUserId: typeof row.assignedUserId === "string" && row.assignedUserId.trim() ? row.assignedUserId.trim() : null,
      externalContactId:
        typeof row.externalContactId === "string" && row.externalContactId.trim() ? row.externalContactId.trim() : null,
      orgChartNodeId:
        typeof row.orgChartNodeId === "string" && row.orgChartNodeId.trim() ? row.orgChartNodeId.trim() : null,
    })
  }
  if (!nodes.length) return null
  nodes.sort((a, b) => a.order - b.order)
  const nodeIds = new Set(nodes.map((n) => n.id))
  let edges = parseEdges(o.edges, nodeIds)
  if (!edges.length) edges = deriveSequentialEdges(nodes)
  return {
    v: 1,
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "My business workflow",
    nodes,
    edges,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
    shared_with_admin_at: typeof o.shared_with_admin_at === "string" ? o.shared_with_admin_at : null,
    processOverseerUserIds: Array.isArray(o.processOverseerUserIds)
      ? o.processOverseerUserIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : undefined,
  }
}

export function loadBusinessWorkflowFromMetadata(metadata: unknown): BusinessWorkflowDoc {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return createDefaultBusinessWorkflow()
  }
  const raw = (metadata as Record<string, unknown>)[BUSINESS_WORKFLOW_META_KEY]
  return parseBusinessWorkflow(raw) ?? createDefaultBusinessWorkflow()
}

export function mergeBusinessWorkflowMetadata(
  prevMeta: Record<string, unknown>,
  doc: BusinessWorkflowDoc,
): Record<string, unknown> {
  return {
    ...prevMeta,
    [BUSINESS_WORKFLOW_META_KEY]: { ...doc, v: 1, updated_at: new Date().toISOString() },
  }
}

export function sortedWorkflowNodes(doc: BusinessWorkflowDoc): WorkflowNode[] {
  const steps = workflowProgressDisplaySteps(doc)
  if (steps.length) return steps.map((s) => s.node)
  return [...doc.nodes].sort((a, b) => a.order - b.order)
}

/** Reassign node.order to match chart display sequence (call before persisting workflow). */
export function syncWorkflowNodeOrdersFromChart(doc: BusinessWorkflowDoc): BusinessWorkflowDoc {
  const steps = workflowProgressDisplaySteps(doc)
  const orderById = new Map(steps.map((s, i) => [s.node.id, i]))
  const nodes = doc.nodes.map((n) => ({
    ...n,
    order: orderById.has(n.id) ? orderById.get(n.id)! : n.order,
  }))
  return { ...doc, nodes }
}

export type WorkflowProgressDisplayStep = {
  node: WorkflowNode
  /** Display label such as "1", "2.a", "2.b", "3". */
  stepLabel: string
  level: number
}

const PARALLEL_LETTERS = "abcdefghijklmnopqrstuvwxyz"

function workflowIncomingEdges(doc: BusinessWorkflowDoc, nodeId: string): WorkflowEdge[] {
  return doc.edges.filter((e) => e.toId === nodeId)
}

function workflowOutgoingEdges(doc: BusinessWorkflowDoc, nodeId: string): WorkflowEdge[] {
  return doc.edges.filter((e) => e.fromId === nodeId)
}

/**
 * Order workflow steps by following arrows (topological layers).
 * Parallel steps at the same layer get sub-labels: 2.a, 2.b, etc.
 */
export function workflowProgressDisplaySteps(doc: BusinessWorkflowDoc): WorkflowProgressDisplayStep[] {
  const nodes = doc.nodes
  if (!nodes.length) return []

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const inDegree = new Map<string, number>()
  for (const n of nodes) inDegree.set(n.id, workflowIncomingEdges(doc, n.id).length)

  let frontier = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0)
  if (!frontier.length) {
    frontier = [...nodes].sort((a, b) => a.order - b.order)
  } else {
    frontier.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }

  const out: WorkflowProgressDisplayStep[] = []
  const visited = new Set<string>()
  let level = 0

  while (frontier.length) {
    const layer = [...frontier].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    frontier = []
    level += 1

    layer.forEach((node, idx) => {
      if (visited.has(node.id)) return
      visited.add(node.id)
      const stepLabel =
        layer.length === 1
          ? String(level)
          : `${level}.${PARALLEL_LETTERS[idx] ?? String(idx + 1)}`
      out.push({ node, stepLabel, level })
    })

    for (const node of layer) {
      for (const edge of workflowOutgoingEdges(doc, node.id)) {
        const next = nodeById.get(edge.toId)
        if (!next || visited.has(next.id)) continue
        const nextIn = (inDegree.get(next.id) ?? 1) - 1
        inDegree.set(next.id, nextIn)
        if (nextIn <= 0) frontier.push(next)
      }
    }

    frontier.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }

  for (const n of [...nodes].sort((a, b) => a.order - b.order)) {
    if (!visited.has(n.id)) {
      level += 1
      out.push({ node: n, stepLabel: String(level), level })
      visited.add(n.id)
    }
  }

  return out
}

export type WorkflowEdgeGeometry = {
  x1: number
  y1: number
  x2: number
  y2: number
  cx: number
  cy: number
}

/** Line from bottom-center of source to top-center of target, with perpendicular offset for parallel arrows. */
export function workflowEdgeGeometry(
  from: WorkflowNode,
  to: WorkflowNode,
  laneIndex: number,
  laneCount: number,
  opts?: { fromHeight?: number },
): WorkflowEdgeGeometry {
  const fromH = opts?.fromHeight ?? NODE_H
  const x1 = from.x + NODE_W / 2
  const y1 = from.y + fromH
  const x2 = to.x + NODE_W / 2
  const y2 = to.y
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const perpX = (-dy / len) * 14
  const perpY = (dx / len) * 14
  const lane = laneCount > 1 ? laneIndex - (laneCount - 1) / 2 : 0
  const ox = perpX * lane
  const oy = perpY * lane
  return {
    x1: x1 + ox,
    y1: y1 + oy,
    x2: x2 + ox,
    y2: y2 + oy,
    cx: (x1 + x2) / 2 + ox,
    cy: (y1 + y2) / 2 + oy,
  }
}

/** Group edges that share the same from→to pair for lane offsetting. */
export function workflowEdgesWithLanes(edges: WorkflowEdge[]): Array<{ edge: WorkflowEdge; laneIndex: number; laneCount: number }> {
  const groups = new Map<string, WorkflowEdge[]>()
  for (const e of edges) {
    const key = `${e.fromId}\0${e.toId}`
    const g = groups.get(key) ?? []
    g.push(e)
    groups.set(key, g)
  }
  const out: Array<{ edge: WorkflowEdge; laneIndex: number; laneCount: number }> = []
  for (const group of groups.values()) {
    group.forEach((edge, laneIndex) => {
      out.push({ edge, laneIndex, laneCount: group.length })
    })
  }
  return out
}

/** SVG label chip on arrow midpoint. */
export function workflowEdgeLabelSvg(cx: number, cy: number, text: string, stroke: string): string {
  const label = escapeXml(truncateLabel(text, 28))
  const w = Math.min(200, Math.max(72, label.length * 6.2 + 16))
  const h = 18
  const x = cx - w / 2
  const y = cy - h / 2
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#ffffff" stroke="${stroke}" stroke-width="1"/>`,
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="10" font-weight="600" fill="#334155">${label}</text>`,
  ].join("")
}

function wrapLabelLines(text: string, maxChars: number): string[] {
  const raw = text.trim()
  if (!raw) return [""]
  const words = raw.split(/\s+/)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word.length > maxChars ? word.slice(0, maxChars) : word
      while (current.length > maxChars) {
        lines.push(current.slice(0, maxChars))
        current = current.slice(maxChars)
      }
    } else {
      current = next.length > maxChars ? next.slice(0, maxChars) : next
      if (next.length > maxChars && !current.includes(" ")) {
        lines.push(current)
        current = word.slice(maxChars)
      }
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : [""]
}

/** Export height for a step box — grows when the label wraps (matches on-screen tiles). */
export function workflowNodeExportHeight(label: string, assigneeLabel?: string | null): number {
  const lines = wrapLabelLines(label, 30)
  const lineCount = Math.min(lines.length, 5)
  let h = Math.max(NODE_H, 22 + lineCount * 14 + 10)
  if (assigneeLabel?.trim()) {
    const assigneeLines = wrapLabelLines(assigneeLabel, 34).slice(0, 2)
    h += 4 + assigneeLines.length * 12
  }
  return h
}

function workflowNodeAssigneeSvg(x: number, y: number, labelLineCount: number, assignee: string): string {
  const lines = wrapLabelLines(assignee, 34).slice(0, 2)
  const startY = y + 20 + labelLineCount * 14 + 6
  const tspans = lines
    .map((line, i) => `<tspan x="${x + 12}" dy="${i === 0 ? 0 : 12}">${escapeXml(line)}</tspan>`)
    .join("")
  return `<text y="${startY}" font-family="Segoe UI, sans-serif" font-size="10" font-weight="600" fill="#0ea5e9">${tspans}</text>`
}

function workflowNodeLabelSvg(x: number, y: number, label: string, textColor: string): string {
  const lines = wrapLabelLines(label, 30).slice(0, 5)
  const startY = y + 20
  const tspans = lines
    .map((line, i) => `<tspan x="${x + 12}" dy="${i === 0 ? 0 : 14}">${escapeXml(line)}</tspan>`)
    .join("")
  return `<text y="${startY}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="600" fill="${textColor}">${tspans}</text>`
}

function workflowLegendRowSvg(y: number, width: number): string {
  const kinds: WorkflowEdgeApproval[] = ["approved", "needs_approval", "needs_multiple_approvals"]
  const colW = Math.floor((width - SVG_PAD * 2) / kinds.length)
  const parts: string[] = [
    `<rect x="${SVG_PAD}" y="${y}" width="${width - SVG_PAD * 2}" height="${SVG_LEGEND_H}" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>`,
  ]
  kinds.forEach((kind, i) => {
    const meta = WORKFLOW_EDGE_META[kind]
    const cx = SVG_PAD + 16 + i * colW
    const ty = y + SVG_LEGEND_H / 2 + 4
    parts.push(`<line x1="${cx}" y1="${y + 10}" x2="${cx + 28}" y2="${y + 10}" stroke="${meta.stroke}" stroke-width="3"/>`)
    parts.push(
      `<text x="${cx + 36}" y="${ty}" font-family="Segoe UI, sans-serif" font-size="11" fill="#475569">${escapeXml(meta.shortLabel)}</text>`,
    )
  })
  return parts.join("\n")
}

function computeWorkflowSvgBounds(
  nodes: WorkflowNode[],
  nodeHeights: Map<string, number>,
  shiftX: number,
  shiftY: number,
): { width: number; height: number } {
  let maxX = NODE_W + SVG_PAD * 2
  let maxY = SVG_DIAGRAM_TOP + NODE_H + SVG_PAD
  for (const n of nodes) {
    const h = nodeHeights.get(n.id) ?? NODE_H
    maxX = Math.max(maxX, n.x + shiftX + NODE_W + SVG_PAD)
    maxY = Math.max(maxY, n.y + shiftY + h + SVG_PAD)
  }
  return { width: Math.max(760, maxX), height: Math.max(480, maxY) }
}

export type WorkflowSvgOptions = {
  width?: number
  height?: number
  /** Resolved display names for assigned org users / external contacts (keyed by node id). */
  assigneeByNodeId?: ReadonlyMap<string, string> | Record<string, string>
}

function workflowSvgAssigneeLabel(
  options: WorkflowSvgOptions | undefined,
  nodeId: string,
): string | null {
  const map = options?.assigneeByNodeId
  if (!map) return null
  const raw = map instanceof Map ? map.get(nodeId) : map[nodeId as keyof typeof map]
  const trimmed = typeof raw === "string" ? raw.trim() : ""
  return trimmed || null
}

export function workflowToSvg(doc: BusinessWorkflowDoc, options?: WorkflowSvgOptions): string {
  const nodes = sortedWorkflowNodes(doc)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const nodeHeights = new Map(
    nodes.map((n) => [n.id, workflowNodeExportHeight(n.label, workflowSvgAssigneeLabel(options, n.id))]),
  )

  let minX = 0
  let minY = 0
  if (nodes.length > 0) {
    minX = Math.min(...nodes.map((n) => n.x))
    minY = Math.min(...nodes.map((n) => n.y))
  }

  const shiftX = SVG_PAD - minX
  const shiftY = SVG_DIAGRAM_TOP - minY

  const bounds = computeWorkflowSvgBounds(nodes, nodeHeights, shiftX, shiftY)
  const svgW = options?.width ?? bounds.width
  const svgH = options?.height ?? bounds.height

  const lines: string[] = []
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`)
  lines.push(`<rect width="100%" height="100%" fill="#f8fafc"/>`)
  lines.push(
    `<text x="${SVG_PAD}" y="28" font-family="Segoe UI, sans-serif" font-size="18" font-weight="700" fill="#0f172a">${escapeXml(doc.title)}</text>`,
  )
  lines.push(workflowLegendRowSvg(SVG_HEADER_H, svgW))

  lines.push(`<defs>`)
  for (const kind of ["approved", "needs_approval", "needs_multiple_approvals"] as WorkflowEdgeApproval[]) {
    const color = workflowEdgeStroke(kind)
    lines.push(
      `<marker id="arrow-${kind}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${color}"/></marker>`,
    )
  }
  lines.push(`</defs>`)

  for (const { edge, laneIndex, laneCount } of workflowEdgesWithLanes(doc.edges)) {
    const from = byId.get(edge.fromId)
    const to = byId.get(edge.toId)
    if (!from || !to) continue
    const fromShifted = { ...from, x: from.x + shiftX, y: from.y + shiftY }
    const toShifted = { ...to, x: to.x + shiftX, y: to.y + shiftY }
    const fromH = nodeHeights.get(from.id) ?? NODE_H
    const g = workflowEdgeGeometry(fromShifted, toShifted, laneIndex, laneCount, { fromHeight: fromH })
    const stroke = workflowEdgeStroke(edge.approval)
    lines.push(
      `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${stroke}" stroke-width="2.5" marker-end="url(#arrow-${edge.approval})"/>`,
    )
    if (edge.requirement?.trim()) {
      lines.push(workflowEdgeLabelSvg(g.cx, g.cy, edge.requirement.trim(), stroke))
    }
  }

  for (const n of nodes) {
    const pres = workflowNodePresentation(n)
    const x = n.x + shiftX
    const y = n.y + shiftY
    const h = nodeHeights.get(n.id) ?? NODE_H
    const assignee = workflowSvgAssigneeLabel(options, n.id)
    const labelLines = wrapLabelLines(n.label, 30).slice(0, 5)
    lines.push(
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${h}" rx="10" fill="${pres.fill}" stroke="${pres.border}" stroke-width="1.5"/>`,
    )
    lines.push(workflowNodeLabelSvg(x, y, n.label, pres.text))
    if (assignee) {
      lines.push(workflowNodeAssigneeSvg(x, y, labelLines.length, assignee))
    }
  }

  lines.push(`</svg>`)
  return lines.join("\n")
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function truncateLabel(s: string, max: number): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function downloadWorkflowSvg(doc: BusinessWorkflowDoc, fileName?: string, options?: WorkflowSvgOptions): void {
  const svg = workflowToSvg(doc, options)
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName ?? `${doc.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "workflow"}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

export function newWorkflowNode(label: string, order: number, x = 40, y = 40): WorkflowNode {
  return {
    id: `step-${crypto.randomUUID().slice(0, 8)}`,
    label,
    x,
    y,
    order,
  }
}

export function buildShareWithAdminMailto(doc: BusinessWorkflowDoc, userLabel: string): string {
  const byId = new Map(doc.nodes.map((n) => [n.id, n.label]))
  const steps = sortedWorkflowNodes(doc)
    .map((n, i) => `${i + 1}. ${n.label}`)
    .join("\n")
  const arrows = doc.edges
    .map((e) => {
      const from = byId.get(e.fromId) ?? e.fromId
      const to = byId.get(e.toId) ?? e.toId
      const req = e.requirement?.trim() ? ` · ${e.requirement.trim()}` : ""
      return `• ${from} → ${to} (${WORKFLOW_EDGE_META[e.approval].shortLabel}${req})`
    })
    .join("\n")
  const subject = encodeURIComponent(`Tradesman workflow enhancement request — ${userLabel}`)
  const body = encodeURIComponent(
    `Please review my business workflow for personal enhancements.\n\nAccount: ${userLabel}\nWorkflow: ${doc.title}\n\nSteps:\n${steps}\n\nArrows:\n${arrows}\n\n(I attached or will attach a downloaded SVG from My Business Workflow in Tradesman.)`,
  )
  return `mailto:admin@tradesman-us.com?subject=${subject}&body=${body}`
}
