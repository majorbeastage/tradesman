/** Stored in platform_settings for public legal pages. */

export const PRIVACY_SETTINGS_KEY = "tradesman_privacy_policy"
export const TERMS_SETTINGS_KEY = "tradesman_terms"
export const SMS_CONSENT_SETTINGS_KEY = "tradesman_sms_consent"

export type SimpleLegalPage = {
  title: string
  subtitle: string
  /** Main body; line breaks preserved (pre-wrap). */
  body: string
}

export type SmsConsentLegalPage = SimpleLegalPage & {
  consent_statement: string
  sample_message: string
}

export const DEFAULT_PRIVACY_PAGE: SimpleLegalPage = {
  title: "Privacy Policy",
  subtitle:
    "Replace the placeholder sections below with your final privacy policy. This URL is intended for use at https://www.tradesman-us.com/privacy once this app is served on that domain.",
  body: `[Add date] Last updated.

Tradesman ("we," "us," or "our") respects your privacy. This policy describes how we collect, use, and protect information when you use our services. Edit this introduction and all sections below to match your actual practices and legal review.

1. Information we collect
[Describe categories: account data, contact info, usage, cookies, communications, etc.]

2. How we use information
[Describe purposes: provide the service, support, analytics, legal compliance, marketing if applicable.]

3. Sharing and disclosure
[Subprocessors, service providers, legal requirements, business transfers.]

4. Data retention
[How long you keep data and criteria for deletion.]

5. Your rights and choices
[Access, correction, deletion, opt-out, regional rights such as GDPR/CCPA if applicable.]

6. Contact
[How users can reach you for privacy questions.]`,
}

export const DEFAULT_TERMS_PAGE: SimpleLegalPage = {
  title: "Terms & Conditions",
  subtitle:
    "Replace the placeholder sections below with your final terms of use. This URL is intended for use at https://www.tradesman-us.com/terms once this app is served on that domain.",
  body: `[Add date] Last updated.

These terms govern your use of Tradesman services. Edit this introduction and all sections below after legal review.

1. Agreement
[Acceptance of terms, eligibility, authority to bind a business if applicable.]

2. Services
[What you provide, acceptable use, account responsibilities.]

3. Fees and billing
[If applicable.]

4. Limitation of liability
[As reviewed by counsel.]

5. Termination
[How accounts may be suspended or closed.]

6. Contact
[Support / legal contact.]`,
}

export const DEFAULT_SMS_CONSENT_PAGE: SmsConsentLegalPage = {
  title: "SMS Consent and Messaging Terms",
  subtitle:
    "This page describes how Tradesman collects SMS opt-in consent for customer support, appointment coordination, and service-related messaging tied to our business phone numbers, including verified toll-free messaging.",
  consent_statement:
    "By providing your mobile phone number and opting in, you agree to receive text messages from Tradesman regarding customer support, appointment coordination, job updates, account notifications, and service-related follow-up. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help.",
  sample_message:
    "Tradesman: Thanks for contacting us. This is a customer support update regarding your request. Message frequency varies. Reply STOP to opt out, HELP for help.",
  body: `Opt-In Method
Customers opt in to receive SMS messages from Tradesman by providing their phone number directly through one of the following channels and expressly consenting to receive messages:
• Website contact, estimate request, or service request forms
• Direct customer intake during scheduling or support interactions
• Customer service conversations where the customer requests text follow-up

Use Case
Tradesman sends conversational and service-related messages only. Messaging may include:
• Customer support follow-up
• Appointment reminders and coordination
• Job updates and service status messages
• Estimate, scheduling, and account-related notifications

Help and Opt-Out
• Customers can reply STOP at any time to opt out of SMS messages.
• Customers can reply HELP for assistance.
• Message frequency varies based on the customer's support, scheduling, and service activity.
• Message and data rates may apply.

Contact for Messaging Notifications
Notification and compliance contact email: Admin@tradesman-us.com
For support related to messaging, customers can also reply HELP or contact Tradesman through the business support channels listed on the main site.`,
}

export function parseSimpleLegalPage(raw: unknown, fallback: SimpleLegalPage): SimpleLegalPage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback }
  const o = raw as Record<string, unknown>
  const subtitle =
    typeof o.subtitle === "string" && o.subtitle.trim() ? o.subtitle : fallback.subtitle
  const body = typeof o.body === "string" && o.body.trim() ? o.body : fallback.body
  return {
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : fallback.title,
    subtitle,
    body,
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
  }
}
