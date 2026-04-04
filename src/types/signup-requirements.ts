/** platform_settings key for signup field rules + consent flags. */

export const SIGNUP_REQUIREMENTS_KEY = "tradesman_signup_requirements"

export type SignupFieldRequirement = "required" | "optional"

export type SignupBuiltInFieldKey =
  | "email"
  | "password"
  | "display_name"
  | "website_url"
  | "primary_phone"
  | "best_contact_phone"
  | "address"
  | "timezone"

export type SignupCustomField = {
  id: string
  label: string
  required: boolean
}

export type SignupRequirementsValue = {
  fields: Record<SignupBuiltInFieldKey, SignupFieldRequirement>
  custom_fields: SignupCustomField[]
  /** If true, user must check the box to submit (when links are shown). */
  require_terms_ack: boolean
  require_privacy_ack: boolean
  require_sms_consent_ack: boolean
  /** Show legal links on the signup form. */
  show_terms_link: boolean
  show_privacy_link: boolean
  show_sms_consent_link: boolean
}

export const DEFAULT_SIGNUP_REQUIREMENTS: SignupRequirementsValue = {
  fields: {
    email: "required",
    password: "required",
    display_name: "required",
    website_url: "optional",
    primary_phone: "required",
    best_contact_phone: "optional",
    address: "required",
    timezone: "required",
  },
  custom_fields: [],
  require_terms_ack: false,
  require_privacy_ack: false,
  require_sms_consent_ack: false,
  show_terms_link: true,
  show_privacy_link: true,
  show_sms_consent_link: true,
}

const BUILTIN_KEYS: SignupBuiltInFieldKey[] = [
  "email",
  "password",
  "display_name",
  "website_url",
  "primary_phone",
  "best_contact_phone",
  "address",
  "timezone",
]

export function parseSignupRequirements(raw: unknown): SignupRequirementsValue {
  const base: SignupRequirementsValue = {
    fields: { ...DEFAULT_SIGNUP_REQUIREMENTS.fields },
    custom_fields: [],
    require_terms_ack: DEFAULT_SIGNUP_REQUIREMENTS.require_terms_ack,
    require_privacy_ack: DEFAULT_SIGNUP_REQUIREMENTS.require_privacy_ack,
    require_sms_consent_ack: DEFAULT_SIGNUP_REQUIREMENTS.require_sms_consent_ack,
    show_terms_link: DEFAULT_SIGNUP_REQUIREMENTS.show_terms_link,
    show_privacy_link: DEFAULT_SIGNUP_REQUIREMENTS.show_privacy_link,
    show_sms_consent_link: DEFAULT_SIGNUP_REQUIREMENTS.show_sms_consent_link,
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const fieldsRaw = o.fields
  if (fieldsRaw && typeof fieldsRaw === "object" && !Array.isArray(fieldsRaw)) {
    const fr = fieldsRaw as Record<string, unknown>
    for (const key of BUILTIN_KEYS) {
      const v = fr[key]
      if (v === "optional" || v === "required") base.fields[key] = v
    }
  }
  const cf = o.custom_fields
  if (Array.isArray(cf)) {
    base.custom_fields = cf
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null
        const row = item as Record<string, unknown>
        const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : ""
        const label = typeof row.label === "string" ? row.label.trim() : ""
        if (!id || !label) return null
        return { id, label, required: row.required === true }
      })
      .filter(Boolean) as SignupCustomField[]
  }
  if (typeof o.require_terms_ack === "boolean") base.require_terms_ack = o.require_terms_ack
  if (typeof o.require_privacy_ack === "boolean") base.require_privacy_ack = o.require_privacy_ack
  if (typeof o.require_sms_consent_ack === "boolean") base.require_sms_consent_ack = o.require_sms_consent_ack
  if (typeof o.show_terms_link === "boolean") base.show_terms_link = o.show_terms_link
  if (typeof o.show_privacy_link === "boolean") base.show_privacy_link = o.show_privacy_link
  if (typeof o.show_sms_consent_link === "boolean") base.show_sms_consent_link = o.show_sms_consent_link
  return base
}
