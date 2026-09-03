import { supabase } from "./supabase"
import { withSupabasePublicCredentials, platformToolsFetchOrigins } from "./platformToolsJsonBody"
import { totalFromQuoteItemRows } from "./quoteItemMath"
import { invoiceSubtotal, loadInvoicesFromProfile, type InvoiceRecord } from "./invoices"

export type PaymentRequestStatus = "draft" | "sent" | "paid" | "failed" | "canceled"
export type PaymentProviderId = "helcim" | "square" | "clover" | "stripe" | "manual"

export const PAYMENT_PROVIDER_IDS: PaymentProviderId[] = ["helcim", "square", "clover", "stripe", "manual"]

export function paymentProviderLabel(id: PaymentProviderId): string {
  switch (id) {
    case "helcim":
      return "Helcim"
    case "square":
      return "Square"
    case "clover":
      return "Clover"
    case "stripe":
      return "Stripe"
    case "manual":
      return "Manual hosted link"
    default:
      return id
  }
}
export type PaymentSentVia = "sms" | "email" | "both"

export type PaymentRequestRow = {
  id: string
  created_at: string
  created_by: string
  user_id: string
  customer_id: string
  quote_id: string | null
  invoice_id: string | null
  calendar_event_id: string | null
  amount: number
  currency: string
  description: string
  provider: PaymentProviderId
  payment_url: string | null
  status: PaymentRequestStatus
  sent_via: PaymentSentVia | null
  provider_reference_id: string | null
  paid_at: string | null
  metadata?: Record<string, unknown> | null
}

export type PaymentSourceQuote = {
  id: string
  label: string
  amount: number | null
  customer_id: string | null
}

export type PaymentSourceEvent = {
  id: string
  title: string
  start_at: string
  customer_id: string | null
  quote_id: string | null
  quote_total: number | null
}

export type PaymentSourceInvoice = {
  id: string
  label: string
  amount: number | null
  customer_id: string | null
  quote_id: string | null
  calendar_event_id: string | null
  job_title: string
  invoice_number: string
}

export type PaymentLinkSelection = {
  quoteId: string
  invoiceId: string
  eventId: string
  amount: string
  description: string
}

