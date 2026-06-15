const CUSTOMER_FOCUS_KEY = "tradesman_customers_focus_customer_id"
const CUSTOMER_PROFILE_KEY = "tradesman_customers_profile_customer_id"

export function queueCustomerFocus(customerId: string): void {
  if (!customerId || typeof window === "undefined") return
  try {
    sessionStorage.setItem(CUSTOMER_FOCUS_KEY, customerId)
  } catch {
    /* ignore */
  }
}

export function consumeQueuedCustomerFocus(): string | null {
  if (typeof window === "undefined") return null
  try {
    const id = (sessionStorage.getItem(CUSTOMER_FOCUS_KEY) ?? "").trim()
    if (id) {
      sessionStorage.removeItem(CUSTOMER_FOCUS_KEY)
      return id
    }
  } catch {
    /* ignore */
  }
  return null
}

export function queueCustomerProfile(customerId: string): void {
  if (!customerId || typeof window === "undefined") return
  try {
    sessionStorage.setItem(CUSTOMER_PROFILE_KEY, customerId)
  } catch {
    /* ignore */
  }
}

export function consumeQueuedCustomerProfile(): string | null {
  if (typeof window === "undefined") return null
  try {
    const id = (sessionStorage.getItem(CUSTOMER_PROFILE_KEY) ?? "").trim()
    if (id) {
      sessionStorage.removeItem(CUSTOMER_PROFILE_KEY)
      return id
    }
  } catch {
    /* ignore */
  }
  return null
}
