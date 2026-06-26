import { useCallback, useEffect, useRef, useState } from "react"
import logo from "../../../assets/logo.png"
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

const SLIDE_SCROLL_VH = 92

type Props = {
  onLogin?: () => void
  onTrial?: () => void
  onPricing?: () => void
  onAdminLogin?: () => void
}

export function MarketingPreviewStory({ onLogin, onTrial, onPricing, onAdminLogin }: Props) {
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)

  const slideCount = MARKETING_PILLARS.length

  useEffect(() => {
    const update = () => {
      const track = scrollTrackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const scrollable = track.offsetHeight - window.innerHeight
      if (scrollable <= 0) {
        setProgress(0)
        return
      }
      const raw = Math.max(0, Math.min(1, -rect.top / scrollable))
      setProgress(raw * Math.max(1, slideCount - 1))
    }
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    update()
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [slideCount])

  const activeIndex = Math.round(progress)

  const openLightbox = useCallback((src: string, alt: string) => {
    setLightbox({ src, alt })
  }, [])

  return (
    <div className="marketing-story-root">
      <MarketingPreviewTopNav onLogin={onLogin} largeLogo />
      <StoryHero onLogin={onLogin} onTrial={onTrial} onPricing={onPricing} onImageClick={openLightbox} />

      <section style={{ position: "relative", width: "100%", background: "#eef2f6" }}>
        <div style={{ padding: "48px 24px 20px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: theme.primary, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Seven pillars
          </p>
          <h2 style={{ margin: "10px 0 8px", fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 900, color: theme.charcoal }}>
            Scroll to explore
          </h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 15, maxWidth: 560, marginInline: "auto", lineHeight: 1.55 }}>
            Each section glides in from the right as you scroll—screenshots show in full; click any image to expand.
          </p>
        </div>

        <aside className="marketing-story-dots" aria-hidden>
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
                transition: "height 0.3s, background 0.3s",
              }}
            />
          ))}
        </aside>

        <div
          ref={scrollTrackRef}
          className="marketing-story-track"
          style={{ height: `${slideCount * SLIDE_SCROLL_VH}vh`, position: "relative" }}
        >
          <div className="marketing-story-viewport">
            {MARKETING_PILLARS.map((pillar, i) => (
              <HorizontalFadeSlide
                key={pillar.id}
                pillar={pillar}
                index={i}
                progress={progress}
                onImageClick={openLightbox}
              />
            ))}
          </div>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 20, background: theme.charcoal, color: "#fff", padding: "72px 24px" }}>
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

      {onAdminLogin ? (
        <div className="marketing-story-admin-bar">
          <button type="button" onClick={onAdminLogin} className="marketing-story-admin-btn">
            Admin portal login
          </button>
        </div>
      ) : null}

      {lightbox ? (
        <>
          <div
            role="presentation"
            onClick={() => setLightbox(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(15,23,42,0.88)",
              cursor: "zoom-out",
            }}
          />
          <div
            role="dialog"
            aria-modal
            aria-label="Expanded screenshot"
            style={{
              position: "fixed",
              zIndex: 201,
              inset: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <img
              src={lightbox.src}
              alt={lightbox.alt}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                borderRadius: 12,
                boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
                pointerEvents: "auto",
                cursor: "zoom-out",
              }}
              onClick={() => setLightbox(null)}
            />
          </div>
        </>
      ) : null}

      <StoryScrollStyles />
    </div>
  )
}

