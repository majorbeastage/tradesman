/**
 * Canonical public origin for customer-facing links (e-sign, etc.).
 * Never use Capacitor/localhost origins — those break SMS/email recipients.
 */
const FALLBACK_PUBLIC_ORIGIN = "https://www.tradesman-us.com"

function cleanOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, "")
}

function isUsablePublicOrigin(origin: string): boolean {
  if (!origin) return false
  try {
    const u = new URL(origin)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const host = u.hostname.toLowerCase()
    if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return false
    if (host === "capacitor" || host.startsWith("capacitor.")) return false
    return true
  } catch {
    return false
  }
}

/** Origin embedded in outbound customer links (SMS/email). */
export function getPublicSiteOrigin(): string {
  const fromEnv = typeof import.meta.env.VITE_SITE_URL === "string" ? cleanOrigin(import.meta.env.VITE_SITE_URL) : ""
  if (isUsablePublicOrigin(fromEnv)) return fromEnv

  if (typeof window !== "undefined" && window.location?.origin) {
    const fromWindow = cleanOrigin(window.location.origin)
    if (isUsablePublicOrigin(fromWindow)) return fromWindow
  }

  return FALLBACK_PUBLIC_ORIGIN
}
