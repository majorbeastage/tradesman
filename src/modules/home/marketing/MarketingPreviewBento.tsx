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

export function MarketingPreviewBento({ onLogin, onSignup, onTrial, onPricing }: Props) {
  const [hero, ...rest] = MARKETING_PILLARS
  const wide = rest.slice(0, 2)
  const mid = rest.slice(2, 5)
  const tail = rest.slice(5)

  return (
    <>
      <MarketingPreviewTopNav onLogin={onLogin} />
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 20px 56px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
            gap: 40,
            alignItems: "center",
          }}
        >
          <div>
            <MarketingPreviewHeroCopy>
              <MarketingPreviewCtas onPrimary={onLogin} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} />
            </MarketingPreviewHeroCopy>
          </div>
          <ProductShot src={MARKETING_HERO_SCREENSHOT} alt="Tradesman dashboard" tall />
        </div>
      </section>

      <section style={{ background: "#fff", borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 20px" }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: theme.primary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Seven pillars
          </p>
          <h2 style={{ margin: "8px 0 32px", fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 900, color: theme.charcoal }}>
            Everything your office runs on—connected
          </h2>

          <div className="marketing-bento-grid" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>
            <BentoCard pillar={hero} span={7} showImage />
            {wide.map((p) => (
              <BentoCard key={p.id} pillar={p} span={5} showImage compact />
            ))}
            {mid.map((p) => (
              <BentoCard key={p.id} pillar={p} span={4} showImage compact />
            ))}
            {tail.map((p) => (
              <BentoCard key={p.id} pillar={p} span={6} showImage compact />
            ))}
          </div>
          <style>{`
            @media (max-width: 900px) {
              .marketing-bento-grid > article { grid-column: span 12 !important; flex-direction: column !important; }
            }
          `}</style>
        </div>
      </section>

      <section style={{ maxWidth: 720, margin: "0 auto", padding: "56px 20px", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 900, color: theme.charcoal }}>Ready to try it?</h2>
        <p style={{ margin: "0 0 24px", color: "#64748b", lineHeight: 1.6 }}>
          Start in trial mode with demo customers—or sign up when you&apos;re ready for your own data.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <MarketingPreviewCtas onPrimary={onLogin} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} />
        </div>
      </section>
    </>
  )
}

function BentoCard({
  pillar,
  span,
  showImage,
  compact,
}: {
  pillar: (typeof MARKETING_PILLARS)[number]
  span: number
  showImage?: boolean
  compact?: boolean
}) {
  return (
    <article
      style={{
        gridColumn: `span ${span}`,
        minWidth: 0,
        background: "#fafafa",
        borderRadius: 20,
        border: `1px solid ${theme.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: compact ? "column" : "row",
        minHeight: compact ? undefined : 280,
      }}
    >
      {showImage ? (
        <div style={{ flex: compact ? undefined : "1 1 55%", minWidth: 0 }}>
          <img src={pillar.image} alt="" style={{ width: "100%", height: compact ? 160 : "100%", minHeight: compact ? 160 : 220, objectFit: "cover", objectPosition: "top" }} />
        </div>
      ) : null}
      <div style={{ padding: compact ? 18 : 24, flex: "1 1 45%" }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: pillar.accent, marginBottom: 10 }} />
        <h3 style={{ margin: "0 0 6px", fontSize: compact ? 17 : 20, fontWeight: 800, color: theme.charcoal }}>{pillar.title}</h3>
        <p style={{ margin: "0 0 10px", fontSize: compact ? 14 : 15, fontWeight: 700, color: "#334155", lineHeight: 1.4 }}>{pillar.tagline}</p>
        {!compact ? <p style={{ margin: 0, fontSize: 14, color: "#64748b", lineHeight: 1.55 }}>{pillar.body}</p> : null}
      </div>
    </article>
  )
}
