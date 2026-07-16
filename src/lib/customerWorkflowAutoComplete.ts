/**
 * Event-driven auto-completion of a customer's business-workflow steps.
 *
 * When a real event happens (estimate sent, signed estimate received, job added
 * to the calendar, customer payment received) we intelligently mark the matching
 * workflow step — and every step before it — complete, then advance the customer
 * to the next open step. Step matching is by label semantics (see stageForNodeLabel)
 * so it works regardless of what the business names their steps.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { BusinessWorkflowDoc } from "./businessWorkflow"
import { sortedWorkflowNodes } from "./businessWorkflow"
import { stageForNodeLabel, type StageKey } from "./inferCustomerWorkflowStep"
import { loadAccountWorkflowBundleFromMetadata } from "./estimateWorkflowRuntime"
import {
  mergeCustomerWorkflowMeta,
  parseCustomerWorkflowMeta,
  resolveWorkflowNodeDepartmentKey,
} from "./customerWorkflowRouting"

/** Real-world events that can auto-close workflow steps. */
export type WorkflowAutoEvent = "estimate_sent" | "estimate_signed" | "job_scheduled" | "payment_received"

/** The workflow stage each event resolves to (matched against step labels). */
const EVENT_STAGE: Record<WorkflowAutoEvent, StageKey> = {
  estimate_sent: "estimate",
  estimate_signed: "approval",
  job_scheduled: "schedule",
  payment_received: "billing",
}

export type WorkflowAutoCompleteResult = {
  /** True when at least one step moved from open → complete. */
  changed: boolean
  completedNodeIds: string[]
  currentNodeId: string | null
  currentNodeLabel: string | null
}

/**
 * Node ids this event implies are done: the highest-order step matching the
 * event's stage plus every step before it (sequential workflows complete in order).
 */
export function computeWorkflowAutoCompleteNodeIds(workflow: BusinessWorkflowDoc, event: WorkflowAutoEvent): string[] {
  const nodes = sortedWorkflowNodes(workflow)
  if (nodes.length === 0) return []
  const stage = EVENT_STAGE[event]
  let targetIdx = -1
  nodes.forEach((node, i) => {
    if (stageForNodeLabel(node.label) === stage) targetIdx = i
  })
  if (targetIdx < 0) return []
  return nodes.slice(0, targetIdx + 1).map((n) => n.id)
}

/** Pure reducer: fold an event's implied completions into the existing set, never un-completing. */
export function applyWorkflowAutoComplete(
  workflow: BusinessWorkflowDoc,
  existingCompletedNodeIds: string[],
  event: WorkflowAutoEvent,
): WorkflowAutoCompleteResult {
  const nodes = sortedWorkflowNodes(workflow)
  const validIds = new Set(nodes.map((n) => n.id))
  const set = new Set(existingCompletedNodeIds.filter((id) => validIds.has(id)))
  const target = computeWorkflowAutoCompleteNodeIds(workflow, event)

  let changed = false
  for (const id of target) {
    if (!set.has(id)) {
      set.add(id)
      changed = true
    }
  }

  const completedNodeIds = nodes.filter((n) => set.has(n.id)).map((n) => n.id)
  const next = nodes.find((n) => !set.has(n.id)) ?? null
  return {
    changed,
    completedNodeIds,
    currentNodeId: next?.id ?? null,
    currentNodeLabel: next?.label ?? (nodes.length > 0 ? "Completed" : null),
  }
}

/**
 * Load the owner's workflow + this customer's progress, apply the event, and persist
 * the advanced state. Best-effort: never throws (a failed auto-advance must not break
 * the primary action that triggered it).
 */
export async function autoAdvanceCustomerWorkflow(
  supabase: SupabaseClient | null,
  ownerUserId: string | null | undefined,
  customerId: string | null | undefined,
  event: WorkflowAutoEvent,
): Promise<boolean> {
  try {
    if (!supabase || !ownerUserId || !customerId) return false

    const { data: profile } = await supabase.from("profiles").select("metadata").eq("id", ownerUserId).maybeSingle()
    const bundle = loadAccountWorkflowBundleFromMetadata(profile?.metadata)
    if (!bundle.workflow.nodes.length) return false

    const { data: cust } = await supabase.from("customers").select("metadata").eq("id", customerId).maybeSingle()
    if (!cust) return false

    const existing = parseCustomerWorkflowMeta((cust as { metadata?: unknown }).metadata)?.completedNodeIds ?? []
    const result = applyWorkflowAutoComplete(bundle.workflow, existing, event)
    if (!result.changed) return false

    const nextNode = result.currentNodeId
      ? bundle.workflow.nodes.find((n) => n.id === result.currentNodeId) ?? null
      : null
    const departmentKey = nextNode ? resolveWorkflowNodeDepartmentKey(nextNode, bundle.orgChart) : null

    const metadata = mergeCustomerWorkflowMeta((cust as { metadata?: unknown }).metadata, {
      activeNodeId: result.currentNodeId,
      departmentKey,
      completedNodeIds: result.completedNodeIds,
      pendingNodeIds: [],
    })

    const { error } = await supabase
      .from("customers")
      .update({
        metadata,
        job_pipeline_status: result.currentNodeLabel ?? "Completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)
    if (error) {
      console.warn("[workflowAutoComplete] persist", error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn("[workflowAutoComplete]", e instanceof Error ? e.message : e)
    return false
  }
}
