/** Map a Conversations automatic-replies field id to its Quotes counterpart. */
export function mapConvAutoReplyKeyToQuote(convKey: string): string | null {
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
/** Map a Quotes automatic-replies field id to its Conversations counterpart. */
export function mapQuoteAutoReplyKeyToConv(qKey: string): string | null {
  if (!qKey.startsWith("quote_auto_")) return null
  return `conv_auto_${qKey.slice("quote_auto_".length)}`
}

/**
 * Build `conversationsAutomaticRepliesValues` from the Quotes modal values.
 */
export function carryQuoteToConversationValues(
  quoteVals: Record<string, string>,
  convItemIds: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [qKey, val] of Object.entries(quoteVals)) {
    const cKey = mapQuoteAutoReplyKeyToConv(qKey)
    if (cKey && convItemIds.has(cKey)) out[cKey] = val
  }
  return out
}

export function carryConversationAutoRepliesToQuoteValues(
  convVals: Record<string, string>,
  quoteItemIds: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [cKey, val] of Object.entries(convVals)) {
    const qKey = mapConvAutoReplyKeyToQuote(cKey)
    if (qKey && quoteItemIds.has(qKey)) out[qKey] = val
  }
  if (quoteItemIds.has("quote_auto_reply_ai_require_approval")) {
    out.quote_auto_reply_ai_require_approval = "checked"
  }
  for (const id of CLEAR_TEXT_ON_CARRY_TO_QUOTES) {
    if (quoteItemIds.has(id)) out[id] = ""
  }
  return out
}
