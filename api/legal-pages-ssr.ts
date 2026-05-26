/**
 * Serverless bundle copy of `src/types/legal-pages.ts` — imported only from `api/_renderPublicLegalHtml.ts`
 * so Vercel always packages this file with the function (avoids missing `../src/...` at runtime).
 * Regenerate after editing the source file: `npm run legal:sync-ssr`
 */
/** Stored in platform_settings for public legal pages. */

export const PRIVACY_SETTINGS_KEY = "tradesman_privacy_policy"
export const TERMS_SETTINGS_KEY = "tradesman_terms"
export const SMS_CONSENT_SETTINGS_KEY = "tradesman_sms_consent"

export type SimpleLegalPage = {
  title: string
  subtitle: string
  /** Main body; line breaks preserved (pre-wrap). */
  body: string
  /** Line above the main title (empty = product default “Tradesman Systems”). */
  hero_kicker?: string
  /** Optional notice card above the main body. */
  notice_title?: string
  notice_body?: string
  /**
   * Optional footer line under the nav links. When empty, the public layout uses its built-in
   * cross-link sentence (Privacy/Terms pages point to SMS; SMS page points to Privacy/Terms).
   */
  footer_note?: string
}

export type SmsConsentLegalPage = SimpleLegalPage & {
  consent_statement: string
  sample_message: string
  /** Shown under the hero subtitle (e.g. “Last updated: …”). */
  hero_last_updated?: string
  /** @deprecated Legacy layout; public page uses structured sections below. */
  details_section_title?: string
  /** @deprecated Legacy layout. */
  consent_section_title?: string
  /** @deprecated Legacy layout. */
  sample_section_title?: string
  /** @deprecated Legacy layout. */
  sample_section_intro?: string
  /** Section 1 — Intro */
  intro?: string
  /** Section 2 — Consent Methods (bullet lines, one per line). */
  consent_methods?: string
  /** Section 4 — Manual Contacts */
  manual_contacts?: string
  /** Section 5 — Messaging Use Cases (bullet lines). */
  messaging_use_cases?: string
  /** Section 6 — STOP / HELP */
  stop_help?: string
  /** Section 7 — Platform Rules */
  platform_rules?: string
  /** Subheading inside CTA Disclosure Example card. */
  cta_disclosure_heading?: string
}

export type SmsConsentSectionKind = "paragraph" | "list" | "disclosure"

export type SmsConsentResolvedSection = {
  title: string
  kind: SmsConsentSectionKind
  /** Optional line before a list or disclosure. */
  lead?: string
  content: string
  subheading?: string
}

const SMS_INTRO_DEFAULT =
  "Tradesman Systems facilitates one-to-one messaging between businesses and their customers for customer support, scheduling, estimates, appointment coordination, job updates, and related service communication."

const SMS_CONSENT_METHODS_LEAD = "Customers may consent to receive SMS messages by:"

const SMS_CONSENT_METHODS_DEFAULT = `• Contacting a business directly through a publicly advertised phone number
• Submitting a website contact form or service request
• Sending an SMS inquiry
• Requesting service in person
• Providing their phone number directly to a business and agreeing to receive communication
• Through direct referral`

const SMS_CTA_DISCLOSURE_DEFAULT = `“By submitting a service request or contacting [Business Name], you agree to receive SMS messages related to your inquiry, scheduling, estimates, job updates, and customer support from [Business Name]. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help.”`

const SMS_MANUAL_CONTACTS_DEFAULT =
  "For manually entered contacts, businesses using the Tradesman Systems platform are required to obtain express customer consent before sending any SMS message."

const SMS_USE_CASES_LEAD = "Messages may include:"

const SMS_USE_CASES_DEFAULT = `• Customer support follow-up
• Appointment reminders and confirmations
• Scheduling coordination
• Job updates and service notifications
• Estimates and account-related communication`

const SMS_STOP_HELP_DEFAULT = `Customers may reply STOP at any time to opt out of SMS messages or HELP for assistance.

Message frequency varies. Message and data rates may apply.`

const SMS_PLATFORM_RULES_DEFAULT =
  "Tradesman Systems does not support bulk messaging or unsolicited outreach. All messaging is intended to be one-to-one and directly related to a customer inquiry or ongoing service."

