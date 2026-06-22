/**
 * Training sandbox — demo org-chart / workflow personas auto-complete assigned steps.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { readAssignedDemoUserId, mergeCalendarAssigneeMetadata } from "./calendarAssignee"
import {
  applyMarkApproved,
  applySendForApproval,
  computeEstimateWorkflowActions,
  loadAccountWorkflowBundleFromMetadata,
  mergeQuoteInternalWorkflowMetadata,
  parseQuoteInternalWorkflow,
  type QuoteInternalWorkflowState,
  type WorkflowActionButton,
} from "./estimateWorkflowRuntime"
import { loadLinkableOrgUsers } from "./orgChartMembers"
import {
  isSandboxDemoUserId,
  parseSandboxDemoTeam,
  sandboxDemoMemberById,
  type SandboxDemoTeamMember,
} from "./sandboxDemoTeam"
import { parseSandboxMeta, SANDBOX_META_KEY, mergeSandboxMeta } from "./sandboxEnvironment"
import { dispatchSandboxTrafficEvent } from "./sandboxTrafficEvents"

export type SandboxDummyAutopilotPermissions = {
  approveEstimates: boolean
  completeFieldJobs: boolean
  customerReplies: boolean
  invoicing: boolean
}

export type SandboxDummyAutopilotResult = {
  ran: boolean
  actions: string[]
  reason?: string
}

const DEFAULT_PERMISSIONS: SandboxDummyAutopilotPermissions = {
  approveEstimates: true,
  completeFieldJobs: true,
  customerReplies: true,
  invoicing: true,
}

export function resolveDummyAutopilotPermissions(
  raw: SandboxDummyAutopilotPermissions | Partial<SandboxDummyAutopilotPermissions> | undefined,
): SandboxDummyAutopilotPermissions {
  if (!raw) return { ...DEFAULT_PERMISSIONS }
  return {
    approveEstimates: raw.approveEstimates !== false,
    completeFieldJobs: raw.completeFieldJobs !== false,
    customerReplies: raw.customerReplies !== false,
    invoicing: raw.invoicing !== false,
  }
}

function demoCanApprove(member: SandboxDemoTeamMember, perms: SandboxDummyAutopilotPermissions): boolean {
  if (!perms.approveEstimates) return false
  return member.role === "office_manager" || member.role === "corporate_internal" || member.role === "corporate_management"
}

function demoCanCompleteField(member: SandboxDemoTeamMember, perms: SandboxDummyAutopilotPermissions): boolean {
  if (!perms.completeFieldJobs) return false
  return member.role === "user" || member.role === "corporate_external" || member.role === "office_manager"
}

function demoCanInvoice(member: SandboxDemoTeamMember, perms: SandboxDummyAutopilotPermissions): boolean {
  if (!perms.invoicing) return false
  return member.role === "corporate_internal" || member.role === "office_manager"
}

function isDemoAssignee(action: WorkflowActionButton): boolean {
  const id = action.assignee?.id
  return Boolean(id && (action.assignee?.isDemo || isSandboxDemoUserId(id)))
}

async function persistQuoteWorkflow(
  supabase: SupabaseClient,
  userId: string,
  quoteId: string,
  prevMetadata: unknown,
  nextState: QuoteInternalWorkflowState,
): Promise<void> {
  const prevMeta =
    prevMetadata && typeof prevMetadata === "object" && !Array.isArray(prevMetadata)
      ? { ...(prevMetadata as Record<string, unknown>) }
      : {}
  const nextMeta = mergeQuoteInternalWorkflowMetadata(prevMeta, nextState)
  const { error } = await supabase
    .from("quotes")
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("user_id", userId)
  if (error) throw error
}

async function logDemoAction(
  supabase: SupabaseClient,
  userId: string,
  customerId: string | null,
  demoMember: SandboxDemoTeamMember,
  summary: string,
): Promise<void> {
  await supabase.from("communication_events").insert({
    user_id: userId,
    customer_id: customerId,
    event_type: "note",
    direction: "outbound",
    subject: `Demo autopilot — ${demoMember.label}`,
    body: summary,
    unread: false,
    metadata: {
      sandbox_simulated: true,
      sandbox_dummy_autopilot: true,
      demo_user_id: demoMember.id,
      demo_user_label: demoMember.label,
    },
  })
}

async function processQuoteWorkflows(
  supabase: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown>,
  demoTeam: SandboxDemoTeamMember[],
  perms: SandboxDummyAutopilotPermissions,
  maxActions: number,
  actions: string[],
): Promise<number> {
  let used = 0
  const bundle = loadAccountWorkflowBundleFromMetadata(metadata)
  const linkableUsers = await loadLinkableOrgUsers(supabase, userId)

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, customer_id, metadata")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12)
  if (error || !quotes?.length) return used

  const quoteIds = quotes.map((q) => (q as { id: string }).id)
  const { data: itemRows } = await supabase.from("quote_items").select("quote_id").in("quote_id", quoteIds)
  const lineCountByQuote = new Map<string, number>()
  for (const row of itemRows ?? []) {
    const qid = (row as { quote_id?: string }).quote_id
    if (!qid) continue
    lineCountByQuote.set(qid, (lineCountByQuote.get(qid) ?? 0) + 1)
  }

  for (const row of quotes) {
    if (used >= maxActions) break
    const quote = row as {
      id: string
      customer_id?: string | null
      metadata?: unknown
    }
    const lineCount = lineCountByQuote.get(quote.id) ?? 0
    if (lineCount < 1) continue

    let state = parseQuoteInternalWorkflow(quote.metadata)
    const computed = computeEstimateWorkflowActions({
      workflow: bundle.workflow,
      orgChart: bundle.orgChart,
      externalContacts: bundle.externalContacts,
      linkableUsers,
      state,
      quoteHasLineItems: true,
      canBypassApprovals: false,
    })

    const pendingApproval = computed.find((a) => a.kind === "mark_approved" && isDemoAssignee(a) && !a.disabled)
    if (pendingApproval && used < maxActions) {
      const member = sandboxDemoMemberById(demoTeam, pendingApproval.assignee?.id ?? "")
      if (member && demoCanApprove(member, perms)) {
        const node = bundle.workflow.nodes.find((n) => n.id === pendingApproval.nodeId)
        if (node) {
          state = applyMarkApproved(state, node, member.id)
          await persistQuoteWorkflow(supabase, userId, quote.id, quote.metadata, state)
          await logDemoAction(
            supabase,
            userId,
            quote.customer_id ?? null,
            member,
            `Approved workflow step “${node.label}”.`,
          )
          actions.push(`${member.label} approved “${node.label}”`)
          used++
          continue
        }
      }
    }

    const sendApproval = computed.find((a) => a.kind === "send_for_approval" && isDemoAssignee(a) && !a.disabled)
    if (sendApproval && used < maxActions) {
      const member = sandboxDemoMemberById(demoTeam, sendApproval.assignee?.id ?? "")
      if (member && demoCanApprove(member, perms)) {
        const node = bundle.workflow.nodes.find((n) => n.id === sendApproval.nodeId)
        if (node) {
          state = applySendForApproval(state, node, member.id)
          await persistQuoteWorkflow(supabase, userId, quote.id, quote.metadata, state)
          actions.push(`Routed “${node.label}” to ${member.label} for approval`)
          used++
        }
      }
    }
  }

  return used
}

async function processCalendarJobs(
  supabase: SupabaseClient,
  userId: string,
  demoTeam: SandboxDemoTeamMember[],
  perms: SandboxDummyAutopilotPermissions,
  maxActions: number,
  actions: string[],
): Promise<number> {
  let used = 0
  const nowIso = new Date().toISOString()

  const { data: events, error } = await supabase
    .from("calendar_events")
    .select("id, title, start_at, customer_id, metadata, completed_at")
    .eq("user_id", userId)
    .is("removed_at", null)
    .is("completed_at", null)
    .lte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(20)
  if (error || !events?.length) return used

  for (const ev of events) {
    if (used >= maxActions) break
    const row = ev as {
      id: string
      title?: string
      customer_id?: string | null
      metadata?: unknown
    }
    const demoId = readAssignedDemoUserId(row.metadata)
    if (!demoId) continue
    const member = sandboxDemoMemberById(demoTeam, demoId)
    if (!member || !demoCanCompleteField(member, perms)) continue

    const completedIso = new Date().toISOString()
    const nextMeta = mergeCalendarAssigneeMetadata(row.metadata, demoId, {
      sandbox_dummy_autopilot_completed: true,
      completion_note: `Marked complete by demo autopilot (${member.label}).`,
    })
    const { error: upErr } = await supabase
      .from("calendar_events")
      .update({ completed_at: completedIso, metadata: nextMeta, updated_at: completedIso })
      .eq("id", row.id)
    if (upErr) continue

    await logDemoAction(
      supabase,
      userId,
      row.customer_id ?? null,
      member,
      `Completed scheduled job “${row.title ?? "Job"}”.`,
    )
    actions.push(`${member.label} completed “${row.title ?? "job"}”`)
    used++
  }

  return used
}

async function processInvoicingSteps(
  supabase: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown>,
  demoTeam: SandboxDemoTeamMember[],
  perms: SandboxDummyAutopilotPermissions,
  maxActions: number,
  actions: string[],
): Promise<number> {
  if (!perms.invoicing) return 0
  let used = 0
  const bundle = loadAccountWorkflowBundleFromMetadata(metadata)
  const billingNode = bundle.workflow.nodes.find((n) => /bill|invoice|accounting/i.test(n.label))
  if (!billingNode) return 0

  const assigneeId = billingNode.assignedUserId
  const member = sandboxDemoMemberById(demoTeam, assigneeId ?? "")
  if (!member || !demoCanInvoice(member, perms)) return 0

  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, customer_id, metadata")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(8)
  if (!quotes?.length) return 0

  for (const q of quotes) {
    if (used >= maxActions) break
    const quote = q as { id: string; customer_id?: string | null; metadata?: unknown }
    const state = parseQuoteInternalWorkflow(quote.metadata)
    if (state.completedNodeIds.includes(billingNode.id)) continue
    if (!state.completedNodeIds.length) continue

    const next = applyMarkApproved(state, billingNode, member.id)
    await persistQuoteWorkflow(supabase, userId, quote.id, quote.metadata, next)
    await logDemoAction(
      supabase,
      userId,
      quote.customer_id ?? null,
      member,
      `Recorded billing step “${billingNode.label}” (simulated invoice).`,
    )
    actions.push(`${member.label} completed billing step`)
    used++
  }

  return used
}

export async function runSandboxDummyAutopilot(
  supabase: SupabaseClient,
  userId: string,
  profileMetadata: Record<string, unknown>,
): Promise<SandboxDummyAutopilotResult> {
  const sandboxMeta = parseSandboxMeta(profileMetadata[SANDBOX_META_KEY])
  if (!sandboxMeta?.dummyUsersAutopilotEnabled) {
    return { ran: false, actions: [], reason: "autopilot_off" }
  }

  const intervalMin = sandboxMeta.dummyUsersAutopilotIntervalMinutes ?? 2
  const lastAt = sandboxMeta.dummyUsersAutopilotLastAt
    ? new Date(sandboxMeta.dummyUsersAutopilotLastAt).getTime()
    : 0
  const now = Date.now()
  if (lastAt && now - lastAt < intervalMin * 60_000) {
    return { ran: false, actions: [], reason: "too_soon" }
  }

  const demoTeam = parseSandboxDemoTeam(profileMetadata.sandbox_demo_team)
  const perms = resolveDummyAutopilotPermissions(sandboxMeta.dummyUsersAutopilotPermissions)
  const actions: string[] = []
  const maxPerTick = 6

  let used = 0
  used += await processQuoteWorkflows(supabase, userId, profileMetadata, demoTeam, perms, maxPerTick - used, actions)
  if (used < maxPerTick) {
    used += await processCalendarJobs(supabase, userId, demoTeam, perms, maxPerTick - used, actions)
  }
  if (used < maxPerTick) {
    used += await processInvoicingSteps(supabase, userId, profileMetadata, demoTeam, perms, maxPerTick - used, actions)
  }

  const nextMeta = mergeSandboxMeta(profileMetadata, { dummyUsersAutopilotLastAt: new Date().toISOString() })
  await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", userId)

  if (actions.length) dispatchSandboxTrafficEvent()

  return { ran: true, actions }
}

export async function setSandboxDummyAutopilot(
  supabase: SupabaseClient,
  userId: string,
  profileMetadata: Record<string, unknown>,
  enabled: boolean,
  intervalMinutes = 2,
  permissions?: Partial<SandboxDummyAutopilotPermissions>,
): Promise<void> {
  const prev = parseSandboxMeta(profileMetadata[SANDBOX_META_KEY])
  const nextMeta = mergeSandboxMeta(profileMetadata, {
    dummyUsersAutopilotEnabled: enabled,
    dummyUsersAutopilotIntervalMinutes: Math.max(1, Math.min(15, intervalMinutes)),
    dummyUsersAutopilotPermissions: {
      ...resolveDummyAutopilotPermissions(prev?.dummyUsersAutopilotPermissions),
      ...permissions,
    },
    ...(enabled ? {} : { dummyUsersAutopilotLastAt: undefined }),
  })
  const { error } = await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", userId)
  if (error) throw error
}
