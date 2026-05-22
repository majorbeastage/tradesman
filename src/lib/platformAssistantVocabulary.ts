/**
 * Tradesman platform assistant — domain vocabulary, workflow phrase banks, and LLM catalog text.
 * Keeps routing aligned with how contractors talk about customers, estimates, SMS, and tabs.
 */

import { TAB_ID_LABELS } from "../types/portal-builder"

/** Subset of parse context used for vocabulary / catalog (avoids circular imports). */
export type AssistantVocabularyContext = {
  currentPage?: string
  selectedCustomerId?: string | null
  selectedCustomerName?: string | null
  selectedQuoteId?: string | null
}

export function normalizeAssistantPhrase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
}

/** Name-like fragment that is not a real customer name (deictic / pronoun). */
export function isDeicticCustomerReference(q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return /^(this|that|the|current|selected)\s+(customer|client)$/.test(t) || /^(them|him|her|this\s+one|that\s+one)$/.test(t)
}

/** User means the customer record already open in the UI. */
export function refersToSelectedCustomer(text: string): boolean {
  return (
    /\b(this|that|current|selected)\s+(customer|client)\b/i.test(text) ||
    /\b(customer|client)\s+(here|on\s+screen|i(?:'m| am)\s+(?:viewing|looking\s+at))\b/i.test(text) ||
    /\b(the\s+)?(customer|client)\s+i(?:'m| am)\s+on\b/i.test(text) ||
    /\b(for\s+)?(them|him|her)\b/i.test(text) ||
    /\bthis\s+one\b/i.test(text)
  )
}

const ESTIMATE_VERB =
  /\b(start|create|make|write|draft|build|prep(?:are)?|begin|open|new|add|do|run)\b/i
const ESTIMATE_NOUN = /\b(estimate|estimates|quote|quotes|proposal|bid|job\s+quote)\b/i

export function isCreateEstimatePhrase(text: string): boolean {
  if (ESTIMATE_VERB.test(text) && ESTIMATE_NOUN.test(text)) return true
  if (/\b(?:estimate|quote|proposal)\s+for\b/i.test(text)) return true
  if (/\b(?:new|another)\s+(?:estimate|quote)\b/i.test(text)) return true
  if (/\bprice\s+(?:this|that|the)\s+job\b/i.test(text)) return true
  return false
}

/** Open the specialty / variance report wizard on the current estimate (not the Reporting tab). */
export function isOpenSpecialtyReportPhrase(text: string): boolean {
  if (/\b(go\s+to|open)\s+(?:the\s+)?reporting\b/i.test(text) && !/\b(start|begin|create|launch|run)\b/i.test(text)) {
    return false
  }
  return (
    /\b(start|open|begin|create|launch|run)\s+(?:a\s+|the\s+)?(?:(?:variance|specialty|inspection|home)\s+)?(?:report|reports?)\b/i.test(
      text,
    ) ||
    /\b(start|open)\s+(?:the\s+)?(?:variance|specialty|inspection)\b/i.test(text) ||
    (/\bvariance\s+report\b/i.test(text) && /\b(start|open|begin|create|launch|run)\b/i.test(text)) ||
    /\bstart\s+report\b/i.test(text)
  )
}

export function isFocusSmsPhrase(text: string): boolean {
  return (
    /\b(text|sms|message|msg)(?:\s+them|\s+him|\s+her|\s+this\s+customer|\s+customer)?\b/i.test(text) ||
    /\bsend\s+(?:a\s+)?(?:text|sms|message)\b/i.test(text) ||
    /\bopen\s+(?:the\s+)?sms\b/i.test(text) ||
    /\bcompose\s+(?:a\s+)?(?:text|sms|message)\b/i.test(text) ||
    /\breply\s+(?:by\s+)?(?:text|sms)\b/i.test(text)
  )
}

/** Open/view customer record only — not estimate or SMS workflow. */
export function isOpenSelectedCustomerOnlyPhrase(text: string): boolean {
  if (!refersToSelectedCustomer(text)) return false
  if (isCreateEstimatePhrase(text) || isFocusSmsPhrase(text) || isOpenSpecialtyReportPhrase(text)) return false
  return (
    /\b(open|show|view|expand|go\s+to|pull\s+up|focus|see)\b/i.test(text) ||
    /\b(this|current|selected)\s+(customer|client)\b/i.test(text) ||
    /^\s*(customer|client)\s*$/i.test(text)
  )
}

/** Weak signal — still send to LLM when rules only clarified. */
export function phraseHasWorkflowCue(text: string): boolean {
  return (
    isCreateEstimatePhrase(text) ||
    isOpenSpecialtyReportPhrase(text) ||
    isFocusSmsPhrase(text) ||
    refersToSelectedCustomer(text) ||
    /\b(missed\s+call|voicemail|last\s+call)\b/i.test(text) ||
    /\b(find|open|show)\s+(?:customer|client)\b/i.test(text) ||
    /\bsetup\s+guide\b/i.test(text) ||
    /\b(line\s*items?|saved\s+lines?|job\s*types?)\b/i.test(text)
  )
}

/** Pull a customer name from estimate/SMS/general “for X” phrasing. */
export function extractNamedCustomerFromPhrase(text: string): string | null {
  const patterns = [
    /\b(?:estimate|quote|proposal|bid)\s+for\s+(?:customer\s+)?(.+?)\s*$/i,
    /\b(?:for|with)\s+(?:customer\s+)?(.+?)\s*$/i,
    /\b(?:open|start|create|make)\s+(?:an?\s+)?(?:estimate|quote)\s+for\s+(.+?)\s*$/i,
    /\b(?:text|sms|message)\s+(.+?)\s*$/i,
    /\b(?:customer|client)\s+(?:named\s+|called\s+)?(.+)/i,
    /\b(?:open|find|show|view|pull\s+up)\s+(?:the\s+)?(?:customer|client)\s+(.+)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m?.[1]) {
      const q = m[1]
        .replace(/\b(please|now|up|here)\b/gi, "")
        .replace(/^(the|a)\s+/i, "")
        .trim()
      if (q.length >= 2 && !isDeicticCustomerReference(q)) return q.slice(0, 80)
    }
  }
  return null
}

export function resolveCustomerTargetFromPhrase(
  text: string,
  ctx: AssistantVocabularyContext,
): { customerId?: string; customerQuery?: string } {
  if (refersToSelectedCustomer(text) && ctx.selectedCustomerId) {
    return { customerId: ctx.selectedCustomerId }
  }
  const named = extractNamedCustomerFromPhrase(text)
  if (named) return { customerQuery: named }
  if (ctx.currentPage === "customers" && ctx.selectedCustomerId && (isCreateEstimatePhrase(text) || isFocusSmsPhrase(text))) {
    return { customerId: ctx.selectedCustomerId }
  }
  if (ctx.currentPage === "customers" && ctx.selectedCustomerId && /\b(estimate|quote|text|sms)\b/i.test(text)) {
    return { customerId: ctx.selectedCustomerId }
  }
  return {}
}

/** Machine-readable domain training for Phase 2 LLM (append to routing catalog). */
export function buildPlatformAssistantDomainTraining(ctx: AssistantVocabularyContext): string {
  const lines: string[] = []
  lines.push("## Domain vocabulary (Tradesman contractor app)")
  lines.push("")
  lines.push("- **Customer** = client record on the Customers tab (contact, SMS thread, activity, lead score).")
  lines.push("- **Estimate** = same as **quote**; workspace tab id is `quotes` (UI label Estimates).")
  lines.push("- **create_estimate** = open Estimates and start or resume that customer’s quote wizard — NOT the same as navigate to quotes without a customer.")
  lines.push("- **focus_customer_sms** = open Customers, expand the customer, scroll to SMS compose — does NOT send automatically.")
  lines.push("- **open_current_customer** = re-focus the customer already open on Customers — do NOT use when user wants an estimate or SMS.")
  lines.push("- **find_customer** = search by name when no record is selected; use `customerQuery` with the name fragment only.")
  lines.push("- **open_last_missed_call** = most recent missed inbound call tied to a customer record.")
  lines.push(
    "- **open_specialty_report** = open Estimates and launch the specialty / variance report wizard (Start report) for the estimate on screen.",
  )
  lines.push("- **My T** / **account** = business phone, forwarding, voicemail (tab `account`).")
  lines.push("- **Leads** = inbound lead inbox; **Conversations** = message threads.")
  lines.push("- **Setup guide** / mini-wizards = in-app configuration (auto-replies, line items, scheduling alerts, etc.).")
  lines.push("")

  const page = ctx.currentPage?.trim()
  if (page) {
    lines.push(`### Active tab: ${TAB_ID_LABELS[page] ?? page} (\`${page}\`)`)
  }
  const custId = ctx.selectedCustomerId?.trim()
  const custName = ctx.selectedCustomerName?.trim()
  if (custId && custName) {
    lines.push(`### Customer open in UI: **${custName}**`)
    lines.push(
      `- User says "this customer", "them", "for him/her", or "start estimate" without a name → use **create_estimate** or **focus_customer_sms** with their name in the message; the app resolves the open record.`,
    )
    lines.push(`- Do NOT use find_customer with query "this customer" or "them".`)
    lines.push(`- Do NOT use open_current_customer when they ask for an estimate or quote — use create_estimate.`)
  } else if (page === "customers") {
    lines.push("### Customer open in UI: none — user must name a customer or pick a row first for estimate/SMS.")
  }
  lines.push("")

  lines.push("### Say it like this (maps to actions)")
  lines.push("| User might say | Action |")
  lines.push("|----------------|--------|")
  lines.push("| create / start / open / make an estimate (for this customer / for Mike) | create_estimate |")
  lines.push("| new quote, draft proposal, price this job, write up a bid | create_estimate |")
  lines.push("| text them, send SMS, message customer, open SMS | focus_customer_sms |")
  lines.push("| open customer Johnson, find client Mike, pull up Smith | find_customer |")
  lines.push("| last missed call, who called, missed voicemail | open_last_missed_call |")
  lines.push("| start report, open variance report, begin inspection report, specialty report | open_specialty_report |")
  lines.push("| what can I do here, help, explain this screen | explain |")
  lines.push("| customers, calendar, estimates tab, settings | navigate |")
  lines.push("| setup guide, get started | open_setup_guide |")
  lines.push("| automatic replies, estimate line items, call forwarding | open_mini_wizard |")
  lines.push("")

  lines.push("### Disambiguation")
  lines.push('- “open estimate” WITH a person name → create_estimate (not navigate).')
  lines.push('- “open estimate” with customer already on screen → create_estimate (no name needed).')
  lines.push('- “go to estimates” / estimates tab without a customer task → navigate to `quotes`.')
  lines.push('- “open this customer” without estimate/SMS words → open_current_customer.')
  lines.push('- “start report” / “open variance report” on an estimate → open_specialty_report (not navigate to Reporting).')
  lines.push('- “go to reporting” / reports tab → navigate to `reporting`.')

  const quoteId = ctx.selectedQuoteId?.trim()
  if (quoteId) {
    lines.push(`### Estimate open in UI: \`${quoteId.slice(0, 8)}…\` — open_specialty_report uses this row automatically.`)
  } else if (page === "quotes") {
    lines.push("### Estimate open in UI: none — open_specialty_report opens Estimates; user picks a row or asks again.")
  }

  return lines.join("\n")
}
