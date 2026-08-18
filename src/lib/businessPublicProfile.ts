import { normalizePlatformEmailSlug } from "./platformEmailSlug"

export const BUSINESS_PUBLIC_PROFILE_META_KEY = "business_public_profile_v1"
export const BUSINESS_WEB_PROFILE_TAGLINE_MAX = 120
export const BUSINESS_WEB_PROFILE_WORK_PHOTOS_MAX = 12

export type BusinessPublicEmailSource = "tradesman" | "custom"

export type BusinessProfileTemplateId = "classic" | "hero" | "split" | "gallery" | "showcase" | "hair_plumbing"

export type BusinessProfileTheme = {
  primaryColor: string
  secondaryColor: string
  fieldBackgroundColor: string
  fontColor: string
  /** Accent line (e.g. red “honest work” tag on Hair Plumbing). */
  accentColor: string
}

/** Where uploaded photos can be placed on Hair Plumbing–style layouts. */
export const WEBSITE_IMAGE_SLOT_OPTIONS = [
  { id: "background", label: "Fixed background", hint: "Stays put while horizontal bars scroll over it" },
  { id: "hero", label: "Hero spotlight", hint: "Optional hero overlay image (falls back to background)" },
  { id: "feature_1", label: "Feature strip · left", hint: "Small image in the about bar" },
  { id: "feature_2", label: "Feature strip · right", hint: "Small image in the about bar" },
  { id: "service_1", label: "Service card 1", hint: "First “Specialize In” card photo" },
  { id: "service_2", label: "Service card 2", hint: "Second service card photo" },
  { id: "service_3", label: "Service card 3", hint: "Third service card photo" },
] as const

export type WebsiteImageSlotId = (typeof WEBSITE_IMAGE_SLOT_OPTIONS)[number]["id"]

export type WebsiteImageSlots = Partial<Record<WebsiteImageSlotId, string>>

export type WebsiteScrollBandTone = "dark" | "light" | "clear"

export type WebsiteScrollBand = {
  id: string
  title: string
  body: string
  tone: WebsiteScrollBandTone
  /** When false, band is hidden on the home page. */
  enabled?: boolean
}

/** Title + body cards used in Classic feature strip / service trio (editable in preview). */
export type WebsiteContentCard = {
  id: string
  title: string
  body: string
}

/** Built-in destinations for CTA / text links in the editor (no free-form URLs required). */
export const WEBSITE_BUILT_IN_LINK_OPTIONS = [
  { id: "none", label: "No link" },
  { id: "home", label: "Home page" },
  { id: "about", label: "About page" },
  { id: "contact", label: "Contact page" },
  { id: "phone", label: "Call phone" },
  { id: "email", label: "Send email" },
] as const

export type WebsiteBuiltInLinkTarget = (typeof WEBSITE_BUILT_IN_LINK_OPTIONS)[number]["id"]

export const WEBSITE_SOCIAL_PLATFORM_OPTIONS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "google", label: "Google Business" },
  { id: "yelp", label: "Yelp" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
] as const

export type WebsiteSocialPlatformId = (typeof WEBSITE_SOCIAL_PLATFORM_OPTIONS)[number]["id"]

export type WebsiteSocialLinks = Partial<Record<WebsiteSocialPlatformId, string>>

/** Extra About-style pages beyond About / Contact. */
export type WebsiteCustomPage = {
  id: string
  enabled: boolean
  title: string
  body: string
}

/** Per-field typography overrides keyed by edit target id (e.g. hero.headline). */
export type WebsiteTextStyle = {
  color?: string
  fontSize?: string
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  letterSpacing?: string
  textTransform?: "none" | "uppercase" | "capitalize"
  /** Canvas nudge (px) — Carrd-style drag position. */
  offsetX?: number
  offsetY?: number
  /** Optional max width for wrapping / resize. */
  maxWidth?: number
  /** Built-in link for buttons / clickable text. */
  linkTarget?: WebsiteBuiltInLinkTarget
  /** Image slot display size (feature thumbs, etc.). */
  imageSize?: number
}

export type WebsiteTextStyles = Partial<Record<string, WebsiteTextStyle>>

