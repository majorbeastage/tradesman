/**
 * Live workflow is authoritative. Customer/quote progress may hold orphaned node UUIDs
 * from earlier workflow edits — match by label / history, then soft-remap orphans by order.
 */

import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import { sortedWorkflowNodes } from "./businessWorkflow"

export function normalizeWorkflowLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function workflowLabelsRoughlyMatch(a: string, b: string): boolean {
  const na = normalizeWorkflowLabel(a)
  const nb = normalizeWorkflowLabel(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

export type WorkflowCompletionHints = {
  completedNodeIds?: string[] | null
  /** Labels recorded when steps were completed (preferred remap key). */
  completedNodeLabels?: string[] | null
  /** Quote approval history labels / nodeLabels. */
  historyLabels?: string[] | null
}

function collectHintLabels(hints: WorkflowCompletionHints): string[] {
  const out: string[] = []
  for (const raw of hints.completedNodeLabels ?? []) {
    if (typeof raw === "string" && raw.trim()) out.push(raw.trim())
  }
  for (const raw of hints.historyLabels ?? []) {
    if (typeof raw === "string" && raw.trim()) out.push(raw.trim())
  }
  return out
}

/**
 * Resolve which live node IDs should be treated as completed given stored progress.
 * Never invents completion beyond what history/IDs/orphan-count support.
 */
export function resolveLiveCompletedNodeIds(
  workflow: BusinessWorkflowDoc,
  hints: WorkflowCompletionHints,
): string[] {
  const nodes = sortedWorkflowNodes(workflow)
  if (nodes.length === 0) return []

  const liveIds = new Set(nodes.map((n) => n.id))
  const storedIds = (hints.completedNodeIds ?? []).filter((id) => typeof id === "string" && id.trim())
  const matched = new Set<string>()

  for (const id of storedIds) {
    if (liveIds.has(id)) matched.add(id)
  }

  const labels = collectHintLabels(hints)
  for (const node of nodes) {
    if (matched.has(node.id)) continue
    if (labels.some((l) => workflowLabelsRoughlyMatch(l, node.label))) {
      matched.add(node.id)
    }
  }

  const orphanCount = storedIds.filter((id) => !liveIds.has(id)).length
  if (orphanCount > 0 && matched.size === 0) {
    // Legacy lock: progress IDs all orphaned after workflow rebuild — credit earliest live steps.
    const credit = Math.min(orphanCount, nodes.length)
    for (let i = 0; i < credit; i++) matched.add(nodes[i]!.id)
  } else if (orphanCount > 0) {
    // Partial orphans: fill remaining earliest incomplete live nodes up to orphan count.
    let remaining = orphanCount
    for (const node of nodes) {
      if (remaining <= 0) break
      if (matched.has(node.id)) continue
      matched.add(node.id)
      remaining -= 1
    }
  }

  return nodes.filter((n) => matched.has(n.id)).map((n) => n.id)
}

export function isLiveWorkflowNodeComplete(
  workflow: BusinessWorkflowDoc,
  node: WorkflowNode,
  hints: WorkflowCompletionHints,
): boolean {
  return resolveLiveCompletedNodeIds(workflow, hints).includes(node.id)
}

export function canBypassWorkflowProcessGates(
  profileRole: string | null | undefined,
  opts?: {
    userId?: string | null
    accountOwnerUserId?: string | null
    processOverseerUserIds?: string[] | null
    estimateBypassEnabled?: boolean
  },
): boolean {
  const role = (profileRole ?? "").trim().toLowerCase()
  if (
    role === "admin" ||
    role === "office_manager" ||
    role === "corporate_management" ||
    role === "account_owner" ||
    role === "owner" ||
    role === "ceo"
  ) {
    return true
  }
  if (opts?.estimateBypassEnabled) return true
  const uid = opts?.userId?.trim()
  if (uid && opts?.accountOwnerUserId?.trim() && uid === opts.accountOwnerUserId.trim()) return true
  if (uid && (opts?.processOverseerUserIds ?? []).includes(uid)) return true
  return false
}
