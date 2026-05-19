import type { SupabaseClient } from "@supabase/supabase-js"

/** Most recently updated estimate for this customer (same user), or null. */
export async function findLatestQuoteIdForCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<string | null> {
  const cid = customerId.trim()
  if (!cid || !userId.trim()) return null
  const { data, error } = await supabase
    .from("quotes")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", cid)
    .is("removed_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn("[quotes] findLatestQuoteIdForCustomer", error.message)
    return null
  }
  return (data as { id?: string } | null)?.id?.trim() || null
}
