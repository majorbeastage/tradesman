/** Cross-tab navigation queues (sessionStorage) for Customers ↔ Estimates ↔ Scheduling. */

const QUOTES_PREFILL = "tradesman_quotes_prefill_customer_id"
const CUSTOMER_SMS_FOCUS = "tradesman_assistant_focus_customer_sms"
const SCHEDULING_PREFILL = "tradesman_scheduling_prefill_customer_id"
const SCHEDULING_QUOTE_PREFILL = "tradesman_scheduling_prefill_quote_v1"
const CUSTOM_RECEIPT_PREFILL = "tradesman_custom_receipt_prefill_customer_id"
const OPEN_SPECIALTY_REPORT_WIZARD = "tradesman_open_specialty_report_wizard"

export type OpenSpecialtyReportWizardRequest = {
  quoteId?: string
}

export const OPEN_SPECIALTY_REPORT_WIZARD_EVENT = "tradesman:open-specialty-report-wizard"

export function queueOpenSpecialtyReportWizard(req: OpenSpecialtyReportWizardRequest = {}): void {
  if (typeof window === "undefined") return
  try {
    const quoteId = req.quoteId?.trim()
    sessionStorage.setItem(OPEN_SPECIALTY_REPORT_WIZARD, JSON.stringify({ quoteId: quoteId || undefined }))
    window.dispatchEvent(new CustomEvent(OPEN_SPECIALTY_REPORT_WIZARD_EVENT))
  } catch {
    /* ignore */
  }
}

export function consumeOpenSpecialtyReportWizard(): OpenSpecialtyReportWizardRequest | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(OPEN_SPECIALTY_REPORT_WIZARD)
    if (!raw?.trim()) return null
    sessionStorage.removeItem(OPEN_SPECIALTY_REPORT_WIZARD)
    const j = JSON.parse(raw) as { quoteId?: string }
    const quoteId = typeof j.quoteId === "string" ? j.quoteId.trim() : undefined
    return { quoteId: quoteId || undefined }
  } catch {
    return null
  }
}

export type SchedulingQuotePrefill = {
  customerId: string
  quoteId: string
}

export function queueQuotesCustomerPrefill(customerId: string): void {
  if (!customerId?.trim() || typeof window === "undefined") return
  try {
    sessionStorage.setItem(QUOTES_PREFILL, customerId.trim())
  } catch {
    /* ignore */
  }
}

export function queueCustomerAssistantSmsFocus(customerId: string): void {
  if (!customerId?.trim() || typeof window === "undefined") return
  try {
    sessionStorage.setItem(CUSTOMER_SMS_FOCUS, customerId.trim())
  } catch {
    /* ignore */
  }
}

export function consumeCustomerAssistantSmsFocus(): string | null {
  if (typeof window === "undefined") return null
  try {
    const id = (sessionStorage.getItem(CUSTOMER_SMS_FOCUS) ?? "").trim()
    if (id) {
      sessionStorage.removeItem(CUSTOMER_SMS_FOCUS)
      return id
    }
  } catch {
    /* ignore */
  }
  return null
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

export function queueCustomReceiptCustomerPrefill(customerId: string): void {
  if (!customerId?.trim() || typeof window === "undefined") return
  try {
    sessionStorage.setItem(CUSTOM_RECEIPT_PREFILL, customerId.trim())
  } catch {
    /* ignore */
  }
}

export function consumeCustomReceiptCustomerPrefill(): string | null {
  if (typeof window === "undefined") return null
  try {
    const id = (sessionStorage.getItem(CUSTOM_RECEIPT_PREFILL) ?? "").trim()
    if (id) {
      sessionStorage.removeItem(CUSTOM_RECEIPT_PREFILL)
      return id
    }
  } catch {
    /* ignore */
  }
  return null
}

export function queueSchedulingQuotePrefill(prefill: SchedulingQuotePrefill): void {
  if (typeof window === "undefined") return
  const customerId = prefill.customerId?.trim()
  const quoteId = prefill.quoteId?.trim()
  if (!customerId || !quoteId) return
  try {
    sessionStorage.setItem(SCHEDULING_QUOTE_PREFILL, JSON.stringify({ customerId, quoteId }))
  } catch {
    /* ignore */
  }
}

export function consumeSchedulingQuotePrefill(): SchedulingQuotePrefill | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(SCHEDULING_QUOTE_PREFILL)
    if (!raw?.trim()) return null
    sessionStorage.removeItem(SCHEDULING_QUOTE_PREFILL)
    const j = JSON.parse(raw) as { customerId?: string; quoteId?: string }
    const customerId = String(j.customerId ?? "").trim()
    const quoteId = String(j.quoteId ?? "").trim()
    if (!customerId || !quoteId) return null
    return { customerId, quoteId }
  } catch {
    return null
  }
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
