export type PricingLayoutVariant = "cards" | "bento" | "rail" | "compare"

export const DEFAULT_PRICING_LAYOUT: PricingLayoutVariant = "cards"

export const PRICING_LAYOUT_VARIANTS: {
  id: PricingLayoutVariant
  label: string
  blurb: string
}[] = [
  {
    id: "cards",
    label: "Cards (live)",
    blurb: "Default grid — starter inline, subdued; OM Pro highlighted.",
  },
  {
    id: "bento",
    label: "Bento",
    blurb: "Featured plan center stage; asymmetric modern grid.",
  },
  {
    id: "rail",
    label: "Scroll rail",
    blurb: "Horizontal snap carousel on desktop; stacked on mobile.",
  },
  {
    id: "compare",
    label: "Compare",
    blurb: "Column comparison table with sticky tier headers.",
  },
]

export function pricingLayoutFromQueryParam(raw: string | null): PricingLayoutVariant {
  const id = raw?.trim().toLowerCase()
  if (id === "bento" || id === "rail" || id === "compare" || id === "cards") return id
  return DEFAULT_PRICING_LAYOUT
}

export function pricingLayoutQueryValue(id: PricingLayoutVariant): string {
  return id
}
