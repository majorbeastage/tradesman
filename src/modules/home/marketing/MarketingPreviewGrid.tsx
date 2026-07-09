import { MARKETING_HERO_SCREENSHOT, MARKETING_PILLARS } from "../../../lib/marketingPillars"
import {
  MarketingPreviewCtas,
  MarketingPreviewHeroCopy,
  MarketingPreviewTopNav,
  ProductShot,
} from "./MarketingPreviewShared"
import { theme } from "../../../styles/theme"

type Props = {
  onLogin?: () => void
  onSignup?: () => void
  onTrial?: () => void
  onPricing?: () => void
}

export function MarketingPreviewGrid({ onLogin, onSignup, onTrial, onPricing }: Props) {
  return (
    <>
      <MarketingPreviewTopNav onLogin={onLogin} />
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 20px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 32, alignItems: "center" }}>
          <MarketingPreviewHeroCopy>
            <MarketingPreviewCtas onPrimary={onLogin} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} compact />
          </MarketingPreviewHeroCopy>
          <ProductShot src={MARKETING_HERO_SCREENSHOT} alt="Dashboard preview" />
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900, color: theme.charcoal }}>The seven pillars</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 15 }}>Short version—each card expands on hover (desktop).</p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {MARKETING_PILLARS.map((pillar) => (
            <PillarTile key={pillar.id} pillar={pillar} />
          ))}
        </div>
      </section>

      <section
        style={{
          borderTop: `1px solid ${theme.border}`,
          background: "#fff",
          padding: "40px 20px",
          textAlign: "center",
        }}
      >
        <MarketingPreviewCtas onPrimary={onLogin} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} />
      </section>
    </>
  )
}

function PillarTile({ pillar }: { pillar: (typeof MARKETING_PILLARS)[number] }) {
  return (
    <article
      className="marketing-pillar-tile"
      style={{
        position: "relative",
        borderRadius: 16,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        overflow: "hidden",
        minHeight: 200,
        transition: "box-shadow 0.2s, transform 0.2s",
      }}
    >
      <div
        style={{
          height: 100,
          background: `linear-gradient(135deg, ${pillar.accent}22, ${pillar.accent}08)`,
          borderBottom: `1px solid ${theme.border}`,
          overflow: "hidden",
        }}
      >
        <img src={pillar.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", opacity: 0.92 }} />
      </div>
      <div style={{ padding: "16px 18px 18px" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: theme.charcoal }}>{pillar.title}</h3>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#334155", lineHeight: 1.45 }}>{pillar.tagline}</p>
        <p className="marketing-pillar-tile-body" style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          {pillar.body}
        </p>
      </div>
      <style>{`
        .marketing-pillar-tile .marketing-pillar-tile-body {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (hover: hover) {
          .marketing-pillar-tile:hover {
            box-shadow: 0 16px 40px rgba(15,23,42,0.1);
            transform: translateY(-2px);
          }
          .marketing-pillar-tile:hover .marketing-pillar-tile-body {
            display: block;
            -webkit-line-clamp: unset;
          }
        }
      `}</style>
    </article>
  )
}
