/**
 * Platform assistant intent registry (Phase 1).
 * Single source for navigation (intent 1) and configuration wizards (intent 2).
 * Catalog text is reused for Phase 2 LLM routing.
 */

import { TAB_ID_LABELS, USER_PORTAL_TAB_IDS, OFFICE_PORTAL_TAB_IDS } from "../types/portal-builder"
import { SETUP_MINI_WIZARDS, type SetupMiniWizardDef, type SetupMiniWizardId } from "./setupGuideWizards"

export type PlatformAssistantPlatform = "user" | "office_manager" | "admin"

export type AdminPanelId =
  | "signup"
  | "communications"
  | "users"
  | "billing"
  | "portal"
  | "tickets"
  | "about"

export type PlatformPageIntent = {
  kind: "page"
  page: string
  label: string
  /** Shown in clarify / LLM catalog */
  description: string
  platforms: PlatformAssistantPlatform[]
  patterns: RegExp[]
  /** When set, only match if tab is in the user's visible portal tabs */
  requiresTab?: boolean
}

export type PlatformWizardIntent = {
  kind: "wizard"
  wizardId: SetupMiniWizardId
  def: SetupMiniWizardDef
  patterns: RegExp[]
}

export type PlatformAdminIntent = {
  kind: "admin"
  panel: AdminPanelId
  label: string
  description: string
  patterns: RegExp[]
}

export const ADMIN_PANEL_LABELS: Record<AdminPanelId, string> = {
  signup: "Sign up requirements",
  communications: "Routing & Access",
  users: "Users & office managers",
  billing: "Billing & payments (admin)",
  portal: "Portal builder",
  tickets: "Trouble tickets",
  about: "About us (admin)",
}

/** Pages the assistant can open inside the user / office manager app shell. */
export const PLATFORM_PAGE_INTENTS: PlatformPageIntent[] = [
  {
    kind: "page",
    page: "dashboard",
    label: "Dashboard",
    description: "Home, quick links, today’s work, platform assistant",
    platforms: ["user", "office_manager"],
    patterns: [/\bdashboard\b/i, /\bhome\b/i, /\bquick\s+links?\b/i, /\btoday\b/i],
  },
  {
    kind: "page",
    page: "customers",
    label: TAB_ID_LABELS.customers,
    description: "Customer list, SMS, automatic replies, lead scoring",
    platforms: ["user", "office_manager"],
    patterns: [
      /\bcustomers?\b/i,
      /\bclients?\b/i,
      /\bclient\s+list\b/i,
      /\bcustomer\s+list\b/i,
      /\bcustomer\s+(page|tab|section)\b/i,
    ],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "leads",
    label: TAB_ID_LABELS.leads,
    description: "Incoming leads and lead table",
    platforms: ["user", "office_manager"],
    patterns: [/\bleads?\b/i, /\bincoming\s+leads?\b/i, /\blead\s+inbox\b/i],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "conversations",
    label: TAB_ID_LABELS.conversations,
    description: "Message threads with customers",
    platforms: ["user", "office_manager"],
    patterns: [/\bconversations?\b/i, /\bmessage\s+threads?\b/i, /\binbox\b/i, /\bchat\b/i],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "quotes",
    label: "Estimates",
    description: "Quotes, estimates, library, line items, job types",
    platforms: ["user", "office_manager"],
    patterns: [
      /\bestimates?\b/i,
      /\bquotes?\b/i,
      /\bquote\s+tool\b/i,
      /\bpricing\b/i,
      /\bestimate\s+library\b/i,
    ],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "calendar",
    label: TAB_ID_LABELS.calendar,
    description: "Scheduling, calendar, appointments, jobs on calendar",
    platforms: ["user", "office_manager"],
    patterns: [
      /\bcalendar\b/i,
      /\bschedul(e|ing)\b/i,
      /\bappointments?\b/i,
      /\bjob\s+calendar\b/i,
      /\bavailability\b/i,
    ],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "payments",
    label: TAB_ID_LABELS.payments,
    description: "Payments, Helcim, billing portal",
    platforms: ["user", "office_manager"],
    patterns: [/\bpayments?\b/i, /\bbilling\b/i, /\bhelcim\b/i, /\binvoices?\b/i, /\bmerchant\b/i],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "account",
    label: TAB_ID_LABELS.account,
    description: "My T — business phone, call forwarding, voicemail, profile",
    platforms: ["user", "office_manager"],
    patterns: [
      /\bmy\s*t\b/i,
      /\baccount\b/i,
      /\bbusiness\s+(phone|line|number)\b/i,
      /\bprofile\b/i,
      /\bvoicemail\b/i,
      /\bcall\s+forward/i,
    ],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "settings",
    label: TAB_ID_LABELS.settings,
    description: "App settings and custom fields (user portal)",
    platforms: ["user"],
    patterns: [/\bsettings?\b/i, /\bpreferences?\b/i, /\bcustom\s+fields?\b/i],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "web-support",
    label: TAB_ID_LABELS["web-support"],
    description: "Web support resources",
    platforms: ["user", "office_manager"],
    patterns: [/\bweb\s+support\b/i],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "tech-support",
    label: TAB_ID_LABELS["tech-support"],
    description: "Technical support",
    platforms: ["user", "office_manager"],
    patterns: [/\btech(nical)?\s+support\b/i, /\bhelp\s+desk\b/i],
    requiresTab: true,
  },
  {
    kind: "page",
    page: "reporting",
    label: "Reporting",
    description: "Variance reports, inspections, specialty reporting",
    platforms: ["user", "office_manager"],
    patterns: [/\breporting\b/i, /\breports?\b/i, /\bvariance\b/i, /\binspection\b/i, /\bspecialty\s+report/i],
  },
  {
    kind: "page",
    page: "insurance-options",
    label: "Insurance",
    description: "Insurance options (often from dashboard)",
    platforms: ["user", "office_manager"],
    patterns: [/\binsurance\b/i],
  },
]

