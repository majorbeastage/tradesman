const RETURN_KEY = "tradesman_customer_profile_return_v1"

export type CustomerProfileReturnState = {
  customerId: string
  customerName: string
}

const CLEAR_ON_PAGES = new Set([
  "dashboard",
  "customers",
  "account",
  "growth",
  "reporting",
  "insurance-options",
  "tech-support",
  "web-support",
  "business-workflow",
  "organization-chart",
  "conversations",
  "leads",
  "training",
  "settings",
])

export function setCustomerProfileReturn(state: CustomerProfileReturnState): void {
  if (!state.customerId?.trim() || typeof window === "undefined") return
  try {
    sessionStorage.setItem(
      RETURN_KEY,
      JSON.stringify({
        customerId: state.customerId.trim(),
        customerName: state.customerName?.trim() || "Customer",
      }),
    )
  } catch {
    /* ignore */
  }
}

export function getCustomerProfileReturn(): CustomerProfileReturnState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(RETURN_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as CustomerProfileReturnState
    if (!j?.customerId?.trim()) return null
    return { customerId: j.customerId.trim(), customerName: j.customerName?.trim() || "Customer" }
  } catch {
    return null
  }
}

export function clearCustomerProfileReturn(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    /* ignore */
  }
}

export function shouldClearCustomerProfileReturnOnPage(page: string): boolean {
  return CLEAR_ON_PAGES.has(page)
}
