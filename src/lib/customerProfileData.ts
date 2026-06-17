import type { SupabaseClient } from "@supabase/supabase-js"
import {
  customerEmailFromIdentifiers,
  customerEmailsFromIdentifiers,
  customerPhoneFromIdentifiers,
  customerPhonesFromIdentifiers,
  formatCustomerContactLine,
} from "./customerIdentifiers"
import {
  customerEmailMatchesHubKind,
  deriveOrgGroupKeyFromEmail,
  isCustomerContactSeparated,
  normalizeCustomerEmail,
  orgGroupSummaryLabel,
  parseCustomerHubKind,
  parseCustomerOrgGroupKey,
  parseSplitOrgEmails,
} from "./customerContactKind"
import { loadCustomReceiptsForCustomer, type CustomReceiptDraft } from "./customReceipt"
import { loadCustomerCalendarEventsForProfile, type CalendarEventProfileRow } from "./calendarEventProfile"
import { normalizeCommunicationUrgency } from "./customerUrgency"
import { quoteItemsSubtotalFromRows } from "./customerQuotePaymentOptions"
import {
  parseSpecialtyReportRegistry,
  specialtyReportLinkedCustomerId,
  SPECIALTY_REPORT_REGISTRY_KEY,
  type SpecialtyReportRegistryItem,
} from "./specialtyReports/reportRecords"

export type CustomerProfileRecord = {
  id: string
  display_name: string | null
  customer_identifiers?: { type: string; value: string }[] | null
  service_address?: string | null
  service_lat?: number | null
  service_lng?: number | null
  best_contact_method?: string | null
  job_pipeline_status?: string | null
  communication_urgency?: string | null
  last_activity_at?: string | null
  updated_at?: string | null
  fit_classification?: string | null
  fit_confidence?: number | null
  fit_reason?: string | null
  fit_source?: string | null
  fit_manually_overridden?: boolean | null
  metadata?: unknown
  notes?: string | null
  notes_past?: unknown
}

export type CustomerProfileQuoteRow = {
  id: string
  status: string | null
  created_at: string | null
  updated_at: string | null
  title: string | null
  total: number
  metadata: Record<string, unknown> | null
}

export type CustomerProfileCommEvent = {
  id: string
  event_type: string | null
  subject: string | null
  body: string | null
  direction: string | null
  created_at: string | null
  metadata?: unknown
}

export type CustomerProfileLeadRow = {
  id: string
  status: string | null
  created_at: string | null
  title: string | null
}

export type CustomerProfileBundle = {
  customer: CustomerProfileRecord
  contactLine: string
  phone: string
  phones: string[]
  email: string
  emails: string[]
  orgGroupLabel: string | null
  urgency: ReturnType<typeof normalizeCommunicationUrgency>
  quotes: CustomerProfileQuoteRow[]
  calendarEvents: CalendarEventProfileRow[]
  receipts: CustomReceiptDraft[]
  reports: SpecialtyReportRegistryItem[]
  commEvents: CustomerProfileCommEvent[]
  leads: CustomerProfileLeadRow[]
}

const CUSTOMER_SELECT_FULL = `
  id,
  display_name,
  service_address,
  service_lat,
  service_lng,
  best_contact_method,
  job_pipeline_status,
  communication_urgency,
  last_activity_at,
  updated_at,
  fit_classification,
  fit_confidence,
  fit_reason,
  fit_source,
  fit_manually_overridden,
  metadata,
  notes,
  notes_past,
  customer_identifiers ( type, value )
`.replace(/\s+/g, " ").trim()

const CUSTOMER_SELECT_NO_NOTES_PAST = CUSTOMER_SELECT_FULL.replace(", notes_past", "")

const CUSTOMER_SELECT_NO_FIT = `
  id,
  display_name,
  service_address,
  service_lat,
  service_lng,
  best_contact_method,
  job_pipeline_status,
  communication_urgency,
  last_activity_at,
  updated_at,
  metadata,
  notes,
  customer_identifiers ( type, value )
`.replace(/\s+/g, " ").trim()

const CUSTOMER_SELECT_LEGACY = `
  id,
  display_name,
  service_address,
  service_lat,
  service_lng,
  metadata,
  notes,
  customer_identifiers ( type, value )
`.replace(/\s+/g, " ").trim()

