import type { CSSProperties } from "react"

/**
 * Brand-tinted initial tiles for the marketing channels we manage.
 *
 * These are deliberately Tradesman-drawn letter tiles rather than the platforms'
 * actual logo artwork. Brand colors and initials are not the protected marks, so
 * this stays clear of the logo-usage terms each platform publishes while still
 * reading at a glance.
 */

export type PlatformBadgeId =
  | "website"
  | "google"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "yelp"
  | "tiktok"
  | "x"
  | "youtube"

type BadgeSpec = { glyph: string; background: string; color: string; fontScale?: number }

const BADGES: Record<PlatformBadgeId, BadgeSpec> = {
  website: { glyph: "WWW", background: "#0f172a", color: "#ffffff", fontScale: 0.3 },
  google: { glyph: "G", background: "#4285f4", color: "#ffffff" },
  facebook: { glyph: "f", background: "#1877f2", color: "#ffffff" },
  instagram: {
    glyph: "IG",
    background: "linear-gradient(135deg, #f9ce34 0%, #ee2a7b 50%, #6228d7 100%)",
    color: "#ffffff",
    fontScale: 0.4,
  },
  linkedin: { glyph: "in", background: "#0a66c2", color: "#ffffff", fontScale: 0.42 },
  yelp: { glyph: "Y", background: "#d32323", color: "#ffffff" },
  tiktok: { glyph: "TT", background: "#111111", color: "#ffffff", fontScale: 0.4 },
  x: { glyph: "X", background: "#000000", color: "#ffffff" },
  youtube: { glyph: "▶", background: "#ff0000", color: "#ffffff", fontScale: 0.5 },
}

export function isPlatformBadgeId(value: string): value is PlatformBadgeId {
  return value in BADGES
}

export default function PlatformBadge({
  id,
  size = 22,
  style,
}: {
  id: PlatformBadgeId
  size?: number
  style?: CSSProperties
}) {
  const spec = BADGES[id]
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        background: spec.background,
        color: spec.color,
        fontSize: Math.round(size * (spec.fontScale ?? 0.55)),
        fontWeight: 800,
        letterSpacing: spec.glyph.length > 1 ? "-0.02em" : undefined,
        lineHeight: 1,
        ...style,
      }}
    >
      {spec.glyph}
    </span>
  )
}