async function paymentApiFetch<T>(
  action: string,
  payload: Record<string, unknown>,
  accessToken: string | null,
): Promise<T> {
  const origins = platformToolsFetchOrigins()
  let lastErr = "Could not reach payment API."
  for (const origin of origins) {
    try {
      const res = await fetch(`${origin}/api/payment-requests?__action=${encodeURIComponent(action)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(withSupabasePublicCredentials(payload)),
      })
      const data = (await res.json().catch(() => ({}))) as T & { error?: string }
      if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export async function createPaymentRequestLink(input: {
  userId: string
  customerId: string
  amount: number
  description: string
  provider: PaymentProviderId
  quoteId?: string | null
  calendarEventId?: string | null
  invoiceId?: string | null
  accessToken: string | null
}): Promise<{ paymentRequest: PaymentRequestRow; paymentUrl: string }> {
  const data = await paymentApiFetch<{
    paymentRequest: PaymentRequestRow
    paymentUrl: string
  }>("create-link", input, input.accessToken)
  return { paymentRequest: data.paymentRequest, paymentUrl: data.paymentUrl }
}

export async function sendPaymentRequest(input: {
  userId: string
  paymentRequestId: string
  channel: PaymentSentVia
  accessToken: string | null
}): Promise<PaymentRequestRow> {
  const data = await paymentApiFetch<{ paymentRequest: PaymentRequestRow }>("send", input, input.accessToken)
  return data.paymentRequest
}

export async function fetchPaymentProviderStatus(
  userId: string,
  accessToken: string | null,
): Promise<{
  providers: Record<PaymentProviderId, { connected: boolean; accountLabel?: string | null }>
  defaultProvider: PaymentProviderId
  autoReceiptOnPaid: boolean
  hostedPayPortalConfigured: boolean
}> {
  return paymentApiFetch("provider-status", { userId }, accessToken)
}

export async function savePaymentProviderCredentials(input: {
  userId: string
  provider: PaymentProviderId
  accountLabel?: string
  fields: Record<string, string>
  defaultProvider?: PaymentProviderId
  autoReceiptOnPaid?: boolean
  customerPayLinkUrl?: string
  accessToken: string | null
}): Promise<void> {
  await paymentApiFetch("save-credentials", input, input.accessToken)
}

export async function updatePaymentRequest(
  userId: string,
  paymentRequestId: string,
  patch: { description?: string; amount?: number },
): Promise<void> {
  if (!supabase) throw new Error("Not connected")
  const updates: Record<string, unknown> = {}
  if (patch.description !== undefined) updates.description = patch.description.trim()
  if (patch.amount !== undefined) {
    if (!Number.isFinite(patch.amount) || patch.amount <= 0) throw new Error("Amount must be greater than zero.")
    updates.amount = patch.amount
  }
  if (!Object.keys(updates).length) return
  const { error } = await supabase
    .from("payment_requests")
    .update(updates)
    .eq("id", paymentRequestId)
    .eq("user_id", userId)
    .in("status", ["draft", "sent"])
  if (error) throw error
}

export async function fetchAdminClientCollections(
  profileId: string,
  accessToken: string | null,
): Promise<AdminClientCollectionRow[]> {
  const data = await paymentApiFetch<{ collections?: AdminClientCollectionRow[] }>(
    "admin-client-payments",
    { profileId, userId: profileId },
    accessToken,
  )
  return Array.isArray(data.collections) ? data.collections : []
}

export type AdminClientCollectionRow = {
  id: string
  created_at: string
  paid_at: string | null
  amount: number
  currency: string
  status: string
  provider: string
  description: string
  customer_id: string | null
  customer_name: string | null
  provider_reference_id: string | null
  payment_url: string | null
  sent_via: string | null
}

export async function loadPaymentRequests(userId: string, limit = 40): Promise<PaymentRequestRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    if (/payment_requests|does not exist/i.test(error.message ?? "")) return []
    throw error
  }
  return (data ?? []) as PaymentRequestRow[]
}

export async function loadPaymentSourceQuotes(userId: string, customerId: string): Promise<PaymentSourceQuote[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from("quotes")
    .select("id, customer_id, metadata, status")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .order("updated_at", { ascending: false })
    .limit(40)
  if (error) return []
  const quoteIds = (data ?? []).map((row) => String((row as { id: string }).id))
  const itemsByQuote = new Map<string, Array<{ quantity?: unknown; unit_price?: unknown; metadata?: unknown }>>()
  if (quoteIds.length > 0) {
    const { data: items } = await supabase
      .from("quote_items")
      .select("quote_id, quantity, unit_price, metadata")
      .in("quote_id", quoteIds)
    for (const row of items ?? []) {
      const qid = String((row as { quote_id?: string }).quote_id ?? "")
      if (!qid) continue
      const list = itemsByQuote.get(qid) ?? []
      list.push(row)
      itemsByQuote.set(qid, list)
    }
  }
  return (data ?? []).map((row) => {
    const r = row as { id: string; customer_id?: string | null; metadata?: unknown }
    const meta =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {}
    const title =
      (typeof meta.job_title === "string" && meta.job_title.trim()) ||
      (typeof meta.title === "string" && meta.title.trim()) ||
      `Estimate ${String(r.id).slice(0, 8)}`
    const itemRows = itemsByQuote.get(String(r.id)) ?? []
    const fromItems = totalFromQuoteItemRows(itemRows)
    const amount = fromItems > 0 ? fromItems : parseQuoteAmountFromMetadata(meta)
    const priceLabel = amount != null && amount > 0 ? ` · $${amount.toFixed(2)}` : ""
    return { id: String(r.id), label: `${title}${priceLabel}`, amount, customer_id: r.customer_id ?? null }
  })
}

export async function loadPaymentSourceEvents(userId: string, customerId: string): Promise<PaymentSourceEvent[]> {
  if (!supabase) return []
  const selects = [
    "id, title, start_at, customer_id, quote_id, quote_total",
    "id, title, start_at, customer_id, quote_id",
  ]
  for (const sel of selects) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select(sel)
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .order("start_at", { ascending: false })
      .limit(40)
    if (error) continue
    return (data ?? []).map((row) => {
      const r = row as unknown as PaymentSourceEvent
      return {
        id: String(r.id),
        title: String(r.title ?? "").trim() || "Scheduled job",
        start_at: r.start_at,
        customer_id: r.customer_id ?? null,
        quote_id: r.quote_id ?? null,
        quote_total: typeof r.quote_total === "number" ? r.quote_total : null,
      }
    })
  }
  return []
}

export async function loadPaymentSourceInvoices(userId: string, customerId: string): Promise<PaymentSourceInvoice[]> {
  if (!supabase) return []
  try {
    const rows = await loadInvoicesFromProfile(supabase, userId)
    return rows
      .filter((inv) => inv.customer_id === customerId)
      .map((inv) => mapInvoiceToPaymentSource(inv))
  } catch {
    return []
  }
}

function mapInvoiceToPaymentSource(inv: InvoiceRecord): PaymentSourceInvoice {
  const amount = invoiceSubtotal(inv.line_items)
  const title = inv.job_title.trim() || "Invoice"
  const priceLabel = amount > 0 ? ` · $${amount.toFixed(2)}` : ""
  return {
    id: inv.id,
    label: `${inv.invoice_number} — ${title}${priceLabel}`,
    amount: amount > 0 ? amount : null,
    customer_id: inv.customer_id,
    quote_id: inv.quote_id,
    calendar_event_id: inv.calendar_event_id,
    job_title: inv.job_title,
    invoice_number: inv.invoice_number,
  }
}

function paymentQuoteTitle(label: string): string {
  return label.replace(/\s·\s\$[\d,.]+$/, "").trim()
}

function invoiceDescription(inv: PaymentSourceInvoice): string {
  const title = inv.job_title.trim()
  return title ? `${inv.invoice_number} — ${title}` : inv.invoice_number
}

function firstPositiveAmount(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value != null && Number.isFinite(value) && value > 0) return value
  }
  return null
}

export function resolvePaymentLinkSelection(input: {
  source: "quote" | "invoice" | "event"
  id: string
  quotes: PaymentSourceQuote[]
  events: PaymentSourceEvent[]
  invoices: PaymentSourceInvoice[]
}): PaymentLinkSelection {
  const empty: PaymentLinkSelection = { quoteId: "", invoiceId: "", eventId: "", amount: "", description: "" }
  const id = input.id.trim()
  if (!id) return empty

  if (input.source === "quote") {
    const quote = input.quotes.find((row) => row.id === id)
    const invoice = input.invoices.find((row) => row.quote_id === id)
    const event = input.events.find((row) => row.quote_id === id)
    const amount = firstPositiveAmount(quote?.amount, event?.quote_total, invoice?.amount)
    return {
      quoteId: id,
      invoiceId: invoice?.id ?? "",
      eventId: event?.id ?? "",
      amount: formatPaymentAmount(amount),
      description: quote ? paymentQuoteTitle(quote.label) : invoice ? invoiceDescription(invoice) : event?.title ?? "",
    }
  }

  if (input.source === "invoice") {
    const invoice = input.invoices.find((row) => row.id === id)
    if (!invoice) return { ...empty, invoiceId: id }
    const event =
      (invoice.calendar_event_id ? input.events.find((row) => row.id === invoice.calendar_event_id) : undefined) ??
      (invoice.quote_id ? input.events.find((row) => row.quote_id === invoice.quote_id) : undefined)
    const quote = invoice.quote_id ? input.quotes.find((row) => row.id === invoice.quote_id) : undefined
    const amount = firstPositiveAmount(invoice.amount, quote?.amount, event?.quote_total)
    return {
      quoteId: invoice.quote_id ?? "",
      invoiceId: id,
      eventId: event?.id ?? "",
      amount: formatPaymentAmount(amount),
      description: invoiceDescription(invoice),
    }
  }

  const event = input.events.find((row) => row.id === id)
  if (!event) return { ...empty, eventId: id }
  const invoice =
    input.invoices.find((row) => row.calendar_event_id === id) ??
    (event.quote_id ? input.invoices.find((row) => row.quote_id === event.quote_id) : undefined)
  const quote = event.quote_id ? input.quotes.find((row) => row.id === event.quote_id) : undefined
  const amount = firstPositiveAmount(event.quote_total, quote?.amount, invoice?.amount)
  return {
    quoteId: event.quote_id ?? invoice?.quote_id ?? "",
    invoiceId: invoice?.id ?? "",
    eventId: id,
    amount: formatPaymentAmount(amount),
    description: event.title.trim() || (quote ? paymentQuoteTitle(quote.label) : invoice ? invoiceDescription(invoice) : ""),
  }
}

function parseQuoteAmountFromMetadata(meta: Record<string, unknown>): number | null {
  const lines = meta.line_items ?? meta.quote_line_items ?? meta.items
  if (!Array.isArray(lines)) return null
  let sum = 0
  let any = false
  for (const line of lines) {
    if (!line || typeof line !== "object") continue
    const o = line as Record<string, unknown>
    const qty = Number(o.quantity ?? o.qty ?? 1)
    const unit = Number(o.unit_price ?? o.unitPrice ?? o.price ?? 0)
    if (Number.isFinite(qty) && Number.isFinite(unit)) {
      sum += qty * unit
      any = true
    }
  }
  return any && sum > 0 ? sum : null
}

export function formatPaymentAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return ""
  return amount.toFixed(2)
}

export function paymentStatusLabel(status: PaymentRequestStatus): string {
  switch (status) {
    case "draft":
      return "Draft"
    case "sent":
      return "Sent"
    case "paid":
      return "Paid"
    case "failed":
      return "Failed"
    case "canceled":
      return "Canceled"
    default:
      return status
  }
}
