/**
 * Registry of in-app setup mini-wizards. Main Setup Guide links here; each area implements its own flow.
 */

export type SetupMiniWizardId =
  | "customers_auto_replies"
  | "customers_lead_filters"
  | "estimates_line_items"
  | "estimates_job_types"
  | "scheduling_alerts"
  | "scheduling_add_to_calendar"
  | "scheduling_receipt_template"
  | "myt_call_forwarding"
  | "myt_voicemail_greeting"
  | "myt_call_screening"
  | "operations_team_management"
  | "organization_chart"
  | "business_workflow"

export type SetupMiniWizardDef = {
  id: SetupMiniWizardId
  label: string
  page: string
  /** Where to find it in the UI after navigation */
  locationHint: string
  summary: string
}

export function getSetupMiniWizardDef(id: SetupMiniWizardId): SetupMiniWizardDef | undefined {
  return SETUP_MINI_WIZARDS.find((w) => w.id === id)
}

export const SETUP_MINI_WIZARDS: SetupMiniWizardDef[] = [
  {
    id: "customers_auto_replies",
    label: "Automatic replies",
    page: "customers",
    locationHint: "Customers → Automatic replies",
    summary: "Turn on replies, pick a channel, and optional AI drafts.",
  },
  {
    id: "customers_lead_filters",
    label: "Lead filters & alerts",
    page: "customers",
    locationHint: "Customers → Lead scoring rules",
    summary: "Job types, minimum size, auto-scoring, and urgent notifications.",
  },
  {
    id: "estimates_line_items",
    label: "Estimate line items",
    page: "quotes",
    locationHint: "Estimates → Library → Line items",
    summary: "Speak or type one line item; we fill title, qty, and price.",
  },
  {
    id: "estimates_job_types",
    label: "Job types",
    page: "quotes",
    locationHint: "Estimates → Library → Job types",
    summary: "Name, duration, and color for a reusable job type.",
  },
  {
    id: "scheduling_alerts",
    label: "Scheduling alerts",
    page: "calendar",
    locationHint: "Scheduling → Alerts",
    summary: "Push, email, SMS, and on-the-way customer messages.",
  },
  {
    id: "scheduling_add_to_calendar",
    label: "Add to calendar",
    page: "calendar",
    locationHint: "Scheduling → Add item to calendar → Guide",
    summary: "Walk through customer, job type, date, and duration before scheduling.",
  },
  {
    id: "scheduling_receipt_template",
    label: "Receipt template",
    page: "calendar",
    locationHint: "Scheduling → Receipt template",
    summary: "Intro line, logo, and itemized receipt defaults.",
  },
  {
    id: "myt_call_forwarding",
    label: "Call forwarding",
    page: "account",
    locationHint: "My T → Call forwarding",
    summary: "Ring your cell from your business line with optional whisper.",
  },
  {
    id: "myt_voicemail_greeting",
    label: "Voicemail greeting",
    page: "account",
    locationHint: "My T → Voicemail greeting",
    summary: "Recorded or text-to-speech greeting for missed calls.",
  },
  {
    id: "myt_call_screening",
    label: "Call screening",
    page: "account",
    locationHint: "My T → Call screening",
    summary: "Optional AI or recorded menu before forwarding — off by default.",
  },
  {
    id: "operations_team_management",
    label: "Team management",
    page: "operations-team_management",
    locationHint: "Operations → Team management",
    summary: "Technicians, calendar policies, and crew assignments.",
  },
  {
    id: "organization_chart",
    label: "Organization chart",
    page: "organization-chart",
    locationHint: "Dashboard quick link or Organization chart",
    summary: "Roles and reporting lines for your company.",
  },
  {
    id: "business_workflow",
    label: "Business workflow",
    page: "business-workflow",
    locationHint: "Dashboard quick link or My Business Workflow",
    summary: "Process map with steps, arrows, and assigned users.",
  },
]

export function miniWizardsForSetupStep(stepId: string): SetupMiniWizardDef[] {
  switch (stepId) {
    case "customers":
      return SETUP_MINI_WIZARDS.filter((w) => w.id.startsWith("customers_"))
    case "estimates":
      return SETUP_MINI_WIZARDS.filter((w) => w.id.startsWith("estimates_"))
    case "scheduling":
      return SETUP_MINI_WIZARDS.filter((w) => w.id.startsWith("scheduling_"))
    case "myt":
      return SETUP_MINI_WIZARDS.filter((w) => w.id.startsWith("myt_"))
    case "operations":
      return SETUP_MINI_WIZARDS.filter((w) => w.id === "operations_team_management")
    case "corporate_tools":
      return SETUP_MINI_WIZARDS.filter((w) => w.id === "organization_chart" || w.id === "business_workflow")
    default:
      return []
  }
}
