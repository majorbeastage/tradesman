/**
 * Unified notification preferences (profiles.metadata.notification_prefs_v1).
 *
 * Replaces the per-status alert model for the consolidated "Mobile App and
 * Notifications" section. Each trigger can deliver to the mobile app (push)
 * and/or the desktop notification center. Time-based triggers
 * (calendar_upcoming, assigned_step_ready) are evaluated server-side by the
 * scheduled notify function.
 */

export const NOTIFICATION_PREFS_KEY = "notification_prefs_v1"

export type NotificationTriggerId =
  | "new_lead"
  | "estimate_approved"
  | "calendar_upcoming"
  | "calendar_completed"
  | "workflow_step_completed"
  | "assigned_step_ready"

export type NotificationDelivery = {
  mobile: boolean
  desktop: boolean
}

export type NotificationPrefsV1 = {
  v: 1
  triggers: Record<NotificationTriggerId, NotificationDelivery>
  /** Lead time (minutes) for the "calendar event upcoming" alert. */
  calendarUpcomingLeadMinutes: number
  customer: {
    enRouteText: boolean
    enRouteEmail: boolean
  }
  updatedAt?: string
}

export const NOTIFICATION_TRIGGER_IDS: NotificationTriggerId[] = [
  "new_lead",
  "estimate_approved",
  "calendar_upcoming",
  "calendar_completed",
  "workflow_step_completed",
  "assigned_step_ready",
]

export const NOTIFICATION_TRIGGER_LABELS: Record<NotificationTriggerId, string> = {
  new_lead: "When a new lead is received",
  estimate_approved: "When an estimate is approved by the customer",
  calendar_upcoming: "When a calendar event is upcoming",
  calendar_completed: "When a calendar event is completed",
  workflow_step_completed: "When any workflow step is completed",
  assigned_step_ready: "When an assigned workflow step is ready",
}

/** Options (minutes) for the calendar_upcoming lead-time dropdown. */
export const CALENDAR_UPCOMING_LEAD_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 15, label: "15 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 240, label: "4 hours before" },
  { minutes: 720, label: "12 hours before" },
  { minutes: 1440, label: "1 day before" },
]

function defaultDelivery(mobile = false, desktop = true): NotificationDelivery {
  return { mobile, desktop }
}

export function defaultNotificationPrefs(): NotificationPrefsV1 {
  return {
    v: 1,
    triggers: {
      new_lead: defaultDelivery(false, true),
      estimate_approved: defaultDelivery(false, true),
      calendar_upcoming: defaultDelivery(false, true),
      calendar_completed: defaultDelivery(false, true),
      workflow_step_completed: defaultDelivery(false, false),
      assigned_step_ready: defaultDelivery(false, true),
    },
    calendarUpcomingLeadMinutes: 60,
    customer: { enRouteText: false, enRouteEmail: false },
  }
}

function parseDelivery(raw: unknown): NotificationDelivery {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultDelivery(false, false)
  const o = raw as Record<string, unknown>
  return { mobile: o.mobile === true, desktop: o.desktop === true }
}

export function parseNotificationPrefs(metadata: unknown): NotificationPrefsV1 {
  const base = defaultNotificationPrefs()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>)[NOTIFICATION_PREFS_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>

  const triggersRaw = o.triggers && typeof o.triggers === "object" && !Array.isArray(o.triggers)
    ? (o.triggers as Record<string, unknown>)
    : {}
  const triggers = { ...base.triggers }
  for (const id of NOTIFICATION_TRIGGER_IDS) {
    if (id in triggersRaw) triggers[id] = parseDelivery(triggersRaw[id])
  }

  const lead = Number(o.calendarUpcomingLeadMinutes)
  const customerRaw = o.customer && typeof o.customer === "object" && !Array.isArray(o.customer)
    ? (o.customer as Record<string, unknown>)
    : {}

  return {
    v: 1,
    triggers,
    calendarUpcomingLeadMinutes: Number.isFinite(lead) && lead > 0 ? Math.round(lead) : base.calendarUpcomingLeadMinutes,
    customer: {
      enRouteText: customerRaw.enRouteText === true,
      enRouteEmail: customerRaw.enRouteEmail === true,
    },
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  }
}

export function mergeNotificationPrefs(metadata: unknown, prefs: NotificationPrefsV1): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}
  base[NOTIFICATION_PREFS_KEY] = { ...prefs, v: 1, updatedAt: new Date().toISOString() }
  return base
}

/** True when this trigger should create a desktop notification-center row. */
export function triggerWantsDesktop(prefs: NotificationPrefsV1, id: NotificationTriggerId): boolean {
  return prefs.triggers[id]?.desktop === true
}

/** True when this trigger should send a mobile push. */
export function triggerWantsMobile(prefs: NotificationPrefsV1, id: NotificationTriggerId): boolean {
  return prefs.triggers[id]?.mobile === true
}
