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
    "How Tradesman Systems LLC and the Tradesman platform collect, use, share, and protect information—including messaging, security monitoring, and misuse prevention.",
  body: `[Add date] Last updated.

This Privacy Policy describes how Tradesman Systems LLC and its affiliates (“Tradesman,” “we,” “us,” or “our”) handle information when you use our websites, applications, APIs, and related services (collectively, the “Services”). By using the Services, you acknowledge this Policy. Capitalized terms used in subscription or order documents apply as defined there.

1. Who this policy covers
• Visitors to our public websites and marketing pages.
• Registered users, including business accounts, office managers, and administrators.
• End customers of our users whose information is submitted into the Services (for example, when they call, text, or email a Tradesman-connected business line, or when a user enters customer data).

2. Information we collect
• Account and profile data: name, email, phone, business name, address, credentials, role, preferences, and settings you save in the product.
• Customer and job data that you or your staff enter: contacts, messages, quotes, calendar events, files, recordings, transcripts, and similar operational records.
• Communications metadata and content processed through the Services (including SMS, email, voice, voicemail, and attachments) as needed to route, display, store, and deliver those communications.
• Technical and usage data: device type, browser, IP address, approximate location, cookies or similar technologies, logs, diagnostics, and performance metrics.
• Payment-related information as processed by our payment partners (we generally do not store full card numbers on our own servers).
• Support and legal requests: information you provide in tickets, surveys, or correspondence.

3. How we use information
We use information to:
• Provide, operate, secure, improve, and personalize the Services.
• Authenticate users, prevent fraud and abuse, enforce our agreements, and protect rights and safety.
• Send service-related notices (including billing, security alerts, and policy updates where permitted).
• Comply with law, regulatory inquiries, and carrier / telecommunications compliance obligations (including SMS and voice programs such as A2P 10DLC where applicable).
• Analyze aggregated or de-identified usage to improve the product.

4. SMS and text messaging data
If you or your customers use SMS features, we process mobile numbers, message content, delivery status, and related metadata as necessary to send and receive messages, display threads, enforce technical limits (such as message length and first-message compliance footers), and meet carrier and regulatory expectations. Message frequency varies with account activity. Standard message and data rates may apply. Reply STOP to opt out where supported; Reply HELP for help when we offer it.

5. Legal bases (where GDPR or similar laws apply)
Depending on context we may rely on contract performance, legitimate interests (such as security and product improvement), consent where required, or legal obligation.

6. Sharing and disclosure
We may share information with:
• Service providers and subprocessors who assist us (for example hosting, email delivery, SMS/voice carriers, analytics, payment processors, customer support tools). They are permitted to use data only to perform services for us.
• Your organization’s admins or office managers as enabled by your account configuration.
• Professional advisers, auditors, or insurers under confidentiality obligations.
• Law enforcement, regulators, or other parties when we believe in good faith that disclosure is required by law, legal process, or to protect rights, safety, or security.
• A successor in interest in a merger, acquisition, financing, or sale of assets, subject to this Policy or successor terms.

We do not sell personal information for money as a primary business. Where “sale” or “sharing” is defined broadly by state law, see your rights below.

7. Security, monitoring, and misuse
We maintain administrative, technical, and organizational measures designed to protect information. We may monitor, log, scan, or analyze use of the Services (including automated signals) to detect, investigate, and respond to unauthorized access, hacks, malware, policy violations, spam, or attempts to misuse or overload the Services—including attempts to circumvent messaging limits or use unapproved third-party tools with the Services. We may retain related records for security, compliance, and dispute resolution.

8. Data retention
We retain information for as long as needed to provide the Services, comply with law, resolve disputes, and enforce agreements. Retention periods can vary by data category and legal requirements. Some backups or archived logs may persist for a limited additional period.

9. Your rights and choices
Depending on your location you may have rights to access, correct, delete, port, or restrict processing of certain data, or to object to certain processing. You may also have the right to opt out of certain “sales” or “sharing” for cross-context behavioral advertising where applicable. To exercise rights, contact us using the details below. We may verify requests and deny requests that compromise others’ rights, security, or where the law does not require action.

10. International transfers
If you access the Services from outside the United States, information may be processed in the United States or other countries where we or our providers operate.

11. Children’s privacy
The Services are not directed to children under 16 (or the age required in your jurisdiction). Do not provide children’s information for marketing or unrelated profiling.

12. Changes to this Policy
We may update this Policy from time to time. We will post the revised version and update the “Last updated” date. Material changes may be communicated through the Services or email where appropriate.

13. Contact
For privacy questions or requests: Admin@tradesman-us.com (update to your designated privacy contact after legal review).`,
}

