/** Saved workflow library — profiles.metadata.saved_workflows_v1 */

import {
  type BusinessWorkflowDoc,
  type WorkflowEdge,
  type WorkflowNode,
  newWorkflowEdge,
  newWorkflowNode,
} from "./businessWorkflow"

export const SAVED_WORKFLOWS_META_KEY = "saved_workflows_v1"

export type SavedWorkflowScopeKind = "department" | "customer" | "template" | "general"

export type SavedWorkflowEntry = {
  id: string
  title: string
  scopeKind: SavedWorkflowScopeKind
  departmentKey?: string | null
  departmentLabel?: string | null
  customerId?: string | null
  customerName?: string | null
  templateId?: string | null
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  created_at: string
  updated_at: string
}

export type SavedWorkflowsLibrary = {
  v: 1
  entries: SavedWorkflowEntry[]
  updated_at: string
}

function emptyLibrary(): SavedWorkflowsLibrary {
  return { v: 1, entries: [], updated_at: new Date().toISOString() }
}

export function parseSavedWorkflowsLibrary(raw: unknown): SavedWorkflowsLibrary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyLibrary()
  const o = raw as Record<string, unknown>
  if (o.v !== 1 || !Array.isArray(o.entries)) return emptyLibrary()
  const entries: SavedWorkflowEntry[] = []
  for (const row of o.entries) {
    if (!row || typeof row !== "object") continue
    const e = row as Record<string, unknown>
    if (typeof e.id !== "string" || typeof e.title !== "string") continue
    if (!Array.isArray(e.nodes) || !Array.isArray(e.edges)) continue
    const scopeKind =
      e.scopeKind === "department" || e.scopeKind === "customer" || e.scopeKind === "template" || e.scopeKind === "general"
        ? e.scopeKind
        : "general"
    entries.push({
      id: e.id,
      title: e.title.trim() || "Saved workflow",
      scopeKind,
      departmentKey: typeof e.departmentKey === "string" ? e.departmentKey : null,
      departmentLabel: typeof e.departmentLabel === "string" ? e.departmentLabel : null,
      customerId: typeof e.customerId === "string" ? e.customerId : null,
      customerName: typeof e.customerName === "string" ? e.customerName : null,
      templateId: typeof e.templateId === "string" ? e.templateId : null,
      nodes: e.nodes as WorkflowNode[],
      edges: e.edges as WorkflowEdge[],
      created_at: typeof e.created_at === "string" ? e.created_at : new Date().toISOString(),
      updated_at: typeof e.updated_at === "string" ? e.updated_at : new Date().toISOString(),
    })
  }
  return { v: 1, entries, updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString() }
}

export function loadSavedWorkflowsFromMetadata(metadata: unknown): SavedWorkflowsLibrary {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return emptyLibrary()
  const raw = (metadata as Record<string, unknown>)[SAVED_WORKFLOWS_META_KEY]
  return parseSavedWorkflowsLibrary(raw)
}

export function mergeSavedWorkflowsMetadata(
  prevMeta: Record<string, unknown>,
  library: SavedWorkflowsLibrary,
): Record<string, unknown> {
  return {
    ...prevMeta,
    [SAVED_WORKFLOWS_META_KEY]: { ...library, v: 1, updated_at: new Date().toISOString() },
  }
}

export function entryToBusinessWorkflowDoc(entry: SavedWorkflowEntry): BusinessWorkflowDoc {
  return {
    v: 1,
    title: entry.title,
    nodes: entry.nodes.map((n) => ({ ...n })),
    edges: entry.edges.map((e) => ({ ...e })),
    updated_at: entry.updated_at,
  }
}

export function businessWorkflowToEntry(
  doc: BusinessWorkflowDoc,
  meta: {
    title: string
    scopeKind: SavedWorkflowScopeKind
    departmentKey?: string | null
    departmentLabel?: string | null
    customerId?: string | null
    customerName?: string | null
    templateId?: string | null
  },
  existingId?: string,
): SavedWorkflowEntry {
  const now = new Date().toISOString()
  return {
    id: existingId ?? `swf-${crypto.randomUUID().slice(0, 8)}`,
    title: meta.title.trim() || doc.title,
    scopeKind: meta.scopeKind,
    departmentKey: meta.departmentKey ?? null,
    departmentLabel: meta.departmentLabel ?? null,
    customerId: meta.customerId ?? null,
    customerName: meta.customerName ?? null,
    templateId: meta.templateId ?? null,
    nodes: doc.nodes.map((n) => ({ ...n })),
    edges: doc.edges.map((e) => ({ ...e })),
    created_at: now,
    updated_at: now,
  }
}

