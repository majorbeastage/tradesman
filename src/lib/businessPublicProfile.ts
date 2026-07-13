import { normalizePlatformEmailSlug } from "./platformEmailSlug"

export const BUSINESS_PUBLIC_PROFILE_META_KEY = "business_public_profile_v1"
export const BUSINESS_WEB_PROFILE_TAGLINE_MAX = 120
export const BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX = 5

export type BusinessPublicEmailSource = "tradesman" | "custom"

export type BusinessProfileTemplateId = "classic" | "hero" | "split" | "gallery"

export type BusinessProfileTheme = {
  primaryColor: string
  secondaryColor: string
  fieldBackgroundColor: string
  fontColor: string
}

export const BUSINESS_PROFILE_TEMPLATE_OPTIONS: Array<{ id: BusinessProfileTemplateId; label: string; hint: string }> = [
  { id: "classic", label: "Classic", hint: "Centered card with clean sections — great for most trades." },
  { id: "hero", label: "Hero banner", hint: "Full-width header band with logo and bold headline." },
  { id: "split", label: "Split layout", hint: "Two-column desktop: story and contact beside photos." },
  { id: "gallery", label: "Gallery focus", hint: "Large work-photo grid with compact business details." },
]

export const DEFAULT_BUSINESS_PROFILE_THEME: BusinessProfileTheme = {
  primaryColor: "#0f766e",
  secondaryColor: "#0f172a",
  fieldBackgroundColor: "#f8fafc",
  fontColor: "#0f172a",
}

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
  templateId: BusinessProfileTemplateId
  theme: BusinessProfileTheme
  /** Comma- or line-separated cities, counties, states served. */
  serviceAreasText: string
  showServiceAreasList: boolean
  /** Comma-separated services — each item on its own line on the public page. */
  servicesOfferedText: string
  showServicesOffered: boolean
  showContactForm: boolean
  /** Optional social links — mirrored with Growth presencePages. */
  facebookUrl: string
  instagramUrl: string
  showSocialLinks: boolean
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
    templateId: "classic",
    theme: { ...DEFAULT_BUSINESS_PROFILE_THEME },
    serviceAreasText: "",
    showServiceAreasList: false,
    servicesOfferedText: "",
    showServicesOffered: false,
    showContactForm: false,
    facebookUrl: "",
    instagramUrl: "",
    showSocialLinks: true,
  }
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function normalizeBusinessProfileHexColor(raw: string, fallback: string): string {
  const t = raw.trim()
  if (HEX_COLOR_RE.test(t)) return t.toLowerCase()
  return fallback
}

export function parseBusinessProfileTheme(raw: unknown): BusinessProfileTheme {
  const base = { ...DEFAULT_BUSINESS_PROFILE_THEME }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  return {
    primaryColor: normalizeBusinessProfileHexColor(
      typeof o.primaryColor === "string" ? o.primaryColor : "",
      base.primaryColor,
    ),
    secondaryColor: normalizeBusinessProfileHexColor(
      typeof o.secondaryColor === "string" ? o.secondaryColor : "",
      base.secondaryColor,
    ),
    fieldBackgroundColor: normalizeBusinessProfileHexColor(
      typeof o.fieldBackgroundColor === "string" ? o.fieldBackgroundColor : "",
      base.fieldBackgroundColor,
    ),
    fontColor: normalizeBusinessProfileHexColor(typeof o.fontColor === "string" ? o.fontColor : "", base.fontColor),
  }
}

export function parseBusinessProfileTemplateId(raw: unknown): BusinessProfileTemplateId {
  if (raw === "hero" || raw === "split" || raw === "gallery" || raw === "classic") return raw
  return "classic"
}

/** Split comma, semicolon, or newline separated lists from settings fields. */
export function parseBusinessProfileListField(raw: string, maxItems = 40): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,;\n]+/)) {
    const item = part.trim()
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= maxItems) break
  }
  return out
}

/** URL slug from business name — not user-editable. */
export function businessWebProfileSlugFromName(displayName: string): string {
  return normalizePlatformEmailSlug(displayName)
}

