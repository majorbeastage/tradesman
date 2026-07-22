import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import logo from "../../../assets/logo.png"
import {
  MARKETING_HERO_PRESENTATION,
  MARKETING_HERO_SCREENSHOT,
  MARKETING_PILLARS,
  type MarketingImagePresentation,
  type MarketingPillar,
} from "../../../lib/marketingPillars"
import { supabase } from "../../../lib/supabase"
import {
  ABOUT_US_SETTINGS_KEY,
  DEFAULT_ABOUT_US_CONTENT,
  parseAboutUsContent,
  type AboutUsContent,
  type AboutUsImageBlock,
} from "../../../types/about-us"
import { MarketingPreviewCtas, MarketingPreviewHeroCopy } from "./MarketingPreviewShared"
import { CopyrightVersionFooter } from "../../../components/CopyrightVersionFooter"
import { PublicLegalNav } from "../../public/PublicLegalNav"
import { useIsMobile } from "../../../hooks/useIsMobile"
import { theme } from "../../../styles/theme"

/** Scroll units per hold / transition — ~7 wheel ticks to crossfade, ~10 to hold on each slide. */
const STORY_HOLD_UNITS = 10
const STORY_TRANSITION_UNITS = 7
const LOGO_INTRO_UNITS = 7
const STORY_LAST_UNLOCK_UNITS = 10
const STORY_VH_PER_UNIT = 10
/** Preview banner (MarketingPreviewBanner) sits above the story track; 0 on production homepage. */
const DEFAULT_TOP_INSET_PX = 48
const ABOUT_SLIDE_ACCENT = "#f97316"
const LOGO_SCALE_START = 2.3
const MOBILE_BREAKPOINT = 900

function countStorySlides(isMobile: boolean): number {
  if (!isMobile) return 1 + MARKETING_PILLARS.length + 1
  // logo + hero copy + hero shot + pillars (copy + shot each) + hero copy finale
  return 3 + MARKETING_PILLARS.length * 2 + 1
}

function mobilePillarCopyIndex(pillarIdx: number): number {
  return 3 + pillarIdx * 2
}

function mobilePillarShotIndex(pillarIdx: number): number {
  return 4 + pillarIdx * 2
}

function mobileHeroFinaleIndex(): number {
  return 3 + MARKETING_PILLARS.length * 2
}

type StoryScrollState = {
  progress: number
  scrollUnits: number
  lastUnlock: boolean
  logoT: number
  heroShotReveal: number
  footerReveal: number
}

function storyScrollMetrics(totalSlides: number, isMobile: boolean) {
  const standardSeg = STORY_HOLD_UNITS + STORY_TRANSITION_UNITS
  if (isMobile) {
    const totalUnits =
      LOGO_INTRO_UNITS +
      STORY_TRANSITION_UNITS +
      Math.max(0, totalSlides - 2) * standardSeg +
      STORY_HOLD_UNITS +
      STORY_LAST_UNLOCK_UNITS
    return { standardSeg, totalUnits, isMobile: true as const }
  }
  const firstSeg = LOGO_INTRO_UNITS + STORY_HOLD_UNITS + STORY_TRANSITION_UNITS
  const totalUnits = firstSeg + Math.max(0, totalSlides - 2) * standardSeg + STORY_HOLD_UNITS + STORY_LAST_UNLOCK_UNITS
  return { firstSeg, standardSeg, totalUnits, isMobile: false as const }
}

function computeFooterReveal(units: number, totalSlides: number, isMobile: boolean): number {
  const { standardSeg } = storyScrollMetrics(totalSlides, isMobile)
  const n = totalSlides
  let unlockStart: number
  if (isMobile) {
    let cursor = LOGO_INTRO_UNITS + STORY_TRANSITION_UNITS
    for (let i = 1; i < n - 1; i++) cursor += standardSeg
    unlockStart = cursor + STORY_HOLD_UNITS
  } else {
    const firstSeg = storyScrollMetrics(totalSlides, false).firstSeg!
    let cursor = LOGO_INTRO_UNITS
    for (let i = 0; i < n - 1; i++) {
      cursor += i === 0 ? firstSeg - LOGO_INTRO_UNITS : standardSeg
    }
    unlockStart = cursor + STORY_HOLD_UNITS
  }
  if (units < unlockStart) return 0
  return Math.min(1, (units - unlockStart) / STORY_LAST_UNLOCK_UNITS)
}