export const WEBSITE_BUILDER_PREVIEW_STORAGE_KEY = "tradesman_website_builder_preview_v1"

export const WEBSITE_FONT_OPTIONS = [
  { id: "Oswald", label: "Oswald (headlines)", stack: '"Oswald", system-ui, sans-serif' },
  { id: "Jost", label: "Jost (body)", stack: '"Jost", system-ui, sans-serif' },
  { id: "Georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { id: "System", label: "System", stack: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
] as const

export const WEBSITE_FONT_SIZE_OPTIONS = ["12px", "14px", "16px", "18px", "22px", "28px", "36px", "48px", "64px"] as const

/** Home-page blocks the editor can turn off entirely. */
export const WEBSITE_HOME_SECTION_OPTIONS = [
  { id: "hero", label: "Hero / headline" },
  { id: "about_band", label: "About scroll bar" },
  { id: "services_band", label: "Services scroll bar" },
  { id: "gallery", label: "Photo gallery" },
  { id: "areas_hours", label: "Service areas & hours" },
  { id: "contact_home", label: "Contact block on home" },
  { id: "sticky_cta", label: "Mobile sticky call bar" },
] as const

export type WebsiteHomeSectionId = (typeof WEBSITE_HOME_SECTION_OPTIONS)[number]["id"]

export type WebsiteHomeSections = Record<WebsiteHomeSectionId, boolean>

export function defaultWebsiteHomeSectionOrder(): WebsiteHomeSectionId[] {
  return WEBSITE_HOME_SECTION_OPTIONS.map((o) => o.id)
}

export function parseWebsiteHomeSectionOrder(raw: unknown): WebsiteHomeSectionId[] {
  const all = defaultWebsiteHomeSectionOrder()
  if (!Array.isArray(raw)) return all
  const seen = new Set<string>()
  const out: WebsiteHomeSectionId[] = []
  for (const item of raw) {
    if (typeof item !== "string") continue
    if (!(all as string[]).includes(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item as WebsiteHomeSectionId)
  }
  for (const id of all) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

export type WebsiteSubPageId = "about" | "contact"

export type WebsiteSubPages = {
  about: { enabled: boolean; title: string; body: string }
  contact: { enabled: boolean; title: string }
}

export type WebsitePublicPageId = "home" | WebsiteSubPageId | `custom:${string}`

export function websiteCustomPagePathId(pageId: string): string {
  return pageId.replace(/^custom:/, "").replace(/[^a-z0-9-]/gi, "").slice(0, 40)
}

export function parseWebsiteCustomPages(raw: unknown): WebsiteCustomPage[] {
  if (!Array.isArray(raw)) return []
  const out: WebsiteCustomPage[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 40)
        : ""
    if (!id) continue
    const title =
      typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 80) : "New page"
    out.push({
      id,
      enabled: o.enabled !== false,
      title,
      body: typeof o.body === "string" ? o.body.trim().slice(0, 8000) : "",
    })
    if (out.length >= 6) break
  }
  return out
}

export function emptyWebsiteSocialLinks(): WebsiteSocialLinks {
  return {}
}

export function parseWebsiteSocialLinks(raw: unknown, facebookUrl = "", instagramUrl = ""): WebsiteSocialLinks {
  const out: WebsiteSocialLinks = emptyWebsiteSocialLinks()
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    for (const opt of WEBSITE_SOCIAL_PLATFORM_OPTIONS) {
      const v = o[opt.id]
      if (typeof v === "string" && v.trim()) out[opt.id] = v.trim().slice(0, 500)
    }
  }
  if (!out.facebook && facebookUrl.trim()) out.facebook = facebookUrl.trim().slice(0, 500)
  if (!out.instagram && instagramUrl.trim()) out.instagram = instagramUrl.trim().slice(0, 500)
  return out
}

export function isWebsiteBuiltInLinkTarget(value: unknown): value is WebsiteBuiltInLinkTarget {
  return typeof value === "string" && WEBSITE_BUILT_IN_LINK_OPTIONS.some((o) => o.id === value)
}

export function emptyWebsiteHomeSections(): WebsiteHomeSections {
  return {
    hero: true,
    about_band: true,
    services_band: true,
    gallery: true,
    areas_hours: true,
    contact_home: true,
    sticky_cta: true,
  }
}

