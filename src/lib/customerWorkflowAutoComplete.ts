/**
 * Event-driven auto-completion of a customer's business-workflow steps.
 *
 * When a real event happens (estimate sent, signed estimate received, job added
 * to the calendar, customer payment received) we mark the matching workflow step
 * complete and advance to the next open step. Only the current active step (or an
 * explicit target node) is completed per event — never every step through the last
 * label match (supports multiple schedule steps in one workflow).
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
import { emitUserNotification } from "./userNotifications"

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

export type WorkflowAutoCompleteOptions = {
  /** Explicit workflow node to complete (e.g. calendar event linked to a schedule step). */
  targetNodeId?: string | null
  /** Customer's current active node from metadata (used when targetNodeId omitted). */
  activeNodeId?: string | null
  /** Already completed node ids (used to pick the first matching open step). */
  completedNodeIds?: string[]
}

/**
 * Node ids this event should complete: only the target/active step when its label
 * stage matches the event — not every prior step and not every later duplicate stage.
 */
export function computeWorkflowAutoCompleteNodeIds(
  workflow: BusinessWorkflowDoc,
  event: WorkflowAutoEvent,
  options: WorkflowAutoCompleteOptions = {},
): string[] {
  const nodes = sortedWorkflowNodes(workflow)
  if (nodes.length === 0) return []
  const stage = EVENT_STAGE[event]
  const completed = new Set(options.completedNodeIds ?? [])

  const tryNode = (nodeId: string | null | undefined, requireStageMatch: boolean): string[] => {
    const id = nodeId?.trim()
    if (!id || completed.has(id)) return []
    const node = nodes.find((n) => n.id === id)
    if (!node) return []
    if (requireStageMatch && stageForNodeLabel(node.label) !== stage) return []
    return [id]
  }

  // Explicit workflow node from calendar handoff — complete that step even when the label
  // does not match the generic stage regex (e.g. custom "Site survey" steps).
  const explicit = tryNode(options.targetNodeId, false)
  if (explicit.length > 0) return explicit

  const active = tryNode(options.activeNodeId, true)
  if (active.length > 0) return active

  for (const node of nodes) {
    if (completed.has(node.id)) continue
    if (stageForNodeLabel(node.label) === stage) return [node.id]
  }
  return []
}

/** Pure reducer: fold an event's implied completions into the existing set, never un-completing. */
export function applyWorkflowAutoComplete(
  workflow: BusinessWorkflowDoc,
  existingCompletedNodeIds: string[],
  event: WorkflowAutoEvent,
  options: WorkflowAutoCompleteOptions = {},
): WorkflowAutoCompleteResult {
  const nodes = sortedWorkflowNodes(workflow)
  const validIds = new Set(nodes.map((n) => n.id))
  const set = new Set(existingCompletedNodeIds.filter((id) => validIds.has(id)))
  const target = computeWorkflowAutoCompleteNodeIds(workflow, event, {
    ...options,
    completedNodeIds: [...set],
  })

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
  options: WorkflowAutoCompleteOptions = {},
): Promise<boolean> {
  try {
    if (!supabase || !ownerUserId || !customerId) return false

    const { data: profile } = await supabase.from("profiles").select("metadata").eq("id", ownerUserId).maybeSingle()
    const bundle = loadAccountWorkflowBundleFromMetadata(profile?.metadata)
    if (!bundle.workflow.nodes.length) return false

    const { data: cust } = await supabase.from("customers").select("metadata").eq("id", customerId).maybeSingle()
    if (!cust) return false

    const customerMeta = parseCustomerWorkflowMeta((cust as { metadata?: unknown }).metadata)
    const existing = customerMeta?.completedNodeIds ?? []
    const activeNodeId = options.activeNodeId ?? customerMeta?.activeNodeId ?? null
    const result = applyWorkflowAutoComplete(bundle.workflow, existing, event, {
      ...options,
      activeNodeId,
      completedNodeIds: existing,
    })
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
    void emitUserNotification(supabase, {
      ownerUserId,
      kind: "workflow_step_completed",
      title: "Workflow step completed",
      body: result.currentNodeLabel ? `Advanced to: ${result.currentNodeLabel}` : "Workflow advanced.",
      customerId,
    })
    if (result.currentNodeId) {
      void emitUserNotification(supabase, {
        ownerUserId,
        kind: "assigned_step_ready",
        title: "Workflow step ready",
        body: result.currentNodeLabel ? `Ready: ${result.currentNodeLabel}` : "The next workflow step is ready.",
        customerId,
      })
    }
    return true
  } catch (e) {
    console.warn("[workflowAutoComplete]", e instanceof Error ? e.message : e)
    return false
  }
}