function rawToStoryState(raw: number, totalSlides: number, isMobile: boolean): StoryScrollState {
  const metrics = storyScrollMetrics(totalSlides, isMobile)
  const { standardSeg, totalUnits } = metrics
  const units = Math.max(0, Math.min(totalUnits, raw * totalUnits))
  const n = totalSlides
  const footerReveal = computeFooterReveal(units, totalSlides, isMobile)

  if (units < LOGO_INTRO_UNITS) {
    return {
      progress: 0,
      scrollUnits: units,
      lastUnlock: false,
      logoT: units / LOGO_INTRO_UNITS,
      heroShotReveal: 0,
      footerReveal,
    }
  }

  if (isMobile) {
    let cursor = LOGO_INTRO_UNITS
    if (units < cursor + STORY_TRANSITION_UNITS) {
      const t = (units - cursor) / STORY_TRANSITION_UNITS
      return { progress: t, scrollUnits: units, lastUnlock: false, logoT: 1, heroShotReveal: 1, footerReveal }
    }
    cursor += STORY_TRANSITION_UNITS

    for (let i = 1; i < n - 1; i++) {
      const holdEnd = cursor + STORY_HOLD_UNITS
      const segEnd = cursor + standardSeg
      if (units < holdEnd) {
        return { progress: i, scrollUnits: units, lastUnlock: false, logoT: 1, heroShotReveal: 1, footerReveal }
      }
      if (units < segEnd) {
        const t = (units - holdEnd) / STORY_TRANSITION_UNITS
        return { progress: i + t, scrollUnits: units, lastUnlock: false, logoT: 1, heroShotReveal: 1, footerReveal }
      }
      cursor = segEnd
    }

    const lastHoldEnd = cursor + STORY_HOLD_UNITS
    if (units < lastHoldEnd) {
      return { progress: n - 1, scrollUnits: units, lastUnlock: false, logoT: 1, heroShotReveal: 1, footerReveal }
    }
    return { progress: n - 1, scrollUnits: units, lastUnlock: true, logoT: 1, heroShotReveal: 1, footerReveal: 1 }
  }

  const firstSeg = metrics.firstSeg!
  let cursor = LOGO_INTRO_UNITS

  for (let i = 0; i < n - 1; i++) {
    const segLen = i === 0 ? firstSeg - LOGO_INTRO_UNITS : standardSeg
    const holdEnd = cursor + STORY_HOLD_UNITS
    const segEnd = cursor + segLen

    if (units < holdEnd) {
      let reveal = 1
      if (i === 0 && units < LOGO_INTRO_UNITS + 2) {
        reveal = Math.min(1, (units - LOGO_INTRO_UNITS) / 2)
      }
      return { progress: i, scrollUnits: units, lastUnlock: false, logoT: 1, heroShotReveal: reveal, footerReveal }
    }
    if (units < segEnd) {
      const t = (units - holdEnd) / STORY_TRANSITION_UNITS
      return { progress: i + t, scrollUnits: units, lastUnlock: false, logoT: 1, heroShotReveal: 1, footerReveal }
    }
    cursor = segEnd
  }

  const lastHoldEnd = cursor + STORY_HOLD_UNITS
  if (units < lastHoldEnd) {
    return { progress: n - 1, scrollUnits: units, lastUnlock: false, logoT: 1, heroShotReveal: 1, footerReveal }
  }
  return { progress: n - 1, scrollUnits: units, lastUnlock: true, logoT: 1, heroShotReveal: 1, footerReveal: 1 }
}

function logoLayoutStyle(logoT: number, isMobile: boolean): CSSProperties {
  const t = Math.max(0, Math.min(1, logoT))

  if (isMobile) {
    if (t >= 1) {
      return {
        top: "12px",
        right: "12px",
        left: "auto",
        transform: "none",
      }
    }
    const scale = LOGO_SCALE_START - (LOGO_SCALE_START - 1) * t
    const mix = 1 - t
    return {
      top: `calc(${50 * mix}% + ${12 * t}px)`,
      right: `calc(${50 * mix}% + ${12 * t}px)`,
      left: "auto",
      transform: `translate(${50 * mix}%, ${-50 * mix}%) scale(${scale})`,
      transformOrigin: "100% 50%",
    }
  }

  if (t >= 1) {
    return {
      top: "clamp(12px, 2vh, 20px)",
      right: "clamp(20px, 4vw, 48px)",
      left: "auto",
      transform: "none",
    }
  }

  const scale = LOGO_SCALE_START - (LOGO_SCALE_START - 1) * t
  const topPct = 50 * (1 - t)
  const topPx = 18 * t

  return {
    top: `calc(${topPct}% + ${topPx}px)`,
    right: `calc(${14 * (1 - t)}vw + ${48 * t}px)`,
    left: "auto",
    transform: `translateY(-50%) scale(${scale})`,
    transformOrigin: "100% 50%",
  }
}

type Props = {
  topInsetPx?: number
  onLogin?: () => void
  onSignup?: () => void
  onTrial?: () => void
  onPricing?: () => void
  onAdminLogin?: () => void
  onAboutUs?: () => void
}

