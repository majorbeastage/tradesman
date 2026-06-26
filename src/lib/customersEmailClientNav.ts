export const CUSTOMERS_EMAIL_PAGE = "customers-email"

/** Navigate to the in-app email client (same session — never opens a new tab). */
export function navigateToCustomersEmail(setPage?: (page: string) => void): void {
  setPage?.(CUSTOMERS_EMAIL_PAGE)
}

/** @deprecated Use navigateToCustomersEmail — kept for call-site compatibility. */
export function openCustomersEmailClient(setPage?: (page: string) => void): void {
  navigateToCustomersEmail(setPage)
}

export function navigateToCustomersList(setPage?: (page: string) => void): void {
  setPage?.("customers")
}
