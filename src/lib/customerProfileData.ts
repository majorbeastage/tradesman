import type { SupabaseClient } from "@supabase/supabase-js"
import { customerEmailFromIdentifiers, customerPhoneFromIdentifiers, formatCustomerContactLine } from "./customerIdentifiers"
import { loadCustomReceiptsForCustomer, type CustomReceiptDraft } from "./customReceipt"
import { loadCustomerCalendarEvents, type CustomerCalendarEventRow } from "./customerSchedulingActivity"
import { normalizeCommunicationUrgency } from "./customerUrgency"
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
}

export type CustomerProfileCommEvent = {
  id: string
  event_type: string | null
  subject: string | null
  body: string | null
  direction: string | null
  created_at: string | null
}

export type CustomerProfileLeadRow = {
  id: string
  status: string | null
  created_at: string | null
  source: string | null
}

export type CustomerProfileBundle = {
  customer: CustomerProfileRecord
  contactLine: string
  phone: string
  email: string
  urgency: ReturnType<typeof normalizeCommunicationUrgency>
  quotes: CustomerProfileQuoteRow[]
  calendarEvents: CustomerCalendarEventRow[]
  receipts: CustomReceiptDraft[]
  reports: SpecialtyReportRegistryItem[]
  commEvents: CustomerProfileCommEvent[]
  leads: CustomerProfileLeadRow[]
}

const CUSTOMER_SELECT =
  "id, display_name, customer_identifiers, service_address, service_lat, service_lng, best_contact_method, job_pipeline_status, communication_urgency, last_activity_at, updated_at, fit_classification, fit_confidence, fit_reason, fit_source, fit_manually_overridden, metadata, notes, notes_past"

export async function loadCustomerProfileBundle(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<CustomerProfileBundle> {
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select(CUSTOMER_SELECT)
    .eq("user_id", userId)
    .eq("id", customerId)
    .maybeSingle()

  if (custErr) throw custErr
  if (!customer) throw new Error("Customer not found.")

  const row = customer as CustomerProfileRecord
  const phone = customerPhoneFromIdentifiers(row.customer_identifiers)
  const email = customerEmailFromIdentifiers(row.customer_identifiers)

  const [quotesRes, calendarEvents, receipts, leadsRes, commRes, allQuotesRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, created_at, updated_at, metadata")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })
      .limit(80),
    loadCustomerCalendarEvents(supabase, userId, customerId),
    loadCustomReceiptsForCustomer(supabase, customerId).catch(() => [] as CustomReceiptDraft[]),
    supabase
      .from("leads")
      .select("id, status, created_at, source")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("communication_events")
      .select("id, event_type, subject, body, direction, created_at")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase.from("quotes").select("id, customer_id, metadata").eq("user_id", userId).is("removed_at", null).limit(800),
  ])

  if (quotesRes.error) throw quotesRes.error
  if (leadsRes.error) throw leadsRes.error
  if (commRes.error) throw commRes.error

  const quotes: CustomerProfileQuoteRow[] = (quotesRes.data ?? []).map((q) => {
    const meta =
      q.metadata && typeof q.metadata === "object" && !Array.isArray(q.metadata)
        ? (q.metadata as Record<string, unknown>)
        : {}
    const title = typeof meta.job_title === "string" ? meta.job_title : typeof meta.title === "string" ? meta.title : null
    return {
      id: String(q.id),
      status: typeof q.status === "string" ? q.status : null,
      created_at: typeof q.created_at === "string" ? q.created_at : null,
      updated_at: typeof q.updated_at === "string" ? q.updated_at : null,
      title,
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
    email,
    urgency: normalizeCommunicationUrgency(row.communication_urgency),
    quotes,
    calendarEvents,
    receipts,
    reports,
    commEvents: (commRes.data ?? []) as CustomerProfileCommEvent[],
    leads: (leadsRes.data ?? []) as CustomerProfileLeadRow[],
  }
}