export function MarketingPreviewStory({
  topInsetPx = DEFAULT_TOP_INSET_PX,
  onLogin,
  onSignup,
  onTrial,
  onPricing,
  onAdminLogin,
  onAboutUs,
}: Props) {
  const isMobile = useIsMobile(MOBILE_BREAKPOINT)
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const lastUnlockRef = useRef(false)
  const [progress, setProgress] = useState(0)
  const [logoT, setLogoT] = useState(0)
  const [heroShotReveal, setHeroShotReveal] = useState(0)
  const [footerReveal, setFooterReveal] = useState(0)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [aboutContent, setAboutContent] = useState<AboutUsContent>({
    ...DEFAULT_ABOUT_US_CONTENT,
    blocks: [...DEFAULT_ABOUT_US_CONTENT.blocks],
  })

  const totalSlides = countStorySlides(isMobile)
  const aboutSlideIndex = isMobile ? mobileHeroFinaleIndex() : totalSlides - 1
  const maxProgress = totalSlides - 1
  const { totalUnits } = storyScrollMetrics(totalSlides, isMobile)
  const trackHeightVh = totalUnits * STORY_VH_PER_UNIT

  useEffect(() => {
    if (!supabase) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", ABOUT_US_SETTINGS_KEY)
          .maybeSingle()
        if (!error && data?.value) setAboutContent(parseAboutUsContent(data.value))
      } catch {
        /* keep defaults */
      }
    })()
  }, [])

  const aboutImages = aboutContent.blocks.filter((b): b is AboutUsImageBlock => b.type === "image" && !!b.url?.trim())

  const applyScrollState = useCallback(() => {
    const track = scrollTrackRef.current
    const viewport = viewportRef.current
    if (!track || !viewport) return

    const viewportH = window.innerHeight
    const trackTop = track.offsetTop
    const trackHeight = track.offsetHeight
    const scrollY = window.scrollY

    const pinStart = Math.max(0, trackTop - topInsetPx)
    const pinEnd = trackTop + trackHeight - viewportH
    const span = Math.max(1, pinEnd - pinStart)
    const raw = scrollY < pinStart ? 0 : Math.max(0, Math.min(1, (scrollY - pinStart) / span))
    const story = rawToStoryState(raw, totalSlides, isMobile)

    viewport.style.position = "fixed"
    viewport.style.top = `${topInsetPx}px`
    viewport.style.left = "0"
    viewport.style.width = "100vw"

    if (scrollY > pinEnd || story.lastUnlock) {
      progressRef.current = maxProgress
      lastUnlockRef.current = true
      setProgress(maxProgress)
      setLogoT(1)
      setHeroShotReveal(1)
      setFooterReveal(1)
      return
    }

    progressRef.current = story.progress
    lastUnlockRef.current = story.lastUnlock
    setProgress(story.progress)
    setLogoT(story.logoT)
    setHeroShotReveal(story.heroShotReveal)
    setFooterReveal(story.footerReveal)
  }, [maxProgress, totalSlides, isMobile, topInsetPx])

  useLayoutEffect(() => {
    applyScrollState()
  }, [applyScrollState])

  useEffect(() => {
    window.addEventListener("scroll", applyScrollState, { passive: true })
    window.addEventListener("resize", applyScrollState)
    return () => {
      window.removeEventListener("scroll", applyScrollState)
      window.removeEventListener("resize", applyScrollState)
    }
  }, [applyScrollState])

  useEffect(() => {
    const track = scrollTrackRef.current
    if (!track) return

    const onWheel = (e: WheelEvent) => {
      const viewportH = window.innerHeight
      const trackTop = track.offsetTop
      const trackHeight = track.offsetHeight
      const scrollY = window.scrollY
      const pinStart = Math.max(0, trackTop - topInsetPx)
      const pinEnd = trackTop + trackHeight - viewportH

      if (scrollY > pinEnd) return

      if (scrollY < pinStart) {
        if (e.deltaY <= 0) return
        e.preventDefault()
        window.scrollBy({ top: e.deltaY, left: 0, behavior: "auto" })
        return
      }

      const span = Math.max(1, pinEnd - pinStart)
      const raw = Math.max(0, Math.min(1, (scrollY - pinStart) / span))
      const story = rawToStoryState(raw, totalSlides, isMobile)
      const atStart = raw <= 0.002 && e.deltaY < 0
      const atEndUnlock = story.lastUnlock && e.deltaY > 0
      if (atStart || atEndUnlock) return

      e.preventDefault()
      window.scrollBy({ top: e.deltaY, left: 0, behavior: "auto" })
    }

    window.addEventListener("wheel", onWheel, { passive: false })
    return () => window.removeEventListener("wheel", onWheel)
  }, [totalSlides, isMobile])

  const activeIndex = Math.round(progress)

  const openLightbox = useCallback((src: string, alt: string) => {
    setLightbox({ src, alt })
  }, [])

  const ctaProps = { onLogin, onSignup, onTrial, onPricing }

  const logoStyle = logoLayoutStyle(logoT, isMobile)
  const mobileDotColors = isMobile
    ? [
        theme.primary,
        theme.primary,
        theme.primary,
        ...MARKETING_PILLARS.flatMap((p) => [p.accent, p.accent]),
        theme.primary,
      ]
    : []

  return (
    <div className={`marketing-story-root ${isMobile ? "marketing-story-root-mobile" : ""}`}>
      <div
        ref={scrollTrackRef}
        className="marketing-story-track"
        style={{ height: `${trackHeightVh}vh`, position: "relative", width: "100%" }}
      >
        <div ref={viewportRef} className="marketing-story-viewport">
          {!isMobile ? (
            <div
              className="marketing-story-intro-right marketing-story-intro-right-desktop"
              style={{
                opacity: logoT < 1 ? 1 : 0,
                visibility: logoT < 1 ? "visible" : "hidden",
              }}
              aria-hidden
            />
          ) : null}

          {isMobile ? (
            <div className="marketing-story-mobile-cta-bar">
              <MarketingPreviewCtas onPrimary={onLogin} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} compact />
            </div>
          ) : null}

          <div
            className={`marketing-story-logo-wrap marketing-story-logo-wrap-visible ${isMobile ? "marketing-story-logo-wrap-mobile" : ""}`}
            style={logoStyle}
            aria-hidden={false}
          >
            <img src={logo} alt="Tradesman" className="marketing-story-logo" />
          </div>

          <aside className="marketing-story-dots" aria-label="Slide progress">
            {isMobile ? (
              mobileDotColors.map((color, i) => (
                <span key={`m-dot-${i}`} title={`Slide ${i + 1}`} style={dotStyle(activeIndex === i, color, true)} />
              ))
            ) : (
              <>
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
                <span
                  className="marketing-story-dot"
                  title="About Us"
                  style={dotStyle(activeIndex === aboutSlideIndex, ABOUT_SLIDE_ACCENT)}
                />
              </>
            )}
          </aside>

          {isMobile ? (
            <>
              <MobileLogoIntroSlide index={0} progress={progress} totalSlides={totalSlides} />
              <MobileHeroCopySlide index={1} progress={progress} totalSlides={totalSlides} />
              <MobileHeroShotSlide
                index={2}
                progress={progress}
                totalSlides={totalSlides}
                onImageClick={openLightbox}
              />
              {MARKETING_PILLARS.map((pillar, i) => (
                <MobilePillarCopySlide
                  key={`${pillar.id}-copy`}
                  pillar={pillar}
                  index={mobilePillarCopyIndex(i)}
                  progress={progress}
                  totalSlides={totalSlides}
                />
              ))}
              {MARKETING_PILLARS.map((pillar, i) => (
                <MobilePillarShotSlide
                  key={`${pillar.id}-shot`}
                  pillar={pillar}
                  index={mobilePillarShotIndex(i)}
                  progress={progress}
                  totalSlides={totalSlides}
                  onImageClick={openLightbox}
                />
              ))}
              <MobileHeroCopySlide
                index={mobileHeroFinaleIndex()}
                progress={progress}
                totalSlides={totalSlides}
              />
            </>
          ) : (
            <>
              <HeroFadeSlide
                index={0}
                progress={progress}
                totalSlides={totalSlides}
                heroShotReveal={heroShotReveal}
                onImageClick={openLightbox}
                {...ctaProps}
              />

              {MARKETING_PILLARS.map((pillar, i) => (
                <HorizontalFadeSlide
                  key={pillar.id}
                  pillar={pillar}
                  index={i + 1}
                  pillarNumber={i + 1}
                  progress={progress}
                  totalSlides={totalSlides}
                  onImageClick={openLightbox}
                  {...ctaProps}
                />
              ))}

              <AboutUsStorySlide
                index={aboutSlideIndex}
                progress={progress}
                totalSlides={totalSlides}
                content={aboutContent}
                images={aboutImages}
                onAboutUs={onAboutUs}
                {...ctaProps}
              />
            </>
          )}

          <MarketingStoryDockFooter reveal={footerReveal} onAdminLogin={onAdminLogin} isMobile={isMobile} />
        </div>
      </div>

      <div className="marketing-story-footer-runway" aria-hidden />

      {!isMobile ? (
      <section style={{ position: "relative", zIndex: 5, background: theme.charcoal, color: "#fff", padding: "72px 24px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 900 }}>See it with your workflow</h2>
          <p style={{ margin: "0 0 24px", color: "#cbd5e1", lineHeight: 1.6 }}>
            Trial mode uses sample customers so you can click through estimates, SMS, and scheduling before you commit.
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <MarketingPreviewCtas primaryLabel="Start trial" onPrimary={onTrial} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} />
          </div>
        </div>
      </section>
      ) : null}

      {lightbox ? <StoryLightbox lightbox={lightbox} onClose={() => setLightbox(null)} /> : null}

      <StoryScrollStyles topInsetPx={topInsetPx} />
    </div>
  )
}

