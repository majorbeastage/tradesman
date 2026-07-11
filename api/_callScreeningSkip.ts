/**
 * Skip auto-attendant for returning customers in Active or Booked (in-process) who already completed screening.
 * Mirrors Customers hub bucket rules from CustomersPage.loadCustomers.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { lookupCustomerIdByPhone } from "./_communications.js"
import { parseCustomerHubKind } from "./_customerContactKind.js"

const MANUAL_ARCHIVED_META_KEY = "manual_archived"

function isCompletedJobStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "completed"
}

function isCustomerManuallyArchived(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  return (metadata as Record<string, unknown>)[MANUAL_ARCHIVED_META_KEY] === true
}

function customerCompletedCallScreening(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  const m = metadata as Record<string, unknown>
  if (m.call_screening !== true) return false
  const answers = m.screening_answers
  if (!Array.isArray(answers) || answers.length === 0) return false
  return answers.some((a) => {
    if (!a || typeof a !== "object") return false
    return String((a as { answer?: unknown }).answer ?? "").trim().length > 0
  })
}

async function customerHasPriorScreeningAnswers(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("communication_events")
    .select("metadata")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .eq("event_type", "call")
    .order("created_at", { ascending: false })
    .limit(25)
  if (error) return false
  return (data ?? []).some((row) => customerCompletedCallScreening(row.metadata))
}

async function isCustomerInActiveOrBookedHub(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<boolean> {
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, metadata, job_pipeline_status, customer_identifiers ( type, value )")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !customer) return false

  if (parseCustomerHubKind(customer.metadata) === "promotional") return false
  if (isCustomerManuallyArchived(customer.metadata)) return false
  if (isCompletedJobStatus(customer.job_pipeline_status)) return false

  let eventsRes = await supabase
    .from("calendar_events")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .is("completed_at", null)
    .limit(1)
  if (eventsRes.error) {
    eventsRes = await supabase
      .from("calendar_events")
      .select("id")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .limit(1)
  }
  const isBooked = (eventsRes.data?.length ?? 0) > 0
  if (isBooked) return true

  const [leads, convos, quotes, anyLeads, anyConvos, anyQuotes, anyEvents] = await Promise.all([
    supabase
      .from("leads")
      .select("id")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .is("converted_at", null)
      .limit(1),
    supabase
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .limit(1),
    supabase
      .from("quotes")
      .select("id")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .is("removed_at", null)
      .is("scheduled_at", null)
      .limit(1),
    supabase.from("leads").select("id").eq("user_id", userId).eq("customer_id", customerId).limit(1),
    supabase.from("conversations").select("id").eq("user_id", userId).eq("customer_id", customerId).limit(1),
    supabase.from("quotes").select("id").eq("user_id", userId).eq("customer_id", customerId).limit(1),
    supabase.from("calendar_events").select("id").eq("user_id", userId).eq("customer_id", customerId).limit(1),
  ])

  const hasActiveSignal =
    (leads.data?.length ?? 0) > 0 || (convos.data?.length ?? 0) > 0 || (quotes.data?.length ?? 0) > 0
  const hasRelatedHistory =
    (anyLeads.data?.length ?? 0) > 0 ||
    (anyConvos.data?.length ?? 0) > 0 ||
    (anyQuotes.data?.length ?? 0) > 0 ||
    (anyEvents.data?.length ?? 0) > 0

  return hasActiveSignal || !hasRelatedHistory
}

/** True when caller should bypass auto-attendant and connect directly. */
export async function shouldSkipCallScreeningForCaller(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
): Promise<boolean> {
  const customerId = await lookupCustomerIdByPhone(supabase, userId, phone)
  if (!customerId) return false

  const [screenedBefore, inActiveOrBooked] = await Promise.all([
    customerHasPriorScreeningAnswers(supabase, userId, customerId),
    isCustomerInActiveOrBookedHub(supabase, userId, customerId),
  ])
  return screenedBefore && inActiveOrBooked
}
