import type { SupabaseClient } from "@supabase/supabase-js"

function isLeadAutoConversationWhenQualifiedEnabled(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  const raw = (metadata as Record<string, unknown>).leadsSettingsValues
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false
  const v = (raw as Record<string, unknown>).lead_auto_conversation_when_qualified
  if (v === true) return true
  if (typeof v === "string" && v.trim() === "checked") return true
  return false
}

/**
 * When lead fit becomes "hot" (rules/AI qualified) and the user enabled auto-move to conversations,
 * create an open customer conversation if none exists. Kept API-local to avoid import cycles with _leadAutomation.
 */
export async function maybeCreateConversationAfterLeadFitHot(
  supabase: SupabaseClient,
  params: { userId: string; leadId: string; prevFit: string | null | undefined; nextFit: string | null | undefined },
): Promise<void> {
  const prev = (params.prevFit ?? "").trim().toLowerCase()
  const next = (params.nextFit ?? "").trim().toLowerCase()
  if (next !== "hot" || prev === "hot") return

  const { data: prof, error: pErr } = await supabase.from("profiles").select("metadata").eq("id", params.userId).maybeSingle()
  if (pErr || !isLeadAutoConversationWhenQualifiedEnabled(prof?.metadata)) return

  const { data: lead, error: lErr } = await supabase.from("leads").select("customer_id").eq("id", params.leadId).maybeSingle()
  if (lErr) {
    console.warn("[leadQualifiedConvo] lead", lErr.message)
    return
  }
  const customerId = (lead as { customer_id?: string | null } | null)?.customer_id
  if (!customerId || typeof customerId !== "string") return

  const { data: existing, error: exErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", params.userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (exErr) {
    console.warn("[leadQualifiedConvo] existing convo", exErr.message)
    return
  }
  if (existing?.id) return

  const { error: insErr } = await supabase.from("conversations").insert({
    user_id: params.userId,
    customer_id: customerId,
    channel: "sms",
    status: "open",
  })
  if (insErr) console.warn("[leadQualifiedConvo] insert", insErr.message)
}