export function businessWebProfilePublicUrl(slug: string, origin = "https://www.tradesman-us.com"): string {
  const safe = businessWebProfileSlugFromName(slug)
  return `${origin.replace(/\/+$/, "")}/${safe}`
}

function readNestedProfileString(o: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = o[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

export function parseBusinessPublicProfileSettings(metadata: unknown): BusinessPublicProfileSettings {
  const base = emptyBusinessPublicProfileSettings()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>)[BUSINESS_PUBLIC_PROFILE_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  if (o.v !== 1 && o.v != null) return base
  const workPhotoUrls = Array.isArray(o.workPhotoUrls)
    ? o.workPhotoUrls.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX)
    : []
  return {
    v: 1,
    enabled: o.enabled === true,
    tagline: readNestedProfileString(o, "tagline", "short_description", "shortDescription").slice(0, BUSINESS_WEB_PROFILE_TAGLINE_MAX),
    aboutUs: readNestedProfileString(o, "aboutUs", "about_us").slice(0, 4000),
    showPhone: o.showPhone !== false,
    showEmail: o.showEmail !== false,
    emailSource: o.emailSource === "custom" ? "custom" : "tradesman",
    showAddress: o.showAddress !== false,
    showServiceArea: o.showServiceArea === true,
    showBusinessHours: o.showBusinessHours !== false,
    profilePhotoUrl: typeof o.profilePhotoUrl === "string" && o.profilePhotoUrl.trim() ? o.profilePhotoUrl.trim() : null,
    workPhotoUrls,
    publishedSlug: typeof o.publishedSlug === "string" ? normalizePlatformEmailSlug(o.publishedSlug) : "",
    templateId: parseBusinessProfileTemplateId(o.templateId),
    theme: parseBusinessProfileTheme(o.theme),
    serviceAreasText: readNestedProfileString(o, "serviceAreasText", "service_areas_text").slice(0, 2000),
    showServiceAreasList: o.showServiceAreasList === true,
    servicesOfferedText: readNestedProfileString(o, "servicesOfferedText", "services_offered_text").slice(0, 2000),
    showServicesOffered: o.showServicesOffered === true,
    showContactForm: o.showContactForm === true,
    facebookUrl: readNestedProfileString(o, "facebookUrl", "facebook_url").slice(0, 500),
    instagramUrl: readNestedProfileString(o, "instagramUrl", "instagram_url").slice(0, 500),
    showSocialLinks: o.showSocialLinks !== false,
  }
}

export function mergeBusinessPublicProfileMetadata(
  prevMeta: Record<string, unknown>,
  settings: BusinessPublicProfileSettings,
  publishedSlug?: string,
): Record<string, unknown> {
  const slug = publishedSlug ? normalizePlatformEmailSlug(publishedSlug) : settings.publishedSlug
  const prevSettings = parseBusinessPublicProfileSettings(prevMeta)
  return {
    ...prevMeta,
    [BUSINESS_PUBLIC_PROFILE_META_KEY]: {
      ...prevSettings,
      ...settings,
      v: 1,
      tagline: settings.tagline.trim().slice(0, BUSINESS_WEB_PROFILE_TAGLINE_MAX),
      aboutUs: settings.aboutUs.trim().slice(0, 4000),
      workPhotoUrls: settings.workPhotoUrls.slice(0, BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX),
      publishedSlug: slug,
      templateId: parseBusinessProfileTemplateId(settings.templateId),
      theme: parseBusinessProfileTheme(settings.theme),
      serviceAreasText: settings.serviceAreasText.trim().slice(0, 2000),
      showServiceAreasList: settings.showServiceAreasList === true,
      servicesOfferedText: settings.servicesOfferedText.trim().slice(0, 2000),
      showServicesOffered: settings.showServicesOffered === true,
      showContactForm: settings.showContactForm === true,
      facebookUrl: settings.facebookUrl.trim().slice(0, 500),
      instagramUrl: settings.instagramUrl.trim().slice(0, 500),
      showSocialLinks: settings.showSocialLinks !== false,
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
  "trial",
  "signup",
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