export const DEFAULT_TERMS_PAGE: SimpleLegalPage = {
  title: "Terms & Conditions",
  subtitle:
    "Binding terms for use of the Tradesman platform—including acceptable use, messaging and A2P compliance, enforcement, fees, suspension, collections, and limitations of liability.",
  body: `[Add date] Last updated.

These Terms & Conditions (“Terms”) govern access to and use of the websites, applications, APIs, and related services offered by Tradesman Systems LLC and its affiliates (collectively, “Tradesman,” “we,” “us,” or “our”) (the “Services”). By creating an account, clicking to accept, or using the Services, you (“you,” “your,” or “User”) agree to these Terms on behalf of yourself and, if you use the Services for a company or other entity, that entity (“Organization”). If you do not agree, do not use the Services.

1. Eligibility and authority
You represent that you are at least the age of majority in your jurisdiction and have authority to bind your Organization. You are responsible for all activity under your credentials.

2. The Services
Tradesman provides software and related tools for business communications, scheduling, quotes, and similar workflows. Features may change; we may add, modify, or discontinue functionality. We do not guarantee uninterrupted or error-free operation.

3. Accounts and security
You must provide accurate registration information and keep credentials confidential. Notify us promptly of unauthorized use. We may require multi-factor authentication or other controls.

4. Acceptable use
You will use the Services only in compliance with law and these Terms. You will not: (a) interfere with or disrupt the Services or networks; (b) attempt unauthorized access to systems, data, or accounts; (c) introduce malware or harmful code; (d) scrape, harvest, or collect data from the Services in violation of our rules or robots restrictions; (e) impersonate others or misrepresent affiliation; (f) use the Services to build a competing product by systematic extraction of non-public interfaces; or (g) reverse engineer, decompile, or attempt to extract source code except where prohibited by law.

5. Messaging, SMS, voice, email, and A2P / carrier compliance
5.1 Your obligations. You are solely responsible for lawful use of messaging (SMS/MMS), voice, email, and other communications channels made available through or with the Services—including obtaining and documenting consent where required, honoring opt-outs (e.g., STOP), maintaining accurate registration with carriers or registries (such as A2P 10DLC brand and campaign registration where applicable), and complying with the Telephone Consumer Protection Act (TCPA), Telemarketing Sales Rule, CAN-SPAM, carrier acceptable use policies, and similar laws and industry standards.

5.2 Platform design. The Services are intended for conversational and operational communications with customers who have contacted you or consented to messages—not for unsolicited bulk or “cold” outreach. Technical limits (for example, absence of simultaneous multi-recipient SMS blast features, first-SMS compliance footers, and character budgets) are part of the product design and may change.

5.3 No circumvention. You may not use or encourage use of unapproved third-party software, scripts, bots, integrations, devices, or manual processes to bypass product limits, harvest numbers, send unauthorized messages, obscure message origin, or evade carrier or regulatory requirements. Doing so is a material breach.

5.4 Indemnity for communications. To the fullest extent permitted by law, you will defend, indemnify, and hold harmless Tradesman and its officers, directors, employees, contractors, carriers, and partners from claims, fines, penalties, losses, and expenses (including reasonable attorneys’ fees) arising out of or related to your communications, your failure to obtain consent, your violation of messaging or telemarketing laws, or your circumvention of product or carrier rules.

6. Prohibited and high-risk conduct
Without limitation, you must not use the Services for: illegal products or services; fraud; harassment; hate or extremist content; sexual exploitation; deceptive practices; distribution of malware; denial-of-service; credential stuffing; or any activity that exposes Tradesman, users, or third parties to undue legal, security, or reputational risk. We may investigate suspected violations.

7. Enforcement, suspension, and termination
7.1 Our rights. We may suspend or terminate access to the Services (in whole or part), remove content, block messages, or take other technical or legal steps if we reasonably believe you have violated these Terms, created security or compliance risk, or if we are required to do so by law, regulators, or carriers.

7.2 Effect. Upon suspension or termination, you may lose access to data stored in the Services subject to our data retention practices and law. You remain responsible for fees and obligations accrued before termination.

8. Fees, billing, and financial remedies for misuse
8.1 Subscription and fees. If you subscribe to paid plans, you agree to pay all fees when due according to the plan, order form, or checkout terms presented at purchase. Fees are exclusive of taxes unless stated otherwise; you are responsible for applicable taxes.

8.2 Continuation and recovery after misuse. If we suspend or terminate your account for material breach (including messaging abuse, circumvention, fraud, or security incidents), you acknowledge that we may, to the extent permitted by law and your order terms: (i) continue to charge subscription or minimum fees for a reasonable wind-down or notice period stated in your plan or invoice; (ii) charge administrative, liquidated, or cancellation fees designed to cover unrecoverable costs, fraud prevention, compliance remediation, and harm to our network reputation, in amounts we specify in your order, plan description, or a written notice; and (iii) offset or recover amounts you owe us using lawful means.

8.3 Collections and legal fees. If we refer past-due amounts to collections or pursue legal action to recover fees or enforce these Terms, you agree to pay our reasonable collection costs, court costs, and attorneys’ fees, in addition to any judgment or settlement amounts, to the extent permitted by law.

8.4 No waiver. Failure to invoice immediately does not waive our right to later invoice or enforce.

9. Disclaimers
TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT MESSAGES WILL BE DELIVERED BY ANY PARTICULAR CARRIER OR THAT REGULATORY APPROVALS (SUCH AS A2P CAMPAIGNS) WILL BE GRANTED.

10. Limitation of liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL TRADESMAN’S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICES EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICES IN THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS ($100). WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE, DATA, OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS; IN THOSE CASES OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED.

11. Indemnification (general)
You will defend, indemnify, and hold harmless Tradesman and its affiliates, officers, directors, employees, and contractors from any third-party claims, fines, and expenses (including reasonable attorneys’ fees) arising from your use of the Services, your data, your violation of law or third-party rights, or your breach of these Terms, except to the extent caused by our willful misconduct.

12. Governing law and venue
These Terms are governed by the laws of the State of South Carolina, USA, excluding conflict-of-law rules, unless a different governing law is required by your mandatory local law. You consent to exclusive jurisdiction and venue in the state and federal courts located in South Carolina, except where prohibited; we may also seek injunctive or equitable relief in any court of competent jurisdiction.

13. Changes
We may modify these Terms by posting an updated version or providing notice as required by law. Continued use after the effective date constitutes acceptance unless applicable law requires additional consent.

14. Miscellaneous
Severability; assignment; entire agreement; no third-party beneficiaries except as expressly stated; export and sanctions compliance; U.S. Government rights if applicable.

15. Contact
Legal and billing notices: Admin@tradesman-us.com (replace with your official legal contact after review).`,
}