/** Setup mini-wizards (intent 2 — configure). Patterns merged with each wizard def. */
export const PLATFORM_WIZARD_INTENTS: PlatformWizardIntent[] = SETUP_MINI_WIZARDS.map((def) => ({
  kind: "wizard" as const,
  wizardId: def.id,
  def,
  patterns: wizardPatternsForId(def.id),
}))

function wizardPatternsForId(id: SetupMiniWizardId): RegExp[] {
  switch (id) {
    case "customers_auto_replies":
      return [
        /\bautomatic\s+repl/i,
        /\bauto[\s-]?repl/i,
        /\breply\s+automation\b/i,
        /\bauto\s+response\b/i,
        /\blead\s+auto\s+repl/i,
      ]
    case "customers_lead_filters":
      return [
        /\blead\s+filter/i,
        /\bfilter\s+leads/i,
        /\bhot\s+lead/i,
        /\blead\s+scor/i,
        /\blead\s+alert/i,
        /\bscoring\s+rules?\b/i,
      ]
    case "estimates_line_items":
      return [
        /\bline\s+items?\b/i,
        /\bestimate\s+lines?\b/i,
        /\bprice\s+book\b/i,
        /\blibrary\s+lines?\b/i,
        /\breusable\s+lines?\b/i,
      ]
    case "estimates_job_types":
      return [/\bjob\s+types?\b/i, /\btypes?\s+of\s+jobs?\b/i, /\bestimate\s+job\s+type/i]
    case "scheduling_alerts":
      return [
        /\bschedul\w*\s+alerts?\b/i,
        /\bcalendar\s+alerts?\b/i,
        /\bjob\s+notifications?\b/i,
        /\bon[\s-]?the[\s-]?way\b/i,
        /\bpush\s+notifications?\b/i,
      ]
    case "scheduling_receipt_template":
      return [
        /\breceipt\s+template\b/i,
        /\bcompletion\s+receipt/i,
        /\breceipt\s+wording\b/i,
        /\bjob\s+receipt\b/i,
      ]
    case "myt_call_forwarding":
      return [/\bcall\s+forward/i, /\bforward\s+calls?\b/i, /\bring\s+my\s+cell\b/i, /\bwhisper\b/i]
    case "myt_voicemail_greeting":
      return [/\bvoicemail\b/i, /\bgreeting\s+recording\b/i, /\bmissed\s+call\s+message\b/i, /\bgreeting\s+text\b/i]
    default:
      return []
  }
}

