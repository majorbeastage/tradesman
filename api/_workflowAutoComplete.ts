import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Server-side port of src/lib/customerWorkflowAutoComplete.ts for the payment
 * webhook. Mirrors the client stage classifier + sequential completion so a
 * provider "paid" webhook can close the customer-payment workflow step.
 */

type ServerWorkflowNode = { id: string; label: string; order: number }
type StageKey = "intake" | "estimate" | "approval" | "schedule" | "field" | "parts" | "billing" | "complete"
type ServerAutoEvent = "estimate_sent" | "estimate_signed" | "job_scheduled" | "payment_received"

const EVENT_STAGE: Record<ServerAutoEvent, StageKey> = {
  estimate_sent: "estimate",
  estimate_signed: "approval",
  job_scheduled: "schedule",
  payment_received: "billing",
}

/** Keep in lockstep with stageForNodeLabel() in src/lib/inferCustomerWorkflowStep.ts. */
function stageForNodeLabel(label: string): StageKey | null {
  const l = label.toLowerCase()
  if (/lead|intake|reception|inquir|contact|call/.test(l)) return "intake"
  if (/estimate|quote|bid|proposal/.test(l)) return "estimate"
  if (/approv|sign.?off|signoff|accept|review/.test(l)) return "approval"
  if (/schedul|dispatch|assign|calendar|book/.test(l)) return "schedule"
  if (/field|install|service|technician|job site|complete job|perform/.test(l)) return "field"
  if (/parts|purchase|order|inventory|shop|supply/.test(l)) return "parts"
  if (/invoice|bill|payment|collect|accounting/.test(l)) return "billing"
  if (/close|done|complete|finish|archive/.test(l)) return "complete"
  return null
}

function parseWorkflowNodes(metadata: unknown): ServerWorkflowNode[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return []
  const doc = (metadata as Record<string, unknown>)["business_workflow_v1"]
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return []
  const rawNodes = (doc as Record<string, unknown>).nodes
  if (!Array.isArray(rawNodes)) return []
  const nodes: ServerWorkflowNode[] = []
  rawNodes.forEach((n, i) => {
    if (!n || typeof n !== "object") return
    const row = n as Record<string, unknown>
    if (typeof row.id !== "string" || typeof row.label !== "string") return
    nodes.push({
      id: row.id,
      label: row.label,
      order: typeof row.order === "number" && Number.isFinite(row.order) ? row.order : i,
    })
  })
  nodes.sort((a, b) => a.order - b.order)
  return nodes
}

function parseCompletedNodeIds(customerMetadata: unknown): string[] {
  if (!customerMetadata || typeof customerMetadata !== "object" || Array.isArray(customerMetadata)) return []
  const raw = (customerMetadata as Record<string, unknown>)["customer_workflow_v1"]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
  const ids = (raw as Record<string, unknown>).completedNodeIds
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []
}

/**
 * Load the owner workflow + this customer's progress, apply the event, and persist.
 * Best-effort: never throws.
 */
export async function autoAdvanceCustomerWorkflowServer(
  sb: SupabaseClient,
  ownerUserId: string | null | undefined,
  customerId: string | null | undefined,
  event: ServerAutoEvent,
): Promise<boolean> {
  try {
    if (!ownerUserId || !customerId) return false

    const { data: profile } = await sb.from("profiles").select("metadata").eq("id", ownerUserId).maybeSingle()
    const nodes = parseWorkflowNodes((profile as { metadata?: unknown } | null)?.metadata)
    if (nodes.length === 0) return false

    const stage = EVENT_STAGE[event]
    let targetIdx = -1
    nodes.forEach((n, i) => {
      if (stageForNodeLabel(n.label) === stage) targetIdx = i
    })
    if (targetIdx < 0) return false

    const { data: cust } = await sb.from("customers").select("metadata").eq("id", customerId).maybeSingle()
    if (!cust) return false
    const customerMetadata = (cust as { metadata?: unknown }).metadata

    const validIds = new Set(nodes.map((n) => n.id))
    const set = new Set(parseCompletedNodeIds(customerMetadata).filter((id) => validIds.has(id)))
    let changed = false
    for (const node of nodes.slice(0, targetIdx + 1)) {
      if (!set.has(node.id)) {
        set.add(node.id)
        changed = true
      }
    }
    if (!changed) return false

    const completedNodeIds = nodes.filter((n) => set.has(n.id)).map((n) => n.id)
    const next = nodes.find((n) => !set.has(n.id)) ?? null

    const baseMeta =
      customerMetadata && typeof customerMetadata === "object" && !Array.isArray(customerMetadata)
        ? { ...(customerMetadata as Record<string, unknown>) }
        : {}
    const prevWf =
      baseMeta["customer_workflow_v1"] && typeof baseMeta["customer_workflow_v1"] === "object" && !Array.isArray(baseMeta["customer_workflow_v1"])
        ? (baseMeta["customer_workflow_v1"] as Record<string, unknown>)
        : {}
    baseMeta["customer_workflow_v1"] = {
      ...prevWf,
      v: 1,
      activeNodeId: next?.id ?? null,
      completedNodeIds,
      pendingNodeIds: [],
      updatedAt: new Date().toISOString(),
    }

    const { error } = await sb
      .from("customers")
      .update({
        metadata: baseMeta,
        job_pipeline_status: next?.label ?? "Completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)
    if (error) {
      console.warn("[workflowAutoComplete:server] persist", error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn("[workflowAutoComplete:server]", e instanceof Error ? e.message : e)
    return false
  }
}
