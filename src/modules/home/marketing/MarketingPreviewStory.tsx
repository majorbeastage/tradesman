import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import {
  MARKETING_HERO_PRESENTATION,
  MARKETING_HERO_SCREENSHOT,
  MARKETING_PILLARS,
  type MarketingImagePresentation,
  type MarketingPillar,
} from "../../../lib/marketingPillars"
import {
  MarketingPreviewCtas,
  MarketingPreviewHeroCopy,
  MarketingPreviewTopNav,
} from "./MarketingPreviewShared"
import { theme } from "../../../styles/theme"

const STACK_STICKY_BASE = 108
const STACK_STICKY_STEP = 22
const SLIDE_SCROLL_VH = 108

type Props = {
  onLogin?: () => void
  onTrial?: () => void
  onPricing?: () => void
}

export function MarketingPreviewStory({ onLogin, onTrial, onPricing }: Props) {
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [stackMode, setStackMode] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)")
    const update = () => setStackMode(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (!stackMode) return
    const updateActive = () => {
      let best = 0
      let bestDist = Infinity
      slideRefs.current.forEach((el, i) => {
        if (!el) return
        const stickyTop = STACK_STICKY_BASE + i * STACK_STICKY_STEP
        const dist = Math.abs(el.getBoundingClientRect().top - stickyTop)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      })
      setActiveIndex(best)
    }
    window.addEventListener("scroll", updateActive, { passive: true })
    updateActive()
    return () => window.removeEventListener("scroll", updateActive)
  }, [stackMode])

  return (
    <>
      <MarketingPreviewTopNav onLogin={onLogin} />
      <StoryHero onLogin={onLogin} onTrial={onTrial} onPricing={onPricing} />

      <section style={{ position: "relative", background: "#eef2f6", padding: "8px 0 0" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 20px 12px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: theme.primary, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Seven pillars
          </p>
          <h2 style={{ margin: "10px 0 8px", fontSize: "clamp(1.5rem, 3vw, 2.1rem)", fontWeight: 900, color: theme.charcoal }}>
            Scroll the stack
          </h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 15, maxWidth: 520, marginInline: "auto", lineHeight: 1.55 }}>
            {stackMode
              ? "Each card sticks as you scroll—the next slides over it like a deck."
              : "On smaller screens, cards flow normally so nothing gets clipped."}
          </p>
        </div>

        {stackMode ? (
          <aside
            aria-hidden
            style={{
              position: "fixed",
              right: 18,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {MARKETING_PILLARS.map((p, i) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                title={p.title}
                style={{
                  width: 10,
                  height: activeIndex === i ? 28 : 10,
                  borderRadius: 999,
                  background: activeIndex === i ? p.accent : "#cbd5e1",
                  transition: "height 0.25s, background 0.25s",
                }}
              />
            ))}
          </aside>
        ) : null}

        <div className="marketing-story-stack">
          {MARKETING_PILLARS.map((pillar, i) => (
            <StickyStackSlide
              key={pillar.id}
              pillar={pillar}
              index={i}
              stackMode={stackMode}
              slideRefs={slideRefs}
            />
          ))}
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 100, background: theme.charcoal, color: "#fff", padding: "72px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 900 }}>See it with your workflow</h2>
          <p style={{ margin: "0 0 24px", color: "#cbd5e1", lineHeight: 1.6 }}>
            Trial mode uses sample customers so you can click through estimates, SMS, and scheduling before you commit.
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <MarketingPreviewCtas primaryLabel="Start trial" onPrimary={onTrial} onPricing={onPricing} />
          </div>
        </div>
      </section>

      <StoryScrollStyles />
    </>
  )
}

function StoryHero({ onLogin, onTrial, onPricing }: Props) {
  return (
    <section
      style={{
        background: "linear-gradient(165deg, #fff 0%, #f8fafc 55%, #eef2f6 100%)",
        borderBottom: `1px solid ${theme.border}`,
        minHeight: "min(92vh, 900px)",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "32px 20px 56px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: 40,
          alignItems: "center",
          width: "100%",
        }}
      >
        <div>
          <MarketingPreviewHeroCopy>
            <MarketingPreviewCtas onPrimary={onLogin} onTrial={onTrial} onPricing={onPricing} />
          </MarketingPreviewHeroCopy>
        </div>
        <BrowserFrame presentation={MARKETING_HERO_PRESENTATION} src={MARKETING_HERO_SCREENSHOT} alt="Tradesman dashboard" />
      </div>
    </section>
  )
}

type SlideProps = {
  pillar: MarketingPillar
  index: number
  stackMode: boolean
  slideRefs: RefObject<(HTMLDivElement | null)[]>
}

