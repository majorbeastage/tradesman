/** Hash-based in-app navigation so browser Back closes overlays and returns to prior tabs. */

export const APP_NAV_PREFIX = "#/app/"

export const APP_OVERLAY_JOB_TYPES = "job-types"

export function buildAppHash(page: string, overlay?: string | null): string {
  const safePage = encodeURIComponent(page.trim() || "dashboard")
  const base = `${APP_NAV_PREFIX}${safePage}`
  if (overlay?.trim()) return `${base}?overlay=${encodeURIComponent(overlay.trim())}`
  return base
}

export function parseAppHash(hash: string): { page: string | null; overlay: string | null } {
  if (!hash.startsWith(APP_NAV_PREFIX)) return { page: null, overlay: null }
  const rest = hash.slice(APP_NAV_PREFIX.length)
  const qIdx = rest.indexOf("?")
  const pagePart = qIdx >= 0 ? rest.slice(0, qIdx) : rest
  const pageRaw = decodeURIComponent(pagePart || "").trim()
  const page = pageRaw || null
  let overlay: string | null = null
  if (qIdx >= 0) {
    const params = new URLSearchParams(rest.slice(qIdx + 1))
    overlay = params.get("overlay")
  }
  return { page, overlay }
}