export function defaultWebsiteSubPages(): WebsiteSubPages {
  return {
    about: { enabled: true, title: "About Us", body: "" },
    contact: { enabled: true, title: "Contact Us" },
  }
}

export function parseWebsiteHomeSections(raw: unknown): WebsiteHomeSections {
  const base = emptyWebsiteHomeSections()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  for (const opt of WEBSITE_HOME_SECTION_OPTIONS) {
    if (o[opt.id] === false) base[opt.id] = false
    else if (o[opt.id] === true) base[opt.id] = true
  }
  return base
}

export function parseWebsiteSubPages(raw: unknown): WebsiteSubPages {
  const base = defaultWebsiteSubPages()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const about = o.about && typeof o.about === "object" && !Array.isArray(o.about) ? (o.about as Record<string, unknown>) : null
  const contact =
    o.contact && typeof o.contact === "object" && !Array.isArray(o.contact) ? (o.contact as Record<string, unknown>) : null
  return {
    about: {
      enabled: about?.enabled !== false,
      title: typeof about?.title === "string" && about.title.trim() ? about.title.trim().slice(0, 80) : base.about.title,
      body: typeof about?.body === "string" ? about.body.trim().slice(0, 8000) : "",
    },
    contact: {
      enabled: contact?.enabled !== false,
      title:
        typeof contact?.title === "string" && contact.title.trim()
          ? contact.title.trim().slice(0, 80)
          : base.contact.title,
    },
  }
}

export const BUSINESS_PROFILE_TEMPLATE_OPTIONS: Array<{ id: BusinessProfileTemplateId; label: string; hint: string }> = [
  {
    id: "hair_plumbing",
    label: "Classic",
    hint: "Fixed background photo with dark/light bars that scroll over it. Drag photos into hero, features, and service cards.",
  },
  {
    id: "showcase",
    label: "Showcase",
    hint: "Same marketing layout as Classic with neutral defaults.",
  },
  { id: "hero", label: "Hero banner", hint: "Full-width header band with logo and bold headline." },
  { id: "gallery", label: "Gallery focus", hint: "Large work-photo grid with compact business details." },
  { id: "split", label: "Split layout", hint: "Two-column desktop: story and contact beside photos." },
  { id: "classic", label: "Simple card", hint: "Centered card with clean sections — simple and reliable." },
]

export const DEFAULT_BUSINESS_PROFILE_THEME: BusinessProfileTheme = {
  primaryColor: "#0f766e",
  secondaryColor: "#0f172a",
  fieldBackgroundColor: "#f8fafc",
  fontColor: "#0f172a",
  accentColor: "#b91c1c",
}

/** One-click brand packs customers can apply, then fine-tune. */
export const BUSINESS_PROFILE_BRAND_PRESETS: Array<{
  id: string
  label: string
  theme: BusinessProfileTheme
}> = [
  {
    id: "classic_bw",
    label: "Classic B&W",
    theme: {
      primaryColor: "#111111",
      secondaryColor: "#000000",
      fieldBackgroundColor: "#ffffff",
      fontColor: "#0f172a",
      accentColor: "#c41e3a",
    },
  },
  {
    id: "plumbing_teal",
    label: "Plumbing teal",
    theme: {
      primaryColor: "#0e7490",
      secondaryColor: "#164e63",
      fieldBackgroundColor: "#ecfeff",
      fontColor: "#0f172a",
      accentColor: "#b91c1c",
    },
  },
  {
    id: "construction_amber",
    label: "Construction amber",
    theme: {
      primaryColor: "#c2410c",
      secondaryColor: "#1c1917",
      fieldBackgroundColor: "#fff7ed",
      fontColor: "#1c1917",
      accentColor: "#ea580c",
    },
  },
  {
    id: "landscape_green",
    label: "Landscape green",
    theme: {
      primaryColor: "#15803d",
      secondaryColor: "#14532d",
      fieldBackgroundColor: "#f0fdf4",
      fontColor: "#14532d",
      accentColor: "#ca8a04",
    },
  },
  {
    id: "roofing_navy",
    label: "Roofing navy",
    theme: {
      primaryColor: "#1d4ed8",
      secondaryColor: "#0f172a",
      fieldBackgroundColor: "#eff6ff",
      fontColor: "#0f172a",
      accentColor: "#dc2626",
    },
  },
  {
    id: "clean_charcoal",
    label: "Clean charcoal",
    theme: {
      primaryColor: "#334155",
      secondaryColor: "#0f172a",
      fieldBackgroundColor: "#f8fafc",
      fontColor: "#0f172a",
      accentColor: "#b91c1c",
    },
  },
]

