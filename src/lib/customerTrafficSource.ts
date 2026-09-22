/** First-touch inbound origin on `customers.metadata`. Set only when the customer is created. */

export const CUSTOMER_TRAFFIC_SOURCE_META_KEY = "traffic_source"
export const CUSTOMER_TRAFFIC_SOURCE_DETAIL_META_KEY = "traffic_source_detail"
export const CUSTOMER_TRAFFIC_SOURCE_AT_META_KEY = "traffic_source_at"

export type CustomerTrafficSourceKind =
  | "inbound_phone"
  | "inbound_sms"
  | "inbound_email"
  | "website_form"
  | "manual"
  | "admin"
  | "sandbox"
  | "split"

export type CustomerTrafficSourceStamp = {
  kind: CustomerTrafficSourceKind
  detail?: string
}

const TRAFFIC_SOURCE_LABELS: Record<CustomerTrafficSourceKind, string> = {
  inbound_phone: "Phone call",
  inbound_sms: "Text message",
  inbound_email: "Email",
  website_form: "Website form",
  manual: "Added by shop",
  admin: "Admin / ops",
  sandbox: "Training sandbox",
  split: "Split from another customer",
}

function asRecord(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) }
  }
  return {}
}

export function parseCustomerTrafficSource(metadata: unknown): {
  kind: string
  detail: string
  at: string
} | null {
  const meta = asRecord(metadata)
  const kind = typeof meta[CUSTOMER_TRAFFIC_SOURCE_META_KEY] === "string" ? meta[CUSTOMER_TRAFFIC_SOURCE_META_KEY].trim() : ""
  if (!kind) return null
  const detail =
    typeof meta[CUSTOMER_TRAFFIC_SOURCE_DETAIL_META_KEY] === "string"
      ? meta[CUSTOMER_TRAFFIC_SOURCE_DETAIL_META_KEY].trim()
      : ""
  const at =
    typeof meta[CUSTOMER_TRAFFIC_SOURCE_AT_META_KEY] === "string" ? meta[CUSTOMER_TRAFFIC_SOURCE_AT_META_KEY].trim() : ""
  return { kind, detail, at }
}

export function formatCustomerTrafficSource(metadata: unknown): string | null {
  const parsed = parseCustomerTrafficSource(metadata)
  if (!parsed) return null
  const label = TRAFFIC_SOURCE_LABELS[parsed.kind as CustomerTrafficSourceKind] ?? parsed.kind
  return parsed.detail ? `${label} · ${parsed.detail}` : label
}

/** Writes traffic source only if the customer does not already have one. */
export function mergeCustomerTrafficSourceFirstTouch(
  existing: unknown,
  stamp: CustomerTrafficSourceStamp,
): Record<string, unknown> {
  const prev = asRecord(existing)
  if (typeof prev[CUSTOMER_TRAFFIC_SOURCE_META_KEY] === "string" && prev[CUSTOMER_TRAFFIC_SOURCE_META_KEY].trim()) {
    return prev
  }
  prev[CUSTOMER_TRAFFIC_SOURCE_META_KEY] = stamp.kind
  const detail = stamp.detail?.trim()
  if (detail) prev[CUSTOMER_TRAFFIC_SOURCE_DETAIL_META_KEY] = detail.slice(0, 160)
  prev[CUSTOMER_TRAFFIC_SOURCE_AT_META_KEY] = new Date().toISOString()
  return prev
}
