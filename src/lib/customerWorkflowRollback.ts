/**
 * Move a customer job back to an earlier workflow step — with optional calendar cleanup.
 */

import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import { sortedWorkflowNodes } from "./businessWorkflow"
import type { QuoteInternalWorkflowState } from "./estimateWorkflowRuntime"
import type { CalendarEventProfileRow } from "./calendarEventProfile"
import { calendarEventDisplayStatus } from "./calendarEventProfile"

export type WorkflowRollbackTarget = {
  nodeId: string
  label: string
  order: number
  hint: string
}

export type CustomerWorkflowCalendarContext = {
  upcoming: CalendarEventProfileRow[]
  cancelled: CalendarEventProfileRow[]
  recurring: CalendarEventProfileRow[]
}

export function buildCustomerWorkflowCalendarContext(
  events: CalendarEventProfileRow[],
): CustomerWorkflowCalendarContext {
  const upcoming: CalendarEventProfileRow[] = []
  const cancelled: CalendarEventProfileRow[] = []
  const recurring: CalendarEventProfileRow[] = []
  for (const ev of events) {
    const status = calendarEventDisplayStatus(ev)
    if (status === "Cancelled") cancelled.push(ev)
    else if (status === "Recurring") recurring.push(ev)
    else if (status === "Upcoming") upcoming.push(ev)
  }
  return { upcoming, cancelled, recurring }
}

function stageHint(label: string): string {
  const l = label.toLowerCase()
  if (/schedul|calendar|dispatch/.test(l)) return "Scheduling step — may have calendar appointments"
  if (/approv|sign.?off/.test(l)) return "Approval step — estimate may need re-review"
  if (/estimate|quote/.test(l)) return "Estimate step — customer may need a revised quote"
  if (/work order|field|job complete/.test(l)) return "Field / work order step"
  if (/invoice|bill|accounting/.test(l)) return "Billing step"
  return "Earlier step in your business workflow"
}

export function listWorkflowRollbackTargets(
  workflow: BusinessWorkflowDoc,
  currentNodeId: string | null,
): WorkflowRollbackTarget[] {
  const nodes = sortedWorkflowNodes(workflow)
  if (!currentNodeId) return []
  const current = nodes.find((n) => n.id === currentNodeId)
  if (!current) return []
  return nodes
    .filter((n) => n.order < current.order)
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      order: n.order,
      hint: stageHint(n.label),
    }))
}

export function suggestRollbackTargetForCancellation(
  workflow: BusinessWorkflowDoc,
  currentNodeId: string | null,
): string | null {
  const nodes = sortedWorkflowNodes(workflow)
  const scheduleNode = nodes.find((n) => /schedul|calendar|dispatch|resource/.test(n.label.toLowerCase()))
  if (scheduleNode && scheduleNode.order < (nodes.find((n) => n.id === currentNodeId)?.order ?? Infinity)) {
    return scheduleNode.id
  }
  const targets = listWorkflowRollbackTargets(workflow, currentNodeId)
  return targets.length > 0 ? targets[targets.length - 1]!.nodeId : null
}

export function completedNodeIdsBeforeTarget(
  workflow: BusinessWorkflowDoc,
  targetNodeId: string,
): string[] {
  const nodes = sortedWorkflowNodes(workflow)
  const target = nodes.find((n) => n.id === targetNodeId)
  if (!target) return []
  return nodes.filter((n) => n.order < target.order).map((n) => n.id)
}

export function applyWorkflowRollback(
  state: QuoteInternalWorkflowState,
  workflow: BusinessWorkflowDoc,
  targetNodeId: string,
  byUserId: string | null,
  note?: string,
): QuoteInternalWorkflowState {
  const nodes = sortedWorkflowNodes(workflow)
  const target = nodes.find((n) => n.id === targetNodeId)
  if (!target) return state

  const completedNodeIds = completedNodeIdsBeforeTarget(workflow, targetNodeId)

  return {
    ...state,
    completedNodeIds,
    pendingNodeIds: [],
    history: [
      ...state.history,
      {
        at: new Date().toISOString(),
        action: "rollback",
        nodeId: targetNodeId,
        nodeLabel: target.label,
        byUserId,
        note: note?.trim() || undefined,
      },
    ],
  }
}

export function rollbackRemovesCalendarByDefault(
  workflow: BusinessWorkflowDoc,
  currentNodeId: string | null,
  targetNodeId: string,
): boolean {
  const nodes = sortedWorkflowNodes(workflow)
  const current = currentNodeId ? nodes.find((n) => n.id === currentNodeId) : null
  const target = nodes.find((n) => n.id === targetNodeId)
  if (!target) return false
  const targetIsSchedule = /schedul|calendar|dispatch|resource/.test(target.label.toLowerCase())
  const currentIsAfterSchedule =
    current != null &&
    nodes.some(
      (n) =>
        /schedul|calendar|dispatch|resource/.test(n.label.toLowerCase()) &&
        n.order <= current.order &&
        n.order > target.order,
    )
  return currentIsAfterSchedule && !targetIsSchedule
}

export function workflowNodeById(workflow: BusinessWorkflowDoc, nodeId: string): WorkflowNode | null {
  return workflow.nodes.find((n) => n.id === nodeId) ?? null
}