export function emptyWebsiteImageSlots(): WebsiteImageSlots {
  return {}
}

export function defaultWebsiteScrollBands(): WebsiteScrollBand[] {
  return [
    {
      id: "about",
      title: "Your Local Plumbing Professionals",
      body: "As a leading plumbing company, we offer a wide range of services, including drain cleaning, water softeners, and water heater repair, and our skilled technicians are dedicated to providing efficient and reliable solutions for all your plumbing needs.",
      tone: "dark",
      enabled: true,
    },
    {
      id: "services",
      title: "What We Specialize In",
      body: "",
      tone: "light",
      enabled: true,
    },
  ]
}

export function defaultWebsiteFeatureCards(): WebsiteContentCard[] {
  return [
    {
      id: "feature_1",
      title: "Quality Fixtures",
      body: "We install and repair high-quality faucets to ensure optimal water flow and durability.",
    },
    {
      id: "feature_2",
      title: "Expert Pipe Repair",
      body: "Our skilled technicians can diagnose and repair any pipe issue, from leaks to clogs.",
    },
  ]
}

export function defaultWebsiteServiceCards(): WebsiteContentCard[] {
  return [
    {
      id: "service_1",
      title: "Water Softner Installation",
      body: "We install reliable water softening systems designed to improve your home's water quality, increase appliance efficiency, and provide softer water throughout your home.",
    },
    {
      id: "service_2",
      title: "Service Plumbing Repairs",
      body: "Whether it’s a small repair or a major plumbing concern, you can count on dependable service and solutions you can trust.",
    },
    {
      id: "service_3",
      title: "Water Heater Replacement",
      body: "When your water heater can no longer keep up with your household’s needs, it may be time for a reliable replacement. An aging or failing unit can lead to inconsistent hot water, higher energy costs, leaks, and unexpected breakdowns.",
    },
  ]
}

export function parseWebsiteContentCards(raw: unknown, fallback: WebsiteContentCard[], max = 6): WebsiteContentCard[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((c) => ({ ...c }))
  const out: WebsiteContentCard[] = []
  for (const item of raw.slice(0, max)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 40) : `card_${out.length + 1}`
    out.push({
      id,
      title: typeof o.title === "string" ? o.title.trim().slice(0, 120) : "",
      body: typeof o.body === "string" ? o.body.trim().slice(0, 2000) : "",
    })
  }
  return out.length ? out : fallback.map((c) => ({ ...c }))
}

export function parseWebsiteTextStyles(raw: unknown): WebsiteTextStyles {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: WebsiteTextStyles = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim() || !value || typeof value !== "object" || Array.isArray(value)) continue
    const o = value as Record<string, unknown>
    const style: WebsiteTextStyle = {}
    if (typeof o.color === "string" && HEX_COLOR_RE.test(o.color.trim())) style.color = o.color.trim().toLowerCase()
    if (typeof o.fontSize === "string" && o.fontSize.trim()) style.fontSize = o.fontSize.trim().slice(0, 16)
    if (typeof o.fontFamily === "string" && o.fontFamily.trim()) style.fontFamily = o.fontFamily.trim().slice(0, 120)
    if (typeof o.fontWeight === "string" && o.fontWeight.trim()) style.fontWeight = o.fontWeight.trim().slice(0, 16)
    if (typeof o.fontStyle === "string" && o.fontStyle.trim()) style.fontStyle = o.fontStyle.trim().slice(0, 16)
    if (typeof o.letterSpacing === "string" && o.letterSpacing.trim()) style.letterSpacing = o.letterSpacing.trim().slice(0, 16)
    if (o.textTransform === "none" || o.textTransform === "uppercase" || o.textTransform === "capitalize") {
      style.textTransform = o.textTransform
    }
    if (typeof o.offsetX === "number" && Number.isFinite(o.offsetX)) style.offsetX = Math.max(-600, Math.min(600, Math.round(o.offsetX)))
    if (typeof o.offsetY === "number" && Number.isFinite(o.offsetY)) style.offsetY = Math.max(-600, Math.min(600, Math.round(o.offsetY)))
    if (typeof o.maxWidth === "number" && Number.isFinite(o.maxWidth)) style.maxWidth = Math.max(80, Math.min(1200, Math.round(o.maxWidth)))
    if (isWebsiteBuiltInLinkTarget(o.linkTarget) && o.linkTarget !== "none") style.linkTarget = o.linkTarget
    if (typeof o.imageSize === "number" && Number.isFinite(o.imageSize)) {
      style.imageSize = Math.max(32, Math.min(280, Math.round(o.imageSize)))
    }
    if (Object.keys(style).length) out[key.trim().slice(0, 80)] = style
  }
  return out
}

