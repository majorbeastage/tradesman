import type { SupabaseClient } from "@supabase/supabase-js"

const QUALIFIED = "Qualified"

export type QualifiedLeadToConversationsResult =
  | { action: "none" }
  | { action: "error"; message: string }
  | { action: "created" }

/**
 * When a lead becomes Qualified and Leads settings enable it, ensure an open conversation exists for the customer.
 * Does not set leads.converted_at (use "Add to Conversations" to archive the lead).
 */
export async function runQualifiedLeadToConversationsAutomation(params: {
  supabase: SupabaseClient
  userId: string
  customerId: string
  prevStatusRaw: string | null | undefined
  nextStatusRaw: string | null | undefined
  prefs: Record<string, string>
}): Promise<QualifiedLeadToConversationsResult> {
  const prev = (params.prevStatusRaw ?? "").trim()
  const next = (params.nextStatusRaw ?? "").trim()
  if (next !== QUALIFIED || prev === QUALIFIED) return { action: "none" }

  if (params.prefs.lead_auto_conversation_when_qualified !== "checked") return { action: "none" }

  const { data: existing, error: exErr } = await params.supabase
    .from("conversations")
    .select("id")
    .eq("user_id", params.userId)
    .eq("customer_id", params.customerId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (exErr) return { action: "error", message: exErr.message }
  if (existing?.id) return { action: "none" }

  const { error: insErr } = await params.supabase.from("conversations").insert({
    user_id: params.userId,
    customer_id: params.customerId,
    channel: "sms",
    status: "open",
  })
  if (insErr) return { action: "error", message: insErr.message }

  return { action: "created" }
}
