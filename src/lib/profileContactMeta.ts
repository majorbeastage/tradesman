export const PROFILE_CONTACT_META_KEYS = {
  firstName: "contact_first_name",
  lastName: "contact_last_name",
  companyLogoUrl: "company_logo_url",
  profilePhotoUrl: "profile_photo_url",
} as const

export type ProfileContactFields = {
  firstName: string
  lastName: string
  companyLogoUrl: string | null
  profilePhotoUrl: string | null
}

export function parseProfileContactFields(metadata: unknown): ProfileContactFields {
  const base: ProfileContactFields = {
    firstName: "",
    lastName: "",
    companyLogoUrl: null,
    profilePhotoUrl: null,
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const o = metadata as Record<string, unknown>
  const readStr = (key: string) => (typeof o[key] === "string" ? o[key].trim() : "")
  const readUrl = (key: string) => {
    const v = o[key]
    return typeof v === "string" && v.trim() ? v.trim() : null
  }
  return {
    firstName: readStr(PROFILE_CONTACT_META_KEYS.firstName),
    lastName: readStr(PROFILE_CONTACT_META_KEYS.lastName),
    companyLogoUrl: readUrl(PROFILE_CONTACT_META_KEYS.companyLogoUrl),
    profilePhotoUrl: readUrl(PROFILE_CONTACT_META_KEYS.profilePhotoUrl) ?? readUrl("profile_photo_url"),
  }
}

export function mergeProfileContactMetadata(
  prevMeta: Record<string, unknown>,
  fields: Pick<ProfileContactFields, "firstName" | "lastName"> & { companyLogoUrl?: string | null },
): Record<string, unknown> {
  const next = { ...prevMeta }
  next[PROFILE_CONTACT_META_KEYS.firstName] = fields.firstName.trim()
  next[PROFILE_CONTACT_META_KEYS.lastName] = fields.lastName.trim()
  if (fields.companyLogoUrl !== undefined) {
    if (fields.companyLogoUrl) next[PROFILE_CONTACT_META_KEYS.companyLogoUrl] = fields.companyLogoUrl
    else delete next[PROFILE_CONTACT_META_KEYS.companyLogoUrl]
  }
  return next
}

export function formatPersonName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
}

export function resolvePublicBusinessProfileImageUrl(
  webProfileSettings: { profilePhotoUrl: string | null },
  profileMeta: unknown,
): string | null {
  if (webProfileSettings.profilePhotoUrl) return webProfileSettings.profilePhotoUrl
  const contact = parseProfileContactFields(profileMeta)
  return contact.companyLogoUrl ?? contact.profilePhotoUrl
}
