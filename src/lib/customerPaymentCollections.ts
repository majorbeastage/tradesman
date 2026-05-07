import type { SupabaseClient } from "@supabase/supabase-js"

export type CustomerPaymentCollectionsRow = {
  id: string
  created_at: string
  user_id: string
  customer_id: string | null
  quote_id: string | null
  calendar_event_id: string | null
  event_type: string
  amount: number | null
  currency: string | null
  status: string | null
  metadata: Record<string, unknown>
  /** Enriched */
  customer_name?: string | null
  quote_status?: string | null
  calendar_title?: string | null
  calendar_start_at?: string | null
}

function uniqStrings(ids: (string | null | undefined)[]): string[] {
  const s = new Set<string>()
  for (const x of ids) {
    const t = typeof x === "string" ? x.trim() : ""
    if (t) s.add(t)
  }
  return [...s]
}

/**
 * Loads recent homeowner/customer payment activity for the Payments hub and aligns names from customers.
 */
export async function fetchCustomerPaymentCollectionsHistory(input: {
  supabase: SupabaseClient | null
  userId: string | null
  limit?: number
}): Promise<{ rows: CustomerPaymentCollectionsRow[]; error?: string }> {
  const { supabase, userId } = input
  const limit = Math.min(Math.max(Number(input.limit) || 80, 1), 200)
  if (!supabase || !userId) return { rows: [] }
  try {
    const { data: evs, error } = await supabase
      .from("customer_payment_events")
      .select("id, created_at, user_id, customer_id, quote_id, calendar_event_id, event_type, amount, currency, status, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) {
      if (/customer_payment_events|does not exist|relation/i.test(error.message ?? "")) {
        return { rows: [] }
      }
      return { rows: [], error: error.message }
    }
    const rows = ((evs ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      created_at: String(r.created_at),
      user_id: String(r.user_id),
      customer_id: r.customer_id != null ? String(r.customer_id) : null,
      quote_id: r.quote_id != null ? String(r.quote_id) : null,
      calendar_event_id: r.calendar_event_id != null ? String(r.calendar_event_id) : null,
      event_type: String(r.event_type ?? ""),
      amount: typeof r.amount === "number" ? r.amount : r.amount != null ? Number(r.amount) : null,
      currency: r.currency != null ? String(r.currency) : null,
      status: r.status != null ? String(r.status) : null,
      metadata:
        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {},
    })) as CustomerPaymentCollectionsRow[]

    const custIds = uniqStrings(rows.map((r) => r.customer_id))
    const quoteIds = uniqStrings(rows.map((r) => r.quote_id))
    const calIds = uniqStrings(rows.map((r) => r.calendar_event_id))

    const [custRes, quoteRes, calRes] = await Promise.all([
      custIds.length > 0
        ? supabase.from("customers").select("id, display_name").in("id", custIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
      quoteIds.length > 0
        ? supabase.from("quotes").select("id, status").in("id", quoteIds)
        : Promise.resolve({ data: [] as { id: string; status: string | null }[], error: null }),
      calIds.length > 0
        ? supabase.from("calendar_events").select("id, title, start_at").in("id", calIds)
        : Promise.resolve({ data: [] as { id: string; title: string | null; start_at: string | null }[], error: null }),
    ])

    const labelById = new Map<string, string | null>()
    if (!custRes.error && Array.isArray(custRes.data)) {
      for (const c of custRes.data) {
        labelById.set(c.id, c.display_name ?? null)
      }
    }

    const quoteStatusById = new Map<string, string | null>()
    if (!quoteRes.error && Array.isArray(quoteRes.data)) {
      for (const q of quoteRes.data) {
        quoteStatusById.set(q.id, q.status ?? null)
      }
    }

    const calById = new Map<string, { title: string | null; start_at: string | null }>()
    if (!calRes.error && Array.isArray(calRes.data)) {
      for (const ev of calRes.data) {
        calById.set(ev.id, { title: ev.title ?? null, start_at: ev.start_at ?? null })
      }
    }

    for (const r of rows) {
      if (r.customer_id) r.customer_name = labelById.get(r.customer_id) ?? null
      if (r.quote_id) r.quote_status = quoteStatusById.get(r.quote_id) ?? null
      if (r.calendar_event_id) {
        const ce = calById.get(r.calendar_event_id)
        if (ce) {
          r.calendar_title = ce.title
          r.calendar_start_at = ce.start_at
        }
      }
    }
    return { rows }
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Unknown error" }
  }
}

export function formatUsdAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—"
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount)
}

export function customerPaymentEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "payment_link_sent":
      return "Payment link copied"
    case "payment_barcode_sent":
      return "Barcode link copied"
    case "payment_marked_collected":
      return "Manual status"
    case "payment_recorded":
      return "Payment recorded"
    case "payment_receipt_reviewed":
      return "Receipt reviewed"
    default:
      return eventType.replace(/_/g, " ")
  }
}

/** Subline for `payment_marked_collected` from row metadata. */
export function customerPaymentMarkedDetail(meta: Record<string, unknown> | undefined): string | null {
  if (!meta || typeof meta !== "object") return null
  const k = meta.manual_kind
  if (k === "paid") return "Marked paid (manual)"
  if (k === "waived") return "Marked waived / offline"
  return null
}

export function formatCollectionsQuoteContext(row: CustomerPaymentCollectionsRow): string | null {
  if (!row.quote_id?.trim()) return null
  const short = row.quote_id.slice(0, 8)
  const st = row.quote_status?.trim()
  return st ? `Estimate ${short} · ${st}` : `Estimate ${short}`
}

export function formatCollectionsCalendarContext(row: CustomerPaymentCollectionsRow): string | null {
  if (!row.calendar_event_id?.trim()) return null
  const title = row.calendar_title?.trim()
  const start = row.calendar_start_at
  let datePart = ""
  if (start) {
    const t = Date.parse(start)
    if (Number.isFinite(t)) {
      datePart = new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    }
  }
  if (title && datePart) return `${title} · ${datePart}`
  if (title) return title
  if (datePart) return `Scheduled job · ${datePart}`
  return `Calendar ${row.calendar_event_id.slice(0, 8)}`
}
