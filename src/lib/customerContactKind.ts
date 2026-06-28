import { customerEmailsFromIdentifiers, customerPhonesFromIdentifiers } from "./customerIdentifiers"
export type CustomerHubKind = "customer" | "promotional"

export const CUSTOMER_HUB_KIND_META_KEY = "customer_hub_kind"
export const CUSTOMER_ORG_GROUP_META_KEY = "org_group_key"
/** Emails intentionally split out of an org-grouped customer (audit on source row). */
export const CUSTOMER_SPLIT_EMAILS_META_KEY = "split_org_emails"
/** Phones intentionally split out to another customer (audit on source row). */
export const CUSTOMER_SPLIT_PHONES_META_KEY = "split_contact_phones"
/** Marks a customer created by splitting contacts — excluded from org hub grouping. */
export const CUSTOMER_CONTACT_SEPARATED_META_KEY = "contact_separated"
export const CUSTOMER_SPLIT_FROM_META_KEY = "split_from_customer_id"

const PROMOTIONAL_LOCAL_PART =
  /^(no[-_.]?reply|donotreply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|bounce|bounces|notifications?|newsletter|marketing|promo|unsubscribe|daemon|robot|automated|alerts?|notify|notification|helpdesk|servicedesk|tickets?|ticket[-_.]?system|deals|offers|special[-_.]?offers?|spam|bulk)$/i

const PROMOTIONAL_LOCAL_PREFIX =
  /^(no[-_.]?reply|donotreply|do[-_.]?not[-_.]?reply|mailer|bounce|notification|newsletter|marketing|promo|helpdesk|servicedesk|ticket|deals|offers|special|spam|bulk)/i

const CONSUMER_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "msn.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
])

/** Reserved / test TLDs — never org-group (e.g. RFC 2606 example.invalid). */
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
  if (local.includes("unsubscribe") || local.includes("special-offer") || local.includes("specialoffer")) return true
  if (domain === "resend.dev" || domain.endsWith(".resend.dev")) return true
  return false
}

/** Canonical org label: twilio.com, mail.twilio.com, and bare twilio all → twilio. */
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

/** Match legacy rows keyed as twilio.com as well as canonical twilio. */
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

export function organizationDisplayNameFromOrgKey(orgKey: string): string {
  const k = orgKey.trim().toLowerCase()
  if (!k) return "Organization"
  const label = k.split(".")[0] ?? k
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function parseCustomerHubKind(metadata: unknown): CustomerHubKind {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "customer"
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_HUB_KIND_META_KEY]
  return raw === "promotional" ? "promotional" : "customer"
}

export function parseCustomerOrgGroupKey(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_ORG_GROUP_META_KEY]
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null
}

export function parseSplitOrgEmails(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return []
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_SPLIT_EMAILS_META_KEY]
  if (!Array.isArray(raw)) return []
  return raw.flatMap((v) => (typeof v === "string" && v.trim() ? [normalizeCustomerEmail(v)] : []))
}

export function parseSplitContactPhones(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return []
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_SPLIT_PHONES_META_KEY]
  if (!Array.isArray(raw)) return []
  return raw.flatMap((v) => (typeof v === "string" && v.trim() ? [v.trim()] : []))
}

/** True when this customer was split out or should not be org-converged with siblings. */
export function isCustomerContactSeparated(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  const o = metadata as Record<string, unknown>
  if (o[CUSTOMER_CONTACT_SEPARATED_META_KEY] === true) return true
  return typeof o[CUSTOMER_SPLIT_FROM_META_KEY] === "string" && Boolean(o[CUSTOMER_SPLIT_FROM_META_KEY])
}

/** Match org-grouped customers even when legacy rows lack customer_hub_kind metadata. */
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

export function mergeCustomerHubMetadata(
  existingMetadata: unknown,
  patch: {
    hubKind?: CustomerHubKind
    orgGroupKey?: string | null
    splitOrgEmails?: string[]
    splitContactPhones?: string[]
    contactSeparated?: boolean
    manualArchived?: boolean
  },
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
  if (patch.splitContactPhones) prev[CUSTOMER_SPLIT_PHONES_META_KEY] = patch.splitContactPhones
  if (patch.contactSeparated === true) prev[CUSTOMER_CONTACT_SEPARATED_META_KEY] = true
  if (patch.manualArchived === true) prev[CUSTOMER_MANUAL_ARCHIVED_META_KEY] = true
  if (patch.manualArchived === false) delete prev[CUSTOMER_MANUAL_ARCHIVED_META_KEY]
  return prev
}

/**
 * Default: group business-domain addresses under one customer per org (and a separate promotional hub).
 * Consumer domains (gmail, etc.) stay one customer per address.
 */
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

export function customerHubKindLabel(kind: CustomerHubKind): string {
  return kind === "promotional" ? "Promotions & system" : "Customer"
}

/** True when any email on the customer looks like system / no-reply / marketing mail. */
export function customerHasPromotionalEmail(
  identifiers?: { type: string; value: string }[] | null,
): boolean {
  for (const ident of identifiers ?? []) {
    if (ident.type === "email" && isPromotionalEmailAddress(ident.value)) return true
  }
  return false
}

/** Customers hub Promotions tab — stored kind or inferred from noreply / system email addresses. */
export function parseCustomerHubKindExplicit(metadata: unknown): CustomerHubKind | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_HUB_KIND_META_KEY]
  return raw === "promotional" ? "promotional" : raw === "customer" ? "customer" : null
}

export const CUSTOMER_MANUAL_ARCHIVED_META_KEY = "manual_archived"

export function isCustomerManuallyArchived(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  return (metadata as Record<string, unknown>)[CUSTOMER_MANUAL_ARCHIVED_META_KEY] === true
}

/** Customers hub Promotions tab — stored kind or inferred from noreply / system email addresses. */
export function customerBelongsInPromotionsHub(customer: {
  metadata?: unknown
  customer_identifiers?: { type: string; value: string }[] | null
}): boolean {
  const explicit = parseCustomerHubKindExplicit(customer.metadata)
  if (explicit === "promotional") return true
  if (explicit === "customer") return false

  const phones = customerPhonesFromIdentifiers(customer.customer_identifiers)
  if (phones.length > 0) return false

  const emails = customerEmailsFromIdentifiers(customer.customer_identifiers)
  if (emails.some((e) => !isPromotionalEmailAddress(e))) return false

  return customerHasPromotionalEmail(customer.customer_identifiers)
}

export function promotionalEmailFromEventMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const from = (metadata as Record<string, unknown>).from
  if (typeof from === "string" && isPromotionalEmailAddress(from)) return normalizeCustomerEmail(from)
  return null
}

export function orgGroupSummaryLabel(orgKey: string | null, hubKind: CustomerHubKind): string | null {
  if (!orgKey) return null
  if (hubKind === "promotional") return `${organizationDisplayNameFromOrgKey(orgKey)} · system mail`
  return `${organizationDisplayNameFromOrgKey(orgKey)} · shared domain`
}
