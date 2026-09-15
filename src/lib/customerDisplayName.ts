/** True when the stored title is empty, the email itself, or an auto-generated Unknown label. */
export function isPlaceholderCustomerDisplayName(displayName: string | null | undefined): boolean {
  const raw = (displayName ?? "").trim()
  if (!raw) return true
  if (/^unknown\s*\(/i.test(raw)) return true
  if (/^new customer$/i.test(raw)) return true
  return raw.includes("@")
}

/**
 * Manual add: the typed person/company name always wins.
 * Email classification (org label or the address itself) is only a fallback when no name was entered.
 */
export function resolveManualCustomerDisplayName(input: {
  name?: string
  phone?: string
  email?: string
  classifiedDisplayName?: string
}): string {
  const name = input.name?.trim() ?? ""
  if (name) return name
  const classified = input.classifiedDisplayName?.trim() ?? ""
  if (classified) return classified
  const phone = input.phone?.trim() ?? ""
  if (phone) return `Unknown (${phone})`
  const email = input.email?.trim() ?? ""
  if (email) return `Unknown (${email})`
  return "New customer"
}

/** Best-effort last token for filenames / PDF search (display names vary). */
export function lastNameTokenFromDisplayName(displayName: string | null | undefined): string {
  const raw = (displayName ?? "").trim()
  if (!raw) return ""
  const parts = raw.split(/\s+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ""
}

export function slugForFilenameSegment(name: string, maxLen = 40): string {
  const s = name
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, maxLen)
  return s || "customer"
}
