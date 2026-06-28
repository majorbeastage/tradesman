import { useMemo, useState } from "react"
import type { ProductPackageId } from "../../../lib/productPackages"
import { sectionStyle, TierCard, usePricingGridBreakpoint, type PricingLayoutProps } from "./PricingShared"
import PricingPackageComparePanel from "./PricingPackageComparePanel"
import { theme } from "../../../styles/theme"

/** Default full-width card grid with optional multi-select comparison chart. */
export default function PricingLayoutCards({
  tiers,
  expandedId,
  setExpandedId,
  onSignupWithPackage,
  isMobile,
}: PricingLayoutProps) {
  const [compareIds, setCompareIds] = useState<ProductPackageId[]>([])
  const gridBreakpoint = usePricingGridBreakpoint()
  const mobile = isMobile || gridBreakpoint === "mobile"
  const desktopRow = gridBreakpoint === "desktop"

  const gridTemplateColumns = mobile
    ? "1fr"
    : gridBreakpoint === "tablet"
      ? "repeat(3, minmax(0, 1fr))"
      : "repeat(6, minmax(0, 1fr))"

  const selectedTiers = useMemo(
    () => tiers.filter((t) => compareIds.includes(t.id)),
    [tiers, compareIds],
  )

  const toggleCompare = (id: ProductPackageId) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <section style={sectionStyle}>
      {compareIds.length === 1 ? (
        <p
          style={{
            margin: "0 0 14px",
            padding: "10px 14px",
            borderRadius: 10,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            fontSize: 13,
            color: "#1e40af",
            fontWeight: 600,
          }}
        >
          Select at least one more package to open the comparison chart.
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns,
          gap: desktopRow ? 10 : 16,
          alignItems: "stretch",
          width: "100%",
        }}
      >
        {tiers.map((tier) => {
          const isStarter = tier.id === "estimate_tools_only"
          const expanded = expandedId === tier.id
          const compareSelected = compareIds.includes(tier.id)
          return (
            <div
              key={tier.id}
              style={{
                minWidth: 0,
                height: "100%",
                outline: compareSelected ? `2px solid ${theme.primary}` : undefined,
                borderRadius: 16,
              }}
            >
              <TierCard
                tier={tier}
                expanded={expanded}
                onToggle={() => setExpandedId(expanded ? null : tier.id)}
                onSignup={() => onSignupWithPackage(tier.id)}
                subdued={isStarter}
                compact={desktopRow}
                compareSelected={compareSelected}
                onCompareToggle={() => toggleCompare(tier.id)}
              />
            </div>
          )
        })}
      </div>

      <PricingPackageComparePanel
        selectedTiers={selectedTiers}
        onClear={() => setCompareIds([])}
        onSignup={onSignupWithPackage}
        isMobile={mobile}
      />
    </section>
  )
}