/** TCPA / A2P — shown on public /sms and related compliance surfaces. */
export const SMS_CONSENT_NOT_REQUIRED_FOR_PURCHASE =
  "Consent to receive SMS messages is not required as a condition of purchasing goods or services."

function pickSmsField(page: SmsConsentLegalPage, key: keyof SmsConsentLegalPage, fallback: string): string {
  const v = page[key]
  return typeof v === "string" && v.trim() ? v.trim() : fallback
}

/** Public /sms page sections in display order. */
export function resolvedSmsConsentSections(page: SmsConsentLegalPage): SmsConsentResolvedSection[] {
  return [
    {
      title: "Intro",
      kind: "paragraph",
      content: pickSmsField(page, "intro", SMS_INTRO_DEFAULT),
    },
    {
      title: "Consent Methods",
      kind: "list",
      lead: SMS_CONSENT_METHODS_LEAD,
      content: pickSmsField(page, "consent_methods", SMS_CONSENT_METHODS_DEFAULT),
    },
    {
      title: "CTA Disclosure Example",
      kind: "disclosure",
      subheading: pickSmsField(page, "cta_disclosure_heading", "Example SMS Consent Disclosure"),
      content: pickSmsField(page, "consent_statement", SMS_CTA_DISCLOSURE_DEFAULT),
    },
    {
      title: "Consent and purchase",
      kind: "paragraph",
      content: SMS_CONSENT_NOT_REQUIRED_FOR_PURCHASE,
    },
    {
      title: "Manual Contacts",
      kind: "paragraph",
      content: pickSmsField(page, "manual_contacts", SMS_MANUAL_CONTACTS_DEFAULT),
    },
    {
      title: "Messaging Use Cases",
      kind: "list",
      lead: SMS_USE_CASES_LEAD,
      content: pickSmsField(page, "messaging_use_cases", SMS_USE_CASES_DEFAULT),
    },
    {
      title: "STOP / HELP",
      kind: "paragraph",
      content: pickSmsField(page, "stop_help", SMS_STOP_HELP_DEFAULT),
    },
    {
      title: "Platform Rules",
      kind: "paragraph",
      content: pickSmsField(page, "platform_rules", SMS_PLATFORM_RULES_DEFAULT),
    },
  ]
}

/** Split multiline bullet text into list items (strips leading • or -). */
export function smsConsentBulletItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[•\-]\s*/, "").trim())
    .filter(Boolean)
}

/** Subtitles saved from early seeds pointed editors at Admin; strip so public pages never show that line. */
export function isAdminSignupRequirementsSubtitlePlaceholder(subtitle: string): boolean {
  return /edit in admin\s*[→-]?\s*sign up requirements/i.test(subtitle.trim())
}