export function websiteTextStyleToCss(style: WebsiteTextStyle | undefined): {
  color?: string
  fontSize?: string
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  letterSpacing?: string
  textTransform?: "none" | "uppercase" | "capitalize"
  transform?: string
  maxWidth?: number | string
  position?: "relative"
  display?: "inline-block"
} {
  if (!style) return {}
  const css: {
    color?: string
    fontSize?: string
    fontFamily?: string
    fontWeight?: string
    fontStyle?: string
    letterSpacing?: string
    textTransform?: "none" | "uppercase" | "capitalize"
    transform?: string
    maxWidth?: number | string
    position?: "relative"
    display?: "inline-block"
  } = {}
  if (style.color) css.color = style.color
  if (style.fontSize) css.fontSize = style.fontSize
  if (style.fontFamily) css.fontFamily = style.fontFamily
  if (style.fontWeight) css.fontWeight = style.fontWeight
  if (style.fontStyle) css.fontStyle = style.fontStyle
  if (style.letterSpacing) css.letterSpacing = style.letterSpacing
  if (style.textTransform) css.textTransform = style.textTransform
  const ox = style.offsetX ?? 0
  const oy = style.offsetY ?? 0
  if (ox !== 0 || oy !== 0) {
    css.transform = `translate(${ox}px, ${oy}px)`
    css.position = "relative"
    css.display = "inline-block"
  }
  if (typeof style.maxWidth === "number") css.maxWidth = style.maxWidth
  return css
}

export function parseWebsiteImageSlots(raw: unknown): WebsiteImageSlots {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyWebsiteImageSlots()
  const o = raw as Record<string, unknown>
  const out: WebsiteImageSlots = {}
  for (const opt of WEBSITE_IMAGE_SLOT_OPTIONS) {
    const v = o[opt.id]
    if (typeof v === "string" && v.trim()) out[opt.id] = v.trim()
  }
  return out
}

export function parseWebsiteScrollBands(raw: unknown): WebsiteScrollBand[] {
  const base = defaultWebsiteScrollBands()
  if (!Array.isArray(raw) || raw.length === 0) return base
  const out: WebsiteScrollBand[] = []
  for (const item of raw.slice(0, 6)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 40) : `band_${out.length + 1}`
    const tone: WebsiteScrollBandTone =
      o.tone === "light" || o.tone === "clear" || o.tone === "dark" ? o.tone : "dark"
    out.push({
      id,
      title: typeof o.title === "string" ? o.title.trim().slice(0, 120) : "",
      body: typeof o.body === "string" ? o.body.trim().slice(0, 2000) : "",
      tone,
      enabled: o.enabled !== false,
    })
  }
  return out.length ? out : base
}