function queryMissingColumn(message: string | undefined, column: string): boolean {
  const m = (message ?? "").toLowerCase()
  return m.includes(column.toLowerCase()) && (m.includes("does not exist") || m.includes("schema cache") || m.includes("column"))
}

async function loadCustomerRow(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<CustomerProfileRecord> {
  const attempts = [CUSTOMER_SELECT_FULL, CUSTOMER_SELECT_NO_NOTES_PAST, CUSTOMER_SELECT_NO_FIT, CUSTOMER_SELECT_LEGACY]
  let lastErr: { message: string } | null = null
  for (const select of attempts) {
    const { data, error } = await supabase
      .from("customers")
      .select(select)
      .eq("user_id", userId)
      .eq("id", customerId)
      .maybeSingle()
    if (!error && data) return data as unknown as CustomerProfileRecord
    lastErr = error
    const msg = error?.message ?? ""
    if (
      queryMissingColumn(msg, "notes_past") ||
      queryMissingColumn(msg, "fit_") ||
      queryMissingColumn(msg, "communication_urgency") ||
      queryMissingColumn(msg, "best_contact") ||
      queryMissingColumn(msg, "job_pipeline") ||
      queryMissingColumn(msg, "last_activity")
    ) {
      continue
    }
    break
  }
  throw lastErr ?? new Error("Customer not found.")
}

async function findOrgGroupedCustomerIds(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  emails: string[],
  metadata: unknown,
): Promise<string[]> {
  if (isCustomerContactSeparated(metadata)) return [customerId]
  const hubKind = parseCustomerHubKind(metadata)
  const orgRoots = new Set<string>()
  for (const raw of emails) {
    const root = deriveOrgGroupKeyFromEmail(raw)
    if (root) orgRoots.add(root)
  }
  if (orgRoots.size === 0) return [customerId]

  const { data, error } = await supabase
    .from("customer_identifiers")
    .select("customer_id, value, customers!inner(id, metadata)")
    .eq("user_id", userId)
    .eq("type", "email")

  if (error || !data?.length) return [customerId]

  type Row = {
    customer_id: string
    value: string
    customers: { id: string; metadata: unknown } | Array<{ id: string; metadata: unknown }>
  }

  const ids = new Set<string>([customerId])
  for (const row of data as Row[]) {
    const email = normalizeCustomerEmail(row.value)
    const root = deriveOrgGroupKeyFromEmail(email)
    if (!root || !orgRoots.has(root)) continue
    const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers
    if (!cust) continue
    if (isCustomerContactSeparated(cust.metadata)) continue
    if (parseSplitOrgEmails(metadata).includes(email)) continue
    if (!customerEmailMatchesHubKind(email, cust.metadata, hubKind)) continue
    ids.add(String(row.customer_id))
  }
  return [...ids]
}

async function loadLeadsForCustomers(
  supabase: SupabaseClient,
  userId: string,
  customerIds: string[],
): Promise<CustomerProfileLeadRow[]> {
  const attempts = ["id, status, created_at, title", "id, status, created_at, description", "id, status, created_at"]
  for (const select of attempts) {
    const { data, error } = await supabase
      .from("leads")
      .select(select)
      .eq("user_id", userId)
      .in("customer_id", customerIds)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(40)
    if (!error) {
      return (data ?? []).map((row) => {
        const r = row as unknown as Record<string, unknown>
        const title =
          typeof r.title === "string"
            ? r.title
            : typeof r.description === "string"
              ? r.description.slice(0, 120)
              : null
        return {
          id: String(r.id),
          status: typeof r.status === "string" ? r.status : null,
          created_at: typeof r.created_at === "string" ? r.created_at : null,
          title,
        }
      })
    }
    if (!queryMissingColumn(error.message, "title") && !queryMissingColumn(error.message, "description")) break
  }
  return []
}

async function loadCommEventsForCustomers(
  supabase: SupabaseClient,
  userId: string,
  customerIds: string[],
): Promise<CustomerProfileCommEvent[]> {
  const { data, error } = await supabase
    .from("communication_events")
    .select("id, event_type, subject, body, direction, created_at, metadata")
    .eq("user_id", userId)
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false })
    .limit(120)
  if (error) throw error
  return (data ?? []) as CustomerProfileCommEvent[]
}