/** Removes legacy in-body acknowledgment some installs pasted from AI drafts (not shown on public pages). */
export function stripLegacyPortalLegalAcknowledgmentParagraph(body: string): string {
  const re =
    /\s*\(?I understand these issues,?\s+and I recognize you are not legally obligated,?\s+liable,?\s+or in lieu of attorney reviews,?\s+and are not bound by law to create legally binding agreements for me\)?\.?\s*/i
  return body.replace(re, "\n\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** Older defaults prefixed bodies with an IMPORTANT / not legal advice block; strip when still present in DB. */
export function stripLegacyImportantLegalNoticePrefix(body: string): string {
  const re =
    /^[\s\n]*IMPORTANT:\s*This text is a starting point for your business and is not legal advice\.\s*A qualified attorney in your jurisdiction should review and customize all policies, fees, and enforcement language before you rely on them with customers, carriers, or courts\.[\s\n]*/i
  return body.replace(re, "").replace(/^\n{2,}/, "\n").trimStart()
}

export const DEFAULT_PRIVACY_PAGE: SimpleLegalPage = {
  title: "Privacy Policy",
  subtitle:
    "A concise summary of how Tradesman Systems collects, uses, and shares information—including SMS and security practices—for our websites and software.",
  body: `Effective date: April 6, 2026

Tradesman Systems (“Company,” “we,” “our,” or “us”) respects your privacy and is committed to protecting it through this Privacy Policy. This Privacy Policy describes what we collect and how we use it when you use our websites, applications, APIs, and related services (the “Services”). By using the Services, you agree to this Policy.

1. Information we collect
We may collect:
• Name, phone number, email address, and business details you provide
• Messages and related content sent through the platform (SMS, email, chat, voicemail where used)
• Usage activity, diagnostics, and system logs
• Device and browser information (for example IP address, device type, cookies or similar technologies)
• Payment-related information as processed by our payment partners (we generally do not store full card numbers on our own servers)
• Information you provide in support tickets, surveys, or similar correspondence

2. How we use information
We use information to:
• Operate, secure, and improve the platform
• Facilitate communication between businesses and their customers
• Send service-related notifications and security alerts
• Detect misuse (including messaging abuse or attempts to circumvent technical limits) and protect users and the Services
• Comply with law and carrier or telecommunications obligations (including SMS programs such as A2P 10DLC where applicable)

3. SMS and communication consent
Customers may receive SMS messages from businesses they interact with using the Tradesman Systems platform.

Customers provide consent by:
• Contacting a business directly, or
• Providing their phone number to a business and agreeing to receive communication

Messages may include service updates, appointment coordination, and customer support communication. Message frequency varies. Message and data rates may apply.

4. Information sharing
We do not sell personal information for monetary value. We may share information with service providers solely to operate the platform and deliver messaging services.

We may share information with businesses using the platform solely for the purpose of facilitating communication with their customers.

We may also share data with service providers for other necessary operations (such as hosting, email, analytics, and payments) under contract; with your organization’s admins or office managers as your settings allow; when required by law or legal process; or as part of a merger, acquisition, or sale of assets subject to this Policy or successor terms. Where state law defines “sale” or “sharing” broadly, see Section 7.

5. Data security
We use reasonable administrative, technical, and organizational safeguards. No transmission over the Internet is completely secure.

6. Data retention
We retain information as needed to provide the Services, comply with law, resolve disputes, and enforce agreements. Some backups or logs may persist for a limited additional period.

7. Your rights
Depending on where you live, you may request access, correction, deletion, or restriction of certain data, or object to some processing. Contact us using the details below. We may verify requests and decline where permitted by law.

8. Third-party services
Third parties may process data as part of delivering the Services; their use is governed by their terms and our agreements with them.

9. International transfers; children’s privacy
If you access the Services from outside the United States, information may be processed in the United States or other countries where we or our providers operate. The Services are not directed to children under 16 (or the age required in your jurisdiction) for marketing or unrelated profiling.

10. Legal entity; changes; contact
Tradesman Systems LLC is a South Carolina limited liability company. “Tradesman Systems” is the trade name we use for the Services, websites, and customer-facing materials.

We may update this Policy and will post the revised version with an updated effective date. Material changes may be communicated through the Services or email where appropriate.

Tradesman Systems — privacy and requests: Admin@tradesman-us.com`,
}

export const DEFAULT_TERMS_PAGE: SimpleLegalPage = {
  title: "Terms & Conditions",
  subtitle:
    "Rules for using Tradesman Systems—messaging and A2P compliance, platform safeguards, enforcement, liability limits, and South Carolina governing law.",
  body: `Effective date: April 6, 2026

These Terms & Conditions (“Terms”) govern your use of the websites, applications, APIs, and related services offered by Tradesman Systems and its affiliates (collectively, “we,” “us,” or “our”) (the “Services”). By registering, clicking accept, or using the Services, you agree on behalf of yourself and any company or entity you represent. If you do not agree, do not use the Services.

1. Use of service
Tradesman Systems provides tools for businesses to manage customer communication, scheduling, quotes, and related operations. Features may change. We do not guarantee uninterrupted or error-free operation.

2. User responsibilities
You agree to provide accurate information, maintain account security, and comply with all applicable laws—including communication, privacy, and telemarketing laws. You are responsible for all activity under your credentials.

3. Messaging compliance
You are solely responsible for lawful messaging: obtaining and documenting consent where required, honoring opt-outs (such as STOP), and complying with the TCPA, CAN-SPAM, telemarketing and carrier rules, and A2P 10DLC registration where applicable. You may only contact individuals consistent with those laws. You may NOT send unsolicited messages; use purchased, scraped, or third-party cold lists to message people who have not consented; send simultaneous bulk SMS to many recipients through the product; or use unapproved third-party tools, scripts, or workarounds to bypass product limits, harvest numbers, forge origin, or evade consent or carrier rules.

4. Platform safeguards
The Services may require consent confirmation and consent-source notes when you manually add contacts, may append compliance footers to certain first outbound SMS (longer or shorter depending on whether the customer has already contacted you on your business line), and may apply character budgets. These safeguards support compliance and deliverability and may change.

5. Enforcement
We may suspend or terminate accounts, remove content, block messages, or restrict capabilities if we reasonably believe you violated these Terms, created security or compliance risk, engaged in fraud or abuse, or if required by law, regulators, or carriers. You may be responsible for fines, penalties, or third-party claims arising from your misuse to the extent permitted by law.

Consent; no verification. Users are solely responsible for ensuring they have proper consent before contacting any individual. Tradesman Systems does not verify consent on behalf of users.

Messaging indemnity. Users agree to indemnify and hold harmless Tradesman Systems from any claims, damages, fines, or penalties resulting from misuse of messaging features or violation of communication laws, to the fullest extent permitted by law.

6. AI features
Where enabled, AI-generated outputs are assistive only. You must review outputs before relying on them with customers or regulators; outputs are not legal advice and may be incorrect for your situation.

7. Disclaimers; limitation of liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND. IN NO EVENT SHALL THE AGGREGATE LIABILITY OF TRADESMAN SYSTEMS ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICES EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICES IN THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS ($100). WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE, DATA, OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS; IN THOSE CASES OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED.

8. Indemnification
To the fullest extent permitted by law, you will defend, indemnify, and hold harmless Tradesman Systems and its affiliates, officers, directors, employees, contractors, carriers, and partners from third-party claims, fines, penalties, losses, and expenses (including reasonable attorneys’ fees) arising from your use of the Services, your data, your communications, your violation of law or third-party rights, or your breach of these Terms—including claims tied to consent, messaging, or circumvention—except to the extent caused by our willful misconduct.

9. Fees; collections
If you subscribe to paid plans, you agree to pay applicable fees and taxes when due. Accounts with unpaid balances may be suspended. Tradesman Systems reserves the right to pursue collection of outstanding fees.

If we suspend or terminate for material breach (including messaging abuse), we may invoice wind-down, administrative, or cancellation amounts as permitted by your plan and law. If we pursue collection or legal action to recover fees or enforce these Terms, you agree to pay reasonable collection costs, court costs, and attorneys’ fees to the extent permitted by law.

10. Service availability; modifications
Service may be interrupted for maintenance or reasons beyond our reasonable control. We may modify these Terms by posting updates; continued use after the effective date constitutes acceptance where permitted by law.

11. Governing law and venue
Legal entity. Tradesman Systems LLC is a South Carolina limited liability company doing business as Tradesman Systems. It is the contracting party for the Services.

These Terms are governed by the laws of the State of South Carolina, USA, excluding conflict-of-law rules, unless mandatory local law requires otherwise. You consent to exclusive jurisdiction and venue in the state and federal courts located in South Carolina, except where prohibited; we may seek injunctive or equitable relief in any court of competent jurisdiction.

12. Miscellaneous; contact
If a provision is unenforceable, the remainder stays in effect. These Terms are the entire agreement regarding the Services to the extent stated here. Legal and billing notices: Admin@tradesman-us.com`,
}

export const DEFAULT_SMS_CONSENT_PAGE: SmsConsentLegalPage = {
  title: "SMS Consent and Messaging Terms",
  subtitle: "",
  hero_last_updated: "",
  notice_title: "",
  notice_body: "",
  consent_statement: SMS_CTA_DISCLOSURE_DEFAULT,
  sample_message: "",
  body: "",
  intro: SMS_INTRO_DEFAULT,
  consent_methods: SMS_CONSENT_METHODS_DEFAULT,
  manual_contacts: SMS_MANUAL_CONTACTS_DEFAULT,
  messaging_use_cases: SMS_USE_CASES_DEFAULT,
  stop_help: SMS_STOP_HELP_DEFAULT,
  platform_rules: SMS_PLATFORM_RULES_DEFAULT,
  cta_disclosure_heading: "Example SMS Consent Disclosure",
}

function pickOptionalString(o: Record<string, unknown>, key: string): string | undefined {
  if (!(key in o)) return undefined
  return typeof o[key] === "string" ? (o[key] as string) : undefined
}

export function parseSimpleLegalPage(raw: unknown, fallback: SimpleLegalPage): SimpleLegalPage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback }
  const o = raw as Record<string, unknown>
  let subtitle = fallback.subtitle
  if ("subtitle" in o) {
    const rawSubtitle = typeof o.subtitle === "string" ? o.subtitle.trim() : ""
    subtitle = isAdminSignupRequirementsSubtitlePlaceholder(rawSubtitle) ? fallback.subtitle : rawSubtitle
  }
  const rawBody = typeof o.body === "string" && o.body.trim() ? o.body : fallback.body
  const body = stripLegacyImportantLegalNoticePrefix(stripLegacyPortalLegalAcknowledgmentParagraph(rawBody))
  return {
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : fallback.title,
    subtitle,
    body,
    hero_kicker: pickOptionalString(o, "hero_kicker") ?? fallback.hero_kicker,
    notice_title: pickOptionalString(o, "notice_title") ?? fallback.notice_title,
    notice_body: pickOptionalString(o, "notice_body") ?? fallback.notice_body,
    footer_note: pickOptionalString(o, "footer_note") ?? fallback.footer_note,
  }
}

