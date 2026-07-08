import { normalizePlatformEmailSlug } from "./platformEmailSlug"

export const BUSINESS_PUBLIC_PROFILE_META_KEY = "business_public_profile_v1"
export const BUSINESS_WEB_PROFILE_TAGLINE_MAX = 120
export const BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX = 5

export type BusinessPublicEmailSource = "tradesman" | "custom"

export type BusinessPublicProfileSettings = {
  v: 1
  enabled: boolean
  /** Short tagline (e.g. for Google Business / social bios). */
  tagline: string
  aboutUs: string
  showPhone: boolean
  showEmail: boolean
  /** Tradesman @tradesman-us.com (A) or verified custom domain address (B). */
  emailSource: BusinessPublicEmailSource
  showAddress: boolean
  showServiceArea: boolean
  showBusinessHours: boolean
  /** Corporate profile image for the public page header. */
  profilePhotoUrl: string | null
  workPhotoUrls: string[]
  /** Saved public URL slug when published. */
  publishedSlug: string
}

export function emptyBusinessPublicProfileSettings(): BusinessPublicProfileSettings {
  return {
    v: 1,
    enabled: false,
    tagline: "",
    aboutUs: "",
    showPhone: true,
    showEmail: true,
    emailSource: "tradesman",
    showAddress: true,
    showServiceArea: false,
    showBusinessHours: true,
    profilePhotoUrl: null,
    workPhotoUrls: [],
    publishedSlug: "",
  }
}

/** URL slug from business name — not user-editable. */
export function businessWebProfileSlugFromName(displayName: string): string {
  return normalizePlatformEmailSlug(displayName)
}

export function businessWebProfilePublicUrl(slug: string, origin = "https://www.tradesman-us.com"): string {
  const safe = businessWebProfileSlugFromName(slug)
  return `${origin.replace(/\/+$/, "")}/${safe}`
}

export function parseBusinessPublicProfileSettings(metadata: unknown): BusinessPublicProfileSettings {
  const base = emptyBusinessPublicProfileSettings()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>)[BUSINESS_PUBLIC_PROFILE_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return base
  const workPhotoUrls = Array.isArray(o.workPhotoUrls)
    ? o.workPhotoUrls.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX)
    : []
  return {
    v: 1,
    enabled: o.enabled === true,
    tagline: typeof o.tagline === "string" ? o.tagline.slice(0, BUSINESS_WEB_PROFILE_TAGLINE_MAX) : "",
    aboutUs: typeof o.aboutUs === "string" ? o.aboutUs.slice(0, 4000) : "",
    showPhone: o.showPhone !== false,
    showEmail: o.showEmail !== false,
    emailSource: o.emailSource === "custom" ? "custom" : "tradesman",
    showAddress: o.showAddress !== false,
    showServiceArea: o.showServiceArea === true,
    showBusinessHours: o.showBusinessHours !== false,
    profilePhotoUrl: typeof o.profilePhotoUrl === "string" && o.profilePhotoUrl.trim() ? o.profilePhotoUrl.trim() : null,
    workPhotoUrls,
    publishedSlug: typeof o.publishedSlug === "string" ? normalizePlatformEmailSlug(o.publishedSlug) : "",
  }
}

export function mergeBusinessPublicProfileMetadata(
  prevMeta: Record<string, unknown>,
  settings: BusinessPublicProfileSettings,
  publishedSlug?: string,
): Record<string, unknown> {
  const slug = publishedSlug ? normalizePlatformEmailSlug(publishedSlug) : settings.publishedSlug
  return {
    ...prevMeta,
    [BUSINESS_PUBLIC_PROFILE_META_KEY]: {
      ...settings,
      v: 1,
      tagline: settings.tagline.trim().slice(0, BUSINESS_WEB_PROFILE_TAGLINE_MAX),
      workPhotoUrls: settings.workPhotoUrls.slice(0, BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX),
      publishedSlug: slug,
    },
  }
}

/** Pathname segments that must not resolve as a business web profile slug. */
export const RESERVED_BUSINESS_WEB_PROFILE_SLUGS = new Set([
  "privacy",
  "terms",
  "sms",
  "sms-consent",
  "sms-cta",
  "sms-cts",
  "account-deletion",
  "about",
  "pricing",
  "reset-password",
  "home-preview",
  "cta",
  "embed",
  "api",
  "assets",
  "index.html",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
])

export function isReservedBusinessWebProfileSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase()
  return !s || s.length < 3 || RESERVED_BUSINESS_WEB_PROFILE_SLUGS.has(s)
}
