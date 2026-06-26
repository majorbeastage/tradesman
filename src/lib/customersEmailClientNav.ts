import { buildAppHash } from "./appNavigationHistory"

export const CUSTOMERS_EMAIL_PAGE = "customers-email"

/** Navigate to the in-app email client (same session — never opens a new tab). */
export function navigateToCustomersEmail(setPage?: (page: string) => void): void {
  setPage?.(CUSTOMERS_EMAIL_PAGE)
}

/** Open the email client in a new browser tab (same origin + hash route; session must already exist). */
export function openCustomersEmailInNewTab(): void {
  const hash = buildAppHash(CUSTOMERS_EMAIL_PAGE)
  const url = `${window.location.origin}${window.location.pathname}${hash}`
  window.open(url, "_blank", "noopener,noreferrer")
}

/** @deprecated Use navigateToCustomersEmail — kept for call-site compatibility. */
export function openCustomersEmailClient(setPage?: (page: string) => void): void {
  navigateToCustomersEmail(setPage)
}

export function navigateToCustomersList(setPage?: (page: string) => void): void {
  setPage?.("customers")
}
