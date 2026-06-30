import { APP_NAV_PREFIX } from "./appNavigationHistory"

/** One-shot flag from marketing preview → production home (not persisted across flows). */
export const ADMIN_LOGIN_FROM_PREVIEW_KEY = "tradesman_open_admin_login"

/** Contractor portal sign-in — separate from admin portal login. */
export const CONTRACTOR_LOGIN_HASH = "#/login"

/** Admin portal sign-in — linked from homepage footer only. */
export const ADMIN_LOGIN_HASH = "#/admin-login"

export function hasAppNavDeepLink(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  return hash.startsWith(APP_NAV_PREFIX)
}

export function isContractorLoginRouteHash(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  const h = hash.toLowerCase()
  return h === CONTRACTOR_LOGIN_HASH || h.startsWith(`${CONTRACTOR_LOGIN_HASH}?`)
}

export function isAdminLoginRouteHash(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  const h = hash.toLowerCase()
  return h === ADMIN_LOGIN_HASH || h.startsWith(`${ADMIN_LOGIN_HASH}?`)
}

export function isLoginRouteHash(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  return isContractorLoginRouteHash(hash) || isAdminLoginRouteHash(hash)
}

function baseUrlPath(): string {
  if (typeof window === "undefined") return "/"
  return `${window.location.pathname}${window.location.search}`
}

/** Drop #/app/... so admin login is not hijacked by contractor deep-link routing. */
export function stripAppNavHashFromLocation(): void {
  if (typeof window === "undefined") return
  if (!hasAppNavDeepLink()) return
  window.history.replaceState(null, "", baseUrlPath())
}

export function setContractorLoginRoute(): void {
  if (typeof window === "undefined") return
  window.history.replaceState(null, "", `${baseUrlPath()}${CONTRACTOR_LOGIN_HASH}`)
}

export function setAdminLoginRoute(): void {
  if (typeof window === "undefined") return
  window.history.replaceState(null, "", `${baseUrlPath()}${ADMIN_LOGIN_HASH}`)
}

export function stripLoginRouteHash(): void {
  if (typeof window === "undefined") return
  if (!isLoginRouteHash()) return
  window.history.replaceState(null, "", baseUrlPath())
}

export function setAppHomeRoute(): void {
  if (typeof window === "undefined") return
  window.history.replaceState(null, "", baseUrlPath())
}

/** Email pop-out / #/app/* tabs must never inherit a login-route hash from another flow. */
export function prepareAppDeepLinkHash(): void {
  if (typeof window === "undefined") return
  if (!hasAppNavDeepLink()) return
  stripLoginRouteHash()
}
