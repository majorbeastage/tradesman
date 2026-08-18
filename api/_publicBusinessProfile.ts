/**
 * Public business web profile API — self-contained (no ../src imports) for Vercel serverless.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  getPrimaryEmailChannelForUser,
  resolveOutboundEmailFromAddress,
} from "./_communications.js"
import { bootstrapHairPlumbingWebsiteIfNeeded, HAIR_PLUMBING_SITE_SEED_VERSION } from "./_seedHairPlumbingWebsite.js"

const BUSINESS_PUBLIC_PROFILE_META_KEY = "business_public_profile_v1"
const PLATFORM_EMAIL_ROOT_DOMAIN = "tradesman-us.com"
const COMPANY_LOGO_META_KEY = "company_logo_url"

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const DAY_LABELS: Record<(typeof DAY_ORDER)[number], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

type BusinessPublicProfileSettings = {
  enabled: boolean
  tagline: string
  aboutUs: string
  showPhone: boolean
  showEmail: boolean
  emailSource: "tradesman" | "custom"
  showAddress: boolean
  showServiceArea: boolean
  showBusinessHours: boolean
  profilePhotoUrl: string | null
  workPhotoUrls: string[]
  publishedSlug: string
  templateId: "classic" | "hero" | "split" | "gallery" | "showcase" | "hair_plumbing"
  theme: {
    primaryColor: string
    secondaryColor: string
    fieldBackgroundColor: string
    fontColor: string
    accentColor: string
  }
  serviceAreasText: string
  showServiceAreasList: boolean
  servicesOfferedText: string
  showServicesOffered: boolean
  showContactForm: boolean
  facebookUrl: string
  instagramUrl: string
  showSocialLinks: boolean
  imageSlots: Record<string, string>
  scrollBands: Array<{ id: string; title: string; body: string; tone: "dark" | "light" | "clear"; enabled?: boolean }>
  heroHeadline: string
  ctaLabel: string
  customDomain: string
  homeSections: Record<string, boolean>
  subPages: {
    about: { enabled: boolean; title: string; body: string }
    contact: { enabled: boolean; title: string }
  }
  featureCards: Array<{ id: string; title: string; body: string }>
  serviceCards: Array<{ id: string; title: string; body: string }>
  textStyles: Record<string, Record<string, string>>
  homeSectionOrder: string[]
  fixedBackground: boolean
  footerCopyright: string
  showPoweredBy: boolean
}

const DEFAULT_THEME = {
  primaryColor: "#0f766e",
  secondaryColor: "#0f172a",
  fieldBackgroundColor: "#f8fafc",
  fontColor: "#0f172a",
  accentColor: "#b91c1c",
}

function normalizeHexColor(raw: string, fallback: string): string {
  const t = raw.trim()
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t.toLowerCase() : fallback
}

function parseTheme(raw: unknown): BusinessPublicProfileSettings["theme"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_THEME }
  const o = raw as Record<string, unknown>
  return {
    primaryColor: normalizeHexColor(typeof o.primaryColor === "string" ? o.primaryColor : "", DEFAULT_THEME.primaryColor),
    secondaryColor: normalizeHexColor(typeof o.secondaryColor === "string" ? o.secondaryColor : "", DEFAULT_THEME.secondaryColor),
    fieldBackgroundColor: normalizeHexColor(
      typeof o.fieldBackgroundColor === "string" ? o.fieldBackgroundColor : "",
      DEFAULT_THEME.fieldBackgroundColor,
    ),
    fontColor: normalizeHexColor(typeof o.fontColor === "string" ? o.fontColor : "", DEFAULT_THEME.fontColor),
    accentColor: normalizeHexColor(typeof o.accentColor === "string" ? o.accentColor : "", DEFAULT_THEME.accentColor),
  }
}

function parseTemplateId(raw: unknown): BusinessPublicProfileSettings["templateId"] {
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
  return "hair_plumbing"
}

function parseListField(raw: string, maxItems = 40): string[] {
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

type ProfileRow = {
  id: string
  display_name?: string | null
  email?: string | null
  metadata?: unknown
  business_address?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  service_radius_enabled?: boolean | null
  service_radius_miles?: number | string | null
  business_hours?: unknown
  business_web_profile_slug?: string | null
}

const PROFILE_SELECT =
  "id, display_name, email, metadata, business_address, address_line_1, address_line_2, address_city, address_state, address_zip, service_radius_enabled, service_radius_miles, business_hours, business_web_profile_slug"

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64)
}

function slugFromDisplayName(displayName: string): string {
  return normalizeSlug(displayName)
}

function readNestedProfileString(o: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = o[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

function parseSettings(metadata: unknown): BusinessPublicProfileSettings {
  const base: BusinessPublicProfileSettings = {
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
    templateId: "hair_plumbing",
    theme: { ...DEFAULT_THEME },
    serviceAreasText: "",
    showServiceAreasList: false,
    servicesOfferedText: "",
    showServicesOffered: false,
    showContactForm: true,
    facebookUrl: "",
    instagramUrl: "",
    showSocialLinks: true,
    imageSlots: {},
    scrollBands: [
      { id: "about", title: "Your Local Professionals", body: "", tone: "dark" },
      { id: "services", title: "What We Specialize In", body: "", tone: "light" },
    ],
    heroHeadline: "",
    ctaLabel: "Get a Quote",
    customDomain: "",
    homeSections: {
      hero: true,
      about_band: true,
      services_band: true,
      gallery: true,
      areas_hours: true,
      contact_home: true,
      sticky_cta: true,
    },
    subPages: {
      about: { enabled: true, title: "About Us", body: "" },
      contact: { enabled: true, title: "Contact Us" },
    },
    featureCards: [],
    serviceCards: [],
    textStyles: {},
    homeSectionOrder: ["hero", "about_band", "services_band", "gallery", "areas_hours", "contact_home", "sticky_cta"],
    fixedBackground: true,
    footerCopyright: "",
    showPoweredBy: false,
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const meta = metadata as Record<string, unknown>
  const raw = meta[BUSINESS_PUBLIC_PROFILE_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  if (o.v !== 1 && o.v != null) return base
  const workPhotoUrls = Array.isArray(o.workPhotoUrls)
    ? o.workPhotoUrls.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 12)
    : []
  const growth = meta.growth_module_v1
  const pages =
    growth && typeof growth === "object" && !Array.isArray(growth)
      ? ((growth as { presencePages?: Record<string, string> }).presencePages ?? {})
      : {}
  const fb =
    (typeof o.facebookUrl === "string" && o.facebookUrl.trim()) ||
    (typeof pages.facebook === "string" && pages.facebook.trim()) ||
    ""
  const ig =
    (typeof o.instagramUrl === "string" && o.instagramUrl.trim()) ||
    (typeof pages.instagram === "string" && pages.instagram.trim()) ||
    ""
  const imageSlots: Record<string, string> = {}
  if (o.imageSlots && typeof o.imageSlots === "object" && !Array.isArray(o.imageSlots)) {
    for (const [k, v] of Object.entries(o.imageSlots as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) imageSlots[k] = v.trim()
    }
  }
  const scrollBands: BusinessPublicProfileSettings["scrollBands"] = []
  if (Array.isArray(o.scrollBands)) {
    for (const item of o.scrollBands.slice(0, 6)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const b = item as Record<string, unknown>
      scrollBands.push({
        id: typeof b.id === "string" && b.id.trim() ? b.id.trim().slice(0, 40) : `band_${scrollBands.length + 1}`,
        title: typeof b.title === "string" ? b.title.trim().slice(0, 120) : "",
        body: typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "",
        tone: b.tone === "light" || b.tone === "clear" || b.tone === "dark" ? b.tone : "dark",
        enabled: b.enabled !== false,
      })
    }
  }
  const homeSections: Record<string, boolean> = {
    hero: true,
    about_band: true,
    services_band: true,
    gallery: true,
    areas_hours: true,
    contact_home: true,
    sticky_cta: true,
  }
  if (o.homeSections && typeof o.homeSections === "object" && !Array.isArray(o.homeSections)) {
    for (const [k, v] of Object.entries(o.homeSections as Record<string, unknown>)) {
      if (v === false) homeSections[k] = false
      else if (v === true) homeSections[k] = true
    }
  }
  const subRaw = o.subPages && typeof o.subPages === "object" && !Array.isArray(o.subPages) ? (o.subPages as Record<string, unknown>) : {}
  const aboutRaw =
    subRaw.about && typeof subRaw.about === "object" && !Array.isArray(subRaw.about)
      ? (subRaw.about as Record<string, unknown>)
      : {}
  const contactRaw =
    subRaw.contact && typeof subRaw.contact === "object" && !Array.isArray(subRaw.contact)
      ? (subRaw.contact as Record<string, unknown>)
      : {}
  return {
    enabled: o.enabled === true,
    tagline: readNestedProfileString(o, "tagline", "short_description", "shortDescription").slice(0, 120),
    aboutUs: readNestedProfileString(o, "aboutUs", "about_us").slice(0, 4000),
    showPhone: o.showPhone !== false,
    showEmail: o.showEmail !== false,
    emailSource: o.emailSource === "custom" ? "custom" : "tradesman",
    showAddress: o.showAddress !== false,
    showServiceArea: o.showServiceArea === true,
    showBusinessHours: o.showBusinessHours !== false,
    profilePhotoUrl: typeof o.profilePhotoUrl === "string" && o.profilePhotoUrl.trim() ? o.profilePhotoUrl.trim() : null,
    workPhotoUrls,
    publishedSlug: typeof o.publishedSlug === "string" ? normalizeSlug(o.publishedSlug) : "",
    templateId: parseTemplateId(o.templateId),
    theme: parseTheme(o.theme),
    serviceAreasText: readNestedProfileString(o, "serviceAreasText", "service_areas_text").slice(0, 2000),
    showServiceAreasList: o.showServiceAreasList === true,
    servicesOfferedText: readNestedProfileString(o, "servicesOfferedText", "services_offered_text").slice(0, 2000),
    showServicesOffered: o.showServicesOffered === true,
    showContactForm: o.showContactForm !== false,
    facebookUrl: fb.slice(0, 500),
    instagramUrl: ig.slice(0, 500),
    showSocialLinks: o.showSocialLinks !== false,
    imageSlots,
    scrollBands: scrollBands.length
      ? scrollBands
      : [
          { id: "about", title: "Your Local Professionals", body: "", tone: "dark", enabled: true },
          { id: "services", title: "What We Specialize In", body: "", tone: "light", enabled: true },
        ],
    heroHeadline: readNestedProfileString(o, "heroHeadline", "hero_headline").slice(0, 160),
    ctaLabel: readNestedProfileString(o, "ctaLabel", "cta_label").slice(0, 40) || "Get a Quote",
    customDomain: readNestedProfileString(o, "customDomain", "custom_domain")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .slice(0, 120),
    homeSections,
    subPages: {
      about: {
        enabled: aboutRaw.enabled !== false,
        title: typeof aboutRaw.title === "string" && aboutRaw.title.trim() ? aboutRaw.title.trim().slice(0, 80) : "About Us",
        body: typeof aboutRaw.body === "string" ? aboutRaw.body.trim().slice(0, 8000) : "",
      },
      contact: {
        enabled: contactRaw.enabled !== false,
        title:
          typeof contactRaw.title === "string" && contactRaw.title.trim()
            ? contactRaw.title.trim().slice(0, 80)
            : "Contact Us",
      },
    },
    featureCards: parseContentCards(o.featureCards, 4),
    serviceCards: parseContentCards(o.serviceCards, 6),
    textStyles: parseTextStyles(o.textStyles),
    homeSectionOrder: Array.isArray(o.homeSectionOrder)
      ? (o.homeSectionOrder.filter((x): x is string => typeof x === "string") as BusinessPublicProfileSettings["homeSectionOrder"])
      : base.homeSectionOrder,
    fixedBackground: o.fixedBackground !== false,
    footerCopyright: readNestedProfileString(o, "footerCopyright", "footer_copyright").slice(0, 200),
    showPoweredBy: o.showPoweredBy === true,
  }
}

function parseContentCards(raw: unknown, max: number): Array<{ id: string; title: string; body: string }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ id: string; title: string; body: string }> = []
  for (const item of raw.slice(0, max)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const c = item as Record<string, unknown>
    out.push({
      id: typeof c.id === "string" && c.id.trim() ? c.id.trim().slice(0, 40) : `card_${out.length + 1}`,
      title: typeof c.title === "string" ? c.title.trim().slice(0, 120) : "",
      body: typeof c.body === "string" ? c.body.trim().slice(0, 2000) : "",
    })
  }
  return out
}

function parseTextStyles(raw: unknown): Record<string, Record<string, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, Record<string, string>> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim() || !value || typeof value !== "object" || Array.isArray(value)) continue
    const style: Record<string, string> = {}
    for (const [sk, sv] of Object.entries(value as Record<string, unknown>)) {
      if (typeof sv === "string" && sv.trim()) style[sk] = sv.trim().slice(0, 120)
    }
    if (Object.keys(style).length) out[key.trim().slice(0, 80)] = style
  }
  return out
}

function profileMatchesSlug(row: ProfileRow, slug: string): boolean {
  const settings = parseSettings(row.metadata)
  const published = settings.publishedSlug || slugFromDisplayName(row.display_name ?? "")
  const colSlug = typeof row.business_web_profile_slug === "string" ? normalizeSlug(row.business_web_profile_slug) : ""
  return published === slug || colSlug === slug
}

function isPublishedProfile(row: ProfileRow): boolean {
  return parseSettings(row.metadata).enabled === true
}

function resolvePublicImageUrl(settings: BusinessPublicProfileSettings, metadata: unknown): string | null {
  if (settings.profilePhotoUrl) return settings.profilePhotoUrl
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const o = metadata as Record<string, unknown>
  const company = typeof o[COMPANY_LOGO_META_KEY] === "string" ? o[COMPANY_LOGO_META_KEY].trim() : ""
  return company || null
}

function isMissingSlugColumnError(message: string): boolean {
  return /business_web_profile_slug|column.*does not exist/i.test(message)
}

async function findPublishedProfileBySlug(supabase: SupabaseClient, slug: string): Promise<ProfileRow | null> {
  // Indexed / cheap path only. Never scan profiles+metadata for unknown slugs —
  // public `/{slug}` is a catch-all and bots would burn egress (GB/day).
  const { data: byCol, error: colErr } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("business_web_profile_slug", slug)
    .maybeSingle()

  if (!colErr && byCol?.id) {
    const row = byCol as ProfileRow
    if (isPublishedProfile(row) && profileMatchesSlug(row, slug)) return row
  }

  if (colErr && !isMissingSlugColumnError(colErr.message ?? "")) {
    console.warn("[public-business-profile] slug column lookup", colErr.message)
  }

  const { data: byPublishedSlug, error: pubSlugErr } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .filter("metadata->business_public_profile_v1->>publishedSlug", "eq", slug)
    .eq("metadata->business_public_profile_v1->>enabled", "true")
    .limit(4)

  if (pubSlugErr) {
    console.warn("[public-business-profile] publishedSlug lookup", pubSlugErr.message)
    return null
  }

  for (const row of (byPublishedSlug ?? []) as ProfileRow[]) {
    if (isPublishedProfile(row) && profileMatchesSlug(row, slug)) return row
  }

  return null
}

/** Exported for business profile contact submissions. */
export async function findBusinessProfileOwnerBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ profile: ProfileRow; settings: BusinessPublicProfileSettings } | null> {
  const profile = await findPublishedProfileBySlug(supabase, slug)
  if (!profile?.id) return null
  const settings = parseSettings(profile.metadata)
  if (!settings.enabled) return null
  return { profile, settings }
}

function formatUsPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw.trim()
}

function formatTime12h(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return value
  let hour = Number(m[1])
  const min = m[2]
  const ampm = hour >= 12 ? "PM" : "AM"
  hour = hour % 12
  if (hour === 0) hour = 12
  return `${hour}:${min} ${ampm}`
}

type BusinessHoursRow = { day: string; hours: string }

function formatBusinessHoursForPublic(value: unknown): BusinessHoursRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const input = value as Record<string, { enabled?: boolean; open?: string; close?: string }>
  const out: BusinessHoursRow[] = []
  for (const key of DAY_ORDER) {
    const day = input[key]
    if (!day || day.enabled === false) continue
    const open = typeof day.open === "string" && day.open ? formatTime12h(day.open) : ""
    const close = typeof day.close === "string" && day.close ? formatTime12h(day.close) : ""
    if (!open || !close) continue
    out.push({ day: DAY_LABELS[key], hours: `${open} – ${close}` })
  }
  return out
}

function formatAddressFromProfile(row: ProfileRow): string {
  const stored = typeof row.business_address === "string" ? row.business_address.trim() : ""
  if (stored) return stored
  const lines = [
    typeof row.address_line_1 === "string" ? row.address_line_1.trim() : "",
    typeof row.address_line_2 === "string" ? row.address_line_2.trim() : "",
  ].filter(Boolean)
  const cityStateZip = [
    typeof row.address_city === "string" ? row.address_city.trim() : "",
    typeof row.address_state === "string" ? row.address_state.trim() : "",
    typeof row.address_zip === "string" ? row.address_zip.trim() : "",
  ].filter(Boolean)
  if (cityStateZip.length) lines.push(cityStateZip.join(", "))
  return lines.join("\n")
}

