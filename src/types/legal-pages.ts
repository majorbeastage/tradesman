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

Tradesman Systems (“Company,” “we,” “our,” or “us”) respects your privacy. This Privacy Policy describes what we collect and how we use it when you use our websites, applications, APIs, and related services (the “Services”). By using the Services, you agree to this Policy.

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

3. SMS and communication consent; users of the platform
Customers may receive SMS messages from businesses they interact with using the Tradesman Systems platform.

Customers provide consent by:
• Contacting a business directly, or
• Providing their phone number to a business and agreeing to receive communication

Consent to receive SMS messages is not required as a condition of purchasing any goods or services.

Tradesman Systems facilitates messaging but does not independently send unsolicited messages. Message frequency varies. Message and data rates may apply. Msg & data rates may apply. Customers may reply STOP at any time to opt out where the carrier supports it, and HELP when offered.

Users of the platform (including businesses and their authorized users) must obtain proper consent before contacting any individual. Tradesman Systems does not verify consent on behalf of users.

Users may not send unsolicited messages, use purchased contact lists, or engage in bulk messaging. Accounts may be suspended or terminated for violations of messaging policies.

All messaging is conducted on a one-to-one basis between a business and its customer. Tradesman Systems does not support bulk messaging or unsolicited outreach.

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
  subtitle:
    "Who sends texts, how consent works with Tradesman Systems, first-message notices, STOP/HELP, and carrier (A2P) alignment.",
  consent_statement:
    "By providing your mobile number and agreeing to receive texts, you consent to receive automated and manual text messages from the business you interacted with (and its authorized users)—for example scheduling, job updates, estimates, and account notifications—sent using the Tradesman Systems platform and connected carrier numbers. Message and data rates may apply. Msg & data rates may apply. Your phone number and consent will not be shared with third parties for marketing purposes. Message frequency varies. Reply STOP to opt out where supported. Reply HELP for help when offered.",
  sample_message: `Hi, this is Dave from Dave\u2019s Gutters. I\u2019m following up on your recent request.

Reply STOP to opt out. Reply HELP for help.`,
  body: `Effective date: April 6, 2026

This page explains how SMS works when businesses use Tradesman Systems. Message frequency varies. Message and data rates may apply. Msg & data rates may apply. Keep your live intake, Privacy Policy, and Terms aligned with what you actually do. See also https://www.tradesman-us.com/privacy and https://www.tradesman-us.com/terms.

1. Who sends messages
SMS is sent by the business or contractor you interact with. The platform is provided by Tradesman Systems LLC, a South Carolina limited liability company doing business as Tradesman Systems; messages typically route through telecommunications carriers (for example Twilio). The “from” number is assigned to the business’s account.

2. Opt-in method
Customers may receive SMS messages from a business after:

• Contacting that business directly, or
• Providing their phone number to the business and agreeing to receive communication

3. Use case; one-to-one messaging
Tradesman Systems facilitates one-to-one messaging between businesses and their customers. Messages are sent by the business, not by Tradesman Systems.

Messages may include:
• Customer support follow-up
• Appointment reminders and coordination
• Job updates and service status messages
• Estimates, scheduling, and account-related notifications

All messaging is conducted on a one-to-one basis between a business and its customer. Tradesman Systems does not support bulk messaging or unsolicited outreach.

4. Consent; what customers agree to
Customers may receive SMS messages from businesses they interact with using the Tradesman Systems platform.

Customers provide consent by:
• Contacting a business directly, or
• Providing their phone number to a business and agreeing to receive communication

Tradesman Systems facilitates messaging but does not independently send unsolicited messages.

Message frequency varies. Message and data rates may apply. Msg & data rates may apply. Customers may reply STOP at any time to opt out where the carrier supports it.

5. Users of the platform (businesses)
Users must obtain proper consent before contacting any individual. Tradesman Systems does not verify consent on behalf of users.

Users may not send unsolicited messages, use purchased contact lists, or engage in bulk messaging.

Accounts may be suspended or terminated for violations of messaging policies.

Businesses using the platform are required to confirm that they have obtained consent before sending messages to manually added contacts.

6. Message types and automation
Messages are operational (for example scheduling, job updates, estimates, and customer support). Some texts may be automated for those operational purposes where the account enables them; this is not bulk or automated marketing.

7. Opt-out and help
Reply STOP to opt out at any time where the carrier supports it. Reply HELP for assistance when you implement it. Message and data rates may apply. Msg & data rates may apply. Businesses must honor opt-outs as required by law and carrier rules.

8. First message notice
The first outbound SMS in a conversation may include a compliance footer. It is often longer when the customer has not yet texted, called, or left voicemail on the business’s Tradesman Systems-connected line, and shorter when they already have. The app shows how many characters remain for your message on that send. Footers support transparency and carrier (A2P) expectations.

9. Prohibited use
Users may not use the Tradesman Systems platform together with unapproved tools to send spam, cold lists, or simultaneous bulk SMS; to forge origin; or to evade STOP or consent rules. Tradesman Systems may suspend accounts for abuse or non-compliance.

10. Data
SMS content and metadata are processed to deliver and display messages and for security and legal compliance. See the Privacy Policy for broader practices.

11. Sample messages (examples)
The “Sample message” block on this page shows a realistic contractor follow-up. Your actual first outbound SMS may also include an automatic compliance footer (see Section 8). The following are additional patterns—wording is from the business; the sending number is the business’s configured line on Tradesman Systems.

Hi, this is Dave from Dave’s Gutters. I’m following up on your recent request.

Reply STOP to opt out. Reply HELP for help.

[Contractor]: Hi [Name], your appointment with [Contractor] is confirmed for [Date] at [Time]. Reply STOP to opt out or HELP for assistance.

[Contractor]: Your job estimate is ready. Log in to review and approve: [link]. Reply STOP to opt out, HELP for help.

[Contractor]: We received your support request and will follow up within 1 business day. Reply STOP to opt out or HELP for assistance.

[Contractor] is on the way and will arrive in approximately 30 minutes. Reply STOP to opt out or HELP for help.

12. Contact
Tradesman Systems — messaging compliance: Admin@tradesman-us.com`,
}

export function parseSimpleLegalPage(raw: unknown, fallback: SimpleLegalPage): SimpleLegalPage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback }
  const o = raw as Record<string, unknown>
  const rawSubtitle = typeof o.subtitle === "string" ? o.subtitle.trim() : ""
  const subtitle =
    rawSubtitle && !isAdminSignupRequirementsSubtitlePlaceholder(rawSubtitle) ? rawSubtitle : fallback.subtitle
  const rawBody = typeof o.body === "string" && o.body.trim() ? o.body : fallback.body
  const body = stripLegacyImportantLegalNoticePrefix(stripLegacyPortalLegalAcknowledgmentParagraph(rawBody))
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
