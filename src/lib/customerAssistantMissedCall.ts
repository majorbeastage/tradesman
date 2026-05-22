import type { SupabaseClient } from "@supabase/supabase-js"

export type MissedCallCustomerHit = {
  customerId: string
  display_name: string
  missedAt: string
}

/** Latest inbound missed-call event with a linked customer (from dial-result logging). */
export async function findLastMissedCallCustomer(
  supabase: SupabaseClient,
  userId: string,
): Promise<MissedCallCustomerHit | null> {
  if (!userId) return null

  const { data, error } = await supabase
    .from("communication_events")
    .select("customer_id, created_at, body")
    .eq("user_id", userId)
    .eq("direction", "inbound")
    .eq("event_type", "call")
    .not("customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(40)

  if (error) throw new Error(error.message)

  const row = (data ?? []).find(
    (r) =>
      typeof r.customer_id === "string" &&
      r.customer_id &&
      /\bmissed\s+call\b/i.test(String(r.body ?? "")),
  )
  if (!row?.customer_id) return null

  const { data: cust, error: custErr } = await supabase
    .from("customers")
    .select("id, display_name")
    .eq("id", row.customer_id)
    .eq("user_id", userId)
    .maybeSingle()

  if (custErr) throw new Error(custErr.message)
  if (!cust?.id) return null

  return {
    customerId: cust.id,
    display_name: (cust.display_name as string | null)?.trim() || "Customer",
    missedAt: String(row.created_at ?? ""),
  }
}

export function isMissedCallAssistantPhrase(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/\b(missed\s+call|missed\s+the\s+call|call\s+i\s+missed|last\s+missed)\b/i.test(t)) return true
  if (/\b(didn'?t\s+answer|no\s+answer|never\s+answered)\b/i.test(t) && /\b(call|customer|them|him|her)\b/i.test(t))
    return true
  if (
    /\b(take\s+me\s+to|open|show|go\s+to|find)\b/i.test(t) &&
    /\b(last|latest|recent)\b/i.test(t) &&
    /\b(missed|call)\b/i.test(t)
  )
    return true
  return false
}
