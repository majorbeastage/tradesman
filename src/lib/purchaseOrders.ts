import type { SupabaseClient } from "@supabase/supabase-js"

export type PurchaseOrderRecord = {
  id: string
  po_number: string
  vendor_name: string
  description: string
  created_at: string
  updated_at: string
  status: "draft" | "sent" | "received"
  total: number | null
  /** Linked estimate when created from workflow handoff. */
  quote_id?: string | null
  customer_id?: string | null
  estimate_title?: string | null
  work_order_id?: string | null
}

export const PURCHASE_ORDERS_META_KEY = "purchase_orders_v1"

export function generatePurchaseOrderNumber(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  return `PO-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export function parsePurchaseOrders(raw: unknown): PurchaseOrderRecord[] {
  if (!Array.isArray(raw)) return []
  const out: PurchaseOrderRecord[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    if (typeof o.id !== "string") continue
    out.push({
      id: o.id,
      po_number: typeof o.po_number === "string" ? o.po_number : generatePurchaseOrderNumber(),
      vendor_name: typeof o.vendor_name === "string" ? o.vendor_name : "Vendor",
      description: typeof o.description === "string" ? o.description : "",
      created_at: typeof o.created_at === "string" ? o.created_at : new Date().toISOString(),
      updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
      status: o.status === "sent" || o.status === "received" ? o.status : "draft",
      total: typeof o.total === "number" && Number.isFinite(o.total) ? o.total : null,
      quote_id: typeof o.quote_id === "string" ? o.quote_id : null,
      customer_id: typeof o.customer_id === "string" ? o.customer_id : null,
      estimate_title: typeof o.estimate_title === "string" ? o.estimate_title : null,
      work_order_id: typeof o.work_order_id === "string" ? o.work_order_id : null,
    })
  }
  return out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

export async function loadPurchaseOrdersFromProfile(client: SupabaseClient, userId: string): Promise<PurchaseOrderRecord[]> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw error
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  return parsePurchaseOrders(meta[PURCHASE_ORDERS_META_KEY])
}

export async function savePurchaseOrdersToProfile(
  client: SupabaseClient,
  userId: string,
  orders: PurchaseOrderRecord[],
): Promise<void> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw error
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  const { error: upErr } = await client
    .from("profiles")
    .update({ metadata: { ...prevMeta, [PURCHASE_ORDERS_META_KEY]: orders.slice(0, 200) } })
    .eq("id", userId)
  if (upErr) throw upErr
}

export async function findPurchaseOrderForQuoteId(
  client: SupabaseClient,
  userId: string,
  quoteId: string,
): Promise<PurchaseOrderRecord | null> {
  const orders = await loadPurchaseOrdersFromProfile(client, userId)
  return orders.find((o) => o.quote_id === quoteId) ?? null
}

export type PurchaseOrderFromQuoteInput = {
  quote_id: string
  customer_id: string | null
  estimate_title: string
  work_order_id?: string | null
  vendor_name?: string
  description?: string
  total?: number | null
}

export async function createPurchaseOrderFromQuote(
  client: SupabaseClient,
  userId: string,
  input: PurchaseOrderFromQuoteInput,
  poNumber?: string,
): Promise<PurchaseOrderRecord> {
  const orders = await loadPurchaseOrdersFromProfile(client, userId)
  const existing = orders.find((o) => o.quote_id === input.quote_id)
  if (existing) return existing
  const now = new Date().toISOString()
  const title = input.estimate_title.trim() || "Estimate"
  const record: PurchaseOrderRecord = {
    id: crypto.randomUUID(),
    po_number: poNumber?.trim() || generatePurchaseOrderNumber(),
    vendor_name: input.vendor_name?.trim() || "Vendor TBD",
    description: input.description?.trim() || `Parts / materials for ${title}`,
    created_at: now,
    updated_at: now,
    status: "draft",
    total: input.total != null && Number.isFinite(input.total) ? input.total : null,
    quote_id: input.quote_id,
    customer_id: input.customer_id,
    estimate_title: title,
    work_order_id: input.work_order_id ?? null,
  }
  await savePurchaseOrdersToProfile(client, userId, [record, ...orders])
  return record
}

export async function createPurchaseOrder(
  client: SupabaseClient,
  userId: string,
  input: {
    po_number?: string
    vendor_name: string
    description: string
    total?: number | null
    quote_id?: string | null
    customer_id?: string | null
    estimate_title?: string | null
    work_order_id?: string | null
  },
): Promise<PurchaseOrderRecord> {
  const orders = await loadPurchaseOrdersFromProfile(client, userId)
  const now = new Date().toISOString()
  const record: PurchaseOrderRecord = {
    id: crypto.randomUUID(),
    po_number: input.po_number?.trim() || generatePurchaseOrderNumber(),
    vendor_name: input.vendor_name.trim() || "Vendor",
    description: input.description.trim(),
    created_at: now,
    updated_at: now,
    status: "draft",
    total: input.total != null && Number.isFinite(input.total) ? input.total : null,
    quote_id: input.quote_id ?? null,
    customer_id: input.customer_id ?? null,
    estimate_title: input.estimate_title ?? null,
    work_order_id: input.work_order_id ?? null,
  }
  await savePurchaseOrdersToProfile(client, userId, [record, ...orders])
  return record
}