export const PLATFORM_ADMIN_INTENTS: PlatformAdminIntent[] = [
  {
    kind: "admin",
    panel: "portal",
    label: ADMIN_PANEL_LABELS.portal,
    description: "Configure portal tabs, controls, and options per user or audience",
    patterns: [
      /\bportal\s+builder\b/i,
      /\bportal\s+config/i,
      /\blow[\s-]?code\b/i,
      /\bcontrol\s+items?\b/i,
      /\bcustomize\s+portal\b/i,
      /\badmin\s+portal\b/i,
      /\bopen\s+admin\b/i,
      /\badmin\s+panel\b/i,
      /\bback\s+office\b/i,
    ],
  },
  {
    kind: "admin",
    panel: "users",
    label: ADMIN_PANEL_LABELS.users,
    description: "Manage users, office managers, and profiles",
    patterns: [/\busers?\s+and\s+office/i, /\boffice\s+managers?\b/i, /\bmanage\s+users?\b/i, /\buser\s+list\b/i],
  },
  {
    kind: "admin",
    panel: "communications",
    label: ADMIN_PANEL_LABELS.communications,
    description: "Routing, access, and communications settings",
    patterns: [/\brouting\b/i, /\baccess\s+control\b/i, /\bcommunications?\b/i],
  },
  {
    kind: "admin",
    panel: "signup",
    label: ADMIN_PANEL_LABELS.signup,
    description: "Sign-up requirements and onboarding rules",
    patterns: [/\bsign[\s-]?up\s+req/i, /\bonboarding\s+req/i, /\bregistration\s+req/i],
  },
  {
    kind: "admin",
    panel: "tickets",
    label: ADMIN_PANEL_LABELS.tickets,
    description: "Trouble tickets and support escalations",
    patterns: [/\btrouble\s+tickets?\b/i, /\bsupport\s+tickets?\b/i, /\bticket\s+queue\b/i],
  },
  {
    kind: "admin",
    panel: "billing",
    label: ADMIN_PANEL_LABELS.billing,
    description: "Admin billing and payments configuration",
    patterns: [/\badmin\s+billing\b/i, /\bplatform\s+billing\b/i, /\bmerchant\s+setup\b/i],
  },
  {
    kind: "admin",
    panel: "about",
    label: ADMIN_PANEL_LABELS.about,
    description: "About us content for the public site",
    patterns: [/\babout\s+us\b/i, /\bcompany\s+info\b/i],
  },
]

export const ASSISTANT_ADMIN_PANEL_STORAGE_KEY = "tradesman_assistant_admin_panel"

export function defaultTabIdsForPlatform(platform: PlatformAssistantPlatform): readonly string[] {
  if (platform === "office_manager") return OFFICE_PORTAL_TAB_IDS
  if (platform === "admin") return []
  return USER_PORTAL_TAB_IDS
}

