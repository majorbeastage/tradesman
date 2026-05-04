import type { SupabaseClient } from "@supabase/supabase-js"
import type { SmsOutboundComplianceVariant } from "./_smsComplianceLimits.js"

export type FirstSmsComplianceResolve = {
  variant: SmsOutboundComplianceVariant
  businessDisplayName: string
}

async function conversationIdsForCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .is("removed_at", null)
  return (data ?? []).map((r: { id: string }) => r.id).filter(Boolean)
}

async function hasOutboundSmsForCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  convoIds: string[],
): Promise<boolean> {
  const q1 = await supabase
    .from("communication_events")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .eq("event_type", "sms")
    .eq("direction", "outbound")
    .limit(1)
    .maybeSingle()
  if (q1.data?.id) return true
  if (convoIds.length === 0) return false
  const q2 = await supabase
    .from("communication_events")
    .select("id")
    .eq("user_id", userId)
    .in("conversation_id", convoIds)
    .eq("event_type", "sms")
    .eq("direction", "outbound")
    .limit(1)
    .maybeSingle()
  return Boolean(q2.data?.id)
}

async function hasInboundTwilioContactForCustomer(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  convoIds: string[],
): Promise<boolean> {
  const types = ["sms", "call", "voicemail"] as const
  const q1 = await supabase
    .from("communication_events")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .in("event_type", [...types])
    .eq("direction", "inbound")
    .limit(1)
    .maybeSingle()
  if (q1.data?.id) return true
  if (convoIds.length === 0) return false
  const q2 = await supabase
    .from("communication_events")
    .select("id")
    .eq("user_id", userId)
    .in("conversation_id", convoIds)
    .in("event_type", [...types])
    .eq("direction", "inbound")
    .limit(1)
    .maybeSingle()
  return Boolean(q2.data?.id)
}

/**
 * Determines first-SMS compliance footer for this user → customer send.
 * Uses communication_events (same signals as the portal activity views).
 */
export async function resolveFirstSmsComplianceForOutbound(
  supabase: SupabaseClient,
  userId: string,
  customerId: string | null | undefined,
): Promise<FirstSmsComplianceResolve> {
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle()
  const businessDisplayName = (profile?.display_name as string | null)?.trim() || "Your business"

  if (!customerId || !String(customerId).trim()) {
    return { variant: "none", businessDisplayName }
  }
  const cid = String(customerId).trim()

  const convoIds = await conversationIdsForCustomer(supabase, userId, cid)
  const alreadyOutbound = await hasOutboundSmsForCustomer(supabase, userId, cid, convoIds)
  if (alreadyOutbound) {
    return { variant: "none", businessDisplayName }
  }

  const hasInbound = await hasInboundTwilioContactForCustomer(supabase, userId, cid, convoIds)
  return {
    variant: hasInbound ? "twilio_short" : "manual_long",
    businessDisplayName,
  }
}
