import type { SupabaseClient } from "@supabase/supabase-js"
import { estimateDisplayStatus } from "./customerDocumentStatus"

export type WorkOrderRecord = {
  id: string
  work_order_number: string
  quote_id: string
  customer_id: string | null
  customer_name: string
  estimate_title: string
  estimate_total: number | null
  created_at: string
  updated_at: string
  status: "open" | "scheduled" | "complete"
}

export const WORK_ORDERS_META_KEY = "work_orders_v1"

export function quoteEligibleForWorkOrder(status: string | null | undefined, metadata?: unknown): boolean {
  return estimateDisplayStatus(status, metadata) === "Approved by customer"
}

export function generateWorkOrderNumber(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `WO-${ymd}-${suffix}`
}

export function parseWorkOrders(raw: unknown): WorkOrderRecord[] {
  if (!Array.isArray(raw)) return []
  const out: WorkOrderRecord[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    if (typeof o.id !== "string" || typeof o.quote_id !== "string") continue
    out.push({
      id: o.id,
      work_order_number: typeof o.work_order_number === "string" ? o.work_order_number : generateWorkOrderNumber(),
      quote_id: o.quote_id,
      customer_id: typeof o.customer_id === "string" ? o.customer_id : null,
      customer_name: typeof o.customer_name === "string" ? o.customer_name : "Customer",
      estimate_title: typeof o.estimate_title === "string" ? o.estimate_title : "Estimate",
      estimate_total: typeof o.estimate_total === "number" && Number.isFinite(o.estimate_total) ? o.estimate_total : null,
      created_at: typeof o.created_at === "string" ? o.created_at : new Date().toISOString(),
      updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
      status: o.status === "scheduled" || o.status === "complete" ? o.status : "open",
    })
  }
  return out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

export async function loadWorkOrdersFromProfile(
  client: SupabaseClient,
  userId: string,
): Promise<WorkOrderRecord[]> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw error
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  return parseWorkOrders(meta[WORK_ORDERS_META_KEY])
}

export async function saveWorkOrdersToProfile(
  client: SupabaseClient,
  userId: string,
  orders: WorkOrderRecord[],
): Promise<void> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw error
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  const { error: upErr } = await client
    .from("profiles")
    .update({ metadata: { ...prevMeta, [WORK_ORDERS_META_KEY]: orders.slice(0, 200) } })
    .eq("id", userId)
  if (upErr) throw upErr
}

export type SignedQuotePick = {
  id: string
  customer_id: string | null
  customer_name: string
  title: string
  total: number
  status: string | null
}

export const WORK_ORDER_NO_ESTIMATE = "__no_estimate__"

export async function loadQuotesForWorkOrders(
  client: SupabaseClient,
  userId: string,
  customerId?: string | null,
): Promise<SignedQuotePick[]> {
  let q = client
    .from("quotes")
    .select("id, status, customer_id, metadata, customers ( display_name ), quote_items ( quantity, unit_price, description )")
    .eq("user_id", userId)
    .is("removed_at", null)
    .order("updated_at", { ascending: false })
    .limit(120)
  if (customerId?.trim()) q = q.eq("customer_id", customerId.trim())
  const { data, error } = await q
  if (error) {
    let fb = client
      .from("quotes")
      .select("id, status, customer_id, metadata, customers ( display_name )")
      .eq("user_id", userId)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })
      .limit(120)
    if (customerId?.trim()) fb = fb.eq("customer_id", customerId.trim())
    const fallback = await fb
    if (fallback.error) throw fallback.error
    return mapAllQuotesForWorkOrders(fallback.data ?? [])
  }
  return mapAllQuotesForWorkOrders(data ?? [])
}

function mapAllQuotesForWorkOrders(rows: unknown[]): SignedQuotePick[] {
  const out: SignedQuotePick[] = []
  for (const row of rows) {
    const r = row as {
      id: string
      status?: string | null
      customer_id?: string | null
      metadata?: unknown
      customers?: { display_name?: string | null } | { display_name?: string | null }[] | null
      quote_items?: { quantity?: unknown; unit_price?: unknown }[] | null
    }
    const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
    const meta =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? (r.metadata as Record<string, unknown>) : {}
    const title =
      typeof meta.job_title === "string"
        ? meta.job_title
        : typeof meta.title === "string"
          ? meta.title
          : "Estimate"
    let total = 0
    for (const li of r.quote_items ?? []) {
      const q = Number(li.quantity)
      const p = Number(li.unit_price)
      if (Number.isFinite(q) && Number.isFinite(p)) total += q * p
    }
    out.push({
      id: String(r.id),
      customer_id: r.customer_id ?? null,
      customer_name: String(cust?.display_name ?? "").trim() || "Customer",
      title,
      total,
      status: r.status ?? null,
    })
  }
  return out
}

export async function loadSignedQuotesForWorkOrders(
  client: SupabaseClient,
  userId: string,
): Promise<SignedQuotePick[]> {
  const { data, error } = await client
    .from("quotes")
    .select("id, status, customer_id, metadata, customers ( display_name ), quote_items ( quantity, unit_price, description )")
    .eq("user_id", userId)
    .is("removed_at", null)
    .order("updated_at", { ascending: false })
    .limit(120)
  if (error) {
    const fallback = await client
      .from("quotes")
      .select("id, status, customer_id, metadata, customers ( display_name )")
      .eq("user_id", userId)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })
      .limit(120)
    if (fallback.error) throw fallback.error
    return mapSignedQuotes(fallback.data ?? [])
  }
  return mapSignedQuotes(data ?? [])
}