/** Resolve a slot image, falling back through common aliases. */
export function resolveWebsiteSlotImage(
  slots: WebsiteImageSlots | undefined,
  slot: WebsiteImageSlotId,
  workPhotoUrls: string[] = [],
  logoUrl?: string | null,
): string | null {
  const direct = slots?.[slot]?.trim()
  if (direct) return direct
  // Do not auto-reuse service gallery photos as the page background — that made Hair Plumbing’s
  // water-softener shot appear as both the fixed background and the first service card.
  if (slot === "background") return null
  if (slot === "hero") return slots?.background?.trim() || null
  if (slot === "feature_1") return workPhotoUrls[1] || workPhotoUrls[0] || null
  if (slot === "feature_2") return workPhotoUrls[2] || workPhotoUrls[1] || null
  if (slot === "service_1") return workPhotoUrls[0] || null
  if (slot === "service_2") return workPhotoUrls[1] || null
  if (slot === "service_3") return workPhotoUrls[2] || null
  return logoUrl || null
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
  /** Extended social profile URLs (includes facebook/instagram + more). */
  socialLinks: WebsiteSocialLinks
  /** Drag-and-drop image placements by page area. */
  imageSlots: WebsiteImageSlots
  /** Horizontal content bars that scroll over the fixed background. */
  scrollBands: WebsiteScrollBand[]
  /** Optional hero headline (defaults to business name). */
  heroHeadline: string
  /** Hero CTA button label. */
  ctaLabel: string
  /** Optional custom domain for this hosted site (DNS → Vercel). */
  customDomain: string
  /** Which home sections are visible. */
  homeSections: WebsiteHomeSections
  /** Standalone About / Contact pages (not only homepage anchors). */
  subPages: WebsiteSubPages
  /** Extra client-defined sub-pages. */
  customPages: WebsiteCustomPage[]
  /** Feature highlight cards under the about band. */
  featureCards: WebsiteContentCard[]
  /** Specialty / service cards (title + body + image slot). */
  serviceCards: WebsiteContentCard[]
  /** Per-element typography overrides (click-to-edit in builder). */
  textStyles: WebsiteTextStyles
  /** Home section render order (drag reorder in builder). */
  homeSectionOrder: WebsiteHomeSectionId[]
  /** Fixed background stays put while content scrolls (Classic). */
  fixedBackground: boolean
  /** Footer copyright line on Classic sites. */
  footerCopyright: string
  /** Show Tradesman “Powered by” badge (off by default for client Classic sites). */
  showPoweredBy: boolean
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
    templateId: "showcase",
    theme: { ...DEFAULT_BUSINESS_PROFILE_THEME },
    serviceAreasText: "",
    showServiceAreasList: false,
    servicesOfferedText: "",
    showServicesOffered: false,
    showContactForm: true,
    facebookUrl: "",
    instagramUrl: "",
    showSocialLinks: true,
    socialLinks: emptyWebsiteSocialLinks(),
    imageSlots: emptyWebsiteImageSlots(),
    scrollBands: [
      { id: "about", title: "About us", body: "", tone: "dark", enabled: true },
      { id: "services", title: "Our services", body: "", tone: "light", enabled: true },
    ],
    heroHeadline: "",
    ctaLabel: "Get a Quote",
    customDomain: "",
    homeSections: emptyWebsiteHomeSections(),
    subPages: defaultWebsiteSubPages(),
    customPages: [],
    featureCards: [],
    serviceCards: [],
    textStyles: {},
    homeSectionOrder: defaultWebsiteHomeSectionOrder(),
    fixedBackground: true,
    footerCopyright: "",
    showPoweredBy: true,
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
    accentColor: normalizeBusinessProfileHexColor(
      typeof o.accentColor === "string" ? o.accentColor : "",
      base.accentColor,
    ),
  }
}