export const DEFAULT_SMS_CONSENT_PAGE: SmsConsentLegalPage = {
  title: "SMS Consent and Messaging Terms",
  subtitle:
    "How Tradesman Systems LLC and businesses using the Tradesman platform handle U.S. and international-style SMS consent, first-message disclosures, STOP/HELP, and carrier (A2P) alignment.",
  consent_statement:
    "By providing your mobile number and agreeing to receive texts, you consent to receive automated and manual text messages from the business you contacted (and its authorized users) regarding that relationship—such as scheduling, quotes, job updates, and account notifications—sent through Tradesman Systems LLC’s platform and connected carrier numbers. Message frequency varies. Message and data rates may apply. Reply STOP to opt out where supported; Reply HELP for help when offered.",
  sample_message:
    "Thanks for reaching [Business Name]. We can help with your request. Reply STOP to opt out. Msg & data rates may apply.",
  body: `[Add date] Last updated.

This page summarizes how SMS works when businesses use Tradesman with Twilio-connected numbers. It supports transparency for customers, users, and carrier / A2P 10DLC reviewers. Your counsel should align this text with your live signup flows and privacy policy.

1. Who sends the message
End customers typically receive SMS from the business they contacted. Messages may be transmitted using infrastructure operated by Tradesman Systems LLC (“Tradesman”) and telecommunications carriers (for example, Twilio). The displayed “from” number is assigned to the business’s account configuration.

2. How customers opt in
Consent must match your real intake process. Common patterns include:
• The customer texts or calls the business’s published Tradesman/Twilio number first.
• The customer provides a mobile number on a web form or in person and agrees to SMS for the stated purposes.
• The business documents consent when adding a customer manually (your product may require attestations).

Tradesman may append a compliance footer to the first outbound SMS in a relationship, depending on whether inbound call/SMS/voicemail already exists on the business line.

3. First-message disclosures and character limits
To support carrier expectations, the first outbound SMS to a customer may include:
• A longer footer when there is no prior inbound SMS, call, or voicemail from that customer on the business Twilio line (for example identification, STOP, rates, and a link to this page or https://www.tradesman-us.com/sms).
• A shorter footer when the customer has already contacted the business on that line.

The application shows how many characters remain for your message body on that send. Subsequent outbound SMS may not include the footer once an outbound SMS has already been logged for that customer.

4. Automated and manual messages
Messages may be manual (typed by a user) or automated (for example status notifications where enabled). Automated SMS may be length-limited for cost and deliverability.

5. Prohibited use (users of the platform)
Users may not use Tradesman with unapproved third-party tools to send spam, cold lists, or simultaneous bulk SMS; to forge origin; or to evade STOP or consent rules. Tradesman may suspend accounts for abuse or carrier non-compliance.

6. Opt-out and help
Customers should be instructed to reply STOP to cancel SMS where the carrier supports it. HELP may be offered where you implement it. You must honor opt-outs promptly in accordance with law and carrier rules.

7. Data and sharing
SMS content and metadata are processed to deliver and display messages and for security and legal compliance. See the Privacy Policy for broader data practices. SMS opt-in data and consent should not be sold to unrelated third parties for their own marketing.

8. Contact
Messaging compliance: Admin@tradesman-us.com (update after review).`,
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
