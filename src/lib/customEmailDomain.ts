/** Normalize a customer-owned domain for Option B email. */
export function normalizeCustomEmailDomain(raw: string): string {
  let d = raw.trim().toLowerCase()
  d = d.replace(/^https?:\/\//i, "")
  d = d.replace(/^www\./i, "")
  d = d.replace(/\/.*$/, "")
  return d
}

const BLOCKED_DOMAINS = new Set(["tradesman-us.com", "mail.tradesman-us.com"])

export function validateCustomEmailDomainShape(raw: string): string | null {
  const d = normalizeCustomEmailDomain(raw)
  if (!d) return "empty"
  if (!d.includes(".")) return "invalid"
  if (BLOCKED_DOMAINS.has(d)) return "platform_domain"
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return "invalid_chars"
  return null
}

export function customEmailAddress(localPart: string, domain: string): string {
  return `${localPart.trim().toLowerCase()}@${normalizeCustomEmailDomain(domain)}`
}
