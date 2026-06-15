import { DEFAULT_SMS_CONSENT_PAGE, SMS_CONSENT_NOT_REQUIRED_FOR_PURCHASE } from "../types/legal-pages"

export { SMS_CONSENT_NOT_REQUIRED_FOR_PURCHASE }

export const CUSTOMER_SMS_CONSENT_META_KEY = "sms_consent"

/** High-level storage category (carrier / audit). */
export type CustomerSmsConsentSource =
  | "manual_entry"
  | "public_cta"
  | "in_person"
  | "phone_call"
  | "website_form"
  | "other"

/** Required dropdown for manually entered customers — how consent was obtained. */
export type ManualSmsConsentMethod =
  | "signed_paper_form"
  | "in_person_verbal"
  | "phone_call"
  | "business_website"
  | "external_website"
  | "tradesman_cta"
  | "other"

export const MANUAL_SMS_CONSENT_METHOD_OPTIONS: ReadonlyArray<{ value: ManualSmsConsentMethod; label: string }> = [
  { value: "signed_paper_form", label: "Signed paper / printable consent form" },
  { value: "in_person_verbal", label: "In person (verbal agreement)" },
  { value: "phone_call", label: "Phone call (verbal agreement)" },
  { value: "business_website", label: "Our business website (contact form)" },
  { value: "external_website", label: "External website or third-party form" },
  { value: "tradesman_cta", label: "Tradesman website / Google CTA link" },
  { value: "other", label: "Other (describe below)" },
] as const

export type CustomerSmsConsentRecord = {
  at: string
  source: CustomerSmsConsentSource
  consent_method?: ManualSmsConsentMethod
  consent_url?: string
  disclosure_snapshot?: string
  consent_note?: string
}

export type ManualSmsConsentSourceInput = {
  method: ManualSmsConsentMethod | ""
  consentUrl: string
  consentNote: string
}

export const EMPTY_MANUAL_SMS_CONSENT_SOURCE: ManualSmsConsentSourceInput = {
  method: "",
  consentUrl: "",
  consentNote: "",
}

export function buildManualSmsConsentDisclosure(businessName: string): string {
  const biz = businessName.trim() || "Your business"
  return DEFAULT_SMS_CONSENT_PAGE.consent_statement.replace(/\[Business Name\]/g, biz)
}

export function customerSmsConsentCheckboxLabel(_businessName?: string): string {
  return "The customer agrees to receive text messages from the business named above regarding quotes, appointments, scheduling, job updates, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help."
}

function isManualSmsConsentMethod(v: string): v is ManualSmsConsentMethod {
  return MANUAL_SMS_CONSENT_METHOD_OPTIONS.some((o) => o.value === v)
}

export function mapManualMethodToSource(method: ManualSmsConsentMethod): CustomerSmsConsentSource {
  switch (method) {
    case "tradesman_cta":
      return "public_cta"
    case "business_website":
    case "external_website":
      return "website_form"
    case "phone_call":
      return "phone_call"
    case "in_person_verbal":
    case "signed_paper_form":
      return "in_person"
    default:
      return "other"
  }
}

