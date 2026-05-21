/**
 * Registry of in-app setup mini-wizards. Main Setup Guide links here; each area implements its own flow.
 */

export type SetupMiniWizardId =
  | "customers_auto_replies"
  | "customers_lead_filters"
  | "estimates_line_items"
  | "estimates_job_types"
  | "scheduling_alerts"
  | "scheduling_receipt_template"
  | "myt_call_forwarding"
  | "myt_voicemail_greeting"

export type SetupMiniWizardDef = {
  id: SetupMiniWizardId
  label: string
  page: string
  /** Where to find it in the UI after navigation */
  locationHint: string
  /** Shown in main guide; true until a dedicated wizard component exists */
  comingSoon?: boolean
}

export const SETUP_MINI_WIZARDS: SetupMiniWizardDef[] = [
  {
    id: "customers_auto_replies",
    label: "Automatic replies",
    page: "customers",
    locationHint: "Customers → Automatic replies (top action bar)",
    comingSoon: true,
  },
  {
    id: "customers_lead_filters",
    label: "Lead filters & alerts",
    page: "customers",
    locationHint: "Customers → Lead filter preferences and Alerts",
    comingSoon: true,
  },
  {
    id: "estimates_line_items",
    label: "Estimate line items",
    page: "quotes",
    locationHint: "Estimates → Library → Estimate line items",
    comingSoon: true,
  },
  {
    id: "estimates_job_types",
    label: "Job types",
    page: "quotes",
    locationHint: "Estimates → Library → Job types",
    comingSoon: true,
  },
  {
    id: "scheduling_alerts",
    label: "Scheduling alerts",
    page: "calendar",
    locationHint: "Scheduling → Alerts",
    comingSoon: true,
  },
  {
    id: "scheduling_receipt_template",
    label: "Receipt template",
    page: "calendar",
    locationHint: "Scheduling → Receipt template",
    comingSoon: true,
  },
  {
    id: "myt_call_forwarding",
    label: "Call forwarding",
    page: "account",
    locationHint: "My T → Call forwarding",
    comingSoon: true,
  },
  {
    id: "myt_voicemail_greeting",
    label: "Voicemail greeting",
    page: "account",
    locationHint: "My T → Voicemail greeting",
    comingSoon: true,
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
    default:
      return []
  }
}
