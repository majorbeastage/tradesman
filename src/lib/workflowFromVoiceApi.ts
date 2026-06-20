import {
  newWorkflowEdge,
  newWorkflowNode,
  type BusinessWorkflowDoc,
  type WorkflowEdgeApproval,
} from "./businessWorkflow"
import { platformToolsFetchOrigins, platformToolsJsonBody, readPlatformToolsJsonBody } from "./platformToolsJsonBody"
import { workflowDocFromStepLabels } from "./savedWorkflows"

export type WorkflowFromVoiceConnection = {
  from: number
  to: number
  approval?: WorkflowEdgeApproval
  label?: string
}

export type WorkflowFromVoiceResult = {
  title: string
  steps: string[]
  connections: WorkflowFromVoiceConnection[]
  fallback?: boolean
  note?: string
}

function parseSequentialFallback(utterance: string): WorkflowFromVoiceResult {
  const cleaned = utterance
    .replace(/\band then\b/gi, "\n")
    .replace(/\bthen\b/gi, "\n")
    .replace(/[,;]+/g, "\n")
  const steps = cleaned
    .split(/\n+/)
    .map((s) => s.replace(/^[\d.)\s-]+/, "").trim())
    .filter((s) => s.length > 1)
    .slice(0, 20)
  const connections: WorkflowFromVoiceConnection[] = []
  for (let i = 0; i < steps.length - 1; i++) {
    connections.push({ from: i, to: i + 1, approval: "approved" })
  }
  return {
    title: steps[0]?.slice(0, 60) || "Voice workflow",
    steps,
    connections,
    fallback: true,
    note: "Built from your words locally — connect OpenAI on the server for smarter branching.",
  }
}

export async function fetchWorkflowFromVoice(
  accessToken: string,
  utterance: string,
): Promise<WorkflowFromVoiceResult> {
  const trimmed = utterance.trim()
  if (!trimmed) {
    return { title: "New workflow", steps: [], connections: [], note: "Say or type your workflow steps first." }
  }
  if (!accessToken.trim()) {
    return parseSequentialFallback(trimmed)
  }

  const body = platformToolsJsonBody({ utterance: trimmed.slice(0, 8000) })
  const bases = platformToolsFetchOrigins()
  let lastNote = ""

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i]
    const ac = new AbortController()
    const kill = window.setTimeout(() => ac.abort(), 55_000)
    let res: Response
    try {
      res = await fetch(`${base}/api/platform-tools?__route=workflow-from-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body,
        signal: ac.signal,
      })
    } catch (err) {
      clearTimeout(kill)
      lastNote = err instanceof Error ? err.message : String(err)
      if (i < bases.length - 1) continue
      return parseSequentialFallback(trimmed)
    }
    clearTimeout(kill)

    const parsed = await readPlatformToolsJsonBody<{
      ok?: boolean
      title?: string
      steps?: string[]
      connections?: WorkflowFromVoiceConnection[]
      fallback?: boolean
      note?: string
    }>(res)
    const data = parsed.data
    if (!data?.ok) {
      lastNote = typeof data?.note === "string" ? data.note : "Assistant unavailable."
      if (i < bases.length - 1) continue
      return { ...parseSequentialFallback(trimmed), note: lastNote }
    }

    const steps = Array.isArray(data.steps)
      ? data.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 24)
      : []
    const connections = Array.isArray(data.connections)
      ? data.connections
          .filter((c) => c && typeof c === "object")
          .map((c) => c as WorkflowFromVoiceConnection)
          .slice(0, 40)
      : []

    if (!steps.length) return parseSequentialFallback(trimmed)

    return {
      title: typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 120) : "Voice workflow",
      steps,
      connections,
      fallback: data.fallback === true,
      note: typeof data.note === "string" ? data.note : undefined,
    }
  }

  return { ...parseSequentialFallback(trimmed), note: lastNote || undefined }
}

export function businessWorkflowFromVoiceResult(result: WorkflowFromVoiceResult): BusinessWorkflowDoc {
  if (!result.steps.length) {
    return workflowDocFromStepLabels(result.title, ["Describe your first step"])
  }

  const nodes = result.steps.map((label, i) => newWorkflowNode(label.trim(), i, 40 + (i % 2) * 280, 24 + i * 88))
  const edges = []
  const seen = new Set<string>()

  for (const conn of result.connections) {
    const from = conn.from
    const to = conn.to
    if (from < 0 || to < 0 || from >= nodes.length || to >= nodes.length || from === to) continue
    const key = `${from}-${to}`
    if (seen.has(key)) continue
    seen.add(key)
    const approval: WorkflowEdgeApproval =
      conn.approval === "approved" || conn.approval === "needs_approval" || conn.approval === "needs_multiple_approvals"
        ? conn.approval
        : "approved"
    edges.push(newWorkflowEdge(nodes[from].id, nodes[to].id, approval, conn.label ?? ""))
  }

  if (!edges.length) {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push(newWorkflowEdge(nodes[i].id, nodes[i + 1].id, "approved"))
    }
  }

  return {
    v: 1,
    title: result.title,
    nodes,
    edges,
    updated_at: new Date().toISOString(),
  }
}
