/** Organization chart — stored on profiles.metadata.organization_chart_v1 */

export type OrgChartNode = {
  id: string
  label: string
  jobTitle: string
  linkedUserId: string | null
  parentId: string | null
  x: number
  y: number
}

export type OrganizationChartDoc = {
  v: 1
  title: string
  nodes: OrgChartNode[]
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
  return {
    v: 1,
    title: "Company organization chart",
    nodes,
    updated_at: new Date().toISOString(),
  }
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
  return {
    v: 1,
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Organization chart",
    nodes,
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

  for (const n of doc.nodes) {
    if (!n.parentId) continue
    const parent = byId.get(n.parentId)
    if (!parent) continue
    const x1 = parent.x + NODE_W / 2
    const y1 = parent.y + NODE_H
    const x2 = n.x + NODE_W / 2
    const y2 = n.y
    lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>`)
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
  const rows = doc.nodes
    .map((n) => `- ${n.label}${n.jobTitle ? ` (${n.jobTitle})` : ""}${n.linkedUserId ? " [linked user]" : ""}`)
    .join("\n")
  const subject = encodeURIComponent(`Tradesman org chart review — ${userLabel}`)
  const body = encodeURIComponent(
    `Please review my organization chart setup.\n\nAccount: ${userLabel}\nChart: ${doc.title}\n\nRoles:\n${rows}\n\n(Future: estimates, POs, work orders, and approvals will route through this chart.)`,
  )
  return `mailto:admin@tradesman-us.com?subject=${subject}&body=${body}`
}
