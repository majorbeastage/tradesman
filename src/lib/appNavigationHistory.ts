/** Hash-based in-app navigation so browser Back closes overlays and returns to prior tabs. */

export const APP_NAV_PREFIX = "#/app/"

export const APP_OVERLAY_JOB_TYPES = "job-types"

export type AppHashOptions = {
  overlay?: string | null
  /** Email client pop-out: hide sidebar and portal chrome in that browser tab. */
  standalone?: boolean
}

export function buildAppHash(page: string, opts?: AppHashOptions | string | null): string {
  const options: AppHashOptions =
    opts === undefined || opts === null
      ? {}
      : typeof opts === "string"
        ? { overlay: opts }
        : opts
  const safePage = encodeURIComponent(page.trim() || "dashboard")
  const params = new URLSearchParams()
  if (options.overlay?.trim()) params.set("overlay", options.overlay.trim())
  if (options.standalone) params.set("standalone", "1")
  const query = params.toString()
  return query ? `${APP_NAV_PREFIX}${safePage}?${query}` : `${APP_NAV_PREFIX}${safePage}`
}

export function parseAppHash(hash: string): { page: string | null; overlay: string | null; standalone: boolean } {
  if (!hash.startsWith(APP_NAV_PREFIX)) return { page: null, overlay: null, standalone: false }
  const rest = hash.slice(APP_NAV_PREFIX.length)
  const qIdx = rest.indexOf("?")
  const pagePart = qIdx >= 0 ? rest.slice(0, qIdx) : rest
  const pageRaw = decodeURIComponent(pagePart || "").trim()
  const page = pageRaw || null
  let overlay: string | null = null
  let standalone = false
  if (qIdx >= 0) {
    const params = new URLSearchParams(rest.slice(qIdx + 1))
    overlay = params.get("overlay")
    standalone = params.get("standalone") === "1" || params.get("standalone") === "true"
  }
  return { page, overlay, standalone }
}