function formatServiceArea(row: ProfileRow): string {
  if (!row.service_radius_enabled) return ""
  const milesRaw = row.service_radius_miles
  const miles = typeof milesRaw === "number" ? milesRaw : typeof milesRaw === "string" ? Number(milesRaw) : NaN
  if (!Number.isFinite(miles) || miles <= 0) return ""
  const place = [row.address_city, row.address_state].filter((x) => typeof x === "string" && x.trim()).join(", ")
  const mileLabel = miles === 1 ? "1 mile" : `${miles} miles`
  return place ? `${mileLabel} radius from ${place}` : `${mileLabel} service radius`
}

async function fetchPublicTwilioPhone(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("client_communication_channels")
    .select("public_address, updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("channel_kind", "voice_sms")
    .order("updated_at", { ascending: false })
    .limit(12)
  if (error) return null
  const rows = (data ?? []) as Array<{ public_address?: string | null }>
  const withPublic = rows.find((r) => typeof r.public_address === "string" && r.public_address.trim())
  const raw = typeof withPublic?.public_address === "string" ? withPublic.public_address.trim() : ""
  return raw ? formatUsPhoneDisplay(raw) : null
}

async function resolveTradesmanBusinessEmail(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data: routeRow } = await supabase
    .from("platform_email_routes")
    .select("local_part")
    .eq("account_id", userId)
    .eq("domain", PLATFORM_EMAIL_ROOT_DOMAIN)
    .eq("route_kind", "customer_primary")
    .maybeSingle()

  let localPart = typeof routeRow?.local_part === "string" ? routeRow.local_part.trim() : ""
  if (!localPart) {
    const channel = await getPrimaryEmailChannelForUser(supabase, userId)
    const pub = typeof channel?.public_address === "string" ? channel.public_address.trim().toLowerCase() : ""
    const suffix = `@${PLATFORM_EMAIL_ROOT_DOMAIN}`
    if (pub.endsWith(suffix)) localPart = pub.slice(0, -suffix.length)
  }
  return localPart ? `${normalizeSlug(localPart)}@${PLATFORM_EMAIL_ROOT_DOMAIN}` : null
}

