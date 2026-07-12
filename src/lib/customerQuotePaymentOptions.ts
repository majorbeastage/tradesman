import type { SupabaseClient } from "@supabase/supabase-js"
import { computeQuoteLineTotal, parseQuoteItemMetadata, totalFromQuoteItemRows } from "./quoteItemMath"
import { formatUsdAmount } from "./customerDocumentStatus"

export type CustomerPaymentQuoteOption = {
  quoteId: string
  estimateLabel: string
  amountLabel: string | null
  total: number
  metadata: Record<string, unknown> | null
}

export async function loadCustomerPaymentQuoteOptions(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<CustomerPaymentQuoteOption[]> {
  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, metadata, status, updated_at")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .order("updated_at", { ascending: false })
    .limit(80)

  if (error || !quotes?.length) return []

  const quoteIds = quotes.map((q) => String(q.id))
  const { data: items } = await supabase
    .from("quote_items")
    .select("quote_id, description, quantity, unit_price, metadata")
    .in("quote_id", quoteIds)

  const itemsByQuote = new Map<string, typeof items>()
  for (const row of items ?? []) {
    const qid = String((row as { quote_id?: string }).quote_id ?? "")
    if (!qid) continue
    const list = itemsByQuote.get(qid) ?? []
    list.push(row)
    itemsByQuote.set(qid, list)
  }

  return quotes.map((q) => {
    const id = String(q.id)
    const meta =
      q.metadata && typeof q.metadata === "object" && !Array.isArray(q.metadata)
        ? (q.metadata as Record<string, unknown>)
        : null
    const title =
      typeof meta?.job_title === "string"
        ? meta.job_title.trim()
        : typeof meta?.title === "string"
          ? meta.title.trim()
          : ""
    const short = id.slice(0, 8)
    const rows = itemsByQuote.get(id) ?? []
    const total = totalFromQuoteItemRows(rows)
    const estimateLabel = title
      ? `Estimate ${short} — ${title}${total > 0 ? ` · ${formatUsdAmount(total)}` : ""}`
      : `Estimate ${short}${total > 0 ? ` · ${formatUsdAmount(total)}` : ""}`
    return {
      quoteId: id,
      estimateLabel,
      amountLabel: formatUsdAmount(total),
      total,
      metadata: meta,
    }
  })
}

export function quoteItemsSubtotalFromRows(
  items: Array<{ description?: string | null; quantity?: unknown; unit_price?: unknown; metadata?: unknown }>,
): number {
  return totalFromQuoteItemRows(items)
}

export type CalendarQuotePickerOption = {
  quoteId: string
  customerId: string | null
  customerName: string | null
  estimateLabel: string
  amountLabel: string | null
  total: number
}

export async function loadCalendarQuotePickerOptions(
  supabase: SupabaseClient,
  userId: string,
  filterCustomerId?: string | null,
): Promise<CalendarQuotePickerOption[]> {
  let query = supabase
    .from("quotes")
    .select("id, customer_id, metadata, status, updated_at, customers(display_name)")
    .eq("user_id", userId)
    .is("removed_at", null)
    .order("updated_at", { ascending: false })
    .limit(80)
  if (filterCustomerId?.trim()) {
    query = query.eq("customer_id", filterCustomerId.trim())
  }
  const { data: quotes, error } = await query
  if (error || !quotes?.length) return []

  const quoteIds = quotes.map((q) => String(q.id))
  const { data: items } = await supabase
    .from("quote_items")
    .select("quote_id, description, quantity, unit_price, metadata")
    .in("quote_id", quoteIds)

  const itemsByQuote = new Map<string, typeof items>()
  for (const row of items ?? []) {
    const qid = String((row as { quote_id?: string }).quote_id ?? "")
    if (!qid) continue
    const list = itemsByQuote.get(qid) ?? []
    list.push(row)
    itemsByQuote.set(qid, list)
  }

  return quotes.map((q) => {
    const id = String(q.id)
    const meta =
      q.metadata && typeof q.metadata === "object" && !Array.isArray(q.metadata)
        ? (q.metadata as Record<string, unknown>)
        : null
    const title =
      typeof meta?.job_title === "string"
        ? meta.job_title.trim()
        : typeof meta?.title === "string"
          ? meta.title.trim()
          : ""
    const short = id.slice(0, 8)
    const custRaw = (q as { customers?: { display_name?: string | null } | { display_name?: string | null }[] | null })
      .customers
    const custObj = Array.isArray(custRaw) ? custRaw[0] : custRaw
    const customerName = typeof custObj?.display_name === "string" ? custObj.display_name.trim() : ""
    const customerId = typeof q.customer_id === "string" ? q.customer_id : null
    const rows = itemsByQuote.get(id) ?? []
    const total = totalFromQuoteItemRows(rows)
    const amountLabel = formatUsdAmount(total)
    const pricePart = amountLabel ? ` · ${amountLabel}` : ""
    const custPart = customerName ? ` · ${customerName}` : ""
    const estimateLabel = title
      ? `Estimate ${short} — ${title}${pricePart}${custPart}`
      : `Estimate ${short}${pricePart}${custPart}`
    return {
      quoteId: id,
      customerId,
      customerName: customerName || null,
      estimateLabel,
      amountLabel,
      total,
    }
  })
}

export function formatQuoteItemLineTotal(item: {
  description?: string | null
  quantity?: unknown
  unit_price?: unknown
  metadata?: unknown
}): number {
  const qty = typeof item.quantity === "number" ? item.quantity : Number.parseFloat(String(item.quantity ?? 0)) || 0
  const up = typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(String(item.unit_price ?? 0)) || 0
  return computeQuoteLineTotal(qty, up, parseQuoteItemMetadata(item.metadata)).total
}
