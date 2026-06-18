/** Root domain for customer-facing Tradesman email (not mail.tradesman-us.com). */
export const PLATFORM_EMAIL_ROOT_DOMAIN = "tradesman-us.com"

export const PLATFORM_EMAIL_SLUG_MIN_LEN = 3
export const PLATFORM_EMAIL_SLUG_MAX_LEN = 64

export type PlatformEmailSlugIssue =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_chars"

/** Client-side normalize — must match `normalize_platform_email_slug` in Postgres. */
export function normalizePlatformEmailSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, PLATFORM_EMAIL_SLUG_MAX_LEN)
}

export function validatePlatformEmailSlugShape(slug: string): PlatformEmailSlugIssue | null {
  const normalized = normalizePlatformEmailSlug(slug)
  if (!normalized) return "empty"
  if (normalized.length < PLATFORM_EMAIL_SLUG_MIN_LEN) return "too_short"
  if (normalized.length > PLATFORM_EMAIL_SLUG_MAX_LEN) return "too_long"
  return null
}

export function platformEmailAddressFromSlug(slug: string): string {
  return `${normalizePlatformEmailSlug(slug)}@${PLATFORM_EMAIL_ROOT_DOMAIN}`
}

export function parsePlatformRootEmailAddress(addr: string): { localPart: string; domain: string } | null {
  const trimmed = addr.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at <= 0) return null
  return {
    localPart: trimmed.slice(0, at),
    domain: trimmed.slice(at + 1),
  }
}

export function isPlatformRootEmailAddress(addr: string): boolean {
  const parsed = parsePlatformRootEmailAddress(addr)
  return parsed?.domain === PLATFORM_EMAIL_ROOT_DOMAIN
}