export async function handlePublicBusinessProfile(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS")
    res.status(405).json({ ok: false, error: "GET only" })
    return
  }

  const slugParam = req.query?.slug
  const slugRaw = typeof slugParam === "string" ? slugParam : Array.isArray(slugParam) ? String(slugParam[0] ?? "") : ""
  const slug = normalizeSlug(slugRaw)
  if (!slug || slug.length < 3) {
    res.setHeader("Cache-Control", "public, max-age=300")
    res.status(400).json({ ok: false, error: "Invalid slug" })
    return
  }

  try {
    let supabase: ReturnType<typeof createServiceSupabase>
    try {
      supabase = createServiceSupabase()
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Server misconfiguration" })
      return
    }

    let profile = await findPublishedProfileBySlug(supabase, slug)
    if (!profile?.id && (slug === "hair-plumbing" || slug === "hairplumbing")) {
      const { data: byEmail } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .ilike("email", "shair@hairplumbing.com")
        .maybeSingle()
      if (byEmail?.id) profile = byEmail as ProfileRow
    }
    if (!profile?.id) {
      // Cache misses briefly so bot scanners don't re-query Supabase every hit.
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300")
      res.status(404).json({ ok: false, error: "Business website not found. Publish it in MyT → Website Builder." })
      return
    }

    const metaRaw =
      profile.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
        ? (profile.metadata as Record<string, unknown>)
        : {}
    const profileEmail = typeof profile.email === "string" ? profile.email.toLowerCase() : ""
    const isHairPlumbing =
      slug === "hair-plumbing" || slug === "hairplumbing" || profileEmail === "shair@hairplumbing.com"
    if (isHairPlumbing && metaRaw.hair_plumbing_site_seed_v !== HAIR_PLUMBING_SITE_SEED_VERSION) {
      const proto = String(req.headers["x-forwarded-proto"] || "https")
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "www.tradesman-us.com")
      const publicOrigin = `${proto}://${host}`.replace(/\/+$/, "")
      try {
        const seeded = await bootstrapHairPlumbingWebsiteIfNeeded(supabase, {
          userId: profile.id,
          slug: (profile.business_web_profile_slug || "").trim() || "hair-plumbing",
          metadata: metaRaw,
          publicOrigin,
        })
        if (seeded) {
          const { data: refreshed } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", profile.id).maybeSingle()
          if (refreshed?.id) profile = refreshed as ProfileRow
        }
      } catch (seedErr) {
        console.error("[public-business-profile] hair plumbing seed", seedErr)
      }
    }

    const settings = parseSettings(profile.metadata)
    if (!settings.enabled) {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120")
      res.status(404).json({ ok: false, error: "This business profile is not published yet." })
      return
    }

    const businessName = (profile.display_name ?? "").trim() || "Business"
    const profilePhotoUrl = resolvePublicImageUrl(settings, profile.metadata)
    const phone = settings.showPhone ? await fetchPublicTwilioPhone(supabase, profile.id) : null
    let email: string | null = null
    if (settings.showEmail) {
      const channel = await getPrimaryEmailChannelForUser(supabase, profile.id)
      const resolved = await resolveOutboundEmailFromAddress(supabase, profile.id, channel)
      email = resolved.trim() || (await resolveTradesmanBusinessEmail(supabase, profile.id))
    }

    const address = settings.showAddress ? formatAddressFromProfile(profile) : null
    const serviceArea = settings.showServiceArea ? formatServiceArea(profile) : null
    const businessHours = settings.showBusinessHours ? formatBusinessHoursForPublic(profile.business_hours) : []

    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600")
    res.status(200).json({
      ok: true,
      slug,
      businessName,
      tagline: settings.tagline.trim() || undefined,
      aboutUs: settings.aboutUs.trim() || undefined,
      profilePhotoUrl: profilePhotoUrl || null,
      workPhotoUrls: settings.workPhotoUrls,
      phone: phone || null,
      email: email || null,
      address: address || null,
      serviceArea: serviceArea || null,
      serviceAreas: settings.showServiceAreasList ? parseListField(settings.serviceAreasText) : [],
      servicesOffered: settings.serviceCards.length
        ? settings.serviceCards.map((c) => c.title).filter(Boolean)
        : settings.showServicesOffered
          ? parseListField(settings.servicesOfferedText)
          : [],
      businessHours,
      templateId: settings.templateId,
      theme: settings.theme,
      showContactForm: settings.showContactForm !== false,
      facebookUrl: settings.showSocialLinks && settings.facebookUrl ? settings.facebookUrl : undefined,
      instagramUrl: settings.showSocialLinks && settings.instagramUrl ? settings.instagramUrl : undefined,
      imageSlots: settings.imageSlots,
      scrollBands: settings.scrollBands,
      heroHeadline: settings.heroHeadline.trim() || undefined,
      ctaLabel: settings.ctaLabel.trim() || undefined,
      customDomain: settings.customDomain.trim() || undefined,
      homeSections: settings.homeSections,
      subPages: settings.subPages,
      featureCards: settings.featureCards.length ? settings.featureCards : undefined,
      serviceCards: settings.serviceCards.length ? settings.serviceCards : undefined,
      textStyles: Object.keys(settings.textStyles).length ? settings.textStyles : undefined,
      homeSectionOrder: settings.homeSectionOrder,
      fixedBackground: settings.fixedBackground !== false,
      footerCopyright: settings.footerCopyright.trim() || undefined,
      showPoweredBy: settings.showPoweredBy === true ? true : undefined,
    })
  } catch (e) {
    console.error("[public-business-profile]", e)
    res.status(500).json({ ok: false, error: "Could not load business profile." })
  }
}