function StickyStackSlide({ pillar, index, stackMode, slideRefs }: SlideProps) {
  const depth = useStackDepth(index, slideRefs, stackMode)
  const stickyTop = STACK_STICKY_BASE + index * STACK_STICKY_STEP
  const scale = stackMode ? Math.max(0.9, 1 - depth * 0.024) : 1
  const dim = stackMode ? Math.max(0.82, 1 - depth * 0.05) : 1
  const flip = index % 2 === 1
  const emphasis = pillar.imagePresentation?.imageEmphasis
  const shotCol = emphasis ? "1.4fr" : "1.15fr"
  const gridCols = flip ? `1fr ${shotCol}` : `${shotCol} 1fr`

  const cardStyle: CSSProperties = stackMode
    ? {
        position: "sticky",
        top: stickyTop,
        zIndex: 10 + index,
        transform: `scale(${scale})`,
        opacity: dim,
        transformOrigin: "top center",
        willChange: "transform, opacity",
      }
    : {
        position: "relative",
        zIndex: 1,
      }

  return (
    <div
      ref={(el) => {
        slideRefs.current[index] = el
      }}
      id={pillar.id}
      className="marketing-story-slide-wrap"
      style={{
        height: stackMode ? `${SLIDE_SCROLL_VH}vh` : "auto",
        padding: stackMode ? "0 20px 0" : "0 20px 24px",
      }}
    >
      <article
        className="marketing-story-slide"
        style={{
          ...cardStyle,
          maxWidth: 1000,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 24,
          border: `1px solid ${theme.border}`,
          boxShadow: `0 ${12 + index * 4}px ${40 + index * 8}px rgba(15,23,42,${0.08 + index * 0.012})`,
          overflow: "hidden",
          transition: stackMode ? "transform 0.15s ease-out, opacity 0.15s ease-out, box-shadow 0.2s" : undefined,
        }}
      >
        <div
          style={{
            height: 4,
            background: `linear-gradient(90deg, ${pillar.accent}, ${pillar.accent}88, transparent)`,
          }}
        />
        <div
          className="marketing-story-slide-inner"
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            gap: 0,
            alignItems: "stretch",
          }}
        >
          <div className="marketing-story-slide-copy" style={{ order: flip ? 2 : 1, padding: "28px 28px 32px" }}>
            <PillarStoryBlock index={index + 1} pillar={pillar} />
          </div>
          <div className="marketing-story-slide-shot" style={{ order: flip ? 1 : 2, padding: flip ? "20px 20px 20px 0" : "20px 0 20px 20px" }}>
            <StoryScreenshot pillar={pillar} />
          </div>
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: 20,
            top: 16,
            fontSize: 72,
            fontWeight: 900,
            color: `${pillar.accent}14`,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </div>
      </article>
    </div>
  )
}

function useStackDepth(index: number, slideRefs: RefObject<(HTMLDivElement | null)[]>, enabled: boolean) {
  const [depth, setDepth] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setDepth(0)
      return
    }
    const update = () => {
      let stackedAbove = 0
      const refs = slideRefs.current
      for (let j = index + 1; j < refs.length; j++) {
        const wrap = refs[j]
        if (!wrap) continue
        const stickyTop = STACK_STICKY_BASE + j * STACK_STICKY_STEP
        if (wrap.getBoundingClientRect().top <= stickyTop + 4) stackedAbove++
      }
      setDepth(stackedAbove)
    }
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    update()
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [index, slideRefs, enabled])

  return depth
}

function StoryScreenshot({ pillar }: { pillar: MarketingPillar }) {
  const p = pillar.imagePresentation
  return (
    <BrowserFrame
      presentation={p}
      src={pillar.image}
      alt={pillar.title}
      compact
    />
  )
}

function BrowserFrame({
  src,
  alt,
  presentation,
  compact,
}: {
  src: string
  alt: string
  presentation?: MarketingImagePresentation
  compact?: boolean
}) {
  const p = presentation ?? {}
  const minH = p.minHeight ?? (compact ? 400 : 480)
  const zoom = p.zoom ?? 1

  return (
    <div
      style={{
        borderRadius: compact ? 14 : 18,
        overflow: "hidden",
        border: "1px solid rgba(15,23,42,0.1)",
        boxShadow: compact ? "0 8px 28px rgba(15,23,42,0.08)" : "0 20px 50px rgba(15,23,42,0.12)",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 14px",
          background: "#f1f5f9",
          borderBottom: "1px solid rgba(15,23,42,0.06)",
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f87171" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#fbbf24" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399" }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: "#64748b", fontWeight: 600 }}>Tradesman</span>
      </div>
      <div
        style={{
          minHeight: minH,
          maxHeight: compact ? minH + 40 : minH + 80,
          background: p.frameBg ?? "#f8fafc",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          overflow: "auto",
          padding: p.objectFit === "contain" ? "8px 0 0" : 0,
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{
            width: p.objectFit === "contain" ? "100%" : "100%",
            height: p.objectFit === "contain" ? "auto" : "100%",
            maxWidth: "100%",
            objectFit: p.objectFit ?? "cover",
            objectPosition: p.objectPosition ?? "top center",
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            transformOrigin: "top center",
            display: "block",
          }}
        />
      </div>
    </div>
  )
}

function PillarStoryBlock({ index, pillar }: { index: number; pillar: MarketingPillar }) {
  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: pillar.accent, letterSpacing: "0.08em" }}>
        {String(index).padStart(2, "0")} · {pillar.title.toUpperCase()}
      </p>
      <h3
        style={{
          margin: "0 0 12px",
          fontSize: "clamp(1.25rem, 2.2vw, 1.65rem)",
          fontWeight: 900,
          color: theme.charcoal,
          lineHeight: 1.2,
        }}
      >
        {pillar.tagline}
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 15, color: "#475569", lineHeight: 1.65 }}>{pillar.body}</p>
      {pillar.bullets?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#64748b", lineHeight: 1.75, fontSize: 13 }}>
          {pillar.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

function StoryScrollStyles() {
  return (
    <style>{`
      .marketing-story-slide {
        position: relative;
      }
      @media (max-width: 899px) {
        .marketing-story-slide-inner {
          grid-template-columns: 1fr !important;
        }
        .marketing-story-slide-copy,
        .marketing-story-slide-shot {
          order: unset !important;
          padding: 20px !important;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .marketing-story-slide {
          transform: none !important;
          opacity: 1 !important;
          transition: none !important;
        }
      }
    `}</style>
  )
}
