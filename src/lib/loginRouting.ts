import { APP_NAV_PREFIX } from "./appNavigationHistory"

export const ADMIN_LOGIN_FROM_PREVIEW_KEY = "tradesman_open_admin_login"
export const ADMIN_LOGIN_INTENT_KEY = "tradesman_admin_login_intent"

export function hasAppNavDeepLink(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  return hash.startsWith(APP_NAV_PREFIX)
}

/** Drop #/app/... from the URL so admin login is not hijacked by contractor deep-link routing. */
export function stripAppNavHashFromLocation(): void {
  if (typeof window === "undefined") return
  if (!hasAppNavDeepLink()) return
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
}

export function clearAdminLoginIntentStorage(): void {
  try {
    sessionStorage.removeItem(ADMIN_LOGIN_INTENT_KEY)
  } catch {
    /* ignore */
  }
}

export function readAdminLoginIntentStorage(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_LOGIN_INTENT_KEY) === "1"
  } catch {
    return false
  }
}

export function writeAdminLoginIntentStorage(): void {
  try {
    sessionStorage.setItem(ADMIN_LOGIN_INTENT_KEY, "1")
  } catch {
    /* ignore */
  }
}

/** App-hash deep links (email pop-out, etc.) must not inherit a stale admin-login intent. */
export function clearAdminLoginIntentForAppDeepLink(): void {
  if (!hasAppNavDeepLink()) return
  clearAdminLoginIntentStorage()
}
