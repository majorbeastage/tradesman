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

export async function createPurchaseOrder(
  client: SupabaseClient,
  userId: string,
  input: { po_number?: string; vendor_name: string; description: string; total?: number | null },
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
  }
  await savePurchaseOrdersToProfile(client, userId, [record, ...orders])
  return record
}
