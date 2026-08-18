import type { SupabaseClient } from "@supabase/supabase-js"

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

async function uploadFromUrl(
  service: SupabaseClient,
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

/** One-shot Classic site preload for Hair Plumbing (no Design.com chrome). */
export async function bootstrapHairPlumbingWebsiteIfNeeded(
  service: SupabaseClient,
  opts: { userId: string; slug: string; metadata: Record<string, unknown>; publicOrigin: string },
): Promise<boolean> {
  if (opts.metadata.hair_plumbing_site_seeded_at) return false

  const base = opts.publicOrigin.replace(/\/+$/, "")
  const softener = await uploadFromUrl(
    service,
    opts.userId,
    "water-softener.jpg",
    `${base}/seed/hair-plumbing/water-softener.jpg`,
  )
  const repairs = await uploadFromUrl(
    service,
    opts.userId,
    "service-repairs.jpg",
    `${base}/seed/hair-plumbing/service-repairs.jpg`,
  )
  const heater = await uploadFromUrl(
    service,
    opts.userId,
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

  const site = {
    v: 1 as const,
    enabled: true,
    tagline: CONTENT.tagline,
    aboutUs: CONTENT.aboutUs,
    showPhone: true,
    showEmail: true,
    emailSource: "tradesman" as const,
    showAddress: true,
    showServiceArea: false,
    showBusinessHours: true,
    profilePhotoUrl: null,
    workPhotoUrls,
    publishedSlug: opts.slug,
    templateId: "hair_plumbing" as const,
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
        tone: "dark" as const,
        enabled: true,
      },
      { id: "services", title: "What We Specialize In", body: "", tone: "light" as const, enabled: true },
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
    ...opts.metadata,
    business_public_profile_v1: site,
    hosted_website_v1: {
      ...(typeof opts.metadata.hosted_website_v1 === "object" && opts.metadata.hosted_website_v1
        ? (opts.metadata.hosted_website_v1 as Record<string, unknown>)
        : {}),
      hosting: "tradesman",
      siteSlug: opts.slug,
      publicUrl: `${base}/${opts.slug}`,
    },
    hair_plumbing_site_seeded_at: new Date().toISOString(),
  }

  const { error } = await service
    .from("profiles")
    .update({
      metadata: nextMeta,
      business_web_profile_slug: opts.slug,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.userId)
  if (error) throw error
  return true
}
