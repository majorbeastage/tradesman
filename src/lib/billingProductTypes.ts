/**
 * Admin billing sheet: primary + additional product lines per profile.
 * Monthly amounts align with public pricing (USD); Inactive / Exempt are $0.
 */

export type BillingProductTypeId =
  | "inactive"
  | "exempt"
  | "user"
  | "office_manager"
  | "basic_package"
  | "om_entry"
  | "om_pro"
  | "om_elite"

export const BILLING_PRODUCT_OPTIONS: { id: BillingProductTypeId; label: string; monthlyUsd: number }[] = [
  { id: "inactive", label: "Inactive", monthlyUsd: 0 },
  { id: "exempt", label: "Exempt", monthlyUsd: 0 },
  { id: "user", label: "User", monthlyUsd: 0 },
  { id: "office_manager", label: "Office Manager", monthlyUsd: 159.99 },
  { id: "basic_package", label: "Basic Package", monthlyUsd: 124.99 },
  { id: "om_entry", label: "Office Manager ENTRY", monthlyUsd: 159.99 },
  { id: "om_pro", label: "Office Manager PRO", monthlyUsd: 199.99 },
  { id: "om_elite", label: "Office Manager ELITE", monthlyUsd: 369.99 },
]

const MONTHLY_BY_ID: Record<BillingProductTypeId, number> = BILLING_PRODUCT_OPTIONS.reduce(
  (acc, o) => {
    acc[o.id] = o.monthlyUsd
    return acc
  },
  {} as Record<BillingProductTypeId, number>,
)

export function isBillingProductTypeId(s: string): s is BillingProductTypeId {
  return (MONTHLY_BY_ID as Record<string, number>)[s] !== undefined
}

export function monthlyUsdForBillingProductType(id: string | null | undefined): number {
  if (!id || !isBillingProductTypeId(id)) return 0
  return MONTHLY_BY_ID[id] ?? 0
}

/** Sum primary + additional product lines (monthly). */
export function sumMonthlyBillingUsd(primary: string | null | undefined, additional: string[] | null | undefined): number {
  let sum = monthlyUsdForBillingProductType(primary ?? "")
  const add = additional ?? []
  for (const a of add) {
    sum += monthlyUsdForBillingProductType(a)
  }
  return Math.round(sum * 100) / 100
}

export function formatUsdMonthly(n: number): string {
  if (n === 0) return "$0.00"
  return `$${n.toFixed(2)}`
}

export function billingProductLabel(id: string): string {
  return BILLING_PRODUCT_OPTIONS.find((o) => o.id === id)?.label ?? id
}
