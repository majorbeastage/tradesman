/**
 * Skip auto-attendant for numbers already on the Customers tab (or who finished screening).
 * First-time unknown callers still go through the menu. Returning / saved customers connect.
 * Promotions & Marketing numbers never skip-to-connect — they go to voicemail.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { lookupCustomerIdByPhone } from "./_communications.js"
import { parseCustomerHubKind } from "./_customerContactKind.js"

const ESTABLISHED_CUSTOMER_MS = 20_000

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

async function loadCustomerByPhone(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
): Promise<{ id: string; created_at?: string; metadata?: unknown } | null> {
  const customerId = await lookupCustomerIdByPhone(supabase, userId, phone)
  if (!customerId) return null
  const { data: customer } = await supabase
    .from("customers")
    .select("id, created_at, metadata")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  return (customer as { id: string; created_at?: string; metadata?: unknown } | null) ?? null
}

/** True when this phone is on the Promotions & Marketing hub — do not ring the client. */
export async function isPromotionalHubCaller(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
): Promise<boolean> {
  const customer = await loadCustomerByPhone(supabase, userId, phone)
  if (!customer) return false
  return parseCustomerHubKind(customer.metadata) === "promotional"
}

/** True when caller should bypass auto-attendant and connect directly. */
export async function shouldSkipCallScreeningForCaller(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
): Promise<boolean> {
  const customer = await loadCustomerByPhone(supabase, userId, phone)
  if (!customer) return false
  if (parseCustomerHubKind(customer.metadata) === "promotional") return false

  const createdMs = Date.parse(String(customer.created_at ?? ""))
  const established = Number.isFinite(createdMs) && Date.now() - createdMs > ESTABLISHED_CUSTOMER_MS
  if (established) return true

  return customerHasPriorScreeningAnswers(supabase, userId, customer.id)
}