/** Human + machine-readable catalog for clarify messages and Phase 2 LLM system context. */
export function buildPlatformAssistantCatalogText(ctx: {
  platform: PlatformAssistantPlatform
  availableTabIds?: string[]
  isAdmin?: boolean
  currentPage?: string
  selectedCustomerId?: string | null
  selectedCustomerName?: string | null
}): string {
  const lines: string[] = []
  lines.push("## Tradesman platform assistant — allowed actions")
  lines.push("")
  lines.push(`Current shell: **${ctx.platform}**${ctx.isAdmin ? " (user is admin)" : ""}.`)
  if (ctx.currentPage?.trim()) {
    lines.push(`Active tab: **${TAB_ID_LABELS[ctx.currentPage] ?? ctx.currentPage}** (\`${ctx.currentPage}\`). Prefer setup wizards on this tab when the user says “open” or “expand” without naming another area.`)
  }
  const selName = ctx.selectedCustomerName?.trim()
  if (ctx.selectedCustomerId?.trim() && selName) {
    lines.push(`Customer record open in UI: **${selName}** — prefer create_estimate / focus_customer_sms without repeating the name; use open_current_customer only to re-focus the row.`)
  }
  lines.push("")

  const tabSet = ctx.availableTabIds?.length ? new Set(ctx.availableTabIds) : null

  lines.push("### Navigate (open app tab)")
  for (const row of PLATFORM_PAGE_INTENTS) {
    if (!row.platforms.includes(ctx.platform) && ctx.platform !== "admin") continue
    if (tabSet && row.requiresTab && !tabSet.has(row.page)) continue
    const examples = row.patterns.slice(0, 2).map((p) => p.source.replace(/\\b/g, "").replace(/\\/g, ""))
    lines.push(`- **${row.label}** (\`${row.page}\`): ${row.description}. Say e.g. ${examples.join(", ")}.`)
  }

  lines.push("")
  lines.push("### Configure (setup mini-wizard)")
  for (const row of PLATFORM_WIZARD_INTENTS) {
    const d = row.def
    lines.push(`- **${d.label}** (\`${row.wizardId}\`): ${d.summary} Location: ${d.locationHint}.`)
  }

  lines.push("")
  lines.push("### Setup guide")
  lines.push("- **setup guide** / **initial setup** / **get started** — full Setup Guide wizard.")

  if (ctx.isAdmin || ctx.platform === "admin") {
    lines.push("")
    lines.push("### Admin portal (admin login only)")
    const seenAdmin = new Set<string>()
    for (const row of PLATFORM_ADMIN_INTENTS) {
      if (seenAdmin.has(row.panel)) continue
      seenAdmin.add(row.panel)
      lines.push(`- **${row.label}** (\`${row.panel}\`): ${row.description}`)
    }
    lines.push("- The in-app **Portal builder assistant** (separate chat) helps edit `controlItems` JSON per tab/control.")
  }

  lines.push("")
  lines.push("### Find customer (assistant)")
  lines.push("- “open customer Johnson”, “find client Mike”, “show customer Smith” — opens Customers and expands their record.")
  lines.push("- “last missed call”, “take me to the customer I missed a call for” — opens Customers and expands the most recent missed inbound call.")
  lines.push("- “this customer” / “expand this customer” — uses the customer row you have open on Customers.")

  lines.push("")
  lines.push("### Do work (customer + estimate + SMS)")
  lines.push("- Estimates: “create an estimate”, “open quote for Mike”, “new proposal for this customer”, “price this job”, “write up a bid”.")
  lines.push("- SMS: “text them”, “send a message”, “open SMS”, “reply by text” (opens compose; does not auto-send).")
  lines.push("- Customer: “open customer Johnson”, “find client Smith”; with someone on screen: “this customer”, “for them”.")
  lines.push("- Help: “what can I do here”, “help me on this screen”, “explain this”.")

  lines.push("")
  lines.push("### Not yet supported")
  lines.push("- Sending SMS automatically (opens compose only). Bulk actions.")
  return lines.join("\n")
}

export function suggestPhrasesForPlatform(platform: PlatformAssistantPlatform, limit = 8): string[] {
  const phrases: string[] = [
    "create estimate for this customer",
    "text them",
    "last missed call",
    "open customer Smith",
    "help me here",
    "setup guide",
  ]
  if (platform === "user") phrases.push("settings", "payments")
  if (platform !== "user") phrases.push("scheduling alerts", "estimate line items")
  phrases.push("call forwarding", "portal builder")
  return phrases.slice(0, limit)
}
