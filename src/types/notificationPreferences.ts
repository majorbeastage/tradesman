/** Per-channel notification rules when a record's status changes (stored in profiles.metadata). */

export type NotificationTabId = "leads" | "conversations" | "quotes" | "calendar" | "customers"

/** Push / email / SMS toggles + which statuses fire. */
export type StatusChannelPrefs = {
  onStatusChange: boolean
  statuses: string[]
}

export type TabNotificationPrefs = {
  push: StatusChannelPrefs
  email: StatusChannelPrefs
  sms: StatusChannelPrefs
  /** Calendar-only: customer messaging & scheduling assists (server hooks later). */
  calendarCustomerEnRouteEmail?: boolean
  calendarCustomerEnRouteSms?: boolean
  calendarJobEndReminder?: boolean
  calendarNextJobReminder?: boolean
}

export type TabNotificationsMap = Partial<Record<NotificationTabId, TabNotificationPrefs>>

export const NOTIFICATION_METADATA_KEY = "tabNotifications" as const
