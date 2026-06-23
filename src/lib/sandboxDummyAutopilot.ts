/**
 * Training sandbox — demo org-chart / workflow personas auto-advance assigned steps.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { BusinessWorkflowDoc, WorkflowNode } from "./businessWorkflow"
import type { OrganizationChartDoc } from "./organizationChart"
import type { ExternalContactsDoc } from "./externalContacts"
import { readAssignedDemoUserId, mergeCalendarAssigneeMetadata } from "./calendarAssignee"
import {
  applyMarkApproved,
  applySendForApproval,
  computeEstimateWorkflowActions,
  loadAccountWorkflowBundleFromMetadata,
  mergeQuoteInternalWorkflowMetadata,
  parseQuoteInternalWorkflow,
  resolveWorkflowNodeAssignee,
  type QuoteInternalWorkflowState,
} from "./estimateWorkflowRuntime"
import { loadLinkableOrgUsers } from "./orgChartMembers"
import {
  isSandboxDemoUserId,
  parseSandboxDemoTeam,
  sandboxDemoMemberById,
  type SandboxDemoTeamMember,
} from "./sandboxDemoTeam"
import { mergeSandboxWorkflowSeedMetadata } from "./sandboxWorkflowSeed"
import { parseSandboxMeta, SANDBOX_META_KEY, mergeSandboxMeta } from "./sandboxEnvironment"
import { dispatchSandboxTrafficEvent } from "./sandboxTrafficEvents"
import {
  mergeCustomerWorkflowMeta,
  snapshotFromQuoteWorkflow,
} from "./customerWorkflowRouting"
import { insertQuoteItemRowSafe } from "./quoteItemsDb"

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

function demoCanHandleReception(member: SandboxDemoTeamMember, perms: SandboxDummyAutopilotPermissions): boolean {
  if (!perms.customerReplies) return false
  return member.role === "office_manager" || member.role === "corporate_management"
}

function nodeLabelText(node: WorkflowNode, orgChart: OrganizationChartDoc): string {
  const org = node.orgChartNodeId ? orgChart.nodes.find((n) => n.id === node.orgChartNodeId) : null
  return `${node.label} ${org?.label ?? ""}`.toLowerCase()
}

/** Match a workflow step label + org chart link to the best demo persona. */
export function resolveDemoMemberForWorkflowNode(
  node: WorkflowNode,
  orgChart: OrganizationChartDoc,
  externalContacts: ExternalContactsDoc,
  linkableUsers: Awaited<ReturnType<typeof loadLinkableOrgUsers>>,
  demoTeam: SandboxDemoTeamMember[],
): SandboxDemoTeamMember | null {
  const assignee = resolveWorkflowNodeAssignee(node, orgChart, externalContacts, linkableUsers)
  if (assignee.id && isSandboxDemoUserId(assignee.id)) {
    return sandboxDemoMemberById(demoTeam, assignee.id)
  }

  const text = nodeLabelText(node, orgChart)
  const pick = (patterns: RegExp[]) => {
    for (const m of demoTeam) {
      const dept = `${m.department ?? ""} ${m.title ?? ""}`.toLowerCase()
      if (patterns.some((p) => p.test(text) || p.test(dept))) return m
    }
    return null
  }

  if (/intake|reception|customer care|schedule resource/.test(text)) {
    return pick([/reception|office|customer care/, /maria/]) ?? demoTeam.find((m) => m.role === "office_manager") ?? null
  }
  if (/parts|supplier/.test(text) && node.externalContactId) return null
  if (/accounting|bill customer/.test(text)) return pick([/accounting/, /lee/]) ?? null
  if (/shop manager|signed by shop|estimate approval/.test(text) && !/accounting|parts/.test(text)) {
    return pick([/shop|office/, /maria/]) ?? null
  }
  if (/work order|field|job complete|technician/.test(text)) {
    return pick([/field/, /jake|sam/]) ?? null
  }
  if (/estimate is built|estimate built/.test(text)) {
    return pick([/office|maria/]) ?? null
  }
  return null
}

