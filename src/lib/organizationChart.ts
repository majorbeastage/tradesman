/** Organization chart — stored on profiles.metadata.organization_chart_v1 */

export type OrgChartNode = {
  id: string
  label: string
  jobTitle: string
  linkedUserId: string | null
  /** @deprecated Lines are stored in `edges`; kept for migration/export. */
  parentId: string | null
  x: number
  y: number
}

export type OrgChartEdge = {
  id: string
  fromId: string
  toId: string
  /** Optional label on the reporting line. */
  label?: string
}

export type OrganizationChartDoc = {
  v: 1
  title: string
  nodes: OrgChartNode[]
  edges: OrgChartEdge[]
  updated_at: string
  shared_with_admin_at?: string | null
}

export const ORG_CHART_META_KEY = "organization_chart_v1"

const EXAMPLE_NODES: Omit<OrgChartNode, "id">[] = [
  { label: "Owner / General Manager", jobTitle: "Owner", linkedUserId: null, parentId: null, x: 260, y: 24 },
  { label: "Shop Manager", jobTitle: "Shop Manager", linkedUserId: null, parentId: "root", x: 80, y: 140 },
  { label: "Parts Department", jobTitle: "Parts Manager", linkedUserId: null, parentId: "root", x: 260, y: 140 },
  { label: "Accounting", jobTitle: "Controller", linkedUserId: null, parentId: "root", x: 440, y: 140 },
  { label: "Reception / Customer Care", jobTitle: "Customer Care Lead", linkedUserId: null, parentId: "root", x: 260, y: 260 },
]

export function createExampleOrganizationChart(): OrganizationChartDoc {
  const rootId = "org-root"
  const nodes: OrgChartNode[] = EXAMPLE_NODES.map((n, i) => ({
    ...n,
    id: i === 0 ? rootId : `org-${i + 1}`,
    parentId: n.parentId === "root" ? rootId : n.parentId,
  }))
  const edges: OrgChartEdge[] = nodes
    .filter((n) => n.parentId)
    .map((n) => ({
      id: `edge-${n.parentId}-${n.id}`,
      fromId: n.parentId!,
      toId: n.id,
    }))
  return {
    v: 1,
    title: "Company organization chart",
    nodes,
    edges,
    updated_at: new Date().toISOString(),
  }
}

function parseOrgChartEdges(raw: unknown, nodeIds: Set<string>): OrgChartEdge[] {
  if (!Array.isArray(raw)) return []
  const out: OrgChartEdge[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    if (typeof o.fromId !== "string" || typeof o.toId !== "string") continue
    if (!nodeIds.has(o.fromId) || !nodeIds.has(o.toId) || o.fromId === o.toId) continue
    out.push({
      id: typeof o.id === "string" ? o.id : `edge-${crypto.randomUUID().slice(0, 8)}`,
      fromId: o.fromId,
      toId: o.toId,
      label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : undefined,
    })
  }
  return out
}

export function syncOrgChartParentIds(nodes: OrgChartNode[], edges: OrgChartEdge[]): OrgChartNode[] {
  return nodes.map((n) => {
    const incoming = edges.find((e) => e.toId === n.id)
    return { ...n, parentId: incoming?.fromId ?? null }
  })
}

export function parseOrganizationChart(raw: unknown): OrganizationChartDoc | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1 || !Array.isArray(o.nodes)) return null
  const nodes: OrgChartNode[] = []
  for (const n of o.nodes) {
    if (!n || typeof n !== "object") continue
    const row = n as Record<string, unknown>
    if (typeof row.id !== "string" || typeof row.label !== "string") continue
    nodes.push({
      id: row.id,
      label: row.label,
      jobTitle: typeof row.jobTitle === "string" ? row.jobTitle : "",
      linkedUserId: typeof row.linkedUserId === "string" ? row.linkedUserId : null,
      parentId: typeof row.parentId === "string" ? row.parentId : null,
      x: typeof row.x === "number" && Number.isFinite(row.x) ? row.x : 40,
      y: typeof row.y === "number" && Number.isFinite(row.y) ? row.y : 40,
    })
  }
  if (!nodes.length) return null
  const nodeIds = new Set(nodes.map((n) => n.id))
  let edges = parseOrgChartEdges(o.edges, nodeIds)
  if (!edges.length) {
    edges = nodes
      .filter((n) => n.parentId && nodeIds.has(n.parentId))
      .map((n) => ({
        id: `edge-${n.parentId}-${n.id}`,
        fromId: n.parentId!,
        toId: n.id,
      }))
  }
  const syncedNodes = syncOrgChartParentIds(nodes, edges)
  return {
    v: 1,
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Organization chart",
    nodes: syncedNodes,
    edges,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
    shared_with_admin_at: typeof o.shared_with_admin_at === "string" ? o.shared_with_admin_at : null,
  }
}

export function loadOrganizationChartFromMetadata(metadata: unknown): OrganizationChartDoc {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return createExampleOrganizationChart()
  }
  const raw = (metadata as Record<string, unknown>)[ORG_CHART_META_KEY]
  return parseOrganizationChart(raw) ?? createExampleOrganizationChart()
}

export function mergeOrganizationChartMetadata(
  prevMeta: Record<string, unknown>,
  doc: OrganizationChartDoc,
): Record<string, unknown> {
  return {
    ...prevMeta,
    [ORG_CHART_META_KEY]: { ...doc, v: 1, updated_at: new Date().toISOString() },
  }
}

