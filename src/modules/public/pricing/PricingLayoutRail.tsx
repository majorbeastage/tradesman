import { sectionStyle, TierCard, type PricingLayoutProps } from "./PricingShared"

/** Horizontal snap rail on desktop; vertical stack on mobile. */
export default function PricingLayoutRail({
  tiers,
  expandedId,
  setExpandedId,
  onSignupWithPackage,
  isMobile,
}: PricingLayoutProps) {
  if (isMobile) {
    return (
      <section style={{ ...sectionStyle, display: "flex", flexDirection: "column", gap: 14 }}>
        {tiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            expanded={expandedId === tier.id}
            onToggle={() => setExpandedId(expandedId === tier.id ? null : tier.id)}
            onSignup={() => onSignupWithPackage(tier.id)}
            subdued={tier.id === "estimate_tools_only"}
          />
        ))}
      </section>
    )
  }

  return (
    <section style={{ ...sectionStyle, paddingBottom: 24 }}>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
        Scroll horizontally to compare plans →
      </p>
      <div
        style={{
          display: "flex",
          gap: 16,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: 12,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {tiers.map((tier) => (
          <div
            key={tier.id}
            style={{
              flex: "0 0 min(340px, 85vw)",
              scrollSnapAlign: "start",
              maxHeight: expandedId === tier.id ? "none" : 520,
            }}
          >
            <TierCard
              tier={tier}
              expanded={expandedId === tier.id}
              onToggle={() => setExpandedId(expandedId === tier.id ? null : tier.id)}
              onSignup={() => onSignupWithPackage(tier.id)}
              subdued={tier.id === "estimate_tools_only"}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
