/**
 * Public business web profile API — self-contained (no ../src imports) for Vercel serverless.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceSupabase, getPrimaryEmailChannelForUser } from "./_communications.js"

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
}

type ProfileRow = {
  id: string
  display_name?: string | null
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
  "id, display_name, metadata, business_address, address_line_1, address_line_2, address_city, address_state, address_zip, service_radius_enabled, service_radius_miles, business_hours, business_web_profile_slug"

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64)
}

function slugFromDisplayName(displayName: string): string {
  return normalizeSlug(displayName)
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
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>)[BUSINESS_PUBLIC_PROFILE_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return base
  const workPhotoUrls = Array.isArray(o.workPhotoUrls)
    ? o.workPhotoUrls.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 5)
    : []
  return {
    enabled: o.enabled === true,
    tagline: typeof o.tagline === "string" ? o.tagline.slice(0, 120) : "",
    aboutUs: typeof o.aboutUs === "string" ? o.aboutUs.slice(0, 4000) : "",
    showPhone: o.showPhone !== false,
    showEmail: o.showEmail !== false,
    emailSource: o.emailSource === "custom" ? "custom" : "tradesman",
    showAddress: o.showAddress !== false,
    showServiceArea: o.showServiceArea === true,
    showBusinessHours: o.showBusinessHours !== false,
    profilePhotoUrl: typeof o.profilePhotoUrl === "string" && o.profilePhotoUrl.trim() ? o.profilePhotoUrl.trim() : null,
    workPhotoUrls,
    publishedSlug: typeof o.publishedSlug === "string" ? normalizeSlug(o.publishedSlug) : "",
  }
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
  const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).eq("business_web_profile_slug", slug).maybeSingle()

  if (!error && data?.id) return data as ProfileRow

  if (error && !isMissingSlugColumnError(error.message ?? "")) {
    console.warn("[public-business-profile] slug column lookup", error.message)
  }

  const { data: publishedRows, error: pubErr } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .filter("metadata->business_public_profile_v1->>enabled", "eq", "true")
    .limit(200)

  if (pubErr) {
    console.warn("[public-business-profile] metadata enabled lookup", pubErr.message)
    return null
  }

  for (const row of (publishedRows ?? []) as ProfileRow[]) {
    const settings = parseSettings(row.metadata)
    if (!settings.enabled) continue
    const published = settings.publishedSlug || slugFromDisplayName(row.display_name ?? "")
    const colSlug =
      typeof row.business_web_profile_slug === "string" ? normalizeSlug(row.business_web_profile_slug) : ""
    if (published === slug || colSlug === slug) return row
  }

  return null
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

async function resolveCustomDomainBusinessEmail(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data: route } = await supabase
    .from("platform_email_routes")
    .select("local_part, domain, verified_at, route_kind")
    .eq("account_id", userId)
    .eq("route_kind", "customer_custom")
    .not("verified_at", "is", null)
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (
    route?.verified_at &&
    typeof route.local_part === "string" &&
    typeof route.domain === "string" &&
    route.local_part.trim() &&
    route.domain.trim()
  ) {
    return `${route.local_part.trim().toLowerCase()}@${route.domain.trim().toLowerCase()}`
  }
  return null
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

    const profile = await findPublishedProfileBySlug(supabase, slug)
    if (!profile?.id) {
      res.status(404).json({ ok: false, error: "Business profile not found. Publish it in MyT → Business profile / web address." })
      return
    }

    const settings = parseSettings(profile.metadata)
    if (!settings.enabled) {
      res.status(404).json({ ok: false, error: "This business profile is not published yet." })
      return
    }

    const businessName = (profile.display_name ?? "").trim() || "Business"
    const profilePhotoUrl = resolvePublicImageUrl(settings, profile.metadata)
    const phone = settings.showPhone ? await fetchPublicTwilioPhone(supabase, profile.id) : null
    let email: string | null = null
    if (settings.showEmail) {
      email =
        settings.emailSource === "custom"
          ? await resolveCustomDomainBusinessEmail(supabase, profile.id)
          : await resolveTradesmanBusinessEmail(supabase, profile.id)
    }

    const address = settings.showAddress ? formatAddressFromProfile(profile) : null
    const serviceArea = settings.showServiceArea ? formatServiceArea(profile) : null
    const businessHours = settings.showBusinessHours ? formatBusinessHoursForPublic(profile.business_hours) : []

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300")
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
      businessHours,
    })
  } catch (e) {
    console.error("[public-business-profile]", e)
    res.status(500).json({ ok: false, error: "Could not load business profile." })
  }
}
