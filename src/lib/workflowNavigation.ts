/** Cross-tab navigation queues (sessionStorage) for Customers ↔ Estimates ↔ Scheduling. */

const QUOTES_PREFILL = "tradesman_quotes_prefill_customer_id"
const SCHEDULING_PREFILL = "tradesman_scheduling_prefill_customer_id"

export function queueQuotesCustomerPrefill(customerId: string): void {
  if (!customerId?.trim() || typeof window === "undefined") return
  try {
    sessionStorage.setItem(QUOTES_PREFILL, customerId.trim())
  } catch {
    /* ignore */
  }
}

export function consumeQuotesCustomerPrefill(): string | null {
  if (typeof window === "undefined") return null
  try {
    const id = (sessionStorage.getItem(QUOTES_PREFILL) ?? "").trim()
    if (id) {
      sessionStorage.removeItem(QUOTES_PREFILL)
      return id
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Read customer id queued from Customers tab without consuming (for Estimates entry orchestration). */
export function peekQuotesCustomerPrefill(): string | null {
  if (typeof window === "undefined") return null
  try {
    const id = (sessionStorage.getItem(QUOTES_PREFILL) ?? "").trim()
    return id || null
  } catch {
    return null
  }
}

/** Session workspace quote (blank estimate until a customer is linked). */
export const ESTIMATES_WORKSPACE_QUOTE_ID_KEY = "tradesman_estimates_workspace_quote_id"

export function queueSchedulingCustomerPrefill(customerId: string): void {
  if (!customerId?.trim() || typeof window === "undefined") return
  try {
    sessionStorage.setItem(SCHEDULING_PREFILL, customerId.trim())
  } catch {
    /* ignore */
  }
}

export function consumeSchedulingCustomerPrefill(): string | null {
  if (typeof window === "undefined") return null
  try {
    const id = (sessionStorage.getItem(SCHEDULING_PREFILL) ?? "").trim()
    if (id) {
      sessionStorage.removeItem(SCHEDULING_PREFILL)
      return id
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Matches `CalendarSuiteState` in CalendarPage — queued before `setPage("calendar")` from dashboard shortcuts. */
const CALENDAR_SUITE_NAV = "tradesman_calendar_suite_nav"

export type QueuedCalendarSuite =
  | { id: "calendar" }
  | { id: "time_clock" }
  | { id: "team_management"; panel: "team_members" | "job_types" | "team_map" }
  | { id: "scheduling_tools"; panel: "job_types" | "customer_map" }
  | { id: "managed_job_types" }

export function queueCalendarSuiteNavigation(state: QueuedCalendarSuite): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(CALENDAR_SUITE_NAV, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function consumeCalendarSuiteNavigation(): QueuedCalendarSuite | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(CALENDAR_SUITE_NAV)
    if (!raw?.trim()) return null
    sessionStorage.removeItem(CALENDAR_SUITE_NAV)
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const o = parsed as Record<string, unknown>
    const id = o.id
    if (id === "calendar") return { id: "calendar" }
    if (id === "time_clock") return { id: "time_clock" }
    if (id === "managed_job_types") return { id: "managed_job_types" }
    if (id === "team_management") {
      const panel = o.panel
      if (panel === "team_members" || panel === "job_types" || panel === "team_map") {
        return { id: "team_management", panel }
      }
      return { id: "team_management", panel: "team_members" }
    }
    if (id === "scheduling_tools") {
      const panel = o.panel
      if (panel === "job_types" || panel === "customer_map") return { id: "scheduling_tools", panel }
      return { id: "scheduling_tools", panel: "job_types" }
    }
  } catch {
    /* ignore */
  }
  return null
}
