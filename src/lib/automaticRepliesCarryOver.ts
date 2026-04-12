/** Map a Conversations automatic-replies field id to its Quotes counterpart. */
export function mapConvAutoReplyKeyToQuote(convKey: string): string | null {
  if (convKey === "conv_auto_quote_when_qualified") return "quote_auto_notify_when_qualified"
  if (convKey === "conv_auto_ai_infer_status") return null
  if (!convKey.startsWith("conv_auto_")) return null
  return `quote_auto_${convKey.slice("conv_auto_".length)}`
}

const CLEAR_TEXT_ON_CARRY_TO_QUOTES = new Set([
  "quote_auto_reply_message",
  "quote_auto_reply_ai_brief",
  "quote_auto_phone_recording_url",
  "quote_auto_phone_tts_script",
  "quote_auto_scheduling_hold_message",
])

/**
 * Build `quotesAutomaticRepliesValues` from the Conversations modal values.
 * Custom text fields on Quotes are cleared; AI email/SMS approval defaults to on for Quotes.
 */
export function carryConversationAutoRepliesToQuoteValues(
  convVals: Record<string, string>,
  quoteItemIds: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [cKey, val] of Object.entries(convVals)) {
    const qKey = mapConvAutoReplyKeyToQuote(cKey)
    if (qKey && quoteItemIds.has(qKey)) out[qKey] = val
  }
  if (quoteItemIds.has("quote_auto_qualified_criteria")) {
    if (convVals.conv_auto_ai_infer_status === "checked") out.quote_auto_qualified_criteria = "AI decision"
    else out.quote_auto_qualified_criteria = "Signed quote attachment returned"
  }
  if (quoteItemIds.has("quote_auto_reply_ai_require_approval")) {
    out.quote_auto_reply_ai_require_approval = "checked"
  }
  for (const id of CLEAR_TEXT_ON_CARRY_TO_QUOTES) {
    if (quoteItemIds.has(id)) out[id] = ""
  }
  return out
}
