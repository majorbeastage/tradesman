import { buildAppHash, parseAppHash } from "./appNavigationHistory"
import { useEffect, useMemo, useState } from "react"

export const CUSTOMERS_EMAIL_PAGE = "customers-email"

const EMAIL_POPOUT_WINDOW = "tradesman-email-client"

/** Navigate to the in-app email client (same session). */
export function navigateToCustomersEmail(setPage?: (page: string) => void): void {
  setPage?.(CUSTOMERS_EMAIL_PAGE)
}

/**
 * Open the email client in a dedicated browser tab (no sidebar; same login session).
 * Uses a transient anchor click (not window.open) so popup blockers allow user-initiated opens.
 */
export function openCustomersEmailInNewTab(): void {
  const hash = buildAppHash(CUSTOMERS_EMAIL_PAGE, { standalone: true })
  const url = `${window.location.origin}${window.location.pathname}${hash}`
  const link = document.createElement("a")
  link.href = url
  link.target = EMAIL_POPOUT_WINDOW
  link.rel = "noopener noreferrer"
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** @deprecated Use navigateToCustomersEmail — kept for call-site compatibility. */
export function openCustomersEmailClient(setPage?: (page: string) => void): void {
  navigateToCustomersEmail(setPage)
}

export function navigateToCustomersList(setPage?: (page: string) => void): void {
  setPage?.("customers")
}

export function isEmailClientStandaloneFromHash(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  const parsed = parseAppHash(hash)
  return parsed.standalone && parsed.page === CUSTOMERS_EMAIL_PAGE
}

export type EmailClientLayoutFlags = {
  onEmailPage: boolean
  standalone: boolean
  hideSidebar: boolean
  hidePortalChrome: boolean
}

/** Sidebar hidden only in standalone pop-out tab; in-app email keeps the taskbar. */
export function emailClientLayoutFlags(page: string, hash?: string): EmailClientLayoutFlags {
  const onEmailPage = page === CUSTOMERS_EMAIL_PAGE
  const standalone = onEmailPage && isEmailClientStandaloneFromHash(hash)
  return {
    onEmailPage,
    standalone,
    hideSidebar: standalone,
    hidePortalChrome: standalone,
  }
}

export function useEmailClientLayoutFlags(page: string): EmailClientLayoutFlags {
  const [hash, setHash] = useState(() => (typeof window !== "undefined" ? window.location.hash : ""))
  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    window.addEventListener("hashchange", sync)
    window.addEventListener("popstate", sync)
    return () => {
      window.removeEventListener("hashchange", sync)
      window.removeEventListener("popstate", sync)
    }
  }, [])
  return useMemo(() => emailClientLayoutFlags(page, hash), [page, hash])
}
