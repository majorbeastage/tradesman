import { useCallback, useEffect, useMemo, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { theme } from "../../styles/theme"
import { loadCustomerProfileBundle } from "../../lib/customerProfileData"
import { formatAppError } from "../../lib/formatAppError"
import {
  loadAccountWorkflowBundleFromMetadata,
  parseQuoteInternalWorkflow,
  resolveWorkflowNodeAssignee,
} from "../../lib/estimateWorkflowRuntime"
import { loadCustomerWorkflowSnapshotFromProfile } from "../../lib/customerWorkflowRouting"
import { buildCustomerWorkflowStepCompleteUpdate } from "../../lib/customerWorkflowProgress"
import { inferCustomerWorkflowStep } from "../../lib/inferCustomerWorkflowStep"
import { inferWorkflowStepIntention, intentionPrimaryButtonLabel } from "../../lib/workflowStepIntention"
import { loadLinkableOrgUsers } from "../../lib/orgChartMembers"
import type { CustomerQuickViewTabId } from "./customerQuickViewTabs"

type CustomerLite = {
  id: string
  metadata?: unknown
}

type Props = {
  customer: CustomerLite
  supabase: SupabaseClient | null
  userId: string
  profileMetadata: Record<string, unknown> | null
  onGoToTab: (tab: CustomerQuickViewTabId) => void
  setPage?: (page: string) => void
  onOpenQuote?: (quoteId: string) => void
  onCustomerMetadataUpdated?: (metadata: unknown) => void
}

function ownerLabel(displayName: string | null | undefined): string {
  const n = displayName?.trim()
  if (!n || /unassigned/i.test(n)) return "Unassigned"
  return n
}

function targetTabForIntention(
  intention: ReturnType<typeof inferWorkflowStepIntention>,
): CustomerQuickViewTabId {
  switch (intention) {
    case "create_work_order":
      return "work_orders"
    case "create_purchase_order":
      return "purchase_orders"
    case "schedule_resources":
      return "scheduling"
    case "bill_customer":
      return "customer_payments"
    case "complete_job":
      return "receipts"
    case "send_to_customer":
    case "send_to_approver":
    case "await_approval":
    case "internal_handoff":
      return "estimates"
    default:
      return "workflow"
  }
}

function actionLabelForIntention(
  intention: ReturnType<typeof inferWorkflowStepIntention>,
  stepLabel: string | null,
): string {
  if (intention === "internal_handoff" || intention === "unknown") {
    return intentionPrimaryButtonLabel(intention, [], stepLabel ?? undefined)
  }
  switch (intention) {
    case "create_work_order":
      return "Go to work orders"
    case "create_purchase_order":
      return "Go to purchase orders"
    case "schedule_resources":
      return "Open scheduling"
    case "bill_customer":
      return "Go to payments"
    case "complete_job":
      return "Go to receipts"
    case "send_to_customer":
      return "Open estimate delivery"
    case "send_to_approver":
    case "await_approval":
      return "Open estimate approvals"
    default:
      return stepLabel ? `Complete ${stepLabel}` : "Open workflow"
  }
}

function shouldCompleteStepOnAction(intention: ReturnType<typeof inferWorkflowStepIntention>): boolean {
  return intention === "internal_handoff" || intention === "unknown"
}

export function CustomerQuickViewNextSteps({
  customer,
  supabase,
  userId,
  profileMetadata,
  onGoToTab,
  setPage,
  onOpenQuote,
  onCustomerMetadataUpdated,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [completeBusy, setCompleteBusy] = useState(false)

  const workflowBundle = useMemo(
    () => (profileMetadata ? loadAccountWorkflowBundleFromMetadata(profileMetadata) : null),
    [profileMetadata],
  )

  const [stepLabel, setStepLabel] = useState<string | null>(null)
  const [owner, setOwner] = useState("Unassigned")
  const [reason, setReason] = useState("")
  const [actionLabel, setActionLabel] = useState("Open workflow")
  const [targetTab, setTargetTab] = useState<CustomerQuickViewTabId>("workflow")
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [completedNodeIds, setCompletedNodeIds] = useState<string[]>([])
  const [stepIntention, setStepIntention] = useState<ReturnType<typeof inferWorkflowStepIntention>>("unknown")

  const load = useCallback(async () => {
    if (!supabase || !userId || !customer.id) return
    setLoading(true)
    setError("")
    try {
      const [bundle, users] = await Promise.all([
        loadCustomerProfileBundle(supabase, userId, customer.id),
        loadLinkableOrgUsers(supabase, userId),
      ])

      if (!workflowBundle) {
        setStepLabel(null)
        setOwner("—")
        setReason("Configure a business workflow to track next steps.")
        setActionLabel("Open settings")
        setTargetTab("workflow")
        setQuoteId(null)
        return
      }

      const quoteForWorkflow =
        bundle.quotes.find((q) => parseQuoteInternalWorkflow(q.metadata).pendingNodeIds.length > 0) ??
        bundle.quotes[0] ??
        null
      const quoteWorkflowState = quoteForWorkflow ? parseQuoteInternalWorkflow(quoteForWorkflow.metadata) : null
      const workflowSnapshot = loadCustomerWorkflowSnapshotFromProfile(
        profileMetadata,
        quoteForWorkflow?.id ?? null,
        quoteWorkflowState,
        bundle.customer.metadata,
      )
      const inferred = inferCustomerWorkflowStep(workflowBundle.workflow, bundle, workflowSnapshot)
      const currentNode = inferred.currentNodeId
        ? workflowBundle.workflow.nodes.find((n) => n.id === inferred.currentNodeId) ?? null
        : null

      setStepLabel(inferred.currentNodeLabel)
      setReason(inferred.reason)
      setQuoteId(quoteForWorkflow?.id ?? null)
      setCurrentNodeId(inferred.currentNodeId)
      setCompletedNodeIds(inferred.completedNodeIds)

      if (currentNode) {
        const assignee = resolveWorkflowNodeAssignee(
          currentNode,
          workflowBundle.orgChart,
          workflowBundle.externalContacts,
          users,
        )
        const ownerName = ownerLabel(assignee.displayName)
        setOwner(ownerName)
        const intention = inferWorkflowStepIntention(currentNode, "generic")
        setStepIntention(intention)
        setTargetTab(targetTabForIntention(intention))
        setActionLabel(actionLabelForIntention(intention, currentNode.label))
      } else {
        setOwner("—")
        setStepIntention("unknown")
        setTargetTab("workflow")
        setActionLabel("Open workflow")
        setCurrentNodeId(null)
        setCompletedNodeIds([])
      }
    } catch (e) {
      setError(formatAppError(e))
    } finally {
      setLoading(false)
    }
  }, [supabase, userId, customer.id, customer.metadata, profileMetadata, workflowBundle])

  useEffect(() => {
    void load()
  }, [load])

  async function completeCurrentStep() {
    if (!supabase || !userId || !customer.id || !workflowBundle || !currentNodeId) return
    setCompleteBusy(true)
    setError("")
    try {
      const update = buildCustomerWorkflowStepCompleteUpdate({
        workflow: workflowBundle.workflow,
        orgChart: workflowBundle.orgChart,
        customerMetadata: customer.metadata,
        completedNodeIds,
        nodeId: currentNodeId,
        quoteId,
      })
      const nowIso = new Date().toISOString()
      const { error: custErr } = await supabase
        .from("customers")
        .update({
          metadata: update.metadata,
          job_pipeline_status: update.jobPipelineStatus,
          updated_at: nowIso,
        })
        .eq("id", customer.id)
        .eq("user_id", userId)
      if (custErr) throw custErr
      onCustomerMetadataUpdated?.(update.metadata)
      await load()
    } catch (e) {
      setError(formatAppError(e))
    } finally {
      setCompleteBusy(false)
    }
  }

  function handleAction() {
    if (shouldCompleteStepOnAction(stepIntention) && currentNodeId) {
      void completeCurrentStep()
      return
    }
    if (targetTab === "estimates" && quoteId && onOpenQuote) {
      onOpenQuote(quoteId)
      if (setPage) setPage("quotes")
      return
    }
    onGoToTab(targetTab)
    if (targetTab === "scheduling" && setPage) setPage("calendar")
  }

  if (loading) {
    return (
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          background: "#f8fafc",
          fontSize: 12,
          color: "#64748b",
        }}
      >
        Loading next steps…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 12, borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", fontSize: 12, color: "#b91c1c" }}>
        {error}
      </div>
    )
  }

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: "linear-gradient(135deg, #f8fafc 0%, #fff 55%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${theme.border}`,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.06, textTransform: "uppercase" }}>
          Next steps
        </div>
        <button
          type="button"
          onClick={() => onGoToTab("workflow")}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            cursor: "pointer",
          }}
        >
          Workflow chart
        </button>
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>Current step</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: theme.text, lineHeight: 1.3 }}>
              {stepLabel ?? "No active step"}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>Owner</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", maxWidth: 140 }}>{owner}</div>
          </div>
        </div>
        {reason ? (
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{reason}</p>
        ) : null}
        <button
          type="button"
          disabled={completeBusy}
          onClick={handleAction}
          style={{
            justifySelf: "start",
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: completeBusy ? "wait" : "pointer",
          }}
        >
          {completeBusy ? "Saving…" : actionLabel}
        </button>
      </div>
    </div>
  )
}
