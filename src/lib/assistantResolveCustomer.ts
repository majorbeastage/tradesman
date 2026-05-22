import type { SupabaseClient } from "@supabase/supabase-js"
import { searchCustomersByQuery, type CustomerSearchHit } from "./customerAssistantSearch"

export async function resolveCustomerIdForAssistant(
  supabase: SupabaseClient,
  userId: string,
  opts: { customerId?: string; customerQuery?: string },
): Promise<{ id: string; name: string } | { picks: CustomerSearchHit[] } | null> {
  const direct = opts.customerId?.trim()
  if (direct) {
    const { data } = await supabase.from("customers").select("id, display_name").eq("id", direct).eq("user_id", userId).maybeSingle()
    if (data?.id) {
      return { id: data.id, name: (data.display_name as string | null)?.trim() || "Customer" }
    }
  }
  const q = opts.customerQuery?.trim()
  if (!q) return null
  const hits = await searchCustomersByQuery(supabase, userId, q)
  if (hits.length === 1) return { id: hits[0].id, name: hits[0].display_name }
  if (hits.length > 1) return { picks: hits }
  return null
}
