/** Client-side “AI visibility” grading from saved profile URLs (full crawl when partner API connects). */

import type { GrowthModuleDoc, GrowthPresencePages, GrowthProfileGrade, GrowthProfilePlatformId } from "./growthModule"

export type GradedPlatform = {
  id: GrowthProfilePlatformId
  label: string
  url?: string
  grade: GrowthProfileGrade
}

function urlForPlatform(doc: GrowthModuleDoc, id: GrowthProfilePlatformId): string | undefined {
  if (id === "website") return doc.websiteUrl?.trim() || undefined
  if (id === "google") return doc.presencePages?.google?.trim() || doc.gbpProfileUrl?.trim() || undefined
  return doc.presencePages?.[id as keyof GrowthPresencePages]?.trim() || undefined
}

function gradeSingleUrl(platform: GrowthProfilePlatformId, label: string, url: string | undefined): GradedPlatform {
  if (!url) {
    return {
      id: platform,
      label,
      grade: {
        score: 0,
        gradedAt: new Date().toISOString(),
        status: "missing",
        whatAiCanSee: [`No ${label} URL saved — AI and ad platforms cannot reference this channel.`],
        gaps: [`Add your ${label} link in Business profiles.`],
      },
    }
  }

  const whatAiCanSee: string[] = []
  const gaps: string[] = []
  let score = 40

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`)
    whatAiCanSee.push(`Public URL resolves to ${parsed.hostname}.`)
    score += 15
    if (parsed.protocol === "https:") {
      whatAiCanSee.push("HTTPS — link looks trustworthy to crawlers and ad review.")
      score += 10
    } else {
      gaps.push("Use HTTPS so AI summaries and ad platforms trust the link.")
    }
    if (platform === "google" && (parsed.hostname.includes("google") || parsed.hostname.includes("g.page"))) {
      whatAiCanSee.push("Looks like a Google Maps / Business Profile link — good for local AI answers.")
      score += 20
    } else if (platform === "facebook" && parsed.hostname.includes("facebook")) {
      whatAiCanSee.push("Facebook page URL — AI can tie your business name to this page when listed consistently.")
      score += 15
    } else if (platform === "instagram" && parsed.hostname.includes("instagram")) {
      whatAiCanSee.push("Instagram profile — visual brand signals for social campaigns.")
      score += 15
    } else if (platform === "website") {
      whatAiCanSee.push("Primary website — anchor for landing pages and conversion tracking.")
      score += 15
      if (docHasBusinessName(parsed.hostname)) {
        whatAiCanSee.push("Domain appears custom (not a generic builder subdomain).")
        score += 10
      }
    } else {
      whatAiCanSee.push(`${label} URL is saved and reachable by format check.`)
      score += 10
    }
  } catch {
    return {
      id: platform,
      label,
      url,
      grade: {
        score: 10,
        gradedAt: new Date().toISOString(),
        status: "needs_work",
        whatAiCanSee: ["URL could not be parsed — fix the format so partners and AI can use it."],
        gaps: ["Enter a full URL like https://…"],
      },
    }
  }

  score = Math.min(100, score)
  const status = score >= 75 ? "strong" : score >= 45 ? "fair" : "needs_work"

  if (platform === "website" && score < 80) {
    gaps.push("Run a full site audit when your marketing partner connects — speed, mobile, and meta tags affect AI snippets.")
  }
  if (platform === "google" && score < 70) {
    gaps.push("Confirm NAP (name, address, phone) matches your Tradesman account and website.")
  }
  if (whatAiCanSee.length === 0) {
    whatAiCanSee.push("URL saved; deeper crawl pending when partner data collection is enabled.")
  }

  return {
    id: platform,
    label,
    url,
    grade: {
      score,
      gradedAt: new Date().toISOString(),
      status,
      whatAiCanSee,
      gaps,
    },
  }
}

function docHasBusinessName(hostname: string): boolean {
  return !hostname.includes("wixsite") && !hostname.includes("squarespace") && !hostname.includes("wordpress.com")
}

export const GROWTH_PROFILE_PLATFORM_DEFS: { id: GrowthProfilePlatformId; label: string; placeholder: string }[] = [
  { id: "website", label: "Website", placeholder: "https://yourbusiness.com" },
  { id: "google", label: "Google Business Profile", placeholder: "https://maps.google.com/… or g.page link" },
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/your-page" },
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/your-handle" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/…" },
  { id: "yelp", label: "Yelp", placeholder: "https://yelp.com/biz/…" },
  { id: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@your-handle" },
  { id: "x", label: "X (Twitter)", placeholder: "https://x.com/your-handle" },
]

export function gradeGrowthProfiles(doc: GrowthModuleDoc): {
  platforms: GradedPlatform[]
  overall: number
  gradedAt: string
  summary: string
} {
  const platforms = GROWTH_PROFILE_PLATFORM_DEFS.map((def) =>
    gradeSingleUrl(def.id, def.label, urlForPlatform(doc, def.id)),
  )
  const withUrl = platforms.filter((p) => p.url)
  const overall =
    withUrl.length === 0
      ? 0
      : Math.round(withUrl.reduce((sum, p) => sum + p.grade.score, 0) / withUrl.length)

  const missing = platforms.filter((p) => !p.url).length
  const summary =
    withUrl.length === 0
      ? "Add your website and at least one social profile, then grade again."
      : missing > 0
        ? `${withUrl.length} profile${withUrl.length === 1 ? "" : "s"} graded · ${missing} still missing · overall ${overall}/100`
        : `All ${platforms.length} channels graded · overall ${overall}/100`

  return { platforms, overall, gradedAt: new Date().toISOString(), summary }
}

export function gradesToRecord(platforms: GradedPlatform[]): Record<GrowthProfilePlatformId, GrowthProfileGrade> {
  const out = {} as Record<GrowthProfilePlatformId, GrowthProfileGrade>
  for (const p of platforms) out[p.id] = p.grade
  return out
}