function StoryHero({
  onLogin,
  onTrial,
  onPricing,
  onImageClick,
}: Props & { onImageClick: (src: string, alt: string) => void }) {
  return (
    <section
      style={{
        background: "linear-gradient(165deg, #fff 0%, #f8fafc 55%, #eef2f6 100%)",
        borderBottom: `1px solid ${theme.border}`,
        minHeight: "min(92vh, 920px)",
        display: "flex",
        alignItems: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "min(1400px, 100%)",
          margin: "0 auto",
          padding: "32px clamp(20px, 4vw, 48px) 56px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: "clamp(24px, 4vw, 48px)",
          alignItems: "center",
        }}
      >
        <div>
          <img
            src={logo}
            alt="Tradesman"
            style={{ height: "clamp(56px, 8vw, 88px)", width: "auto", objectFit: "contain", marginBottom: 20 }}
          />
          <MarketingPreviewHeroCopy hideEyebrow>
            <MarketingPreviewCtas onPrimary={onLogin} onTrial={onTrial} onPricing={onPricing} />
          </MarketingPreviewHeroCopy>
        </div>
        <BrowserFrame
          presentation={MARKETING_HERO_PRESENTATION}
          src={MARKETING_HERO_SCREENSHOT}
          alt="Tradesman dashboard"
          onExpand={() => onImageClick(MARKETING_HERO_SCREENSHOT, "Tradesman dashboard")}
        />
      </div>
    </section>
  )
}

function HorizontalFadeSlide({
  pillar,
  index,
  progress,
  onImageClick,
}: {
  pillar: MarketingPillar
  index: number
  progress: number
  onImageClick: (src: string, alt: string) => void
}) {
  const motion = slideMotion(index, progress)
  const flip = index % 2 === 1

  return (
    <article
      id={pillar.id}
      className="marketing-story-slide-panel"
      style={{
        opacity: motion.opacity,
        transform: `translateX(${motion.translateX}vw)`,
        zIndex: motion.zIndex,
        pointerEvents: motion.opacity > 0.35 ? "auto" : "none",
      }}
    >
      <div className="marketing-story-slide-accent" style={{ background: `linear-gradient(90deg, ${pillar.accent}, ${pillar.accent}88, transparent)` }} />
      <div className={`marketing-story-slide-grid ${flip ? "marketing-story-slide-grid-flip" : ""}`}>
        <div className="marketing-story-slide-copy">
          <PillarStoryBlock index={index + 1} pillar={pillar} />
        </div>
        <div className="marketing-story-slide-shot">
          <BrowserFrame
            presentation={pillar.imagePresentation}
            src={pillar.image}
            alt={pillar.title}
            compact
            onExpand={() => onImageClick(pillar.image, pillar.title)}
          />
        </div>
      </div>
    </article>
  )
}

function slideMotion(index: number, progress: number): { opacity: number; translateX: number; zIndex: number } {
  const offset = index - progress

  if (offset <= -1.05) return { opacity: 0, translateX: -14, zIndex: 1 }
  if (offset >= 1.05) return { opacity: 0, translateX: 14, zIndex: 1 }

  if (offset <= 0) {
    const t = 1 + offset
    return {
      opacity: Math.max(0, Math.min(1, t)),
      translateX: offset * 11,
      zIndex: 20 + index,
    }
  }

  const t = 1 - offset
  return {
    opacity: Math.max(0, Math.min(1, t)),
    translateX: offset * 11,
    zIndex: 20 + index,
  }
}

