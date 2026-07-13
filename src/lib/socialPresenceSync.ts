/** Shared Instagram / Facebook URLs between Growth and public business profile. */

import { GROWTH_METADATA_KEY, type GrowthModuleDoc, type GrowthPresencePages } from "./growthModule"
import {
  BUSINESS_PUBLIC_PROFILE_META_KEY,
  type BusinessPublicProfileSettings,
  parseBusinessPublicProfileSettings,
} from "./businessPublicProfile"

export type SocialPresenceUrls = {
  facebook: string
  instagram: string
}

export function normalizeSocialUrl(raw: string | null | undefined): string {
  const t = (raw ?? "").trim()
  if (!t) return ""
  if (/^https?:\/\//i.test(t)) return t
  if (/^(www\.|facebook\.com|fb\.com|instagram\.com|instagr\.am)/i.test(t)) return `https://${t}`
  return t
}

export function readSocialPresenceFromMetadata(metadata: unknown): SocialPresenceUrls {
  const empty = { facebook: "", instagram: "" }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return empty
  const meta = metadata as Record<string, unknown>

  const bp = parseBusinessPublicProfileSettings(meta)
  const growthRaw = meta[GROWTH_METADATA_KEY]
  const pages =
    growthRaw && typeof growthRaw === "object" && !Array.isArray(growthRaw)
      ? ((growthRaw as GrowthModuleDoc).presencePages ?? {})
      : ({} as GrowthPresencePages)

  return {
    facebook: normalizeSocialUrl(bp.facebookUrl || pages.facebook || ""),
    instagram: normalizeSocialUrl(bp.instagramUrl || pages.instagram || ""),
  }
}

/** Merge social URLs into both business_public_profile_v1 and growth_module_v1.presencePages. */
export function mergeSocialPresenceIntoMetadata(
  prevMeta: Record<string, unknown>,
  patch: Partial<SocialPresenceUrls>,
): Record<string, unknown> {
  const current = readSocialPresenceFromMetadata(prevMeta)
  const next: SocialPresenceUrls = {
    facebook: patch.facebook !== undefined ? normalizeSocialUrl(patch.facebook) : current.facebook,
    instagram: patch.instagram !== undefined ? normalizeSocialUrl(patch.instagram) : current.instagram,
  }

  const bpPrev = parseBusinessPublicProfileSettings(prevMeta)
  const bpNext: BusinessPublicProfileSettings = {
    ...bpPrev,
    facebookUrl: next.facebook,
    instagramUrl: next.instagram,
  }

  const growthRaw = prevMeta[GROWTH_METADATA_KEY]
  const growthPrev =
    growthRaw && typeof growthRaw === "object" && !Array.isArray(growthRaw)
      ? ({ ...(growthRaw as GrowthModuleDoc) } as GrowthModuleDoc)
      : ({ v: 1 } as GrowthModuleDoc)
  const pages: GrowthPresencePages = { ...(growthPrev.presencePages ?? {}) }
  if (next.facebook) pages.facebook = next.facebook
  else delete pages.facebook
  if (next.instagram) pages.instagram = next.instagram
  else delete pages.instagram

  return {
    ...prevMeta,
    [BUSINESS_PUBLIC_PROFILE_META_KEY]: {
      ...bpNext,
      v: 1,
    },
    [GROWTH_METADATA_KEY]: {
      ...growthPrev,
      v: 1,
      presencePages: pages,
    },
  }
}