export function newOrgChartEdge(fromId: string, toId: string, label = ""): OrgChartEdge {
  const trimmed = label.trim()
  return {
    id: `edge-${crypto.randomUUID().slice(0, 8)}`,
    fromId,
    toId,
    label: trimmed || undefined,
  }
}

export type OrgChartEdgeGeometry = {
  x1: number
  y1: number
  x2: number
  y2: number
  cx: number
  cy: number
}

export function orgChartEdgeGeometry(
  from: OrgChartNode,
  to: OrgChartNode,
  laneIndex: number,
  laneCount: number,
): OrgChartEdgeGeometry {
  const x1 = from.x + NODE_W / 2
  const y1 = from.y + NODE_H
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

export function orgChartEdgesWithLanes(edges: OrgChartEdge[]): Array<{ edge: OrgChartEdge; laneIndex: number; laneCount: number }> {
  const groups = new Map<string, OrgChartEdge[]>()
  for (const e of edges) {
    const key = `${e.fromId}\0${e.toId}`
    const g = groups.get(key) ?? []
    g.push(e)
    groups.set(key, g)
  }
  const out: Array<{ edge: OrgChartEdge; laneIndex: number; laneCount: number }> = []
  for (const group of groups.values()) {
    group.forEach((edge, laneIndex) => {
      out.push({ edge, laneIndex, laneCount: group.length })
    })
  }
  return out
}

export function newOrgChartNode(
  label: string,
  parentId: string | null,
  x = 40,
  y = 40,
): OrgChartNode {
  return {
    id: `org-${crypto.randomUUID().slice(0, 8)}`,
    label,
    jobTitle: "",
    linkedUserId: null,
    parentId,
    x,
    y,
  }
}

const NODE_W = 240
const NODE_H = 72

export function orgChartToSvg(doc: OrganizationChartDoc, width = 760, height = 900): string {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  const lines: string[] = []
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`)
  lines.push(`<rect width="100%" height="100%" fill="#f8fafc"/>`)
  lines.push(`<text x="24" y="32" font-family="Segoe UI, sans-serif" font-size="18" font-weight="700" fill="#0f172a">${escapeXml(doc.title)}</text>`)

  for (const { edge, laneIndex, laneCount } of orgChartEdgesWithLanes(doc.edges)) {
    const from = byId.get(edge.fromId)
    const to = byId.get(edge.toId)
    if (!from || !to) continue
    const g = orgChartEdgeGeometry(from, to, laneIndex, laneCount)
    lines.push(`<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="#94a3b8" stroke-width="2"/>`)
    if (edge.label?.trim()) {
      const label = escapeXml(truncate(edge.label.trim(), 28))
      const w = Math.min(180, Math.max(60, label.length * 6 + 14))
      lines.push(
        `<rect x="${g.cx - w / 2}" y="${g.cy - 9}" width="${w}" height="18" rx="4" fill="#ffffff" stroke="#94a3b8" stroke-width="1"/>`,
      )
      lines.push(
        `<text x="${g.cx}" y="${g.cy + 4}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="10" font-weight="600" fill="#475569">${label}</text>`,
      )
    }
  }

  for (const n of doc.nodes) {
    lines.push(`<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="#fff" stroke="#cbd5e1" stroke-width="1.5"/>`)
    lines.push(`<text x="${n.x + 12}" y="${n.y + 26}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#0f172a">${escapeXml(truncate(n.label, 30))}</text>`)
    if (n.jobTitle.trim()) {
      lines.push(`<text x="${n.x + 12}" y="${n.y + 44}" font-family="Segoe UI, sans-serif" font-size="11" fill="#64748b">${escapeXml(truncate(n.jobTitle, 32))}</text>`)
    }
    if (n.linkedUserId) {
      lines.push(`<text x="${n.x + 12}" y="${n.y + 60}" font-family="Segoe UI, sans-serif" font-size="10" fill="#0ea5e9">Linked Tradesman user</text>`)
    }
  }

  lines.push(`</svg>`)
  return lines.join("\n")
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function downloadOrgChartSvg(doc: OrganizationChartDoc, fileName?: string): void {
  const svg = orgChartToSvg(doc)
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName ?? `${doc.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "org-chart"}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

export function buildOrgChartShareMailto(doc: OrganizationChartDoc, userLabel: string): string {
  const byId = new Map(doc.nodes.map((n) => [n.id, n.label]))
  const rows = doc.nodes
    .map((n) => `- ${n.label}${n.jobTitle ? ` (${n.jobTitle})` : ""}${n.linkedUserId ? " [linked user]" : ""}`)
    .join("\n")
  const lines = doc.edges
    .map((e) => {
      const from = byId.get(e.fromId) ?? e.fromId
      const to = byId.get(e.toId) ?? e.toId
      const label = e.label?.trim() ? ` · ${e.label.trim()}` : ""
      return `• ${from} → ${to}${label}`
    })
    .join("\n")
  const subject = encodeURIComponent(`Tradesman org chart review — ${userLabel}`)
  const body = encodeURIComponent(
    `Please review my organization chart setup.\n\nAccount: ${userLabel}\nChart: ${doc.title}\n\nRoles:\n${rows}\n\nReporting lines:\n${lines || "(none)"}\n\n(Future: estimates, POs, work orders, and approvals will route through this chart.)`,
  )
  return `mailto:admin@tradesman-us.com?subject=${subject}&body=${body}`
}