function BrowserFrame({
  src,
  alt,
  presentation,
  compact,
  onExpand,
}: {
  src: string
  alt: string
  presentation?: MarketingImagePresentation
  compact?: boolean
  onExpand?: () => void
}) {
  const p = presentation ?? {}

  return (
    <div
      style={{
        borderRadius: compact ? 14 : 18,
        overflow: "hidden",
        border: "1px solid rgba(15,23,42,0.1)",
        boxShadow: compact ? "0 8px 28px rgba(15,23,42,0.08)" : "0 20px 50px rgba(15,23,42,0.12)",
        background: "#fff",
        height: "100%",
        display: "flex",
        flexDirection: "column",
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
          flexShrink: 0,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f87171" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#fbbf24" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399" }} />
        <img src={logo} alt="" style={{ marginLeft: 8, height: 18, width: "auto", opacity: 0.85 }} />
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            style={{
              marginLeft: "auto",
              fontSize: 11,
              fontWeight: 700,
              color: theme.primary,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Expand
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onExpand}
        title="Click to expand screenshot"
        style={{
          flex: 1,
          display: "block",
          width: "100%",
          padding: p.objectFit === "contain" ? 12 : 0,
          background: p.frameBg ?? "#f8fafc",
          border: "none",
          cursor: onExpand ? "zoom-in" : "default",
          textAlign: "center",
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{
            width: "100%",
            height: "auto",
            maxHeight: compact ? "min(62vh, 720px)" : "min(68vh, 780px)",
            objectFit: "contain",
            objectPosition: p.objectPosition ?? "top center",
            display: "inline-block",
            verticalAlign: "top",
          }}
        />
      </button>
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
          fontSize: "clamp(1.35rem, 2.5vw, 2rem)",
          fontWeight: 900,
          color: theme.charcoal,
          lineHeight: 1.15,
        }}
      >
        {pillar.tagline}
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: "clamp(15px, 1.6vw, 17px)", color: "#475569", lineHeight: 1.65, maxWidth: 520 }}>
        {pillar.body}
      </p>
      {pillar.bullets?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#64748b", lineHeight: 1.75, fontSize: 14 }}>
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
      .marketing-story-root {
        width: 100%;
        overflow-x: hidden;
      }
      .marketing-story-viewport {
        position: sticky;
        top: 0;
        height: 100vh;
        width: 100vw;
        max-width: 100%;
        overflow: hidden;
        display: flex;
        align-items: stretch;
      }
      .marketing-story-slide-panel {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background: #fff;
        display: flex;
        flex-direction: column;
        transition: opacity 0.12s linear, transform 0.12s linear;
        will-change: opacity, transform;
        box-shadow: 0 0 0 1px rgba(15,23,42,0.06);
      }
      .marketing-story-slide-accent {
        height: 4px;
        flex-shrink: 0;
      }
      .marketing-story-slide-grid {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(280px, 0.95fr) minmax(320px, 1.35fr);
        gap: clamp(16px, 3vw, 40px);
        align-items: center;
        padding: clamp(20px, 3vw, 40px) clamp(20px, 4vw, 48px);
        min-height: 0;
        width: 100%;
        box-sizing: border-box;
      }
      .marketing-story-slide-grid-flip .marketing-story-slide-copy {
        order: 2;
      }
      .marketing-story-slide-grid-flip .marketing-story-slide-shot {
        order: 1;
      }
      .marketing-story-slide-copy {
        padding-right: clamp(0px, 2vw, 16px);
      }
      .marketing-story-slide-shot {
        min-height: 0;
        height: 100%;
        display: flex;
        align-items: center;
      }
      .marketing-story-dots {
        position: fixed;
        right: 18px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 45;
        display: flex;
        flex-direction: column;
        gap: 8;
      }
      .marketing-story-admin-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 55;
        display: flex;
        justify-content: center;
        padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
        background: linear-gradient(to top, rgba(248,250,252,0.98) 70%, transparent);
        pointer-events: none;
      }
      .marketing-story-admin-btn {
        pointer-events: auto;
        padding: 8px 16px;
        border: none;
        background: transparent;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: pointer;
      }
      .marketing-story-admin-btn:hover {
        color: ${theme.charcoal};
      }
      @media (max-width: 899px) {
        .marketing-story-slide-grid {
          grid-template-columns: 1fr !important;
          overflow-y: auto;
          align-items: start;
        }
        .marketing-story-slide-grid-flip .marketing-story-slide-copy,
        .marketing-story-slide-grid-flip .marketing-story-slide-shot {
          order: unset;
        }
        .marketing-story-viewport {
          position: relative;
          height: auto;
          min-height: 100vh;
        }
        .marketing-story-track {
          height: auto !important;
        }
        .marketing-story-slide-panel {
          position: relative;
          min-height: 100vh;
          opacity: 1 !important;
          transform: none !important;
          margin-bottom: 24px;
        }
        .marketing-story-dots {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .marketing-story-slide-panel {
          transition: none !important;
          transform: none !important;
          opacity: 1 !important;
        }
      }
    `}</style>
  )
}
