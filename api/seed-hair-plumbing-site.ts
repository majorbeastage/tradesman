/**
 * Bootstrap Classic website content for Hair Plumbing (shair@hairplumbing.com).
 * Uses service role on Vercel. Idempotent — safe to call multiple times.
 *
 * POST /api/seed-hair-plumbing-site
 * Header: Authorization: Bearer <admin JWT or service role>
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { createServiceSupabase, firstEnv } from "./_communications.js"

const TARGET_EMAIL = "shair@hairplumbing.com"

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
}

function originFromReq(req: VercelRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https"
  const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "www.tradesman-us.com"
  return `${proto}://${host}`.replace(/\/+$/, "")
}

async function assertAdminOrService(req: VercelRequest): Promise<true> {
  const auth = String(req.headers.authorization || "")
  const token = auth.replace(/^Bearer\s+/i, "").trim()
  if (!token) throw new Error("Unauthorized")
  const serviceKey = firstEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (serviceKey && token === serviceKey) return true

  const url = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL")
  const anon = firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
  if (!url || !anon) throw new Error("Supabase not configured")
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) throw new Error("Unauthorized")
  const service = createServiceSupabase()
  const { data: prof } = await service.from("profiles").select("role, email").eq("id", userData.user.id).maybeSingle()
  const role = typeof prof?.role === "string" ? prof.role : ""
  const email = typeof prof?.email === "string" ? prof.email.toLowerCase() : ""
  if (role === "admin" || email === "justin@tradesman-us.com" || email === "joe@tradesman-us.com") return true
  throw new Error("Forbidden")
}

async function uploadFromUrl(
  service: ReturnType<typeof createServiceSupabase>,
  userId: string,
  filename: string,
  sourceUrl: string,
): Promise<string | null> {
  const res = await fetch(sourceUrl)
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  const path = `${userId}/web-profile/hair_${filename}`
  const { error } = await service.storage.from("profile-photos").upload(path, buf, {
    upsert: true,
    contentType: "image/jpeg",
  })
  if (error) throw error
  const { data } = service.storage.from("profile-photos").getPublicUrl(path)
  return data.publicUrl
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })

  try {
    await assertAdminOrService(req)
    const service = createServiceSupabase()
    const { data: profile, error } = await service
      .from("profiles")
      .select("id, email, display_name, metadata, business_web_profile_slug")
      .ilike("email", TARGET_EMAIL)
      .maybeSingle()
    if (error) throw error
    if (!profile?.id) return res.status(404).json({ error: "shair@hairplumbing.com not found" })

    const base = originFromReq(req)
    const softener = await uploadFromUrl(
      service,
      profile.id,
      "water-softener.jpg",
      `${base}/seed/hair-plumbing/water-softener.jpg`,
    )
    const repairs = await uploadFromUrl(
      service,
      profile.id,
      "service-repairs.jpg",
      `${base}/seed/hair-plumbing/service-repairs.jpg`,
    )
    const heater = await uploadFromUrl(
      service,
      profile.id,
      "water-heater.jpg",
      `${base}/seed/hair-plumbing/water-heater.jpg`,
    )

    const workPhotoUrls = [softener, repairs, heater].filter(Boolean) as string[]
    const imageSlots: Record<string, string> = {}
    if (softener) {
      imageSlots.background = softener
      imageSlots.hero = softener
      imageSlots.service_1 = softener
    }
    if (repairs) imageSlots.service_2 = repairs
    if (heater) imageSlots.service_3 = heater

    const slug = (profile.business_web_profile_slug || "hair-plumbing").toLowerCase()
    const prevMeta =
      profile.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
        ? { ...(profile.metadata as Record<string, unknown>) }
        : {}

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
      scrollBands: [
        {
          id: "about",
          title: "Your Local Plumbing Professionals",
          body: CONTENT.aboutUs,
          tone: "dark",
          enabled: true,
        },
        { id: "services", title: "What We Specialize In", body: "", tone: "light", enabled: true },
      ],
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
        ...(typeof prevMeta.hosted_website_v1 === "object" && prevMeta.hosted_website_v1
          ? (prevMeta.hosted_website_v1 as Record<string, unknown>)
          : {}),
        hosting: "tradesman",
        siteSlug: slug,
        publicUrl: `${base}/${slug}`,
      },
      hair_plumbing_site_seeded_at: new Date().toISOString(),
    }

    const { error: upErr } = await service
      .from("profiles")
      .update({
        metadata: nextMeta,
        business_web_profile_slug: slug,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)
    if (upErr) throw upErr

    const { data: channels } = await service
      .from("client_communication_channels")
      .select("channel_kind, public_address, sms_enabled, voice_enabled, email_enabled, forward_to_email, active")
      .eq("user_id", profile.id)
      .eq("active", true)

    const { data: routes } = await service
      .from("platform_email_routes")
      .select("local_part, domain, forward_to_email, route_kind")
      .eq("account_id", profile.id)

    const { data: omAsUser } = await service
      .from("office_manager_clients")
      .select("office_manager_id")
      .eq("user_id", profile.id)
      .maybeSingle()

    return res.status(200).json({
      ok: true,
      userId: profile.id,
      slug,
      publicUrl: `${base}/${slug}`,
      imagesUploaded: workPhotoUrls.length,
      channels,
      emailRoutes: routes,
      shairListedUnderOm: omAsUser?.office_manager_id ?? null,
      note:
        omAsUser?.office_manager_id && omAsUser.office_manager_id !== profile.id
          ? "WARNING: shair is linked as managed client under another OM — SMS may resolve wrong until owner-resolution fix is live."
          : "shair is not redirected via office_manager_clients (good).",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = /Unauthorized|Forbidden/i.test(msg) ? 401 : 500
    console.error("[seed-hair-plumbing-site]", msg)
    return res.status(status).json({ ok: false, error: msg })
  }
}
