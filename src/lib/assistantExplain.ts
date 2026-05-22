import { TAB_ID_LABELS } from "../types/portal-builder"
import type { GlobalAssistantParseContext } from "./globalAssistantNav"
/** Rule-based contextual help (Phase 3) — no extra API call. */
export function buildAssistantExplainMessage(ctx: GlobalAssistantParseContext, _userPhrase: string): string {
  const page = ctx.currentPage?.trim() || "dashboard"
  const pageLabel = TAB_ID_LABELS[page] ?? page
  const cust = ctx.selectedCustomerName?.trim()
  const onCustomers = page === "customers"

  if (onCustomers && cust) {
    return [
      `You are on ${pageLabel} with ${cust} open.`,
      "Use the SMS section to text them (opt-in required for manually added numbers).",
      'Try “create estimate for this customer”, “open quote”, “text them”, or “help me here”.',
    ].join(" ")
  }

  if (onCustomers) {
    return [
      `You are on ${pageLabel}. Pick a customer from the list, then use voice for “text them” or “start estimate”.`,
      'Or say “last missed call” to jump to a recent missed inbound call.',
    ].join(" ")
  }

  if (page === "quotes") {
    return [
      `You are on ${pageLabel} (estimate workspace).`,
      "Use Start quote for the guided flow, or say “estimate line items” / “job types” for library setup.",
      cust ? `Linked customer context: ${cust}.` : "",
    ]
      .filter(Boolean)
      .join(" ")
  }

  if (page === "calendar") {
    return [
      `You are on ${pageLabel}.`,
      'Say “scheduling alerts”, “receipt template”, or “team map” for setup wizards on this tab.',
    ].join(" ")
  }

  if (page === "dashboard") {
    return [
      "You are on the Dashboard — quick links and the assistant field at the top.",
      'Try “take me to customers”, “setup guide”, or “last missed call”.',
    ].join(" ")
  }

  return [
    `You are on ${pageLabel}.`,
    "Tell me a tab (“customers”, “calendar”) or a task (“setup guide”, “start estimate for Smith”).",
  ].join(" ")
}