function mapSignedQuotes(rows: unknown[]): SignedQuotePick[] {
  const out: SignedQuotePick[] = []
  for (const row of rows) {
    const r = row as {
      id: string
      status?: string | null
      customer_id?: string | null
      metadata?: unknown
      customers?: { display_name?: string | null } | { display_name?: string | null }[] | null
      quote_items?: { quantity?: unknown; unit_price?: unknown }[] | null
    }
    if (!quoteEligibleForWorkOrder(r.status, r.metadata)) continue
    const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
    const meta =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? (r.metadata as Record<string, unknown>) : {}
    const title =
      typeof meta.job_title === "string"
        ? meta.job_title
        : typeof meta.title === "string"
          ? meta.title
          : "Signed estimate"
    let total = 0
    for (const li of r.quote_items ?? []) {
      const q = Number(li.quantity)
      const p = Number(li.unit_price)
      if (Number.isFinite(q) && Number.isFinite(p)) total += q * p
    }
    out.push({
      id: String(r.id),
      customer_id: r.customer_id ?? null,
      customer_name: String(cust?.display_name ?? "").trim() || "Customer",
      title,
      total,
      status: r.status ?? null,
    })
  }
  return out
}

export async function findWorkOrderForQuoteId(
  client: SupabaseClient,
  userId: string,
  quoteId: string,
): Promise<WorkOrderRecord | null> {
  const orders = await loadWorkOrdersFromProfile(client, userId)
  return orders.find((o) => o.quote_id === quoteId) ?? null
}

export function customerSignStepCompleteInWorkflow(
  workflow: { nodes: Array<{ id: string; label: string }> },
  completedNodeIds: string[],
): boolean {
  return workflow.nodes.some(
    (n) =>
      completedNodeIds.includes(n.id) &&
      /customer signs estimate|customer signed|signed by customer/i.test(n.label),
  )
}

export function canCreateWorkOrderForQuote(
  status: string | null | undefined,
  metadata: unknown,
  workflow: { nodes: Array<{ id: string; label: string }> },
  completedNodeIds: string[],
): boolean {
  if (quoteEligibleForWorkOrder(status, metadata)) return true
  return customerSignStepCompleteInWorkflow(workflow, completedNodeIds)
}

export type WorkOrderPatch = Partial<Pick<WorkOrderRecord, "work_order_number" | "status">>

export async function updateWorkOrderInProfile(
  client: SupabaseClient,
  userId: string,
  workOrderId: string,
  patch: WorkOrderPatch,
): Promise<WorkOrderRecord> {
  const orders = await loadWorkOrdersFromProfile(client, userId)
  const idx = orders.findIndex((o) => o.id === workOrderId)
  if (idx < 0) throw new Error("Work order not found.")
  const prev = orders[idx]
  const next: WorkOrderRecord = {
    ...prev,
    work_order_number:
      patch.work_order_number !== undefined ? patch.work_order_number.trim() || prev.work_order_number : prev.work_order_number,
    status: patch.status ?? prev.status,
    updated_at: new Date().toISOString(),
  }
  const updated = [...orders]
  updated[idx] = next
  await saveWorkOrdersToProfile(client, userId, updated)
  return next
}

export async function createWorkOrderFromQuote(
  client: SupabaseClient,
  userId: string,
  quote: SignedQuotePick,
  workOrderNumber: string,
): Promise<WorkOrderRecord> {
  const orders = await loadWorkOrdersFromProfile(client, userId)
  if (orders.some((o) => o.quote_id === quote.id)) {
    throw new Error("A work order already exists for this estimate.")
  }
  const now = new Date().toISOString()
  const record: WorkOrderRecord = {
    id: crypto.randomUUID(),
    work_order_number: workOrderNumber.trim() || generateWorkOrderNumber(),
    quote_id: quote.id,
    customer_id: quote.customer_id,
    customer_name: quote.customer_name,
    estimate_title: quote.title,
    estimate_total: quote.total > 0 ? quote.total : null,
    created_at: now,
    updated_at: now,
    status: "open",
  }
  await saveWorkOrdersToProfile(client, userId, [record, ...orders])
  return record
}

export async function createWorkOrderForCustomer(
  client: SupabaseClient,
  userId: string,
  input: {
    customerId: string
    customerName: string
    workOrderNumber?: string
    jobTitle?: string
  },
): Promise<WorkOrderRecord> {
  const orders = await loadWorkOrdersFromProfile(client, userId)
  const now = new Date().toISOString()
  const record: WorkOrderRecord = {
    id: crypto.randomUUID(),
    work_order_number: input.workOrderNumber?.trim() || generateWorkOrderNumber(),
    quote_id: "",
    customer_id: input.customerId,
    customer_name: input.customerName.trim() || "Customer",
    estimate_title: input.jobTitle?.trim() || "No estimate — customer work order",
    estimate_total: null,
    created_at: now,
    updated_at: now,
    status: "open",
  }
  await saveWorkOrdersToProfile(client, userId, [record, ...orders])
  return record
}
