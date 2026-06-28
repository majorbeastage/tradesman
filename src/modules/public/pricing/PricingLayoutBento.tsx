import { sectionStyle, TierCard, type PricingLayoutProps } from "./PricingShared"

/** Asymmetric bento — featured plan large center, others in surrounding cells. */
export default function PricingLayoutBento({
  tiers,
  expandedId,
  setExpandedId,
  onSignupWithPackage,
  isMobile,
}: PricingLayoutProps) {
  const featured = tiers.find((t) => t.featured) ?? tiers[3]
  const others = tiers.filter((t) => t.id !== featured.id)
  const starter = others.find((t) => t.id === "estimate_tools_only")
  const rest = others.filter((t) => t.id !== "estimate_tools_only")

  if (isMobile) {
    return (
      <section style={{ ...sectionStyle, display: "flex", flexDirection: "column", gap: 16 }}>
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
    <section style={sectionStyle}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridAutoRows: "minmax(120px, auto)",
          gap: 16,
          width: "100%",
        }}
      >
        {starter ? (
          <div style={{ gridColumn: "span 3", gridRow: "span 1" }}>
            <TierCard
              tier={starter}
              expanded={expandedId === starter.id}
              onToggle={() => setExpandedId(expandedId === starter.id ? null : starter.id)}
              onSignup={() => onSignupWithPackage(starter.id)}
              subdued
              compact
            />
          </div>
        ) : null}

        <div
          style={{
            gridColumn: "span 6",
            gridRow: "span 2",
          }}
        >
          <TierCard
            tier={featured}
            expanded={expandedId === featured.id}
            onToggle={() => setExpandedId(expandedId === featured.id ? null : featured.id)}
            onSignup={() => onSignupWithPackage(featured.id)}
          />
        </div>

        {rest.slice(0, 2).map((tier, i) => (
          <div key={tier.id} style={{ gridColumn: i === 0 ? "span 3" : "span 3", alignSelf: "stretch" }}>
            <TierCard
              tier={tier}
              expanded={expandedId === tier.id}
              onToggle={() => setExpandedId(expandedId === tier.id ? null : tier.id)}
              onSignup={() => onSignupWithPackage(tier.id)}
              compact
            />
          </div>
        ))}

        {rest.slice(2).map((tier) => (
          <div key={tier.id} style={{ gridColumn: "span 4" }}>
            <TierCard
              tier={tier}
              expanded={expandedId === tier.id}
              onToggle={() => setExpandedId(expandedId === tier.id ? null : tier.id)}
              onSignup={() => onSignupWithPackage(tier.id)}
              compact
            />
          </div>
        ))}
      </div>
    </section>
  )
}