/** Clone a workflow doc with fresh node/edge ids (for import without collisions). */
export function cloneWorkflowDoc(doc: BusinessWorkflowDoc, titleOverride?: string): BusinessWorkflowDoc {
  const idMap = new Map<string, string>()
  const nodes = doc.nodes.map((n, i) => {
    const newId = `step-${crypto.randomUUID().slice(0, 8)}`
    idMap.set(n.id, newId)
    return { ...n, id: newId, order: i }
  })
  const edges = doc.edges
    .map((e) => {
      const fromId = idMap.get(e.fromId)
      const toId = idMap.get(e.toId)
      if (!fromId || !toId || fromId === toId) return null
      return {
        ...e,
        id: `edge-${crypto.randomUUID().slice(0, 8)}`,
        fromId,
        toId,
      }
    })
    .filter((e): e is WorkflowEdge => e !== null)
  return {
    v: 1,
    title: titleOverride?.trim() || doc.title,
    nodes,
    edges,
    updated_at: new Date().toISOString(),
  }
}

/** Append imported steps below the live chart (offset positions, new ids). */
export function mergeWorkflowDocs(base: BusinessWorkflowDoc, incoming: BusinessWorkflowDoc): BusinessWorkflowDoc {
  const cloned = cloneWorkflowDoc(incoming)
  if (!cloned.nodes.length) return { ...base, updated_at: new Date().toISOString() }
  const maxY = base.nodes.reduce((m, n) => Math.max(m, n.y + 72), 0)
  const offsetY = maxY + 48
  const maxOrder = base.nodes.reduce((m, n) => Math.max(m, n.order), -1)
  const nodes = [
    ...base.nodes,
    ...cloned.nodes.map((n, i) => ({
      ...n,
      y: n.y + offsetY,
      order: maxOrder + 1 + i,
    })),
  ]
  return {
    ...base,
    nodes,
    edges: [...base.edges, ...cloned.edges],
    updated_at: new Date().toISOString(),
  }
}

export function upsertSavedWorkflowEntry(library: SavedWorkflowsLibrary, entry: SavedWorkflowEntry): SavedWorkflowsLibrary {
  const idx = library.entries.findIndex((e) => e.id === entry.id)
  const entries =
    idx >= 0
      ? library.entries.map((e, i) => (i === idx ? { ...entry, created_at: e.created_at, updated_at: new Date().toISOString() } : e))
      : [...library.entries, entry]
  return { v: 1, entries, updated_at: new Date().toISOString() }
}

export function removeSavedWorkflowEntry(library: SavedWorkflowsLibrary, id: string): SavedWorkflowsLibrary {
  return {
    v: 1,
    entries: library.entries.filter((e) => e.id !== id),
    updated_at: new Date().toISOString(),
  }
}

export function mergeEntryIntoSavedWorkflow(
  library: SavedWorkflowsLibrary,
  targetId: string,
  incoming: BusinessWorkflowDoc,
): SavedWorkflowsLibrary {
  const target = library.entries.find((e) => e.id === targetId)
  if (!target) return library
  const merged = mergeWorkflowDocs(entryToBusinessWorkflowDoc(target), incoming)
  const next = businessWorkflowToEntry(
    merged,
    {
      title: target.title,
      scopeKind: target.scopeKind,
      departmentKey: target.departmentKey,
      departmentLabel: target.departmentLabel,
      customerId: target.customerId,
      customerName: target.customerName,
      templateId: target.templateId,
    },
    target.id,
  )
  next.created_at = target.created_at
  return upsertSavedWorkflowEntry(library, next)
}

/** Build a workflow doc from step labels with simple vertical layout. */
export function workflowDocFromStepLabels(title: string, labels: string[]): BusinessWorkflowDoc {
  const nodes: WorkflowNode[] = labels
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label, i) => newWorkflowNode(label, i, 40 + (i % 2) * 280, 24 + i * 88))
  const edges: WorkflowEdge[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push(newWorkflowEdge(nodes[i].id, nodes[i + 1].id, "approved"))
  }
  return {
    v: 1,
    title: title.trim() || "New workflow",
    nodes,
    edges,
    updated_at: new Date().toISOString(),
  }
}
