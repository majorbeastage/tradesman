import type { SupabaseClient } from "@supabase/supabase-js"
import { runConversationInboundEmailAutoReply } from "./_conversationAutoReply.js"
import { runOutOfOfficeEmailReply } from "./_emailOutOfOffice.js"

export type InboundEmailHookPayload = {
  userId: string
  customerId: string
  customerEmail: string
  conversationId?: string | null
  leadId?: string | null
  inboundBody: string
  subject?: string
}

/** OOO takes priority; conversation auto-reply runs when OOO is inactive. */
export async function runInboundEmailPostInsertHooks(
  supabase: SupabaseClient,
  opts: InboundEmailHookPayload,
): Promise<{ oooSent: boolean; convAutoReplyAttempted: boolean }> {
  const oooSent = await runOutOfOfficeEmailReply(supabase, opts)
  if (oooSent) return { oooSent: true, convAutoReplyAttempted: false }

  await runConversationInboundEmailAutoReply(supabase, opts)
  return { oooSent: false, convAutoReplyAttempted: true }
}
