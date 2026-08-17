import type {
  BusinessPublicProfileSettings,
  WebsiteHomeSectionId,
  WebsiteTextStyle,
  WebsiteTextStyles,
} from "./businessPublicProfile"
import { WEBSITE_HOME_SECTION_OPTIONS } from "./businessPublicProfile"

/** Stable ids for click-to-edit targets on the Classic / showcase canvas. */
export type WebsiteEditTargetId =
  | "hero.headline"
  | "hero.tagline"
  | "hero.cta"
  | "band.about.title"
  | "band.about.body"
  | "band.services.title"
  | `feature.${number}.title`
  | `feature.${number}.body`
  | `service.${number}.title`
  | `service.${number}.body`
  | "about_page.title"
  | "about_page.body"
  | "contact_page.title"
  | "section.hero"
  | "section.about_band"
  | "section.services_band"
  | "section.gallery"
  | "section.areas_hours"
  | "section.contact_home"
  | "section.sticky_cta"
  | "slot.background"
  | "slot.feature_1"
  | "slot.feature_2"
  | "slot.service_1"
  | "slot.service_2"
  | "slot.service_3"

export type WebsiteEditTargetKind = "text" | "section" | "image"

export type WebsiteEditTargetMeta = {
  id: WebsiteEditTargetId
  kind: WebsiteEditTargetKind
  label: string
}

export const WEBSITE_EDIT_TARGET_META: Partial<Record<WebsiteEditTargetId, WebsiteEditTargetMeta>> = {
  "hero.headline": { id: "hero.headline", kind: "text", label: "Hero headline" },
  "hero.tagline": { id: "hero.tagline", kind: "text", label: "Accent tagline" },
  "hero.cta": { id: "hero.cta", kind: "text", label: "Quote button" },
  "band.about.title": { id: "band.about.title", kind: "text", label: "About heading" },
  "band.about.body": { id: "band.about.body", kind: "text", label: "About body" },
  "band.services.title": { id: "band.services.title", kind: "text", label: "Services heading" },
  "about_page.title": { id: "about_page.title", kind: "text", label: "About page title" },
  "about_page.body": { id: "about_page.body", kind: "text", label: "About page body" },
  "contact_page.title": { id: "contact_page.title", kind: "text", label: "Contact page title" },
  "section.hero": { id: "section.hero", kind: "section", label: "Hero" },
  "section.about_band": { id: "section.about_band", kind: "section", label: "About bar" },
  "section.services_band": { id: "section.services_band", kind: "section", label: "Services bar" },
  "section.gallery": { id: "section.gallery", kind: "section", label: "Gallery" },
  "section.areas_hours": { id: "section.areas_hours", kind: "section", label: "Areas & hours" },
  "section.contact_home": { id: "section.contact_home", kind: "section", label: "Contact on home" },
  "section.sticky_cta": { id: "section.sticky_cta", kind: "section", label: "Mobile call bar" },
  "slot.background": { id: "slot.background", kind: "image", label: "Background photo" },
  "slot.feature_1": { id: "slot.feature_1", kind: "image", label: "Feature image 1" },
  "slot.feature_2": { id: "slot.feature_2", kind: "image", label: "Feature image 2" },
  "slot.service_1": { id: "slot.service_1", kind: "image", label: "Service photo 1" },
  "slot.service_2": { id: "slot.service_2", kind: "image", label: "Service photo 2" },
  "slot.service_3": { id: "slot.service_3", kind: "image", label: "Service photo 3" },
}

export function websiteEditTargetLabel(id: string): string {
  const known = WEBSITE_EDIT_TARGET_META[id as WebsiteEditTargetId]
  if (known) return known.label
  const feature = /^feature\.(\d+)\.(title|body)$/.exec(id)
  if (feature) return `Feature ${Number(feature[1]) + 1} ${feature[2]}`
  const service = /^service\.(\d+)\.(title|body)$/.exec(id)
  if (service) return `Service ${Number(service[1]) + 1} ${service[2]}`
  return id
}

export function websiteEditTargetKind(id: string): WebsiteEditTargetKind {
  if (id.startsWith("section.")) return "section"
  if (id.startsWith("slot.")) return "image"
  return "text"
}

