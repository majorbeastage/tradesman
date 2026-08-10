/** Deep-link into MyT / Account with a specific section fold open. */

export const ACCOUNT_SECTION_PREFILL_KEY = "tradesman-account-section-prefill"
export const ACCOUNT_SECTION_PREFILL_EVENT = "tradesman-account-section-prefill"

export function queueAccountSectionOpen(sectionId: string): void {
  const id = sectionId.trim()
  if (!id || typeof window === "undefined") return
  try {
    sessionStorage.setItem(ACCOUNT_SECTION_PREFILL_KEY, id)
    window.dispatchEvent(new CustomEvent(ACCOUNT_SECTION_PREFILL_EVENT))
  } catch {
    /* ignore */
  }
}

export function consumeAccountSectionPrefill(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(ACCOUNT_SECTION_PREFILL_KEY)
    if (!raw?.trim()) return null
    sessionStorage.removeItem(ACCOUNT_SECTION_PREFILL_KEY)
    return raw.trim()
  } catch {
    return null
  }
}

/** Open the in-app hosted website editor (same Tradesman login — no separate admin password). */
export function openHostedWebsiteEditor(setPage: (page: string) => void): void {
  queueAccountSectionOpen("business_web_profile")
  setPage("account")
}
