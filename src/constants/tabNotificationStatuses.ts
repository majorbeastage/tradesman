import { CONVERSATION_STATUS_OPTIONS } from "../types/portal-builder"
import type { NotificationTabId } from "../types/notificationPreferences"

const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Lost"] as const

/** Quote / job pipeline — align with common DB values; user can add custom in UI later. */
const QUOTE_STATUSES = ["draft", "sent", "viewed", "accepted", "declined", "expired", "scheduled", "completed"] as const

const CALENDAR_STATUSES = ["Scheduled", "In progress", "Completed", "Cancelled"] as const

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
    default:
      return []
  }
}
