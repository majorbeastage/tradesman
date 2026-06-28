/**
 * Infer the customer's current business-workflow step from profile paperwork signals.
 * Used on the full customer profile so staff see one clear "where we are" status.
 */

import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import type { CustomerProfileBundle } from "./customerProfileData"
import type { CustomerWorkflowSnapshot } from "./customerWorkflowRouting"
import { resolveSequentialWorkflowProgress } from "./customerWorkflowProgress"
import { calendarEventDisplayStatus } from "./calendarEventProfile"
import { estimateDisplayStatus } from "./customerDocumentStatus"

export type InferredCustomerWorkflowStep = {
  currentNodeId: string | null
  currentNodeLabel: string | null
  completedNodeIds: string[]
  summary: string
  reason: string
}

type StageKey =
  | "intake"
  | "estimate"
  | "approval"
  | "schedule"
  | "field"
  | "parts"
  | "billing"
  | "complete"

const STAGE_ORDER: StageKey[] = ["intake", "estimate", "approval", "schedule", "field", "parts", "billing", "complete"]

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

function sortedWorkflowNodes(workflow: BusinessWorkflowDoc): WorkflowNode[] {
  return [...workflow.nodes].sort((a, b) => a.order - b.order || a.y - b.y)
}

function highestStageReached(signals: Record<StageKey, boolean>): StageKey {
  let reached: StageKey = "intake"
  for (const key of STAGE_ORDER) {
    if (signals[key]) reached = key
    else break
  }
  return reached
}

function collectSignals(bundle: CustomerProfileBundle): Record<StageKey, boolean> {
  const quotes = bundle.quotes
  const events = bundle.calendarEvents
  const hasSentQuote = quotes.some((q) => {
    const st = estimateDisplayStatus(q.status, q.metadata).toLowerCase()
    return st.includes("sent") || st.includes("accepted") || st.includes("approved")
  })
  const hasUpcomingJob = events.some((ev) => {
    const st = calendarEventDisplayStatus(ev)
    return st === "Upcoming" || st === "Recurring"
  })
  const hasCompletedJob = events.some((ev) => calendarEventDisplayStatus(ev) === "Complete")
  const hasWorkOrder = bundle.workOrders.length > 0
  const hasPo = bundle.purchaseOrders.length > 0
  const hasInvoice = bundle.invoices.length > 0
  const hasReceipt = bundle.receipts.length > 0
  const paidInvoice = bundle.invoices.some((inv) => (inv.status ?? "").toLowerCase().includes("paid"))

  return {
    intake: bundle.leads.length > 0 || bundle.commEvents.length > 0 || quotes.length > 0,
    estimate: hasSentQuote,
    approval: hasSentQuote,
    schedule: hasUpcomingJob || hasCompletedJob,
    field: hasCompletedJob || hasWorkOrder,
    parts: hasPo,
    billing: hasInvoice,
    complete: paidInvoice || hasReceipt,
  }
}

function nodeForStage(nodes: WorkflowNode[], stage: StageKey): WorkflowNode | null {
  for (const node of nodes) {
    if (stageForNodeLabel(node.label) === stage) return node
  }
  return null
}

function nextStageAfter(stage: StageKey): StageKey | null {
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1] ?? null
}

/** Pick the workflow node the customer is on now based on paperwork + calendar signals. */
export function inferCustomerWorkflowStep(
  workflow: BusinessWorkflowDoc,
  bundle: CustomerProfileBundle,
  quoteSnapshot: CustomerWorkflowSnapshot | null,
): InferredCustomerWorkflowStep {
  const nodes = sortedWorkflowNodes(workflow)
  if (nodes.length === 0) {
    return {
      currentNodeId: null,
      currentNodeLabel: null,
      completedNodeIds: [],
      summary: "No workflow steps configured",
      reason: "Add steps in Business workflow to track customer progress.",
    }
  }

  if (quoteSnapshot?.pendingNodeIds?.length) {
    const pendingId = quoteSnapshot.pendingNodeIds[0] ?? null
    const pendingNode = pendingId ? nodes.find((n) => n.id === pendingId) ?? null : null
    if (pendingNode) {
      return {
        currentNodeId: pendingNode.id,
        currentNodeLabel: pendingNode.label,
        completedNodeIds: quoteSnapshot.completedNodeIds,
        summary: `Awaiting approval: ${pendingNode.label}`,
        reason: "An estimate workflow step is waiting for approval.",
      }
    }
  }

  if (quoteSnapshot?.activeNodeId) {
    const active = nodes.find((n) => n.id === quoteSnapshot.activeNodeId) ?? null
    if (active) {
      return {
        currentNodeId: active.id,
        currentNodeLabel: active.label,
        completedNodeIds: quoteSnapshot.completedNodeIds,
        summary: `Currently at: ${active.label}`,
        reason: "Based on estimate workflow approvals and sign-offs on file.",
      }
    }
  }

  const sequential = resolveSequentialWorkflowProgress(workflow, bundle.customer.metadata)
  if (sequential.currentNodeLabel) {
    return {
      currentNodeId: sequential.currentNodeId,
      currentNodeLabel: sequential.currentNodeLabel,
      completedNodeIds: sequential.completedNodeIds,
      summary:
        sequential.currentNodeLabel === "Completed"
          ? "Workflow complete"
          : `Currently at: ${sequential.currentNodeLabel}`,
      reason:
        sequential.completedNodeIds.length > 0
          ? "Based on workflow steps marked complete for this customer."
          : "Mark earlier steps complete in the workflow chart as you work the job.",
    }
  }

  const signals = collectSignals(bundle)
  const reached = highestStageReached(signals)
  const next = nextStageAfter(reached)
  const currentStage = next ?? reached
  const currentNode = nodeForStage(nodes, currentStage) ?? nodes[nodes.length - 1] ?? null

  const completedNodeIds: string[] = []
  for (const node of nodes) {
    const st = stageForNodeLabel(node.label)
    if (!st) continue
    if (STAGE_ORDER.indexOf(st) < STAGE_ORDER.indexOf(currentStage)) completedNodeIds.push(node.id)
  }

  const reasonParts: string[] = []
  if (bundle.quotes.length) reasonParts.push(`${bundle.quotes.length} estimate(s)`)
  if (bundle.calendarEvents.length) reasonParts.push(`${bundle.calendarEvents.length} calendar event(s)`)
  if (bundle.workOrders.length) reasonParts.push(`${bundle.workOrders.length} work order(s)`)
  if (bundle.invoices.length) reasonParts.push(`${bundle.invoices.length} invoice(s)`)

  return {
    currentNodeId: currentNode?.id ?? null,
    currentNodeLabel: currentNode?.label ?? null,
    completedNodeIds,
    summary: currentNode ? `Currently at: ${currentNode.label}` : "Workflow step could not be determined",
    reason:
      reasonParts.length > 0
        ? `Auto-detected from ${reasonParts.join(", ")} on this profile.`
        : "Auto-detected from customer profile activity.",
  }
}

/** True when the active workflow step should open the estimate PDF on the profile (not the Estimates editor). */
export function shouldOpenEstimatePdfFromWorkflowStep(nodeLabel: string | null | undefined): boolean {
  if (!nodeLabel?.trim()) return true
  const l = nodeLabel.toLowerCase()
  if (/sent to customer|email to customer|deliver.*customer|customer delivery/.test(l)) return false
  const stage = stageForNodeLabel(nodeLabel)
  if (stage === "estimate" || stage === "approval") return true
  return /estimate|quote|bid|proposal/.test(l) && !/work order|\bwo\b/.test(l)
}
