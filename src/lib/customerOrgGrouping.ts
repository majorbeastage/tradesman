import { customerEmailsFromIdentifiers } from "./customerIdentifiers"
import {
  customerEmailMatchesHubKind,
  deriveOrgGroupKeyFromEmail,
  isCustomerContactSeparated,
  orgGroupSummaryLabel,
  parseCustomerHubKind,
  parseCustomerOrgGroupKey,
} from "./customerContactKind"

export type CustomerOrgGroupable = {
  id: string
  display_name?: string | null
  customer_identifiers?: { type: string; value: string; is_primary?: boolean }[] | null
  metadata?: unknown
  last_activity_at?: string | null
  updated_at?: string | null
}

export type CustomerOrgGroupingMaps = {
  /** Every customer id in a group → full list of ids (including self). */
  siblingIdsByCustomerId: Map<string, string[]>
  /** Hidden duplicate rows map to the row shown in the list. */
  canonicalIdByCustomerId: Map<string, string>
}

/** Stable key for grouping business-domain mail (Twilio, Stripe, etc.) in the Customers hub. */
export function customerOrgGroupSignature(customer: CustomerOrgGroupable): string | null {
  if (isCustomerContactSeparated(customer.metadata)) return null
  if (
    customer.metadata &&
    typeof customer.metadata === "object" &&
    !Array.isArray(customer.metadata) &&
    ((customer.metadata as Record<string, unknown>).sandbox_seed === true ||
      (customer.metadata as Record<string, unknown>).sandbox_live === true)
  ) {
    return null
  }
  const hubKind = parseCustomerHubKind(customer.metadata)
  for (const email of customerEmailsFromIdentifiers(customer.customer_identifiers)) {
    const root = deriveOrgGroupKeyFromEmail(email)
    if (root) return `${hubKind}:${root}`
  }
  const orgKey = parseCustomerOrgGroupKey(customer.metadata)
  if (orgKey) return `${hubKind}:${orgKey}`
  return null
}

function mergeOrgGroupCustomerRows<T extends CustomerOrgGroupable>(group: T[]): T {
  const sorted = [...group].sort(
    (a, b) =>
      (Date.parse(b.last_activity_at || b.updated_at || "") || 0) -
      (Date.parse(a.last_activity_at || a.updated_at || "") || 0),
  )
  const base = { ...sorted[0] }
  const emailSeen = new Set<string>()
  const mergedIdentifiers: { type: string; value: string; is_primary?: boolean }[] = []
  for (const row of sorted) {
    for (const ident of row.customer_identifiers ?? []) {
      if (ident.type !== "email") {
        mergedIdentifiers.push(ident)
        continue
      }
      const v = ident.value.trim().toLowerCase()
      if (!v || emailSeen.has(v)) continue
      emailSeen.add(v)
      mergedIdentifiers.push({ ...ident, value: v })
    }
  }
  base.customer_identifiers = mergedIdentifiers.length ? mergedIdentifiers : base.customer_identifiers
  const hubKind = parseCustomerHubKind(base.metadata)
  const orgKey = parseCustomerOrgGroupKey(base.metadata)
  if (orgKey && !base.display_name?.trim()) {
    const label = orgGroupSummaryLabel(orgKey, hubKind)
    if (label) base.display_name = label.split(" · ")[0] ?? base.display_name
  }
  return base
}

/**
 * Present one Customers hub row per org source (e.g. all Twilio noreply variants).
 * Does not change database rows — display and activity loading only.
 */
export function collapseOrgGroupedCustomers<T extends CustomerOrgGroupable>(
  customers: T[],
): { customers: T[]; maps: CustomerOrgGroupingMaps } {
  const bySignature = new Map<string, T[]>()
  const standalone: T[] = []

  for (const customer of customers) {
    const signature = customerOrgGroupSignature(customer)
    if (!signature) {
      standalone.push(customer)
      continue
    }
    const bucket = bySignature.get(signature) ?? []
    bucket.push(customer)
    bySignature.set(signature, bucket)
  }

  const collapsed: T[] = [...standalone]
  const siblingIdsByCustomerId = new Map<string, string[]>()
  const canonicalIdByCustomerId = new Map<string, string>()

  for (const group of bySignature.values()) {
    if (group.length === 1) {
      const only = group[0]
      collapsed.push(only)
      siblingIdsByCustomerId.set(only.id, [only.id])
      canonicalIdByCustomerId.set(only.id, only.id)
      continue
    }

    const merged = mergeOrgGroupCustomerRows(group)
    collapsed.push(merged)
    const ids = group.map((c) => c.id)
    for (const id of ids) {
      siblingIdsByCustomerId.set(id, ids)
      canonicalIdByCustomerId.set(id, merged.id)
    }
    siblingIdsByCustomerId.set(merged.id, ids)
  }

  return {
    customers: collapsed,
    maps: { siblingIdsByCustomerId, canonicalIdByCustomerId },
  }
}

/** Remap communication_events.customer_id to the canonical list row for last-activity sorting. */
export function remapEventsToCanonicalCustomers<
  T extends { customer_id?: string | null; created_at?: string | null },
>(events: T[] | null | undefined, canonicalIdByCustomerId: Map<string, string>): T[] {
  if (!events?.length || canonicalIdByCustomerId.size === 0) return events ?? []
  return events.map((row) => {
    const raw = String(row.customer_id ?? "").trim()
    if (!raw) return row
    const canonical = canonicalIdByCustomerId.get(raw)
    return canonical && canonical !== raw ? { ...row, customer_id: canonical } : row
  })
}

export function resolveCanonicalCustomerId(customerId: string, maps: CustomerOrgGroupingMaps): string {
  return maps.canonicalIdByCustomerId.get(customerId) ?? customerId
}

export function resolveOrgSiblingCustomerIds(customerId: string, maps: CustomerOrgGroupingMaps): string[] {
  return maps.siblingIdsByCustomerId.get(customerId) ?? [customerId]
}

/** Match org siblings from an in-memory customer list (no extra query). */
export function findOrgSiblingIdsFromCustomers<T extends CustomerOrgGroupable>(
  customer: T,
  allCustomers: T[],
): string[] {
  const hubKind = parseCustomerHubKind(customer.metadata)
  const orgRoots = new Set<string>()
  for (const email of customerEmailsFromIdentifiers(customer.customer_identifiers)) {
    const root = deriveOrgGroupKeyFromEmail(email)
    if (root) orgRoots.add(root)
  }
  const orgKey = parseCustomerOrgGroupKey(customer.metadata)
  if (orgKey) orgRoots.add(orgKey.split(".")[0] ?? orgKey)
  if (orgRoots.size === 0) return [customer.id]

  const ids = new Set<string>([customer.id])
  for (const row of allCustomers) {
    if (isCustomerContactSeparated(row.metadata)) continue
    for (const email of customerEmailsFromIdentifiers(row.customer_identifiers)) {
      const root = deriveOrgGroupKeyFromEmail(email)
      if (!root || !orgRoots.has(root)) continue
      if (!customerEmailMatchesHubKind(email, row.metadata, hubKind)) continue
      ids.add(row.id)
    }
  }
  return [...ids]
}
