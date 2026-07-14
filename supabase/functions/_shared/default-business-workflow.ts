/** Default business workflow seeded on new account signup. */

export const BUSINESS_WORKFLOW_META_KEY = "business_workflow_v1"

const DEFAULT_LABELS = [
  "Customer Intake",
  "Build Estimate",
  "Customer Approves",
  "Schedule Job",
  "Complete Calendar Event",
  "Customer Payment Received",
  "Send Receipt",
] as const

type WorkflowNode = {
  id: string
  label: string
  x: number
  y: number
  order: number
  boxColor: string
}

type WorkflowEdge = {
  id: string
  fromId: string
  toId: string
  approval: "approved"
}

type BusinessWorkflowDoc = {
  v: 1
  title: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  updated_at: string
}

function nodeColor(label: string, index: number, total: number): string {
  if (index === 0) return "blue"
  if (index === total - 1) return "green"
  if (/approv|payment|receipt/i.test(label)) return "teal"
  if (/schedule|calendar/i.test(label)) return "purple"
  return "default"
}

export function createDefaultBusinessWorkflowDoc(nowIso: string): BusinessWorkflowDoc {
  const nodes: WorkflowNode[] = DEFAULT_LABELS.map((label, i) => ({
    id: `default-step-${i + 1}`,
    label,
    x: 40 + (i % 2) * 190,
    y: 24 + i * 72,
    order: i,
    boxColor: nodeColor(label, i, DEFAULT_LABELS.length),
  }))
  const edges: WorkflowEdge[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]
    edges.push({
      id: `edge-${a.id}-${b.id}`,
      fromId: a.id,
      toId: b.id,
      approval: "approved",
    })
  }
  return {
    v: 1,
    title: "Customer job lifecycle",
    nodes,
    edges,
    updated_at: nowIso,
  }
}

export function mergeDefaultBusinessWorkflowMetadata(
  prevMeta: Record<string, unknown>,
  nowIso: string,
): Record<string, unknown> {
  if (prevMeta[BUSINESS_WORKFLOW_META_KEY]) return prevMeta
  return {
    ...prevMeta,
    [BUSINESS_WORKFLOW_META_KEY]: createDefaultBusinessWorkflowDoc(nowIso),
  }
}
