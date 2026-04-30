import { CONVERSATION_STATUS_OPTIONS } from "../types/portal-builder"
import type { NotificationTabId } from "../types/notificationPreferences"

const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Lost"] as const

/** Quote / job pipeline — align with common DB values; user can add custom in UI later. */
const QUOTE_STATUSES = ["draft", "sent", "viewed", "accepted", "declined", "expired", "scheduled", "completed"] as const

/** Quote detail status `<select>` — values must match Alerts → Quotes status checkboxes (lowercase). */
export const QUOTE_STATUS_SELECT_OPTIONS: { value: string; label: string }[] = QUOTE_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

const CALENDAR_STATUSES = ["Scheduled", "In progress", "Completed", "Cancelled"] as const

/** Customers hub — pipeline stages (align with job_pipeline_status when saved). */
const CUSTOMERS_PIPELINE_STATUSES = [
  "New Lead",
  "First Contact Sent",
  "First Reply Received",
  "Job Description Received",
  "Quote Sent",
  "Quote Approved",
  "Scheduled",
  "Lost",
  "Completed",
] as const

export function statusOptionsForTab(tab: NotificationTabId): readonly string[] {
  switch (tab) {
    case "leads":
      return LEAD_STATUSES as unknown as readonly string[]
    case "conversations":
      return CONVERSATION_STATUS_OPTIONS as unknown as readonly string[]
    case "quotes":
      return QUOTE_STATUSES as unknown as readonly string[]
    case "calendar":
      return CALENDAR_STATUSES as unknown as readonly string[]
    case "customers":
      return CUSTOMERS_PIPELINE_STATUSES as unknown as readonly string[]
    default:
      return []
  }
}
