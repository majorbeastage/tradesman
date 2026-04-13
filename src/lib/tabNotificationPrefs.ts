import type { NotificationTabId, TabNotificationPrefs, TabNotificationsMap } from "../types/notificationPreferences"
import { NOTIFICATION_METADATA_KEY } from "../types/notificationPreferences"

function emptyChannel() {
  return { onStatusChange: false, statuses: [] as string[] }
}

export function defaultTabNotificationPrefs(): TabNotificationPrefs {
  return {
    push: emptyChannel(),
    email: emptyChannel(),
    sms: emptyChannel(),
    calendarCustomerEnRouteEmail: false,
    calendarCustomerEnRouteSms: false,
    calendarJobEndReminder: false,
    calendarNextJobReminder: false,
  }
}

export function parseTabNotificationsMap(raw: unknown): TabNotificationsMap {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  const inner = o[NOTIFICATION_METADATA_KEY]
  if (!inner || typeof inner !== "object") return {}
  return inner as TabNotificationsMap
}

export function getPrefsForTab(map: TabNotificationsMap, tab: NotificationTabId): TabNotificationPrefs {
  const cur = map[tab]
  const base = defaultTabNotificationPrefs()
  if (!cur) return base
  return {
    push: {
      onStatusChange: !!cur.push?.onStatusChange,
      statuses: Array.isArray(cur.push?.statuses) ? [...cur.push!.statuses] : [],
    },
    email: {
      onStatusChange: !!cur.email?.onStatusChange,
      statuses: Array.isArray(cur.email?.statuses) ? [...cur.email!.statuses] : [],
    },
    sms: {
      onStatusChange: !!cur.sms?.onStatusChange,
      statuses: Array.isArray(cur.sms?.statuses) ? [...cur.sms!.statuses] : [],
    },
    calendarCustomerEnRouteEmail: !!cur.calendarCustomerEnRouteEmail,
    calendarCustomerEnRouteSms: !!cur.calendarCustomerEnRouteSms,
    calendarJobEndReminder: !!cur.calendarJobEndReminder,
    calendarNextJobReminder: !!cur.calendarNextJobReminder,
  }
}

export function setPrefsForTab(map: TabNotificationsMap, tab: NotificationTabId, prefs: TabNotificationPrefs): TabNotificationsMap {
  return { ...map, [tab]: prefs }
}
