import { useCallback, useEffect, useRef, useState } from "react"
import logo from "../../../assets/logo.png"
import {
  MARKETING_HERO_PRESENTATION,
  MARKETING_HERO_SCREENSHOT,
  MARKETING_PILLARS,
  type MarketingImagePresentation,
  type MarketingPillar,
} from "../../../lib/marketingPillars"
import { MarketingPreviewCtas, MarketingPreviewHeroCopy } from "./MarketingPreviewShared"
import { theme } from "../../../styles/theme"

/** Scroll distance per slide — taller track keeps the viewport pinned longer. */
const SLIDE_SCROLL_VH = 100
/** Preview banner (MarketingPreviewBanner) sits above the story track. */
const PREVIEW_BANNER_PX = 48

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

  const totalSlides = 1 + MARKETING_PILLARS.length

  useEffect(() => {
    const update = () => {
      const track = scrollTrackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const viewportH = window.innerHeight
      const scrollable = track.offsetHeight - viewportH
      if (scrollable <= 0) {
        setProgress(0)
        return
      }
      const scrolled = Math.max(0, PREVIEW_BANNER_PX - rect.top)
      const raw = Math.max(0, Math.min(1, scrolled / scrollable))
      setProgress(raw * Math.max(1, totalSlides - 1))
    }
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    update()
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [totalSlides])

  const activeIndex = Math.round(progress)

  const openLightbox = useCallback((src: string, alt: string) => {
    setLightbox({ src, alt })
  }, [])

  const ctaProps = { onLogin, onTrial, onPricing }

  return (
    <div className="marketing-story-root">
      <div
        ref={scrollTrackRef}
        className="marketing-story-track"
        style={{ height: `${totalSlides * SLIDE_SCROLL_VH}vh`, position: "relative" }}
      >
        <div className="marketing-story-viewport">
          <div className="marketing-story-logo-wrap" aria-hidden={false}>
            <img src={logo} alt="Tradesman" className="marketing-story-logo" />
          </div>

          <aside className="marketing-story-dots" aria-label="Slide progress">
            <span className="marketing-story-dot" title="Overview" style={dotStyle(activeIndex === 0, theme.primary)} />
            {MARKETING_PILLARS.map((p, i) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                title={p.title}
                aria-label={p.title}
                style={dotStyle(activeIndex === i + 1, p.accent)}
              />
            ))}
          </aside>

          <HeroFadeSlide index={0} progress={progress} onImageClick={openLightbox} {...ctaProps} />

          {MARKETING_PILLARS.map((pillar, i) => (
            <HorizontalFadeSlide
              key={pillar.id}
              pillar={pillar}
              index={i + 1}
              pillarNumber={i + 1}
              progress={progress}
              onImageClick={openLightbox}
              {...ctaProps}
            />
          ))}
        </div>
      </div>

      <section style={{ position: "relative", zIndex: 20, background: theme.charcoal, color: "#fff", padding: "72px 24px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 900 }}>See it with your workflow</h2>
          <p style={{ margin: "0 0 24px", color: "#cbd5e1", lineHeight: 1.6 }}>
            Trial mode uses sample customers so you can click through estimates, SMS, and scheduling before you commit.
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <MarketingPreviewCtas primaryLabel="Start trial" onPrimary={onTrial} onTrial={onTrial} onPricing={onPricing} />
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

      {lightbox ? <StoryLightbox lightbox={lightbox} onClose={() => setLightbox(null)} /> : null}

      <StoryScrollStyles />
    </div>
  )
}

function dotStyle(active: boolean, color: string) {
  return {
    width: 10,
    height: active ? 28 : 10,
    borderRadius: 999,
    background: active ? color : "#cbd5e1",
    transition: "height 0.3s, background 0.3s",
    display: "block" as const,
  }
}

function HeroFadeSlide({
  index,
  progress,
  onImageClick,
  onLogin,
  onTrial,
  onPricing,
}: {
  index: number
  progress: number
  onImageClick: (src: string, alt: string) => void
  onLogin?: () => void
  onTrial?: () => void
  onPricing?: () => void
}) {
  const motion = slideMotion(index, progress)

  return (
    <article
      className="marketing-story-slide-panel marketing-story-slide-hero"
      style={{
        opacity: motion.opacity,
        transform: `translateX(${motion.translateX}vw)`,
        zIndex: motion.zIndex,
        pointerEvents: motion.opacity > 0.35 ? "auto" : "none",
      }}
    >
      <div className="marketing-story-slide-accent" style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.primary}88, transparent)` }} />
      <div className="marketing-story-hero-grid">
        <div className="marketing-story-slide-copy">
          <MarketingPreviewHeroCopy hideEyebrow>
            <MarketingPreviewCtas onPrimary={onLogin} onTrial={onTrial} onPricing={onPricing} />
          </MarketingPreviewHeroCopy>
        </div>
        <div className="marketing-story-slide-shot">
          <BrowserFrame
            presentation={MARKETING_HERO_PRESENTATION}
            src={MARKETING_HERO_SCREENSHOT}
            alt="Tradesman dashboard"
            onExpand={() => onImageClick(MARKETING_HERO_SCREENSHOT, "Tradesman dashboard")}
          />
        </div>
      </div>
    </article>
  )
}

function HorizontalFadeSlide({
  pillar,
  index,
  pillarNumber,
  progress,
  onImageClick,
  onLogin,
  onTrial,
  onPricing,
}: {
  pillar: MarketingPillar
  index: number
  pillarNumber: number
  progress: number
  onImageClick: (src: string, alt: string) => void
  onLogin?: () => void
  onTrial?: () => void
  onPricing?: () => void
}) {
  const motion = slideMotion(index, progress)
  const flip = pillarNumber % 2 === 0

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
          <PillarStoryBlock index={pillarNumber} pillar={pillar} />
          <div style={{ marginTop: 20 }}>
            <MarketingPreviewCtas onPrimary={onLogin} onTrial={onTrial} onPricing={onPricing} compact />
          </div>
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
            maxHeight: compact ? "min(52vh, 640px)" : "min(58vh, 720px)",
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

function StoryLightbox({ lightbox, onClose }: { lightbox: { src: string; alt: string }; onClose: () => void }) {
  return (
    <>
      <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.88)", cursor: "zoom-out" }} />
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
          onClick={onClose}
        />
      </div>
    </>
  )
}

function StoryScrollStyles() {
  return (
    <style>{`
      .marketing-story-root {
        width: 100%;
        overflow-x: hidden;
        background: linear-gradient(165deg, #fff 0%, #f8fafc 55%, #eef2f6 100%);
      }
      .marketing-story-viewport {
        position: sticky;
        top: ${PREVIEW_BANNER_PX}px;
        height: calc(100vh - ${PREVIEW_BANNER_PX}px);
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        display: flex;
        align-items: stretch;
      }
      .marketing-story-logo-wrap {
        position: absolute;
        top: clamp(12px, 2vh, 20px);
        right: clamp(20px, 4vw, 48px);
        z-index: 60;
        pointer-events: none;
      }
      .marketing-story-logo {
        height: clamp(72px, 10vw, 104px);
        width: auto;
        object-fit: contain;
        display: block;
        filter: drop-shadow(0 2px 8px rgba(15,23,42,0.08));
      }
      .marketing-story-slide-panel {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        background: #fff;
        display: flex;
        flex-direction: column;
        transition: opacity 0.15s linear, transform 0.15s linear;
        will-change: opacity, transform;
        box-shadow: 0 0 0 1px rgba(15,23,42,0.06);
      }
      .marketing-story-slide-hero {
        background: linear-gradient(165deg, #fff 0%, #f8fafc 70%, #eef2f6 100%);
      }
      .marketing-story-slide-accent {
        height: 4px;
        flex-shrink: 0;
      }
      .marketing-story-hero-grid,
      .marketing-story-slide-grid {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(280px, 0.95fr) minmax(320px, 1.35fr);
        gap: clamp(16px, 3vw, 40px);
        align-items: center;
        padding: clamp(72px, 10vh, 96px) clamp(20px, 4vw, 48px) clamp(20px, 3vw, 40px);
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
        max-width: 560px;
      }
      .marketing-story-slide-shot {
        min-height: 0;
        height: 100%;
        display: flex;
        align-items: center;
      }
      .marketing-story-dots {
        position: absolute;
        right: clamp(12px, 2vw, 18px);
        top: 50%;
        transform: translateY(-50%);
        z-index: 55;
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
        .marketing-story-hero-grid,
        .marketing-story-slide-grid {
          grid-template-columns: 1fr !important;
          align-items: start;
          overflow-y: auto;
          padding-top: clamp(88px, 14vh, 112px);
        }
        .marketing-story-slide-grid-flip .marketing-story-slide-copy,
        .marketing-story-slide-grid-flip .marketing-story-slide-shot {
          order: unset;
        }
        .marketing-story-logo {
          height: clamp(64px, 14vw, 88px);
        }
        .marketing-story-dots {
          top: auto;
          bottom: calc(56px + env(safe-area-inset-bottom, 0px));
          left: 50%;
          right: auto;
          transform: translateX(-50%);
          flex-direction: row;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .marketing-story-slide-panel {
          transition: none !important;
        }
      }
    `}</style>
  )
}
