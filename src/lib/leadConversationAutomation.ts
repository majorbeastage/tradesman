import type { SupabaseClient } from "@supabase/supabase-js"

const QUALIFIED = "Qualified"

export type QualifiedLeadConversationTrigger =
  | { type: "lead_status_qualified"; prevStatus: string | null | undefined; nextStatus: string | null | undefined }
  | { type: "lead_fit_hot"; prevFit: string | null | undefined; nextFit: string | null | undefined }

export type QualifiedLeadToConversationsResult =
  | { action: "none" }
  | { action: "error"; message: string }
  | { action: "created" }

function shouldRunAutomation(trigger: QualifiedLeadConversationTrigger): boolean {
  if (trigger.type === "lead_status_qualified") {
    const prev = (trigger.prevStatus ?? "").trim()
    const next = (trigger.nextStatus ?? "").trim()
    return next === QUALIFIED && prev !== QUALIFIED
  }
  const prev = (trigger.prevFit ?? "").trim().toLowerCase()
  const next = (trigger.nextFit ?? "").trim().toLowerCase()
  return next === "hot" && prev !== "hot"
}

/**
 * When a lead becomes sales-qualified (status "Qualified" or fit "hot") and Leads settings enable it,
 * ensure an open conversation exists for the customer.
 * Does not set leads.converted_at (use "Add to Conversations" to archive the lead).
 */
export async function runQualifiedLeadToConversationsAutomation(params: {
  supabase: SupabaseClient
  userId: string
  customerId: string
  prefs: Record<string, string>
  trigger: QualifiedLeadConversationTrigger
}): Promise<QualifiedLeadToConversationsResult> {
  if (params.prefs.lead_auto_conversation_when_qualified !== "checked") return { action: "none" }
  if (!shouldRunAutomation(params.trigger)) return { action: "none" }

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
