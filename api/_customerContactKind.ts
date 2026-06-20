/** Server copy for Vercel api routes — keep in sync with src/lib/customerContactKind.ts */
export type CustomerHubKind = "customer" | "promotional"
export const CUSTOMER_HUB_KIND_META_KEY = "customer_hub_kind"
export const CUSTOMER_ORG_GROUP_META_KEY = "org_group_key"
export const CUSTOMER_SPLIT_EMAILS_META_KEY = "split_org_emails"

const PROMOTIONAL_LOCAL_PART =
  /^(no[-_.]?reply|donotreply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|bounce|bounces|notifications?|newsletter|marketing|promo|unsubscribe|daemon|robot|automated|alerts?|notify|notification|helpdesk|servicedesk|tickets?|ticket[-_.]?system)$/i
const PROMOTIONAL_LOCAL_PREFIX =
  /^(no[-_.]?reply|donotreply|do[-_.]?not[-_.]?reply|mailer|bounce|notification|newsletter|marketing|promo|helpdesk|servicedesk|ticket)/i
const CONSUMER_MAIL_DOMAINS = new Set([
  "gmail.com","googlemail.com","yahoo.com","hotmail.com","outlook.com","live.com",
  "icloud.com","me.com","aol.com","msn.com","protonmail.com","proton.me","mail.com",
])
const NON_ORG_GROUP_EMAIL_TLDS = new Set(["invalid", "test", "example", "localhost"])

export function normalizeCustomerEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase()
}

export function parseEmailAddress(email: string): { local: string; domain: string } | null {
  const norm = normalizeCustomerEmail(email)
  const at = norm.lastIndexOf("@")
  if (at <= 0 || at === norm.length - 1) return null
  return { local: norm.slice(0, at), domain: norm.slice(at + 1) }
}

export function isPromotionalEmailAddress(email: string): boolean {
  const parsed = parseEmailAddress(email)
  if (!parsed) return false
  const { local, domain } = parsed
  if (!local || !domain) return false
  if (PROMOTIONAL_LOCAL_PART.test(local)) return true
  if (PROMOTIONAL_LOCAL_PREFIX.test(local)) return true
  if (local.includes("noreply") || local.includes("donotreply") || local.includes("no-reply")) return true
  if (domain === "resend.dev" || domain.endsWith(".resend.dev")) return true
  return false
}

export function organizationRootFromDomain(domain: string): string | null {
  const d = domain.trim().toLowerCase()
  if (!d || CONSUMER_MAIL_DOMAINS.has(d)) return null
  const parts = d.split(".").filter(Boolean)
  if (parts.length === 0) return null
  const tld = parts[parts.length - 1] ?? ""
  if (NON_ORG_GROUP_EMAIL_TLDS.has(tld)) return null
  if (parts.length === 1) return parts[0]
  const base = parts.slice(-2).join(".")
  if (CONSUMER_MAIL_DOMAINS.has(base)) return null
  return parts[parts.length - 2] ?? parts[0]
}

export function deriveOrgGroupKeyFromEmail(email: string): string | null {
  const parsed = parseEmailAddress(email)
  if (!parsed?.domain) return null
  return organizationRootFromDomain(parsed.domain)
}

export function orgGroupKeysForEmail(email: string): string[] {
  const parsed = parseEmailAddress(email)
  if (!parsed?.domain) return []
  const root = organizationRootFromDomain(parsed.domain)
  if (!root) return []
  const keys = new Set<string>([root])
  const parts = parsed.domain.split(".").filter(Boolean)
  if (parts.length >= 2) {
    keys.add(parts.slice(-2).join("."))
    keys.add(parsed.domain)
  }
  return [...keys]
}

export function emailsShareOrgGroup(a: string, b: string): boolean {
  const ka = deriveOrgGroupKeyFromEmail(a)
  const kb = deriveOrgGroupKeyFromEmail(b)
  return ka != null && ka === kb
}

export function parseCustomerHubKind(metadata: unknown): CustomerHubKind {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "customer"
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_HUB_KIND_META_KEY]
  return raw === "promotional" ? "promotional" : "customer"
}

export function parseSplitOrgEmails(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return []
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_SPLIT_EMAILS_META_KEY]
  if (!Array.isArray(raw)) return []
  return raw.flatMap((v) => (typeof v === "string" && v.trim() ? [normalizeCustomerEmail(v)] : []))
}

export function customerEmailMatchesHubKind(
  email: string,
  metadata: unknown,
  hubKind: CustomerHubKind,
): boolean {
  const promo = isPromotionalEmailAddress(email)
  const stored = parseCustomerHubKind(metadata)
  if (hubKind === "promotional") return stored === "promotional" || (stored === "customer" && promo)
  return stored !== "promotional" && !promo
}

export function organizationDisplayNameFromOrgKey(orgKey: string): string {
  const k = orgKey.trim().toLowerCase()
  if (!k) return "Organization"
  const label = k.split(".")[0] ?? k
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function mergeCustomerHubMetadata(
  existingMetadata: unknown,
  patch: { hubKind?: CustomerHubKind; orgGroupKey?: string | null; splitOrgEmails?: string[] },
): Record<string, unknown> {
  const prev =
    existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {}
  if (patch.hubKind) prev[CUSTOMER_HUB_KIND_META_KEY] = patch.hubKind
  if (patch.orgGroupKey !== undefined) {
    if (patch.orgGroupKey) prev[CUSTOMER_ORG_GROUP_META_KEY] = patch.orgGroupKey.trim().toLowerCase()
    else delete prev[CUSTOMER_ORG_GROUP_META_KEY]
  }
  if (patch.splitOrgEmails) prev[CUSTOMER_SPLIT_EMAILS_META_KEY] = patch.splitOrgEmails
  return prev
}

export function classifyInboundEmailContact(email: string): {
  hubKind: CustomerHubKind
  orgGroupKey: string | null
  displayName: string
} {
  const norm = normalizeCustomerEmail(email)
  const promotional = isPromotionalEmailAddress(norm)
  const orgGroupKey = deriveOrgGroupKeyFromEmail(norm)
  const hubKind: CustomerHubKind = promotional ? "promotional" : "customer"
  if (promotional && orgGroupKey) {
    return {
      hubKind,
      orgGroupKey,
      displayName: `${organizationDisplayNameFromOrgKey(orgGroupKey)} (notifications)`,
    }
  }
  if (orgGroupKey) {
    return {
      hubKind: "customer",
      orgGroupKey,
      displayName: organizationDisplayNameFromOrgKey(orgGroupKey),
    }
  }
  return { hubKind: "customer", orgGroupKey: null, displayName: norm || "Unknown sender" }
}
