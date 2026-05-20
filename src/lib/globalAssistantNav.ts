/** Lightweight command routing for the global platform assistant (expand with AI later). */

export type GlobalAssistantAction =
  | { type: "navigate"; page: string; message: string }
  | { type: "open_setup_guide"; message: string }
  | { type: "clarify"; message: string }

const PAGE_ALIASES: Array<{ page: string; patterns: RegExp[] }> = [
  { page: "dashboard", patterns: [/\bdashboard\b/i, /\bhome\b/i] },
  { page: "customers", patterns: [/\bcustomers?\b/i, /\bclients?\b/i] },
  { page: "quotes", patterns: [/\bestimates?\b/i, /\bquotes?\b/i] },
  { page: "calendar", patterns: [/\bcalendar\b/i, /\bschedul(e|ing)\b/i, /\bappointments?\b/i] },
  { page: "account", patterns: [/\bmy\s*t\b/i, /\baccount\b/i, /\bprofile\b/i, /\bvoicemail\b/i, /\bforward(ing)?\b/i] },
  { page: "settings", patterns: [/\bsettings?\b/i, /\bautomatic\s+repl/i] },
  { page: "payments", patterns: [/\bpayments?\b/i, /\bbilling\b/i, /\bhelcim\b/i] },
  { page: "conversations", patterns: [/\bconversations?\b/i, /\bmessages?\b/i, /\bsms\b/i] },
  { page: "leads", patterns: [/\bleads?\b/i] },
  { page: "reporting", patterns: [/\breporting\b/i, /\breports?\b/i] },
  { page: "insurance-options", patterns: [/\binsurance\b/i] },
]

export function parseGlobalAssistantCommand(raw: string): GlobalAssistantAction {
  const text = raw.trim()
  if (!text) {
    return { type: "clarify", message: "Tell me what you would like to do — for example “take me to customers” or “open setup guide”." }
  }

  if (/\bsetup\s+guide\b/i.test(text) || /\binitial\s+setup\b/i.test(text) || /\bget\s+started\b/i.test(text)) {
    return { type: "open_setup_guide", message: "Opening the Setup Guide." }
  }

  if (/\b(job\s+types?|line\s+items?|estimate\s+library)\b/i.test(text)) {
    return {
      type: "navigate",
      page: "quotes",
      message: "Opening Estimates — use Library for line items and job types.",
    }
  }

  if (/\bschedul/i.test(text) && /\b(problem|issue|help|confus|wrong)\b/i.test(text)) {
    return {
      type: "navigate",
      page: "calendar",
      message: "Opening Scheduling. Say “scheduling tools” or “alerts” if you need a specific panel.",
    }
  }

  for (const row of PAGE_ALIASES) {
    if (row.patterns.some((p) => p.test(text))) {
      const labels: Record<string, string> = {
        dashboard: "Dashboard",
        customers: "Customers",
        quotes: "Estimates",
        calendar: "Scheduling",
        account: "My T",
        settings: "Settings",
        payments: "Payments",
        conversations: "Conversations",
        leads: "Leads",
        reporting: "Reporting",
        "insurance-options": "Insurance",
      }
      return { type: "navigate", page: row.page, message: `Opening ${labels[row.page] ?? row.page}.` }
    }
  }

  return {
    type: "clarify",
    message:
      "I am not sure yet. Try “take me to customers”, “open estimates”, “scheduling”, “payments”, or “setup guide”. More AI routing is coming soon.",
  }
}