function dotStyle(active: boolean, color: string, compact?: boolean) {
  return {
    width: compact ? 7 : 10,
    height: active ? (compact ? 18 : 28) : compact ? 7 : 10,
    borderRadius: 999,
    background: active ? color : "#cbd5e1",
    transition: "height 0.3s, background 0.3s",
    display: "block" as const,
    flexShrink: 0,
  }
}

function MobileStorySlideShell({
  index,
  progress,
  totalSlides,
  accent,
  className,
  children,
}: {
  index: number
  progress: number
  totalSlides: number
  accent: string
  className?: string
  children: ReactNode
}) {
  const motion = slideMotion(index, progress, totalSlides)
  return (
    <article
      className={`marketing-story-slide-panel marketing-story-mobile-slide ${className ?? ""}`}
      style={{
        opacity: motion.opacity,
        transform: `translateX(${motion.translateX}vw)`,
        zIndex: motion.zIndex,
        pointerEvents: motion.opacity > 0.35 ? "auto" : "none",
      }}
    >
      <div
        className="marketing-story-slide-accent"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88, transparent)` }}
      />
      <div className="marketing-story-mobile-body">{children}</div>
    </article>
  )
}

function MobileLogoIntroSlide({
  index,
  progress,
  totalSlides,
}: {
  index: number
  progress: number
  totalSlides: number
}) {
  return (
    <MobileStorySlideShell
      index={index}
      progress={progress}
      totalSlides={totalSlides}
      accent={theme.primary}
      className="marketing-story-mobile-logo-slide"
    >
      <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", textAlign: "center" }}>Scroll to explore</p>
    </MobileStorySlideShell>
  )
}

function MobileHeroCopySlide({
  index,
  progress,
  totalSlides,
}: {
  index: number
  progress: number
  totalSlides: number
}) {
  return (
    <MobileStorySlideShell index={index} progress={progress} totalSlides={totalSlides} accent={theme.primary}>
      <MarketingPreviewHeroCopy hideEyebrow />
    </MobileStorySlideShell>
  )
}

function MobileHeroShotSlide({
  index,
  progress,
  totalSlides,
  onImageClick,
}: {
  index: number
  progress: number
  totalSlides: number
  onImageClick: (src: string, alt: string) => void
}) {
  return (
    <MobileStorySlideShell index={index} progress={progress} totalSlides={totalSlides} accent={theme.primary}>
      <BrowserFrame
        presentation={MARKETING_HERO_PRESENTATION}
        src={MARKETING_HERO_SCREENSHOT}
        alt="Tradesman dashboard"
        compact
        onExpand={() => onImageClick(MARKETING_HERO_SCREENSHOT, "Tradesman dashboard")}
      />
    </MobileStorySlideShell>
  )
}

function MobilePillarCopySlide({
  pillar,
  index,
  progress,
  totalSlides,
}: {
  pillar: MarketingPillar
  index: number
  progress: number
  totalSlides: number
}) {
  return (
    <MobileStorySlideShell index={index} progress={progress} totalSlides={totalSlides} accent={pillar.accent}>
      <PillarStoryBlock pillar={pillar} />
    </MobileStorySlideShell>
  )
}

function MobilePillarShotSlide({
  pillar,
  index,
  progress,
  totalSlides,
  onImageClick,
}: {
  pillar: MarketingPillar
  index: number
  progress: number
  totalSlides: number
  onImageClick: (src: string, alt: string) => void
}) {
  return (
    <MobileStorySlideShell index={index} progress={progress} totalSlides={totalSlides} accent={pillar.accent}>
      <BrowserFrame
        presentation={pillar.imagePresentation}
        src={pillar.image}
        alt={pillar.title}
        compact
        onExpand={() => onImageClick(pillar.image, pillar.title)}
      />
    </MobileStorySlideShell>
  )
}

function HeroFadeSlide({
  index,
  progress,
  totalSlides,
  heroShotReveal,
  onImageClick,
  onLogin,
  onSignup,
  onTrial,
  onPricing,
}: {
  index: number
  progress: number
  totalSlides: number
  heroShotReveal: number
  onImageClick: (src: string, alt: string) => void
  onLogin?: () => void
  onSignup?: () => void
  onTrial?: () => void
  onPricing?: () => void
}) {
  const motion = slideMotion(index, progress, totalSlides)
  const shotReveal = Math.max(0, Math.min(1, heroShotReveal))

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
        <div className="marketing-story-slide-copy marketing-story-hero-copy">
          <MarketingPreviewHeroCopy hideEyebrow>
            <MarketingPreviewCtas onPrimary={onLogin} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} />
          </MarketingPreviewHeroCopy>
        </div>
        <div
          className="marketing-story-slide-shot marketing-story-hero-shot"
          style={{ opacity: shotReveal, pointerEvents: shotReveal > 0.35 ? "auto" : "none" }}
        >
          {shotReveal > 0.02 ? (
            <BrowserFrame
              presentation={MARKETING_HERO_PRESENTATION}
              src={MARKETING_HERO_SCREENSHOT}
              alt="Tradesman dashboard"
              onExpand={() => onImageClick(MARKETING_HERO_SCREENSHOT, "Tradesman dashboard")}
            />
          ) : (
            <div className="marketing-story-hero-shot-placeholder" aria-hidden />
          )}
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
  totalSlides,
  onImageClick,
  onLogin,
  onSignup,
  onTrial,
  onPricing,
}: {
  pillar: MarketingPillar
  index: number
  pillarNumber: number
  progress: number
  totalSlides: number
  onImageClick: (src: string, alt: string) => void
  onLogin?: () => void
  onSignup?: () => void
  onTrial?: () => void
  onPricing?: () => void
}) {
  const motion = slideMotion(index, progress, totalSlides)
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
          <PillarStoryBlock pillar={pillar} />
          <div style={{ marginTop: 20 }}>
            <MarketingPreviewCtas onPrimary={onLogin} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} compact />
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

function AboutUsStorySlide({
  index,
  progress,
  totalSlides,
  content,
  images,
  onAboutUs,
  onLogin,
  onSignup,
  onTrial,
  onPricing,
}: {
  index: number
  progress: number
  totalSlides: number
  content: AboutUsContent
  images: AboutUsImageBlock[]
  onAboutUs?: () => void
  onLogin?: () => void
  onSignup?: () => void
  onTrial?: () => void
  onPricing?: () => void
}) {
  const motion = slideMotion(index, progress, totalSlides)
  const introText = content.blocks.find((b) => b.type === "text")?.body ?? content.subtitle

  const goAbout = () => {
    if (onAboutUs) onAboutUs()
    else window.location.href = "/about"
  }

  return (
    <article
      id="about-us"
      className="marketing-story-slide-panel marketing-story-slide-about"
      style={{
        opacity: motion.opacity,
        transform: `translateX(${motion.translateX}vw)`,
        zIndex: motion.zIndex,
        pointerEvents: motion.opacity > 0.35 ? "auto" : "none",
      }}
    >
      <div
        className="marketing-story-slide-accent"
        style={{ background: `linear-gradient(90deg, ${ABOUT_SLIDE_ACCENT}, ${ABOUT_SLIDE_ACCENT}88, transparent)` }}
      />
      <div className="marketing-story-slide-grid marketing-story-slide-grid-flip">
        <div className="marketing-story-slide-copy">
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: ABOUT_SLIDE_ACCENT, letterSpacing: "0.08em" }}>
            ABOUT US
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
            {content.title}
          </h3>
          <p style={{ margin: "0 0 14px", fontSize: "clamp(15px, 1.6vw, 17px)", color: "#475569", lineHeight: 1.65, maxWidth: 520 }}>
            {content.subtitle}
          </p>
          <p style={{ margin: "0 0 18px", fontSize: 15, color: "#64748b", lineHeight: 1.7, maxWidth: 520, whiteSpace: "pre-wrap" }}>
            {introText}
          </p>
          <button
            type="button"
            onClick={goAbout}
            style={{
              marginBottom: 16,
              padding: "10px 18px",
              borderRadius: 10,
              border: `2px solid ${ABOUT_SLIDE_ACCENT}`,
              background: "transparent",
              color: ABOUT_SLIDE_ACCENT,
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Read our full story →
          </button>
          <MarketingPreviewCtas onPrimary={onLogin} onSignup={onSignup} onTrial={onTrial} onPricing={onPricing} compact />
          <div style={{ marginTop: 18, display: "grid", gap: 10, maxWidth: 420 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em" }}>GET THE APPS</p>
            <a
              href="https://play.google.com/store/apps/details?id=com.tradesmanus.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 16px",
                borderRadius: 10,
                border: `1px solid ${theme.border}`,
                background: theme.charcoal,
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Tradesman on Google Play
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.tradesmanus.messaging"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 16px",
                borderRadius: 10,
                border: `2px solid ${ABOUT_SLIDE_ACCENT}`,
                background: "transparent",
                color: ABOUT_SLIDE_ACCENT,
                fontWeight: 800,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Tradesman Messaging on Google Play
            </a>
          </div>
        </div>
        <div className="marketing-story-slide-shot marketing-story-about-photos">
          {images.length > 0 ? (
            <div className="marketing-story-about-photo-grid">
              {images.slice(0, 3).map((img) => (
                <figure key={img.id} style={{ margin: 0 }}>
                  <div className="marketing-story-about-photo-frame">
                    <img src={img.url} alt={img.alt?.trim() || "Tradesman team"} />
                  </div>
                  {img.alt?.trim() ? (
                    <figcaption style={{ marginTop: 8, fontSize: 12, color: "#64748b", fontStyle: "italic" }}>{img.alt.trim()}</figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          ) : (
            <div className="marketing-story-about-photo-placeholder">
              <img src={logo} alt="" style={{ width: 80, opacity: 0.35, marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: 14, color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
                Veteran-founded. Built for contractors who want to focus on the work—not the paperwork.
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function slideMotion(index: number, progress: number, totalSlides: number): { opacity: number; translateX: number; zIndex: number } {
  const lastIndex = totalSlides - 1
  const offset = index - progress

  if (index === lastIndex && progress >= lastIndex - 0.001 && offset > 0) {
    return { opacity: 1, translateX: 0, zIndex: 50 + index }
  }

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

function PillarStoryBlock({ pillar }: { pillar: MarketingPillar }) {
  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: pillar.accent, letterSpacing: "0.08em" }}>
        {pillar.title.toUpperCase()}
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

function MarketingStoryDockFooter({
  reveal,
  onAdminLogin,
  isMobile,
}: {
  reveal: number
  onAdminLogin?: () => void
  isMobile?: boolean
}) {
  const r = Math.max(0, Math.min(1, reveal))
  if (r <= 0.001) return null

  return (
    <div
      className="marketing-story-dock-footer"
      style={{
        opacity: r,
        transform: `translateY(${(1 - r) * 100}%)`,
      }}
    >
      <div className={`marketing-story-dock-footer-inner ${isMobile ? "marketing-story-dock-footer-inner-mobile" : ""}`}>
        <div className="marketing-story-follow-us">
          <span className="marketing-story-follow-us-label">Follow us</span>
          <a
            href="https://www.facebook.com/profile.php?id=61575488133241"
            target="_blank"
            rel="noopener noreferrer"
            className="marketing-story-follow-link"
          >
            Facebook
          </a>
          <span className="marketing-story-follow-sep" aria-hidden>
            ·
          </span>
          <a
            href="https://www.instagram.com/tradesmansystems/"
            target="_blank"
            rel="noopener noreferrer"
            className="marketing-story-follow-link"
          >
            Instagram
          </a>
        </div>
        {onAdminLogin ? (
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <button type="button" onClick={onAdminLogin} className="marketing-story-admin-btn">
              Admin portal login
            </button>
          </div>
        ) : null}
        <PublicLegalNav borderTop={false} />
        <CopyrightVersionFooter
          variant="default"
          style={{ borderTop: `1px solid ${theme.border}`, marginTop: 12, paddingTop: 12 }}
        />
      </div>
    </div>
  )
}

function StoryScrollStyles({ topInsetPx }: { topInsetPx: number }) {
  return (
    <style>{`
      .marketing-story-root {
        width: 100%;
        overflow-x: clip;
        background: linear-gradient(165deg, #fff 0%, #f8fafc 55%, #eef2f6 100%);
      }
      .marketing-story-track {
        width: 100%;
      }
      .marketing-story-viewport {
        position: fixed;
        top: ${topInsetPx}px;
        left: 0;
        height: calc(100vh - ${topInsetPx}px);
        width: 100vw;
        max-width: 100vw;
        overflow: hidden;
        display: flex;
        align-items: stretch;
        z-index: 15;
        background: linear-gradient(165deg, #fff 0%, #f8fafc 70%, #eef2f6 100%);
      }
      .marketing-story-intro-right {
        position: absolute;
        top: 0;
        right: 0;
        width: 58%;
        height: 100%;
        z-index: 25;
        opacity: 1;
        visibility: visible;
        background: linear-gradient(165deg, #fff 0%, #f8fafc 65%, #eef2f6 100%);
        transition: opacity 0.18s linear, visibility 0.18s linear;
        pointer-events: none;
      }
      .marketing-story-hero-shot-placeholder {
        width: 100%;
        height: 100%;
        min-height: 280px;
        background: linear-gradient(165deg, #fff 0%, #f8fafc 70%, #eef2f6 100%);
        border-radius: 18px;
      }
      .marketing-story-dock-footer {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 95;
        padding: 8px 20px calc(12px + env(safe-area-inset-bottom, 0px));
        background: linear-gradient(to top, rgba(248,250,252,0.98) 78%, rgba(248,250,252,0.92) 92%, transparent);
        pointer-events: none;
        transition: opacity 0.12s linear, transform 0.12s linear;
        will-change: transform, opacity;
      }
      .marketing-story-dock-footer-inner {
        max-width: 1100px;
        margin: 0 auto;
        pointer-events: auto;
        position: relative;
      }
      .marketing-story-follow-us {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 8px;
        margin-bottom: 10px;
        font-size: 12px;
        color: #475569;
      }
      .marketing-story-follow-us-label {
        font-weight: 800;
        color: #0f172a;
        margin-right: 4px;
      }
      .marketing-story-follow-link {
        color: #0f766e;
        font-weight: 700;
        text-decoration: none;
      }
      .marketing-story-follow-link:hover {
        text-decoration: underline;
      }
      .marketing-story-follow-sep {
        color: #94a3b8;
      }
      .marketing-story-footer-runway {
        height: min(90vh, 760px);
        pointer-events: none;
      }
      .marketing-story-hero-shot {
        transition: opacity 0.22s linear;
      }
      .marketing-story-hero-copy {
        position: relative;
        z-index: 2;
      }
      .marketing-story-logo-wrap {
        position: absolute;
        z-index: 80;
        pointer-events: none;
        transition: top 0.1s linear, right 0.1s linear, transform 0.1s linear;
      }
      .marketing-story-logo-wrap-visible {
        opacity: 1;
        visibility: visible;
        top: 50%;
        right: 14vw;
        left: auto;
        transform: translateY(-50%) scale(${LOGO_SCALE_START});
        transform-origin: 100% 50%;
      }
      .marketing-story-logo {
        height: clamp(72px, 10vw, 104px);
        width: auto;
        object-fit: contain;
        display: block;
        filter: drop-shadow(0 2px 12px rgba(15,23,42,0.06));
        transition: height 0.1s linear;
      }
      .marketing-story-slide-panel {
        position: absolute;
        inset: 0;
        width: 100vw;
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
        grid-template-columns: minmax(280px, 1fr) minmax(360px, 1.4fr);
        gap: clamp(20px, 4vw, 56px);
        align-items: center;
        padding: clamp(72px, 10vh, 96px) clamp(24px, 5vw, 72px) clamp(48px, 6vh, 72px);
        min-height: 0;
        width: 100%;
        max-width: none;
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
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 70;
        display: flex;
        justify-content: center;
        padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
        background: linear-gradient(to top, rgba(248,250,252,0.98) 70%, transparent);
        pointer-events: none;
      }
      .marketing-story-page-admin {
        display: flex;
        justify-content: center;
        padding: 24px 16px calc(32px + env(safe-area-inset-bottom, 0px));
        background: #fafafa;
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
      .marketing-story-slide-about {
        background: linear-gradient(165deg, #fff 0%, #fff7ed 55%, #f8fafc 100%);
      }
      .marketing-story-about-photos {
        align-items: stretch !important;
      }
      .marketing-story-about-photo-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
      }
      .marketing-story-about-photo-frame {
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(15,23,42,0.1);
        box-shadow: 0 12px 32px rgba(15,23,42,0.1);
        background: #f1f5f9;
        max-width: 220px;
      }
      .marketing-story-about-photo-frame img {
        width: 100%;
        height: auto;
        display: block;
        object-fit: cover;
      }
      .marketing-story-about-photo-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 280px;
        padding: 32px;
        border-radius: 18px;
        border: 1px dashed rgba(15,23,42,0.12);
        background: rgba(248,250,252,0.8);
      }
      @media (max-width: 899px) {
        .marketing-story-root-mobile .marketing-story-viewport {
          background: linear-gradient(165deg, #fff 0%, #f8fafc 70%, #eef2f6 100%);
        }
        .marketing-story-mobile-cta-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 85;
          display: flex;
          justify-content: center;
          padding: calc(8px + env(safe-area-inset-top, 0px)) clamp(12px, 4vw, 72px) 10px clamp(12px, 4vw, 24px);
          background: linear-gradient(to bottom, rgba(248,250,252,0.98) 72%, rgba(248,250,252,0.85) 88%, transparent);
          pointer-events: none;
        }
        .marketing-story-mobile-cta-bar > div {
          pointer-events: auto;
        }
        .marketing-story-mobile-slide {
          background: linear-gradient(165deg, #fff 0%, #f8fafc 70%, #eef2f6 100%);
        }
        .marketing-story-mobile-logo-slide .marketing-story-mobile-body {
          justify-content: flex-end;
          padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
        }
        .marketing-story-mobile-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: stretch;
          padding: calc(56px + env(safe-area-inset-top, 0px)) clamp(16px, 5vw, 24px) clamp(80px, 14vh, 108px);
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .marketing-story-mobile-body .marketing-story-slide-shot {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .marketing-story-dock-footer-inner-mobile {
          font-size: 13px;
        }
        .marketing-story-dock-footer-inner-mobile .marketing-story-admin-btn {
          font-size: 11px;
        }
        .marketing-story-about-photo-grid-mobile {
          flex-direction: column;
          gap: 12px;
        }
        .marketing-story-about-photo-grid-mobile .marketing-story-about-photo-frame {
          max-width: min(100%, 280px);
          margin: 0 auto;
        }
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
        .marketing-story-root-mobile .marketing-story-logo-wrap {
          z-index: 90;
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