export function getWebsiteTextValue(settings: BusinessPublicProfileSettings, targetId: string): string {
  switch (targetId) {
    case "hero.headline":
      return settings.heroHeadline
    case "hero.tagline":
      return settings.tagline
    case "hero.cta":
      return settings.ctaLabel
    case "band.about.title":
      return settings.scrollBands.find((b) => b.id === "about")?.title ?? ""
    case "band.about.body":
      return settings.scrollBands.find((b) => b.id === "about")?.body || settings.aboutUs
    case "band.services.title":
      return settings.scrollBands.find((b) => b.id === "services")?.title ?? ""
    case "about_page.title":
      return settings.subPages.about.title
    case "about_page.body":
      return settings.subPages.about.body || settings.aboutUs
    case "contact_page.title":
      return settings.subPages.contact.title
    default:
      break
  }
  const feature = /^feature\.(\d+)\.(title|body)$/.exec(targetId)
  if (feature) {
    const idx = Number(feature[1])
    const card = settings.featureCards[idx]
    return feature[2] === "title" ? card?.title ?? "" : card?.body ?? ""
  }
  const service = /^service\.(\d+)\.(title|body)$/.exec(targetId)
  if (service) {
    const idx = Number(service[1])
    const card = settings.serviceCards[idx]
    return service[2] === "title" ? card?.title ?? "" : card?.body ?? ""
  }
  return ""
}

export function setWebsiteTextValue(
  settings: BusinessPublicProfileSettings,
  targetId: string,
  value: string,
): BusinessPublicProfileSettings {
  switch (targetId) {
    case "hero.headline":
      return { ...settings, heroHeadline: value }
    case "hero.tagline":
      return { ...settings, tagline: value.slice(0, 120) }
    case "hero.cta":
      return { ...settings, ctaLabel: value.slice(0, 40) }
    case "band.about.title":
    case "band.about.body": {
      const scrollBands = settings.scrollBands.map((b) => {
        if (b.id !== "about") return b
        if (targetId === "band.about.title") return { ...b, title: value.slice(0, 120) }
        return { ...b, body: value.slice(0, 2000) }
      })
      return {
        ...settings,
        scrollBands,
        aboutUs: targetId === "band.about.body" ? value.slice(0, 4000) : settings.aboutUs,
      }
    }
    case "band.services.title": {
      const scrollBands = settings.scrollBands.map((b) =>
        b.id === "services" ? { ...b, title: value.slice(0, 120) } : b,
      )
      return { ...settings, scrollBands }
    }
    case "about_page.title":
      return {
        ...settings,
        subPages: { ...settings.subPages, about: { ...settings.subPages.about, title: value.slice(0, 80) } },
      }
    case "about_page.body":
      return {
        ...settings,
        subPages: { ...settings.subPages, about: { ...settings.subPages.about, body: value.slice(0, 8000) } },
      }
    case "contact_page.title":
      return {
        ...settings,
        subPages: { ...settings.subPages, contact: { ...settings.subPages.contact, title: value.slice(0, 80) } },
      }
    default:
      break
  }
  const feature = /^feature\.(\d+)\.(title|body)$/.exec(targetId)
  if (feature) {
    const idx = Number(feature[1])
    const featureCards = settings.featureCards.map((c, i) => {
      if (i !== idx) return c
      return feature[2] === "title"
        ? { ...c, title: value.slice(0, 120) }
        : { ...c, body: value.slice(0, 2000) }
    })
    return { ...settings, featureCards }
  }
  const service = /^service\.(\d+)\.(title|body)$/.exec(targetId)
  if (service) {
    const idx = Number(service[1])
    const serviceCards = settings.serviceCards.map((c, i) => {
      if (i !== idx) return c
      return service[2] === "title"
        ? { ...c, title: value.slice(0, 120) }
        : { ...c, body: value.slice(0, 2000) }
    })
    const servicesOfferedText = serviceCards.map((c) => c.title).filter(Boolean).join(", ")
    return { ...settings, serviceCards, servicesOfferedText, showServicesOffered: true }
  }
  return settings
}

export function patchWebsiteTextStyle(
  styles: WebsiteTextStyles,
  targetId: string,
  patch: Partial<WebsiteTextStyle>,
): WebsiteTextStyles {
  const prev = styles[targetId] ?? {}
  const next = { ...prev, ...patch }
  for (const key of Object.keys(next) as (keyof WebsiteTextStyle)[]) {
    if (next[key] === undefined || next[key] === "") delete next[key]
  }
  const out = { ...styles }
  if (Object.keys(next).length === 0) delete out[targetId]
  else out[targetId] = next
  return out
}

export function sectionIdFromEditTarget(targetId: string): WebsiteHomeSectionId | null {
  if (!targetId.startsWith("section.")) return null
  const id = targetId.slice("section.".length) as WebsiteHomeSectionId
  return WEBSITE_HOME_SECTION_OPTIONS.some((o) => o.id === id) ? id : null
}

export function hideSectionFromSettings(
  settings: BusinessPublicProfileSettings,
  sectionId: WebsiteHomeSectionId,
): BusinessPublicProfileSettings {
  return {
    ...settings,
    homeSections: { ...settings.homeSections, [sectionId]: false },
  }
}

export function showSectionInSettings(
  settings: BusinessPublicProfileSettings,
  sectionId: WebsiteHomeSectionId,
): BusinessPublicProfileSettings {
  return {
    ...settings,
    homeSections: { ...settings.homeSections, [sectionId]: true },
  }
}
