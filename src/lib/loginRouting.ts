import { APP_NAV_PREFIX } from "./appNavigationHistory"

/** Contractor portal sign-in — separate from admin portal login. */
export const CONTRACTOR_LOGIN_HASH = "#/login"

/** Standalone admin portal path (bookmarkable). Legacy hash `#/admin-login` redirects here. */
export const ADMIN_LOGIN_PATH = "/admin"

/** @deprecated Prefer ADMIN_LOGIN_PATH; kept for old bookmarks. */
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

export function isAdminLoginPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/"): boolean {
  const p = pathname.replace(/\/+$/, "").toLowerCase() || "/"
  return p === ADMIN_LOGIN_PATH || p === "/admin-login"
}

export function isLoginRouteHash(hash = typeof window !== "undefined" ? window.location.hash : ""): boolean {
  return isContractorLoginRouteHash(hash) || isAdminLoginRouteHash(hash)
}

function baseUrlPath(): string {
  if (typeof window === "undefined") return "/"
  return `${window.location.pathname}${window.location.search}`
}

function homeUrl(): string {
  if (typeof window === "undefined") return "/"
  return `/${window.location.search}`
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
  const search = window.location.search || ""
  window.history.replaceState(null, "", `${ADMIN_LOGIN_PATH}${search}`)
}

export function stripLoginRouteHash(): void {
  if (typeof window === "undefined") return
  if (isAdminLoginPath()) {
    // Keep /admin after sign-in so the standalone URL stays bookmarkable in-session.
    if (window.location.hash) {
      window.history.replaceState(null, "", `${ADMIN_LOGIN_PATH}${window.location.search}`)
    }
    return
  }
  if (!isLoginRouteHash()) return
  window.history.replaceState(null, "", baseUrlPath())
}

export function setAppHomeRoute(): void {
  if (typeof window === "undefined") return
  if (isAdminLoginPath() || isLoginRouteHash()) {
    window.history.replaceState(null, "", homeUrl())
    return
  }
  window.history.replaceState(null, "", baseUrlPath())
}

/** Email pop-out / #/app/* tabs must never inherit a login-route hash from another flow. */
export function prepareAppDeepLinkHash(): void {
  if (typeof window === "undefined") return
  if (!hasAppNavDeepLink()) return
  stripLoginRouteHash()
}
