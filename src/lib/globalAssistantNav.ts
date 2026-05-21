/** Command routing for the platform assistant (rules-first; expand with AI API later). */

import type { SetupMiniWizardId } from "./setupGuideWizards"

export type GlobalAssistantAction =
  | { type: "navigate"; page: string; message: string }
  | { type: "open_setup_guide"; message: string }
  | { type: "open_mini_wizard"; wizardId: SetupMiniWizardId; message: string }
  | { type: "clarify"; message: string }

const PAGE_ALIASES: Array<{ page: string; patterns: RegExp[] }> = [
  { page: "dashboard", patterns: [/\bdashboard\b/i, /\bhome\b/i] },
  { page: "customers", patterns: [/\bcustomers?\b/i, /\bclients?\b/i] },
  { page: "quotes", patterns: [/\bestimates?\b/i, /\bquotes?\b/i] },
  { page: "calendar", patterns: [/\bcalendar\b/i, /\bschedul(e|ing)\b/i, /\bappointments?\b/i] },
  { page: "account", patterns: [/\bmy\s*t\b/i, /\baccount\b/i, /\bprofile\b/i] },
  { page: "settings", patterns: [/\bsettings?\b/i] },
  { page: "payments", patterns: [/\bpayments?\b/i, /\bbilling\b/i, /\bhelcim\b/i] },
  { page: "conversations", patterns: [/\bconversations?\b/i, /\bmessages?\b/i] },
  { page: "leads", patterns: [/\bleads?\b/i] },
  { page: "reporting", patterns: [/\breporting\b/i, /\breports?\b/i, /\bvariance\b/i, /\binspection\b/i] },
  { page: "insurance-options", patterns: [/\binsurance\b/i] },
]

const WIZARD_ALIASES: Array<{ wizardId: SetupMiniWizardId; patterns: RegExp[] }> = [
  {
    wizardId: "customers_auto_replies",
    patterns: [/\bautomatic\s+repl/i, /\bauto[\s-]?repl/i, /\breply\s+automation\b/i],
  },
  {
    wizardId: "customers_lead_filters",
    patterns: [/\blead\s+filter/i, /\bfilter\s+leads/i, /\bhot\s+lead/i, /\blead\s+scor/i, /\blead\s+alert/i],
  },
  {
    wizardId: "estimates_line_items",
    patterns: [/\bline\s+items?\b/i, /\bestimate\s+lines?\b/i, /\bprice\s+book\b/i, /\blibrary\s+lines?\b/i],
  },
  {
    wizardId: "estimates_job_types",
    patterns: [/\bjob\s+types?\b/i, /\btypes?\s+of\s+jobs?\b/i],
  },
  {
    wizardId: "scheduling_alerts",
    patterns: [/\bschedul\w*\s+alerts?\b/i, /\bcalendar\s+alerts?\b/i, /\bjob\s+notifications?\b/i],
  },
  {
    wizardId: "scheduling_receipt_template",
    patterns: [/\breceipt\s+template\b/i, /\bcompletion\s+receipt/i, /\breceipt\s+wording\b/i],
  },
  {
    wizardId: "myt_call_forwarding",
    patterns: [/\bcall\s+forward/i, /\bforward\s+calls?\b/i, /\bring\s+my\s+cell\b/i],
  },
  {
    wizardId: "myt_voicemail_greeting",
    patterns: [/\bvoicemail\b/i, /\bgreeting\s+recording\b/i, /\bmissed\s+call\s+message\b/i],
  },
]

const PAGE_LABELS: Record<string, string> = {
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

export function parseGlobalAssistantCommand(raw: string): GlobalAssistantAction {
  const text = raw.trim()
  if (!text) {
    return {
      type: "clarify",
      message: "Tell me what you would like to do — for example “take me to customers” or “set up automatic replies”.",
    }
  }

  if (/\bsetup\s+guide\b/i.test(text) || /\binitial\s+setup\b/i.test(text) || /\bget\s+started\b/i.test(text)) {
    return { type: "open_setup_guide", message: "Opening the Setup Guide." }
  }

  for (const row of WIZARD_ALIASES) {
    if (row.patterns.some((p) => p.test(text))) {
      return {
        type: "open_mini_wizard",
        wizardId: row.wizardId,
        message: `Opening the ${row.wizardId.replace(/_/g, " ")} setup wizard.`,
      }
    }
  }

  if (/\bschedul/i.test(text) && /\b(problem|issue|help|confus|wrong)\b/i.test(text)) {
    return {
      type: "navigate",
      page: "calendar",
      message: "Opening Scheduling. Try “scheduling alerts” or “receipt template” for a guided setup.",
    }
  }

  for (const row of PAGE_ALIASES) {
    if (row.patterns.some((p) => p.test(text))) {
      return { type: "navigate", page: row.page, message: `Opening ${PAGE_LABELS[row.page] ?? row.page}.` }
    }
  }

  return {
    type: "clarify",
    message:
      'Try “take me to customers”, “automatic replies”, “line items”, “job types”, “scheduling alerts”, “call forwarding”, or “setup guide”.',
  }
}
