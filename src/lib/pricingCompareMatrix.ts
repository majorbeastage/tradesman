import type { ProductPackageId } from "./productPackages"
import { PRICING_TIERS, formatPrice, tierById, type PricingFeatureGroup, type PricingTierContent } from "./pricingPageContent"

const OM_TIER_CHAIN: ProductPackageId[] = [
  "base",
  "office_manager_entry",
  "office_manager_pro",
  "office_manager_elite",
  "corporate",
]

/** All feature groups included in a tier (inherits lower OM tiers). */
export function resolveTierFeatureGroups(tier: PricingTierContent): PricingFeatureGroup[] {
  if (tier.id === "estimate_tools_only") {
    const groups: PricingFeatureGroup[] = []
    if (tier.chooseOneTools?.length) {
      groups.push({ title: "Choose one tool", items: tier.chooseOneTools })
    }
    groups.push(...tier.featureGroups)
    return groups
  }

  const chainIdx = OM_TIER_CHAIN.indexOf(tier.id)
  if (chainIdx < 0) return [...tier.featureGroups, ...(tier.tierAdds ?? [])]

  const groups: PricingFeatureGroup[] = []
  const base = tierById("base")
  if (base) groups.push(...base.featureGroups)

  for (let i = 1; i <= chainIdx; i++) {
    const step = tierById(OM_TIER_CHAIN[i])
    if (step?.tierAdds?.length) groups.push(...step.tierAdds)
  }
  return groups
}

export type CompareMatrixSection = {
  title: string
  rows: string[]
}

export type CompareMatrix = {
  sections: CompareMatrixSection[]
  /** Flat lookup: tier id → set of included feature labels */
  includedByTier: Record<ProductPackageId, Set<string>>
}

function featureKey(section: string, item: string): string {
  return `${section}\0${item}`
}

export function buildPricingCompareMatrix(tiers: PricingTierContent[] = PRICING_TIERS): CompareMatrix {
  const includedByTier = {} as Record<ProductPackageId, Set<string>>
  const sectionOrder: string[] = []
  const rowsBySection = new Map<string, Set<string>>()

  for (const tier of tiers) {
    const included = new Set<string>()
    for (const group of resolveTierFeatureGroups(tier)) {
      if (!sectionOrder.includes(group.title)) sectionOrder.push(group.title)
      const rowSet = rowsBySection.get(group.title) ?? new Set<string>()
      for (const item of group.items) {
        rowSet.add(item)
        included.add(featureKey(group.title, item))
      }
      rowsBySection.set(group.title, rowSet)
    }
    includedByTier[tier.id] = included
  }

  const sections: CompareMatrixSection[] = sectionOrder.map((title) => ({
    title,
    rows: [...(rowsBySection.get(title) ?? [])],
  }))

  return { sections, includedByTier }
}

export type CompareSummaryRow = {
  id: string
  label: string
  values: Record<ProductPackageId, string>
}

export function buildCompareSummaryRows(selected: PricingTierContent[]): CompareSummaryRow[] {
  return [
    {
      id: "price",
      label: "Monthly price",
      values: Object.fromEntries(selected.map((t) => [t.id, `${formatPrice(t.priceMonthly)}/mo`])) as Record<
        ProductPackageId,
        string
      >,
    },
    {
      id: "seats",
      label: "Included logins",
      values: Object.fromEntries(selected.map((t) => [t.id, t.seats])) as Record<ProductPackageId, string>,
    },
    {
      id: "usage",
      label: "Usage allocation",
      values: Object.fromEntries(selected.map((t) => [t.id, t.usageDisclaimer])) as Record<ProductPackageId, string>,
    },
  ]
}

export function tierIncludesFeature(
  matrix: CompareMatrix,
  tierId: ProductPackageId,
  section: string,
  item: string,
): boolean {
  return matrix.includedByTier[tierId]?.has(featureKey(section, item)) ?? false
}

export function isChooseOneSection(sectionTitle: string): boolean {
  return sectionTitle === "Choose one tool"
}

/** Starter-only sections — omitted from multi-plan comparison charts. */
export const COMPARE_OMITTED_SECTION_TITLES = new Set([
  "Choose one tool",
  "Included with every 1 Tool plan",
])

export function compareSectionsForDisplay(sections: CompareMatrixSection[]): CompareMatrixSection[] {
  return sections.filter((s) => !COMPARE_OMITTED_SECTION_TITLES.has(s.title))
}
