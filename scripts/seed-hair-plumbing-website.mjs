/**
 * One-off: preload shair@hairplumbing.com Classic website from the live Hair Plumbing Vercel content.
 * Usage: node scripts/seed-hair-plumbing-website.mjs
 * Reads secrets from .env.production.local (vercel env pull) — never commit that file.
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    // Never overwrite a real env value with an empty pull artifact.
    if (!val) continue
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvFile(resolve(process.cwd(), ".env.production.local"))

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
const EMAIL = "shair@hairplumbing.com"
const ASSET_ROOT = resolve(process.env.USERPROFILE || "", "hair-plumbing", "assets", "images")

const CONTENT = {
  heroHeadline: "Expert Plumbers\nQuality Service",
  tagline: "HONEST WORK AT A FAIR PRICE",
  aboutUs:
    "As a leading plumbing company, we offer a wide range of services, including drain cleaning, water softeners, and water heater repair, and our skilled technicians are dedicated to providing efficient and reliable solutions for all your plumbing needs.",
  ctaLabel: "Get a Quote",
  footerCopyright: "© Hair Plumbing. All rights reserved.",
  featureCards: [
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
  ],
  serviceCards: [
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
  ],
  scrollBands: [
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
  ],
}

async function uploadImage(userId, filename, contentType) {
  const full = resolve(ASSET_ROOT, filename)
  if (!existsSync(full)) {
    console.warn("Missing asset", full)
    return null
  }
  const buf = readFileSync(full)
  const path = `${userId}/web-profile/hair_${filename}`
  const { error } = await sb.storage.from("profile-photos").upload(path, buf, {
    upsert: true,
    contentType,
  })
  if (error) throw error
  const { data } = sb.storage.from("profile-photos").getPublicUrl(path)
  return data.publicUrl
}

async function main() {
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, email, display_name, metadata, business_web_profile_slug, primary_phone, best_contact_phone")
    .ilike("email", EMAIL)
    .maybeSingle()
  if (error) throw error
  if (!profile?.id) {
    console.error("Profile not found for", EMAIL)
    process.exit(1)
  }

  console.log("Found", profile.email, profile.id)

  const softener = await uploadImage(profile.id, "water-softener.jpg", "image/jpeg")
  const repairs = await uploadImage(profile.id, "service-repairs.jpg", "image/jpeg")
  const heater = await uploadImage(profile.id, "water-heater.jpg", "image/jpeg")
  console.log("Uploaded images", { softener: !!softener, repairs: !!repairs, heater: !!heater })

  const workPhotoUrls = [softener, repairs, heater].filter(Boolean)
  const imageSlots = {
    background: softener || undefined,
    hero: softener || undefined,
    service_1: softener || undefined,
    service_2: repairs || undefined,
    service_3: heater || undefined,
  }

  const prevMeta =
    profile.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
      ? { ...(profile.metadata) }
      : {}

  const slug = (profile.business_web_profile_slug || "hair-plumbing").toLowerCase()

  const site = {
    v: 1,
    enabled: true,
    tagline: CONTENT.tagline,
    aboutUs: CONTENT.aboutUs,
    showPhone: true,
    showEmail: true,
    emailSource: "tradesman",
    showAddress: true,
    showServiceArea: false,
    showBusinessHours: true,
    profilePhotoUrl: null,
    workPhotoUrls,
    publishedSlug: slug,
    templateId: "hair_plumbing",
    theme: {
      primaryColor: "#111111",
      secondaryColor: "#000000",
      fieldBackgroundColor: "#ffffff",
      fontColor: "#0f172a",
      accentColor: "#c81e1e",
    },
    serviceAreasText: "",
    showServiceAreasList: false,
    servicesOfferedText: CONTENT.serviceCards.map((c) => c.title).join(", "),
    showServicesOffered: true,
    showContactForm: true,
    facebookUrl: "",
    instagramUrl: "",
    showSocialLinks: true,
    imageSlots,
    scrollBands: CONTENT.scrollBands,
    heroHeadline: CONTENT.heroHeadline,
    ctaLabel: CONTENT.ctaLabel,
    customDomain: "",
    homeSections: {
      hero: true,
      about_band: true,
      services_band: true,
      gallery: false,
      areas_hours: false,
      contact_home: true,
      sticky_cta: true,
    },
    subPages: {
      about: { enabled: true, title: "About Us", body: CONTENT.aboutUs },
      contact: { enabled: true, title: "Contact Hair Plumbing" },
    },
    featureCards: CONTENT.featureCards,
    serviceCards: CONTENT.serviceCards,
    textStyles: {},
    homeSectionOrder: ["hero", "about_band", "services_band", "gallery", "areas_hours", "contact_home", "sticky_cta"],
    fixedBackground: true,
    footerCopyright: CONTENT.footerCopyright,
    showPoweredBy: false,
  }

  const nextMeta = {
    ...prevMeta,
    business_public_profile_v1: site,
    hosted_website_v1: {
      ...(typeof prevMeta.hosted_website_v1 === "object" && prevMeta.hosted_website_v1 ? prevMeta.hosted_website_v1 : {}),
      hosting: "tradesman",
      siteSlug: slug,
      publicUrl: `https://www.tradesman-us.com/${slug}`,
    },
  }

  const { error: upErr } = await sb
    .from("profiles")
    .update({
      metadata: nextMeta,
      business_web_profile_slug: slug,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id)
  if (upErr) throw upErr

  console.log("Website metadata saved. Public URL slug:", slug)

  // Communications diagnostics
  const { data: channels, error: chErr } = await sb
    .from("client_communication_channels")
    .select("id, channel_kind, public_address, sms_enabled, voice_enabled, email_enabled, forward_to_email, active")
    .eq("user_id", profile.id)
    .eq("active", true)
  if (chErr) throw chErr
  console.log("Active channels:", JSON.stringify(channels, null, 2))

  const { data: routes } = await sb
    .from("platform_email_routes")
    .select("local_part, domain, forward_to_email, route_kind")
    .eq("account_id", profile.id)
  console.log("Email routes:", JSON.stringify(routes, null, 2))

  const { data: omLinks } = await sb
    .from("office_manager_clients")
    .select("user_id, office_manager_id")
    .or(`user_id.eq.${profile.id},office_manager_id.eq.${profile.id}`)
  console.log("OM links involving shair:", JSON.stringify(omLinks, null, 2))

  // Team member bhair
  const { data: bhair } = await sb.from("profiles").select("id, email, role").ilike("email", "bhair@hairplumbing.com").maybeSingle()
  if (bhair?.id) {
    const { data: bhairLink } = await sb
      .from("office_manager_clients")
      .select("office_manager_id")
      .eq("user_id", bhair.id)
      .maybeSingle()
    console.log("bhair OM resolves to:", bhairLink?.office_manager_id, "expected shair:", profile.id)
  }

  console.log("Done.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
