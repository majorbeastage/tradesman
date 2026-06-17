/**
 * Onboarding materials (server copy — keep in sync with src/types/onboarding-materials.ts).
 */
export const ONBOARDING_MATERIALS_KEY = "tradesman_onboarding_materials"

export type OnboardingMaterialLink = {
  title: string
  url: string
  description: string
}

export type OnboardingMaterialsValue = {
  welcome_subject: string
  welcome_intro: string
  links: OnboardingMaterialLink[]
  sms_cta_url: string
  onboarding_phone_request_email: string
  google_business_profile_url: string
  sms_consent_guide_url: string
}

export const DEFAULT_ONBOARDING_MATERIALS: OnboardingMaterialsValue = {
  welcome_subject: "Welcome to Tradesman — your onboarding checklist",
  welcome_intro:
    "Thank you for signing up. Complete these steps to go live with SMS, voice, and customer communications.",
  sms_cta_url: "https://tradesman-us.vercel.app/sms-cta",
  onboarding_phone_request_email: "admin@tradesman-us.com",
  google_business_profile_url: "https://business.google.com/",
  sms_consent_guide_url: "https://tradesman-us.vercel.app/sms-consent",
  links: [
    {
      title: "SMS consent & CTA page",
      url: "https://tradesman-us.vercel.app/sms-cta",
      description: "Host this page and link it from your website for A2P compliance.",
    },
    {
      title: "Request onboarding phone number",
      url: "mailto:admin@tradesman-us.com?subject=Tradesman%20onboarding%20phone%20number",
      description: "We will buy a new Twilio number or port your existing number.",
    },
    {
      title: "Google Business Profile — add your Tradesman number",
      url: "https://business.google.com/",
      description: "Update your advertised phone number after your Tradesman line is active.",
    },
    {
      title: "SMS opt-in wording guide",
      url: "https://tradesman-us.vercel.app/sms-consent",
      description: "Sample consent language for forms and estimates.",
    },
  ],
}

export function parseOnboardingMaterials(raw: unknown): OnboardingMaterialsValue {
  const base = { ...DEFAULT_ONBOARDING_MATERIALS, links: [...DEFAULT_ONBOARDING_MATERIALS.links] }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  if (typeof o.welcome_subject === "string" && o.welcome_subject.trim()) base.welcome_subject = o.welcome_subject.trim()
  if (typeof o.welcome_intro === "string" && o.welcome_intro.trim()) base.welcome_intro = o.welcome_intro.trim()
  if (typeof o.sms_cta_url === "string" && o.sms_cta_url.trim()) base.sms_cta_url = o.sms_cta_url.trim()
  if (typeof o.onboarding_phone_request_email === "string" && o.onboarding_phone_request_email.trim()) {
    base.onboarding_phone_request_email = o.onboarding_phone_request_email.trim()
  }
  if (typeof o.google_business_profile_url === "string" && o.google_business_profile_url.trim()) {
    base.google_business_profile_url = o.google_business_profile_url.trim()
  }
  if (typeof o.sms_consent_guide_url === "string" && o.sms_consent_guide_url.trim()) {
    base.sms_consent_guide_url = o.sms_consent_guide_url.trim()
  }
  if (Array.isArray(o.links)) {
    const links: OnboardingMaterialLink[] = []
    for (const item of o.links) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const row = item as Record<string, unknown>
      const title = typeof row.title === "string" ? row.title.trim() : ""
      const url = typeof row.url === "string" ? row.url.trim() : ""
      const description = typeof row.description === "string" ? row.description.trim() : ""
      if (title && url) links.push({ title, url, description })
    }
    if (links.length) base.links = links
  }
  return base
}

export function buildOnboardingWelcomeEmailText(params: {
  displayName: string
  materials: OnboardingMaterialsValue
}): { subject: string; text: string } {
  const lines = [
    `Hi ${params.displayName},`,
    "",
    params.materials.welcome_intro,
    "",
    "Onboarding checklist:",
    "",
  ]
  for (const link of params.materials.links) {
    lines.push(`• ${link.title}`)
    if (link.description) lines.push(`  ${link.description}`)
    lines.push(`  ${link.url}`)
    lines.push("")
  }
  lines.push("SMS-CTA page:", params.materials.sms_cta_url)
  lines.push("")
  lines.push(
    "Onboarding phone number (new Twilio number or port your existing line):",
    `mailto:${params.materials.onboarding_phone_request_email}?subject=Tradesman%20onboarding%20phone%20number`,
  )
  lines.push("")
  lines.push("Google Business Profile:", params.materials.google_business_profile_url)
  lines.push("")
  lines.push("SMS consent wording:", params.materials.sms_consent_guide_url)
  lines.push("")
  lines.push("— Tradesman Systems")
  return { subject: params.materials.welcome_subject, text: lines.join("\n") }
}
