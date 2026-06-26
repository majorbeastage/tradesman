import { buildAppHash } from "./appNavigationHistory"

export const CUSTOMERS_EMAIL_PAGE = "customers-email"

/** Desktop opens email client in a new browser tab; mobile navigates in-app. */
export function openCustomersEmailClient(
  setPage: ((page: string) => void) | undefined,
  isMobile: boolean,
): void {
  if (typeof window === "undefined") return
  if (isMobile) {
    setPage?.(CUSTOMERS_EMAIL_PAGE)
    return
  }
  const base = `${window.location.origin}${window.location.pathname}${buildAppHash(CUSTOMERS_EMAIL_PAGE)}`
  window.open(base, "_blank", "noopener,noreferrer")
}

export function navigateToCustomersList(setPage: ((page: string) => void) | undefined): void {
  setPage?.("customers")
}