export async function loadCustomerProfileBundle(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<CustomerProfileBundle> {
  const row = await loadCustomerRow(supabase, userId, customerId)
  const phone = customerPhoneFromIdentifiers(row.customer_identifiers)
  const phones = customerPhonesFromIdentifiers(row.customer_identifiers)
  const email = customerEmailFromIdentifiers(row.customer_identifiers)
  const emails = customerEmailsFromIdentifiers(row.customer_identifiers)
  const orgGroupLabel = orgGroupSummaryLabel(parseCustomerOrgGroupKey(row.metadata), parseCustomerHubKind(row.metadata))
  const relatedCustomerIds = await findOrgGroupedCustomerIds(supabase, userId, customerId, emails, row.metadata)

  const [quotesRes, calendarEvents, receipts, leads, commRes, allQuotesRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, created_at, updated_at, metadata")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })
      .limit(80),
    loadCustomerCalendarEventsForProfile(supabase, userId, customerId).catch(() => [] as CalendarEventProfileRow[]),
    loadCustomReceiptsForCustomer(supabase, customerId).catch(() => [] as CustomReceiptDraft[]),
    loadLeadsForCustomers(supabase, userId, relatedCustomerIds),
    loadCommEventsForCustomers(supabase, userId, relatedCustomerIds).catch(() => [] as CustomerProfileCommEvent[]),
    supabase.from("quotes").select("id, customer_id, metadata").eq("user_id", userId).is("removed_at", null).limit(800),
  ])

  if (quotesRes.error) throw quotesRes.error

  const quoteIds = (quotesRes.data ?? []).map((q) => String(q.id))
  let quoteItemsById = new Map<string, Array<{ description?: string | null; quantity?: unknown; unit_price?: unknown; metadata?: unknown }>>()
  if (quoteIds.length > 0) {
    const { data: quoteItems } = await supabase
      .from("quote_items")
      .select("quote_id, description, quantity, unit_price, metadata")
      .in("quote_id", quoteIds)
    for (const row of quoteItems ?? []) {
      const qid = String((row as { quote_id?: string }).quote_id ?? "")
      if (!qid) continue
      const list = quoteItemsById.get(qid) ?? []
      list.push(row as { description?: string | null; quantity?: unknown; unit_price?: unknown; metadata?: unknown })
      quoteItemsById.set(qid, list)
    }
  }

  const quotes: CustomerProfileQuoteRow[] = (quotesRes.data ?? []).map((q) => {
    const meta =
      q.metadata && typeof q.metadata === "object" && !Array.isArray(q.metadata)
        ? (q.metadata as Record<string, unknown>)
        : null
    const title = typeof meta?.job_title === "string" ? meta.job_title : typeof meta?.title === "string" ? meta.title : null
    const id = String(q.id)
    return {
      id,
      status: typeof q.status === "string" ? q.status : null,
      created_at: typeof q.created_at === "string" ? q.created_at : null,
      updated_at: typeof q.updated_at === "string" ? q.updated_at : null,
      title,
      total: quoteItemsSubtotalFromRows(quoteItemsById.get(id) ?? []),
      metadata: meta,
    }
  })

  const reports: SpecialtyReportRegistryItem[] = []
  const seenReports = new Set<string>()
  for (const q of allQuotesRes.data ?? []) {
    const qr = q as { id: string; customer_id?: string | null; metadata?: unknown }
    const meta =
      qr.metadata && typeof qr.metadata === "object" && !Array.isArray(qr.metadata)
        ? (qr.metadata as Record<string, unknown>)
        : {}
    const parsed = parseSpecialtyReportRegistry(meta[SPECIALTY_REPORT_REGISTRY_KEY]).filter((r) => r.quote_id === qr.id)
    for (const r of parsed) {
      if (specialtyReportLinkedCustomerId(r, qr.customer_id) !== customerId) continue
      if (seenReports.has(r.id)) continue
      seenReports.add(r.id)
      reports.push(r)
    }
  }
  reports.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))

  return {
    customer: row,
    contactLine: formatCustomerContactLine(row.customer_identifiers),
    phone,
    phones,
    email,
    emails,
    orgGroupLabel,
    urgency: normalizeCommunicationUrgency(row.communication_urgency),
    quotes,
    calendarEvents,
    receipts,
    reports,
    commEvents: commRes,
    leads,
  }
}