export function manualConsentMethodLabel(method: ManualSmsConsentMethod | undefined): string {
  if (!method) return ""
  return MANUAL_SMS_CONSENT_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method
}

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function isPlausibleUrl(raw: string): boolean {
  const t = normalizeUrl(raw)
  try {
    const u = new URL(t)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

/** Returns an error message, or null when valid. */
export function validateManualSmsConsentSourceInput(input: ManualSmsConsentSourceInput): string | null {
  if (!input.method) return "Select how the customer gave SMS consent."
  if (input.method === "external_website") {
    if (!input.consentUrl.trim()) return "Enter the external website URL where the customer opted in."
    if (!isPlausibleUrl(input.consentUrl)) return "Enter a valid website URL (https://…)."
  }
  if (input.method === "other") {
    if (!input.consentNote.trim()) return "Describe how the customer gave consent (required for Other)."
    if (input.consentNote.trim().length < 8) return "Consent description must be at least 8 characters."
  }
  return null
}

export function buildConsentAuditNote(input: ManualSmsConsentSourceInput): string {
  const label = manualConsentMethodLabel(input.method as ManualSmsConsentMethod)
  const parts = [`Consent method: ${label}`]
  if (input.method === "external_website" && input.consentUrl.trim()) {
    parts.push(`URL: ${normalizeUrl(input.consentUrl)}`)
  }
  if (input.method === "other" && input.consentNote.trim()) {
    parts.push(`Detail: ${input.consentNote.trim()}`)
  }
  if (input.method === "business_website" && input.consentUrl.trim()) {
    parts.push(`Page: ${normalizeUrl(input.consentUrl)}`)
  }
  return parts.join(" · ")
}

export function parseCustomerSmsConsent(metadata: unknown): CustomerSmsConsentRecord | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const raw = (metadata as Record<string, unknown>)[CUSTOMER_SMS_CONSENT_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const at = typeof o.at === "string" ? o.at.trim() : ""
  if (!at) return null
  const source = typeof o.source === "string" ? o.source.trim() : ""
  const allowed: CustomerSmsConsentSource[] = [
    "manual_entry",
    "public_cta",
    "in_person",
    "phone_call",
    "website_form",
    "other",
  ]
  if (!allowed.includes(source as CustomerSmsConsentSource)) return null
  const methodRaw = typeof o.consent_method === "string" ? o.consent_method.trim() : ""
  return {
    at,
    source: source as CustomerSmsConsentSource,
    consent_method: isManualSmsConsentMethod(methodRaw) ? methodRaw : undefined,
    consent_url:
      typeof o.consent_url === "string" && o.consent_url.trim() ? o.consent_url.trim() : undefined,
    disclosure_snapshot:
      typeof o.disclosure_snapshot === "string" && o.disclosure_snapshot.trim()
        ? o.disclosure_snapshot.trim()
        : undefined,
    consent_note:
      typeof o.consent_note === "string" && o.consent_note.trim() ? o.consent_note.trim() : undefined,
  }
}

export function customerHasSmsConsent(metadata: unknown): boolean {
  return parseCustomerSmsConsent(metadata) !== null
}

export function mergeCustomerSmsConsentMetadata(
  metadata: unknown,
  record: CustomerSmsConsentRecord,
): Record<string, unknown> {
  const prev =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {}
  prev[CUSTOMER_SMS_CONSENT_META_KEY] = record
  return prev
}

export function formatCustomerSmsConsentSource(source: CustomerSmsConsentSource): string {
  switch (source) {
    case "manual_entry":
      return "Manual entry"
    case "public_cta":
      return "Website / Google CTA"
    case "in_person":
      return "In person"
    case "phone_call":
      return "Phone call"
    case "website_form":
      return "Website form"
    default:
      return "Other"
  }
}

export function formatCustomerSmsConsentDetail(record: CustomerSmsConsentRecord): string {
  const methodLabel = manualConsentMethodLabel(record.consent_method)
  if (methodLabel) return methodLabel
  return formatCustomerSmsConsentSource(record.source)
}

export async function persistCustomerSmsConsent(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  customerId: string,
  existingMetadata: unknown,
  input: {
    source: CustomerSmsConsentSource
    businessName: string
    consentMethod: ManualSmsConsentMethod
    consentUrl?: string
    consentNote?: string
    at?: string
  },
): Promise<{ metadata: Record<string, unknown>; record: CustomerSmsConsentRecord }> {
  const url =
    input.consentUrl?.trim() &&
    (input.consentMethod === "external_website" || input.consentMethod === "business_website")
      ? normalizeUrl(input.consentUrl)
      : undefined
  const record: CustomerSmsConsentRecord = {
    at: input.at ?? new Date().toISOString(),
    source: input.source,
    consent_method: input.consentMethod,
    consent_url: url,
    disclosure_snapshot: buildManualSmsConsentDisclosure(input.businessName),
    consent_note: input.consentNote?.trim() || undefined,
  }
  const metadata = mergeCustomerSmsConsentMetadata(existingMetadata, record)
  const { error } = await supabase.from("customers").update({ metadata }).eq("id", customerId)
  if (error) throw error
  return { metadata, record }
}

/** True when phone + checkbox + valid consent source are ready (manual entry). */
export function canSubmitManualSmsOptIn(
  phoneEntered: boolean,
  consentChecked: boolean,
  source: ManualSmsConsentSourceInput,
): boolean {
  if (!phoneEntered) return true
  if (!consentChecked) return false
  return validateManualSmsConsentSourceInput(source) === null
}