function memberCanActOnNode(
  member: SandboxDemoTeamMember,
  node: WorkflowNode,
  orgChart: OrganizationChartDoc,
  perms: SandboxDummyAutopilotPermissions,
  actionKind: "approve" | "send" | "reception",
): boolean {
  if (actionKind === "reception") return demoCanHandleReception(member, perms)
  const text = nodeLabelText(node, orgChart)
  if (/field|work order|job complete/.test(text)) return demoCanCompleteField(member, perms)
  if (/accounting|bill/.test(text)) return demoCanInvoice(member, perms)
  return demoCanApprove(member, perms)
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

async function syncCustomerWorkflowSnapshot(
  supabase: SupabaseClient,
  userId: string,
  customerId: string | null | undefined,
  workflow: BusinessWorkflowDoc,
  orgChart: OrganizationChartDoc,
  quoteId: string,
  state: QuoteInternalWorkflowState,
): Promise<void> {
  if (!customerId) return
  const snapshot = snapshotFromQuoteWorkflow(workflow, orgChart, quoteId, state)
  const { data: row } = await supabase.from("customers").select("metadata").eq("id", customerId).eq("user_id", userId).maybeSingle()
  const merged = mergeCustomerWorkflowMeta(row?.metadata, {
    quoteId,
    activeNodeId: snapshot.activeNodeId,
    departmentKey: snapshot.departmentKey,
  })
  await supabase.from("customers").update({ metadata: merged, updated_at: new Date().toISOString() }).eq("id", customerId).eq("user_id", userId)
}

async function logDemoAction(
  supabase: SupabaseClient,
  userId: string,
  customerId: string | null,
  demoMember: SandboxDemoTeamMember,
  summary: string,
  extra?: { internalHandoffTo?: SandboxDemoTeamMember | null; channel?: "note" | "sms" },
): Promise<void> {
  await supabase.from("communication_events").insert({
    user_id: userId,
    customer_id: customerId,
    event_type: extra?.channel === "sms" ? "sms" : "note",
    direction: "outbound",
    subject: extra?.internalHandoffTo
      ? `Demo team — ${demoMember.label} → ${extra.internalHandoffTo.label}`
      : `Demo Team Autopilot — ${demoMember.label}`,
    body: summary,
    unread: false,
    metadata: {
      sandbox_simulated: true,
      sandbox_dummy_autopilot: true,
      demo_user_id: demoMember.id,
      demo_user_label: demoMember.label,
      handoff_to_demo_id: extra?.internalHandoffTo?.id ?? null,
    },
  })
}

async function ensureWorkflowAndProfileMetadata(
  supabase: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const merged = mergeSandboxWorkflowSeedMetadata(metadata)
  if (JSON.stringify(merged) !== JSON.stringify(metadata)) {
    await supabase.from("profiles").update({ metadata: merged, updated_at: new Date().toISOString() }).eq("id", userId)
  }
  return merged
}

async function ensureTrainingQuotes(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { count } = await supabase.from("quotes").select("id", { count: "exact", head: true }).eq("user_id", userId)
  if ((count ?? 0) > 0) return []

  const { data: customers } = await supabase
    .from("customers")
    .select("id, display_name, notes")
    .eq("user_id", userId)
    .order("last_activity_at", { ascending: false })
    .limit(3)

  const created: string[] = []
  for (const [idx, c] of (customers ?? []).entries()) {
    const row = c as { id: string; display_name?: string | null; notes?: string | null }
    const title = `Estimate — ${row.display_name?.trim() || "Sandbox customer"}`
    const { data: quote, error } = await supabase
      .from("quotes")
      .insert({
        user_id: userId,
        customer_id: row.id,
        status: "draft",
        metadata: { job_title: title, sandbox_autopilot_seed: true },
      })
      .select("id")
      .maybeSingle()
    if (error || !quote?.id) continue
    await insertQuoteItemRowSafe(supabase, {
      quote_id: quote.id as string,
      description: row.notes?.trim() || "Diagnostic, labor, and materials — sandbox training job",
      quantity: 1,
      unit_price: 325 + idx * 85,
    })
    created.push(quote.id as string)
  }
  return created
}

function summarizeInboundBody(body: string | null | undefined): string {
  const text = (body ?? "").trim().replace(/\s+/g, " ")
  if (!text) return "service request details"
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

async function processCustomerIntake(
  supabase: SupabaseClient,
  userId: string,
  demoTeam: SandboxDemoTeamMember[],
  perms: SandboxDummyAutopilotPermissions,
  maxActions: number,
  actions: string[],
): Promise<number> {
  if (!perms.customerReplies || maxActions < 1) return 0
  const reception =
    demoTeam.find((m) => /maria|reception|office/i.test(m.label) || m.role === "office_manager") ?? demoTeam[0]
  if (!reception || !demoCanHandleReception(reception, perms)) return 0

  const { data: comms, error } = await supabase
    .from("communication_events")
    .select("id, customer_id, body, subject, direction, created_at, metadata")
    .eq("user_id", userId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(20)
  if (error || !comms?.length) return 0

  let used = 0
  for (const row of comms) {
    if (used >= maxActions) break
    const comm = row as {
      customer_id?: string | null
      body?: string | null
      subject?: string | null
      metadata?: unknown
    }
    if (!comm.customer_id) continue
    const meta =
      comm.metadata && typeof comm.metadata === "object" && !Array.isArray(comm.metadata)
        ? (comm.metadata as Record<string, unknown>)
        : {}
    if (meta.sandbox_promotional === true) continue

    const { data: cust } = await supabase
      .from("customers")
      .select("metadata, display_name")
      .eq("id", comm.customer_id)
      .eq("user_id", userId)
      .maybeSingle()
    const custMeta =
      cust?.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
        ? (cust.metadata as Record<string, unknown>)
        : {}
    const lastIntake = typeof custMeta.sandbox_autopilot_intake_at === "string" ? custMeta.sandbox_autopilot_intake_at : ""
    if (lastIntake && Date.now() - Date.parse(lastIntake) < 45 * 60_000) continue

    const jobSummary = summarizeInboundBody(comm.body ?? comm.subject)
    const customerName =
      typeof (cust as { display_name?: string })?.display_name === "string"
        ? (cust as { display_name: string }).display_name.trim()
        : "the customer"

    await logDemoAction(
      supabase,
      userId,
      comm.customer_id,
      reception,
      `${reception.label} called ${customerName} back and captured job details: ${jobSummary}`,
      { channel: "sms" },
    )
    await supabase.from("communication_events").insert({
      user_id: userId,
      customer_id: comm.customer_id,
      event_type: "sms",
      direction: "outbound",
      body: `Hi ${customerName.split(" ")[0] || "there"} — this is ${reception.label} at Demo Plumbing. Thanks for reaching out. We noted: ${jobSummary}. Our team is routing this through the workflow now.`,
      unread: false,
      metadata: { sandbox_simulated: true, sandbox_dummy_autopilot: true, demo_user_id: reception.id },
    })

    await supabase
      .from("customers")
      .update({
        metadata: { ...custMeta, sandbox_autopilot_intake_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", comm.customer_id)
      .eq("user_id", userId)

    actions.push(`${reception.label} gathered intake info from ${customerName}`)
    used++
    break
  }

  return used
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
    const quote = row as { id: string; customer_id?: string | null; metadata?: unknown }
    if ((lineCountByQuote.get(quote.id) ?? 0) < 1) continue

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

    const pendingApproval = computed.find((a) => a.kind === "mark_approved" && !a.disabled)
    if (pendingApproval) {
      const node = bundle.workflow.nodes.find((n) => n.id === pendingApproval.nodeId)
      const member = node
        ? resolveDemoMemberForWorkflowNode(node, bundle.orgChart, bundle.externalContacts, linkableUsers, demoTeam)
        : null
      if (node && member && memberCanActOnNode(member, node, bundle.orgChart, perms, "approve")) {
        state = applyMarkApproved(state, node, member.id)
        await persistQuoteWorkflow(supabase, userId, quote.id, quote.metadata, state)
        await syncCustomerWorkflowSnapshot(supabase, userId, quote.customer_id, bundle.workflow, bundle.orgChart, quote.id, state)
        const nextNode = bundle.workflow.nodes.find((n) => !state.completedNodeIds.includes(n.id) && !state.pendingNodeIds.includes(n.id))
        const nextMember = nextNode
          ? resolveDemoMemberForWorkflowNode(nextNode, bundle.orgChart, bundle.externalContacts, linkableUsers, demoTeam)
          : null
        await logDemoAction(
          supabase,
          userId,
          quote.customer_id ?? null,
          member,
          `Completed workflow step “${node.label}”.`,
          nextMember ? { internalHandoffTo: nextMember } : undefined,
        )
        actions.push(`${member.label} approved “${node.label}”${nextMember ? ` → ${nextMember.label}` : ""}`)
        used++
        continue
      }
    }

    const sendApproval = computed.find((a) => a.kind === "send_for_approval" && !a.disabled)
    if (sendApproval) {
      const node = bundle.workflow.nodes.find((n) => n.id === sendApproval.nodeId)
      const sender =
        demoTeam.find((m) => /maria|office|estimator|reception/i.test(m.label) || m.role === "office_manager") ??
        demoTeam[0]
      if (node && sender) {
        state = applySendForApproval(state, node, sender.id)
        await persistQuoteWorkflow(supabase, userId, quote.id, quote.metadata, state)
        await syncCustomerWorkflowSnapshot(supabase, userId, quote.customer_id, bundle.workflow, bundle.orgChart, quote.id, state)
        const approver = resolveDemoMemberForWorkflowNode(node, bundle.orgChart, bundle.externalContacts, linkableUsers, demoTeam)
        await logDemoAction(
          supabase,
          userId,
          quote.customer_id ?? null,
          sender,
          `Routed estimate to “${node.label}”${approver ? ` (${approver.label})` : ""} for approval.`,
          approver ? { internalHandoffTo: approver } : undefined,
        )
        actions.push(`${sender.label} sent estimate to “${node.label}”`)
        used++
      }
    }
  }

  return used
}

async function assignUpcomingCalendarJobs(
  supabase: SupabaseClient,
  userId: string,
  demoTeam: SandboxDemoTeamMember[],
  perms: SandboxDummyAutopilotPermissions,
  maxActions: number,
  actions: string[],
): Promise<number> {
  if (!perms.completeFieldJobs || maxActions < 1) return 0
  const field =
    demoTeam.find((m) => /jake|field/i.test(m.label) && m.role === "user") ??
    demoTeam.find((m) => demoCanCompleteField(m, perms)) ??
    null
  if (!field) return 0

  const nowIso = new Date().toISOString()
  const { data: events, error } = await supabase
    .from("calendar_events")
    .select("id, title, metadata, start_at")
    .eq("user_id", userId)
    .is("removed_at", null)
    .is("completed_at", null)
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(12)
  if (error || !events?.length) return 0

  let used = 0
  for (const ev of events) {
    if (used >= maxActions) break
    const row = ev as { id: string; title?: string; metadata?: unknown }
    if (readAssignedDemoUserId(row.metadata)) continue
    const nextMeta = mergeCalendarAssigneeMetadata(row.metadata, {
      assignedDemoUserId: field.id,
      assignedUserId: null,
    })
    const { error: upErr } = await supabase
      .from("calendar_events")
      .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
      .eq("id", row.id)
    if (upErr) continue
    actions.push(`Assigned “${row.title ?? "job"}” to ${field.label}`)
    used++
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

  let events: unknown[] | null = null
  let error: { message: string } | null = null
  const primary = await supabase
    .from("calendar_events")
    .select("id, title, start_at, customer_id, metadata, completed_at")
    .eq("user_id", userId)
    .is("removed_at", null)
    .is("completed_at", null)
    .lte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(20)
  if (primary.error) {
    const fallback = await supabase
      .from("calendar_events")
      .select("id, title, start_at, customer_id, metadata, completed_at")
      .eq("user_id", userId)
      .lte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(20)
    events = fallback.data
    error = fallback.error
  } else {
    events = primary.data
  }
  if (error || !events?.length) return used

  for (const ev of events) {
    if (used >= maxActions) break
    const row = ev as {
      id: string
      title?: string
      customer_id?: string | null
      metadata?: unknown
      completed_at?: string | null
    }
    if (row.completed_at) continue
    const demoId = readAssignedDemoUserId(row.metadata)
    const member = demoId ? sandboxDemoMemberById(demoTeam, demoId) : demoTeam.find((m) => demoCanCompleteField(m, perms)) ?? null
    if (!member || !demoCanCompleteField(member, perms)) continue

    const completedIso = new Date().toISOString()
    const nextMeta = mergeCalendarAssigneeMetadata(row.metadata, { assignedDemoUserId: member.id, assignedUserId: null }, {
      sandbox_dummy_autopilot_completed: true,
      completion_note: `Marked complete by Demo Team Autopilot (${member.label}).`,
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

  const linkableUsers = await loadLinkableOrgUsers(supabase, userId)
  const member =
    resolveDemoMemberForWorkflowNode(billingNode, bundle.orgChart, bundle.externalContacts, linkableUsers, demoTeam) ??
    sandboxDemoMemberById(demoTeam, billingNode.assignedUserId ?? "")
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
    await syncCustomerWorkflowSnapshot(supabase, userId, quote.customer_id, bundle.workflow, bundle.orgChart, quote.id, next)
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
  opts?: { force?: boolean },
): Promise<SandboxDummyAutopilotResult> {
  const { data: prof } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  let metadata =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? ({ ...(prof.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : { ...profileMetadata }

  metadata = await ensureWorkflowAndProfileMetadata(supabase, userId, metadata)

  const sandboxMeta = parseSandboxMeta(metadata[SANDBOX_META_KEY])
  if (!sandboxMeta?.dummyUsersAutopilotEnabled) {
    return { ran: false, actions: [], reason: "autopilot_off" }
  }

  const intervalMin = sandboxMeta.dummyUsersAutopilotIntervalMinutes ?? 2
  const lastAt = sandboxMeta.dummyUsersAutopilotLastAt
    ? new Date(sandboxMeta.dummyUsersAutopilotLastAt).getTime()
    : 0
  const now = Date.now()
  if (!opts?.force && lastAt && now - lastAt < intervalMin * 60_000) {
    return { ran: false, actions: [], reason: "too_soon" }
  }

  const demoTeam = parseSandboxDemoTeam(metadata.sandbox_demo_team)
  const perms = resolveDummyAutopilotPermissions(sandboxMeta.dummyUsersAutopilotPermissions)
  const actions: string[] = []
  const maxPerTick = 8

  const seededQuotes = await ensureTrainingQuotes(supabase, userId)
  if (seededQuotes.length) actions.push(`Created ${seededQuotes.length} training estimate(s) for workflow demo`)

  let used = 0
  used += await processCustomerIntake(supabase, userId, demoTeam, perms, maxPerTick - used, actions)
  used += await processQuoteWorkflows(supabase, userId, metadata, demoTeam, perms, maxPerTick - used, actions)
  used += await assignUpcomingCalendarJobs(supabase, userId, demoTeam, perms, maxPerTick - used, actions)
  if (used < maxPerTick) {
    used += await processCalendarJobs(supabase, userId, demoTeam, perms, maxPerTick - used, actions)
  }
  if (used < maxPerTick) {
    used += await processInvoicingSteps(supabase, userId, metadata, demoTeam, perms, maxPerTick - used, actions)
  }

  const nextMeta = mergeSandboxMeta(metadata, { dummyUsersAutopilotLastAt: new Date().toISOString() })
  await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", userId)

  if (actions.length) dispatchSandboxTrafficEvent()

  return {
    ran: true,
    actions,
    reason: actions.length ? undefined : "no_pending_steps",
  }
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
