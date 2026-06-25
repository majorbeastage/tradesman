import type { CSSProperties, ReactNode } from "react"
import logo from "../../../assets/logo.png"
import { CopyrightVersionFooter } from "../../../components/CopyrightVersionFooter"
import { PublicLegalNav } from "../../public/PublicLegalNav"
import { MARKETING_HERO } from "../../../lib/marketingPillars"
import { theme } from "../../../styles/theme"
import type { MarketingPreviewVariant } from "../../../lib/marketingPillars"
import { MARKETING_PREVIEW_VARIANTS } from "../../../lib/marketingPillars"

type NavProps = {
  variant: MarketingPreviewVariant
  onVariantChange: (v: MarketingPreviewVariant) => void
}

export function MarketingPreviewBanner({ variant, onVariantChange }: NavProps) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#0f172a",
        color: "#e2e8f0",
        padding: "10px 16px",
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #334155",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        Local marketing preview · not live on homepage yet
        <a href="/" style={{ marginLeft: 12, color: "#fdba74", fontWeight: 600 }}>
          ← Current home
        </a>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {MARKETING_PREVIEW_VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onVariantChange(v.id)}
            title={v.blurb}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              background: variant === v.id ? theme.primary : "#334155",
              color: "#fff",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type CtaProps = {
  primaryLabel?: string
  onPrimary?: () => void
  onTrial?: () => void
  onPricing?: () => void
  compact?: boolean
}

export function MarketingPreviewCtas({
  primaryLabel = "Login",
  onPrimary,
  onTrial,
  onPricing,
  compact,
}: CtaProps) {
  const btn: CSSProperties = compact
    ? { padding: "10px 16px", fontSize: 13, borderRadius: 10, fontWeight: 700, cursor: "pointer", border: "none" }
    : { padding: "14px 22px", fontSize: 15, borderRadius: 12, fontWeight: 700, cursor: "pointer", border: "none" }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <button type="button" onClick={onPrimary} style={{ ...btn, background: theme.primary, color: "#fff" }}>
        {primaryLabel}
      </button>
      {onTrial ? (
        <button
          type="button"
          onClick={onTrial}
          style={{ ...btn, background: "#fff", color: theme.charcoal, border: `2px solid ${theme.border}` }}
        >
          Free trial
        </button>
      ) : null}
      {onPricing ? (
        <button type="button" onClick={onPricing} style={{ ...btn, background: "transparent", color: theme.primary, border: `2px solid ${theme.primary}` }}>
          Pricing
        </button>
      ) : null}
    </div>
  )
}

export function MarketingPreviewHeroCopy({ children }: { children?: ReactNode }) {
  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, color: theme.primary, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Tradesman
      </p>
      <h1
        style={{
          margin: "0 0 14px",
          fontSize: "clamp(2rem, 5vw, 3rem)",
          fontWeight: 900,
          letterSpacing: -1.2,
          lineHeight: 1.08,
          color: theme.charcoal,
        }}
      >
        {MARKETING_HERO.headline}
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: "clamp(1rem, 2.2vw, 1.15rem)", lineHeight: 1.6, color: "#475569", maxWidth: 520 }}>
        {MARKETING_HERO.subhead}
      </p>
      {children}
      <p style={{ margin: "16px 0 0", fontSize: 12, color: "#94a3b8", maxWidth: 480 }}>{MARKETING_HERO.trialNote}</p>
    </>
  )
}

export function MarketingPreviewShell({ banner, children }: { banner: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#fafafa" }}>
      {banner}
      {children}
      <footer style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 40px" }}>
        <PublicLegalNav />
        <CopyrightVersionFooter variant="default" style={{ borderTop: `1px solid ${theme.border}`, marginTop: 12, paddingTop: 12 }} />
      </footer>
    </div>
  )
}

export function MarketingPreviewTopNav({ onLogin }: { onLogin?: () => void }) {
  return (
    <header
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "20px 20px 0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <img src={logo} alt="Tradesman" style={{ height: 44, width: "auto", objectFit: "contain" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href="/pricing" style={ghostLinkStyle}>
          Pricing
        </a>
        <button type="button" onClick={onLogin} style={{ ...ghostLinkStyle, background: theme.primary, color: "#fff", border: "none", cursor: "pointer" }}>
          Login
        </button>
      </div>
    </header>
  )
}

export function ProductShot({ src, alt, tall }: { src: string; alt: string; tall?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(15,23,42,0.08)",
        boxShadow: "0 24px 60px rgba(15,23,42,0.12), 0 0 0 1px rgba(255,255,255,0.6) inset",
        background: "#fff",
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{ display: "block", width: "100%", height: tall ? "auto" : "auto", maxHeight: tall ? 640 : 420, objectFit: "cover", objectPosition: "top" }}
      />
    </div>
  )
}

const ghostLinkStyle: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 14,
  color: theme.charcoal,
  textDecoration: "none",
  border: `1px solid ${theme.border}`,
  background: "#fff",
}
