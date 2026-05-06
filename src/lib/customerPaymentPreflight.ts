import type { SupabaseClient } from "@supabase/supabase-js"

export type CustomerPaymentPreflight = {
  /** Outbound email whose subject/body looks like an estimate or proposal was shared */
  hasEstimateEmailSignal: boolean
  /** Any calendar row for this customer (visit scheduled or completed) */
  hasCalendarJobSignal: boolean
  /** True when we should warn: no estimate-looking email and no calendar job */
  showEstimateOrSchedulingReminder: boolean
}

const ESTIMATE_EMAIL_HINT = /\bestimate\b|\bproposal\b|quote\s*#|your\s+quote/i

/**
 * Heuristic: outbound logged emails that look like an estimate was sent to the customer.
 */
async function hasOutboundEstimateLikeEmail(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<boolean> {
  const { data: rows, error } = await supabase
    .from("communication_events")
    .select("subject, body")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .eq("event_type", "email")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(40)
  if (error || !rows?.length) return false
  return rows.some((row) => {
    const t = `${typeof row.subject === "string" ? row.subject : ""}\n${typeof row.body === "string" ? row.body : ""}`
    return ESTIMATE_EMAIL_HINT.test(t)
  })
}

/** Any non-removed calendar event for this customer counts as “scheduling” for the reminder. */
async function hasCalendarJobForCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle()
  if (error) return false
  return Boolean(data?.id)
}

export async function loadCustomerPaymentPreflight(
  supabase: SupabaseClient | null,
  userId: string | null | undefined,
  customerId: string | null | undefined,
): Promise<CustomerPaymentPreflight> {
  if (!supabase || !userId?.trim() || !customerId?.trim()) {
    return {
      hasEstimateEmailSignal: false,
      hasCalendarJobSignal: false,
      showEstimateOrSchedulingReminder: true,
    }
  }
  const uid = userId.trim()
  const cid = customerId.trim()
  const [hasEstimateEmailSignal, hasCalendarJobSignal] = await Promise.all([
    hasOutboundEstimateLikeEmail(supabase, uid, cid),
    hasCalendarJobForCustomer(supabase, uid, cid),
  ])
  return {
    hasEstimateEmailSignal,
    hasCalendarJobSignal,
    showEstimateOrSchedulingReminder: !hasEstimateEmailSignal && !hasCalendarJobSignal,
  }
}