export function parseSmsConsentLegalPage(raw: unknown, fallback: SmsConsentLegalPage): SmsConsentLegalPage {
  const base = parseSimpleLegalPage(raw, fallback) as SmsConsentLegalPage
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback }
  const o = raw as Record<string, unknown>
  return {
    ...base,
    consent_statement:
      typeof o.consent_statement === "string" && o.consent_statement.trim()
        ? o.consent_statement
        : fallback.consent_statement,
    sample_message:
      typeof o.sample_message === "string" && o.sample_message.trim() ? o.sample_message : fallback.sample_message,
    hero_last_updated: pickOptionalString(o, "hero_last_updated") ?? fallback.hero_last_updated,
    details_section_title: pickOptionalString(o, "details_section_title") ?? fallback.details_section_title,
    consent_section_title: pickOptionalString(o, "consent_section_title") ?? fallback.consent_section_title,
    sample_section_title: pickOptionalString(o, "sample_section_title") ?? fallback.sample_section_title,
    sample_section_intro: pickOptionalString(o, "sample_section_intro") ?? fallback.sample_section_intro,
    intro: pickOptionalString(o, "intro") ?? fallback.intro,
    consent_methods: pickOptionalString(o, "consent_methods") ?? fallback.consent_methods,
    manual_contacts: pickOptionalString(o, "manual_contacts") ?? fallback.manual_contacts,
    messaging_use_cases: pickOptionalString(o, "messaging_use_cases") ?? fallback.messaging_use_cases,
    stop_help: pickOptionalString(o, "stop_help") ?? fallback.stop_help,
    platform_rules: pickOptionalString(o, "platform_rules") ?? fallback.platform_rules,
    cta_disclosure_heading: pickOptionalString(o, "cta_disclosure_heading") ?? fallback.cta_disclosure_heading,
  }
}

const DEFAULT_HERO_KICKER = "Tradesman Systems"

export function resolvedLegalHeroKicker(page: SimpleLegalPage): string {
  const t = (page.hero_kicker ?? "").trim()
  return t || DEFAULT_HERO_KICKER
}

export function resolvedSmsDetailsSectionTitle(page: SmsConsentLegalPage): string {
  return (page.details_section_title ?? "").trim() || "Details"
}

export function resolvedSmsConsentSectionTitle(page: SmsConsentLegalPage): string {
  return (page.consent_section_title ?? "").trim() || "Consent language (opt-in disclosure)"
}

export function resolvedSmsSampleSectionTitle(page: SmsConsentLegalPage): string {
  return (page.sample_section_title ?? "").trim() || "Sample messages (examples)"
}

/** True when the optional notice card should render (both empty → hidden). */
export function smsNoticeCardVisible(page: SmsConsentLegalPage): boolean {
  return Boolean((page.notice_title ?? "").trim() || (page.notice_body ?? "").trim())
}
