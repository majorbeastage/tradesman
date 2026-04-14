import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeConversationStatus } from "../types/portal-builder"

const QUALIFIED = "Qualified"

export function mergeConversationAutomaticRepliesPrefs(
  profile: Record<string, string>,
  form: Record<string, string>,
): Record<string, string> {
  return { ...profile, ...form }
}

export type QualifiedToQuotesAutomationResult =
  | { action: "none" }
  | { action: "error"; message: string }
  | { action: "moved"; navigated: boolean }

/**
 * When conversation status becomes Qualified and portal prefs request it,
 * create a draft quote linked to the conversation and archive the conversation (same as manual Send to Quotes).
 */
export async function runQualifiedConversationToQuotesAutomation(params: {
  supabase: SupabaseClient
  userId: string
  conversationId: string
  customerId: string
  prevStatusRaw: string | null | undefined
  nextStatusRaw: string | null | undefined
  prefs: Record<string, string>
  setPage?: (page: string) => void
}): Promise<QualifiedToQuotesAutomationResult> {
  const prev = normalizeConversationStatus(params.prevStatusRaw)
  const next = normalizeConversationStatus(params.nextStatusRaw)
  if (next !== QUALIFIED || prev === QUALIFIED) return { action: "none" }

  if (params.prefs.conv_auto_reply_enabled !== "checked") return { action: "none" }
  if (params.prefs.conv_auto_quote_when_qualified !== "checked") return { action: "none" }

  const { data: existingRows, error: existingErr } = await params.supabase
    .from("quotes")
    .select("id")
    .eq("conversation_id", params.conversationId)
    .is("removed_at", null)
    .limit(1)
  if (existingErr) return { action: "error", message: existingErr.message }
  if (existingRows?.length) return { action: "none" }

  const { error: insertErr } = await params.supabase.from("quotes").insert({
    user_id: params.userId,
    customer_id: params.customerId,
    conversation_id: params.conversationId,
    status: "draft",
  })
  if (insertErr) return { action: "error", message: insertErr.message }

  const { error: rmErr } = await params.supabase
    .from("conversations")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", params.conversationId)
    .eq("user_id", params.userId)
  if (rmErr) return { action: "error", message: rmErr.message }

  if (params.setPage) {
    params.setPage("quotes")
    return { action: "moved", navigated: true }
  }
  return { action: "moved", navigated: false }
}