export function parseBusinessProfileTemplateId(raw: unknown): BusinessProfileTemplateId {
  if (
    raw === "hero" ||
    raw === "split" ||
    raw === "gallery" ||
    raw === "classic" ||
    raw === "showcase" ||
    raw === "hair_plumbing"
  ) {
    return raw
  }
  return "showcase"
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
    showContactForm: o.showContactForm !== false,
    facebookUrl: readNestedProfileString(o, "facebookUrl", "facebook_url").slice(0, 500),
    instagramUrl: readNestedProfileString(o, "instagramUrl", "instagram_url").slice(0, 500),
    showSocialLinks: o.showSocialLinks !== false,
    socialLinks: parseWebsiteSocialLinks(
      o.socialLinks,
      readNestedProfileString(o, "facebookUrl", "facebook_url"),
      readNestedProfileString(o, "instagramUrl", "instagram_url"),
    ),
    imageSlots: parseWebsiteImageSlots(o.imageSlots),
    scrollBands: parseWebsiteScrollBands(o.scrollBands),
    heroHeadline: readNestedProfileString(o, "heroHeadline", "hero_headline").slice(0, 160),
    ctaLabel: readNestedProfileString(o, "ctaLabel", "cta_label").slice(0, 40) || base.ctaLabel,
    customDomain: readNestedProfileString(o, "customDomain", "custom_domain")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .slice(0, 120),
    homeSections: parseWebsiteHomeSections(o.homeSections),
    subPages: parseWebsiteSubPages(o.subPages),
    customPages: parseWebsiteCustomPages(o.customPages),
    featureCards: parseWebsiteContentCards(o.featureCards, defaultWebsiteFeatureCards(), 4),
    serviceCards: parseWebsiteContentCards(o.serviceCards, defaultWebsiteServiceCards(), 6),
    textStyles: parseWebsiteTextStyles(o.textStyles),
    homeSectionOrder: parseWebsiteHomeSectionOrder(o.homeSectionOrder),
    fixedBackground: o.fixedBackground !== false,
    footerCopyright: readNestedProfileString(o, "footerCopyright", "footer_copyright").slice(0, 200),
    showPoweredBy: o.showPoweredBy === true,
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
      showContactForm: settings.showContactForm !== false,
      facebookUrl: (settings.socialLinks.facebook || settings.facebookUrl).trim().slice(0, 500),
      instagramUrl: (settings.socialLinks.instagram || settings.instagramUrl).trim().slice(0, 500),
      showSocialLinks: settings.showSocialLinks !== false,
      socialLinks: parseWebsiteSocialLinks(
        settings.socialLinks,
        settings.socialLinks.facebook || settings.facebookUrl,
        settings.socialLinks.instagram || settings.instagramUrl,
      ),
      imageSlots: parseWebsiteImageSlots(settings.imageSlots),
      scrollBands: parseWebsiteScrollBands(settings.scrollBands),
      heroHeadline: settings.heroHeadline.trim().slice(0, 160),
      ctaLabel: settings.ctaLabel.trim().slice(0, 40) || "Get a Quote",
      customDomain: settings.customDomain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .slice(0, 120),
      homeSections: parseWebsiteHomeSections(settings.homeSections),
      subPages: parseWebsiteSubPages(settings.subPages),
      customPages: parseWebsiteCustomPages(settings.customPages),
      featureCards: parseWebsiteContentCards(settings.featureCards, defaultWebsiteFeatureCards(), 4),
      serviceCards: parseWebsiteContentCards(settings.serviceCards, defaultWebsiteServiceCards(), 6),
      textStyles: parseWebsiteTextStyles(settings.textStyles),
      homeSectionOrder: parseWebsiteHomeSectionOrder(settings.homeSectionOrder),
      fixedBackground: settings.fixedBackground !== false,
      footerCopyright: settings.footerCopyright.trim().slice(0, 200),
      showPoweredBy: settings.showPoweredBy === true,
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
  "admin",
  "admin-login",
  "reset-password",
  "home-preview",
  "cta",
  "embed",
  "e",
  "voice-studio",
  "api",
  "assets",
  "index.html",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // Common bot / scanner paths — avoid public-profile API hits
  "website-builder-preview",
  "wp-admin",
  "wp-login",
  "wordpress",
  "phpmyadmin",
  ".env",
  "login",
  "logout",
  "register",
  "dashboard",
  "app",
  "office",
  "demo",
  "training",
  "home",
  "www",
  "static",
  "cdn",
  "media",
  "images",
  "img",
  "css",
  "js",
  "fonts",
  "vendor",
  "node_modules",
  "graphql",
  "actuator",
  "swagger",
  "docs",
  "health",
  "status",
  "metrics",
])

export function isReservedBusinessWebProfileSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase()
  return !s || s.length < 3 || RESERVED_BUSINESS_WEB_PROFILE_SLUGS.has(s)
}
