/**
 * SOLE legal drafts. Status is under legal review.
 * These are implementation placeholders for counsel, not finalized contracts.
 * Version changes must require a new acceptance. Do not edit a published version in place.
 */

export const SOLE_LEGAL_VERSION = "2026-10-20.1"

export type SoleLegalAudience = "business" | "developer" | "both"

export type SoleLegalDocument = {
  slug: string
  title: string
  audience: SoleLegalAudience
  version: string
  summary: string
  body: string
  requiredForBusiness: boolean
  requiredForDeveloper: boolean
  requiredBeforeSpend: boolean
}

const COUNSEL =
  "[COUNSEL REVIEW] This is a draft for qualified counsel. It is not legal advice, not a final agreement, and not authorization to hold or redistribute advertising funds."

function doc(
  partial: Omit<SoleLegalDocument, "version">,
): SoleLegalDocument {
  return { ...partial, version: SOLE_LEGAL_VERSION }
}

export const SOLE_LEGAL_DOCUMENTS: SoleLegalDocument[] = [
  doc({
    slug: "terms",
    title: "SOLE Terms of Service",
    audience: "both",
    requiredForBusiness: true,
    requiredForDeveloper: true,
    requiredBeforeSpend: false,
    summary: "What SOLE is, who may use it, and what it does not promise.",
    body: `${COUNSEL}

Effective draft: ${SOLE_LEGAL_VERSION}
Intended publisher: the SOLE legal entity named by counsel. Until that entity is confirmed, do not present this draft as a binding production contract.

1. Purpose
SOLE (Shop-Owned Lead Engine) is a business-to-business marketing distribution, attribution, and recommendation platform. A business connects advertising accounts it is authorized to manage, sets its own budgets, and may receive recommendations. SOLE is not a marketing agency, not a lead broker, and not a seller of shared leads.

2. Accounts
Developer organizations and businesses must register through an authorized flow. The person accepting must have authority to bind that organization. SOLE may refuse or suspend access for security, nonpayment of SOLE’s own service charges, or misuse.

3. Advertising accounts
The business owns or controls its advertising accounts. SOLE may act only within the permissions the business grants through each platform’s authorization flow. SOLE does not ask for advertising-account passwords. Results, delivery, and platform approval are not guaranteed.

4. Budgets and automation
The business sets spending limits. Manual mode leaves allocation to the business. Advisory mode recommends changes the business must approve. Automatic mode is off unless a separate authorization names the platforms, limits, and revocation method. SOLE will not treat signup as permission to raise spend.

5. Fees
Proposed SOLE servicing fee, subject to counsel and the published billing disclosure: 3% of eligible actual managed advertising spend in a billable month, with a $15 minimum when that spend is greater than zero, and $0 when eligible managed spend is $0. No inactivity fee is proposed. A CRM partner may add its own disclosed fee. Advertising platforms bill the business’s own accounts unless a later, approved funds-flow says otherwise. This draft does not authorize SOLE to hold or redistribute prepaid advertising funds.

6. Data
SOLE receives account, billing, and pseudonymous conversion events as described in the Privacy Policy. Partners must not send customer names, emails, phone numbers, postal addresses, or job notes through the attribution contract.

7. Availability and termination
Service may be interrupted. Either party may end use as the final agreement provides. Ending use does not erase amounts already owed for SOLE service charges or advertising the business already authorized at a platform.

8. Disclaimers
THE SERVICE IS PROVIDED “AS IS.” SOLE DOES NOT WARRANT CAMPAIGN RESULTS, PLATFORM AVAILABILITY, OR THAT A RECOMMENDATION WILL IMPROVE PROFIT. LIABILITY LIMITS, INDEMNITY, AND NON-WAIVABLE RIGHTS MUST BE SET BY COUNSEL. Do not treat this sentence as a finished waiver.

9. Governing law
[COUNSEL: insert entity, state, venue, and dispute process. Do not copy Tradesman Systems’ terms by assumption.]

Contact for this draft: the address counsel designates for SOLE. Do not route production legal notices to a placeholder.`,
  }),
  doc({
    slug: "privacy",
    title: "SOLE Privacy Policy",
    audience: "both",
    requiredForBusiness: true,
    requiredForDeveloper: true,
    requiredBeforeSpend: false,
    summary: "What SOLE collects, what it refuses, and how cross-customer statistics are limited.",
    body: `${COUNSEL}

Effective draft: ${SOLE_LEGAL_VERSION}

SOLE minimizes customer-level data. It still collects information that may be personal information. Do not describe SOLE as collecting “no personal information” or as making conversion events “anonymous.”

Categories
• Developer and business account data: name, business name, email, role, and authority attestations of the person accepting.
• Advertising authorization data: platform account identifiers, granted scopes, token expiry, and connection status. Tokens stay on the server.
• Attribution events: pseudonymous lead or opportunity references, event type, time, campaign reference, confidence, optional service category, and optional amount. Names, emails, phone numbers, street addresses, and job notes are rejected.
• Billing records: payer identity, fee calculations, and payment status for SOLE’s own service charges. Card numbers stay with the payment processor.
• Technical data: logs, IP address, and cookie or similar identifiers needed to run the site and secure embeds.

Purposes
Operate the workspace, measure campaign outcomes, calculate disclosed fees, secure tenant isolation, and produce recommendations. Cross-customer learning, if enabled later, uses aggregated statistics, minimum cohort sizes, and only the permissions the contract allows. One CRM’s private results are not shown to another CRM.

Sharing
Processors that host, send email, or process SOLE service fees; advertising platforms the business connects; and the CRM partner that embedded SOLE, limited to that partner’s own tenants. SOLE does not sell the contents of attribution events.

Retention and deletion
Keep acceptance records and fee records for the period counsel sets. Disconnecting an advertising account stops new platform calls. Deletion requests are handled as the final policy and the Data Processing Addendum describe. Backups may persist for a limited time.

Rights
People and businesses may request access, correction, or deletion where the law gives that right. Contact the address counsel designates. SOLE may verify the request.

Cookies and embeds
The hosted workspace and embed session may use strictly necessary cookies or short-lived tokens. Advertising platforms apply their own policies after the business leaves SOLE to authorize an account.

[COUNSEL: state retention periods, subprocessors, international transfers, and whether SOLE is controller, processor, or both for each data set.]`,
  }),
  doc({
    slug: "developer-agreement",
    title: "SOLE Developer Agreement",
    audience: "developer",
    requiredForBusiness: false,
    requiredForDeveloper: true,
    requiredBeforeSpend: false,
    summary: "Rules for CRM companies that embed SOLE or call its API.",
    body: `${COUNSEL}

Effective draft: ${SOLE_LEGAL_VERSION}

1. License
A developer organization may use the SOLE API, SDK, and embed only for tenants it administers, within the credentials SOLE issues. Credentials are secret on the developer’s server. Copy-and-paste snippets must not contain privileged keys.

2. Tenant isolation
A partner must not request or store another partner’s customer data. SOLE will reject cross-partner access. Tradesman Systems has no special access to other partners.

3. Prohibited attribution fields
Do not send names, emails, phone numbers, postal addresses, customer notes, or detailed job records on the attribution contract. Missing outcomes stay unknown. Do not mark a lead lost because a later event never arrived.

4. Disclosures the developer must present
Before a business activates SOLE, the developer’s experience must show that SOLE provides the infrastructure, that the business authorizes advertising-account access, that limited attribution events are sent to SOLE, that SOLE’s terms and privacy policy apply, that extra CRM fees may apply, that results are not guaranteed, and that advertising platforms have their own charges and policies. SOLE cannot edit the developer’s own legal pages. The developer is responsible for putting equivalent language in its terms and privacy policy.

5. Acceptance
The developer cannot skip SOLE’s required acceptance with a frontend flag. Hosted, embedded, and certified delegated flows must all record the same document versions on SOLE’s server.

6. Fees
Proposed wholesale servicing fee: 3% of eligible actual managed spend, $15 minimum in a month with spend, $0 when spend is $0. The developer may add a disclosed markup. Billing mode is one of: the CRM collects and SOLE invoices the CRM; SOLE bills an approved party; or a later approved split. This draft does not approve pooled advertising wallets.

7. Security
Least-privilege scopes, server-side tokens, signed embeds, incident notice on the timeline counsel sets, and no sharing of one tenant’s performance with another tenant.

8. Suspension
SOLE may suspend an integration that sends prohibited fields, bypasses acceptance, or exposes credentials.

[COUNSEL: add IP ownership, audit rights, liability caps, and termination assistance.]`,
  }),
  doc({
    slug: "advertising-authorization",
    title: "SOLE Advertising Management Authorization",
    audience: "business",
    requiredForBusiness: true,
    requiredForDeveloper: false,
    requiredBeforeSpend: true,
    summary: "The business confirms it may connect accounts and that SOLE does not guarantee results.",
    body: `${COUNSEL}

Effective draft: ${SOLE_LEGAL_VERSION}

By accepting, an authorized person for the business states:

• The business owns the advertising accounts it will connect, or is allowed to manage them.
• SOLE may perform only the actions the business turns on, using each platform’s own authorization screen.
• Budgets and stops are set by the business. A connection is not permission to spend.
• Advertising platforms have separate terms and bill the business under those terms unless a later approved arrangement says otherwise.
• Results are not guaranteed.
• SOLE may receive the limited attribution events described in the Privacy Policy.
• Automatic changes to campaigns require a separate automation authorization. This document does not enable automatic mode.
• The business may revoke platform access in the advertising platform and in SOLE settings. Revocation does not undo spend the platform has already delivered.
• SOLE does not own the business’s leads or advertising accounts.

[COUNSEL: confirm any platform-specific consent language required by Google, Meta, and TikTok before production OAuth goes live.]`,
  }),
  doc({
    slug: "billing-disclosure",
    title: "SOLE Billing and Advertising Spend Disclosure",
    audience: "both",
    requiredForBusiness: false,
    requiredForDeveloper: false,
    requiredBeforeSpend: true,
    summary: "How a budget differs from a SOLE service charge, and who is paid.",
    body: `${COUNSEL}

Effective draft: ${SOLE_LEGAL_VERSION}

Advertising budget
The amount the business authorizes for ads. In the default launch design, the advertising platform bills the business’s own account. SOLE records the authorization and the reported spend. Recording an authorization in this version does not collect money and does not start an ad.

SOLE servicing fee (proposed)
3% of eligible actual managed advertising spend for the billable period, at least $15 if that spend is above zero, and $0 if eligible spend is $0. The minimum is once per period, not once per click or per campaign. No inactivity fee and no cancellation penalty are proposed.

CRM partner fee
The developer may add a markup. The workspace must show it separately before the business authorizes spend.

Processing fees
Shown only when a processor actually charges them.

Who is paid
Each authorization record must name the party that would collect a SOLE service charge and state that advertising-platform charges are collected by that platform unless counsel has approved a different funds flow. SOLE must not describe itself as holding prepaid ad funds under this draft.

Recurring schedules
One-time, weekly, or monthly. The renewal day is shown before acceptance. Material increases, new platforms, or a switch to automatic mode need a new authorization.

Pause and cancel
Pausing stops new SOLE management. It does not promise an instant refund of spend a platform has already delivered. Unused platform balances follow that platform’s rules.

This software build rejects live charges until a processor-approved design is explicitly enabled. A successful test record is not a payment.`,
  }),
  doc({
    slug: "data-processing",
    title: "SOLE Data Processing Addendum",
    audience: "developer",
    requiredForBusiness: false,
    requiredForDeveloper: true,
    requiredBeforeSpend: false,
    summary: "Processor terms for CRM partners. Roles are not assumed to be identical for every integration.",
    body: `${COUNSEL}

Effective draft: ${SOLE_LEGAL_VERSION}

Roles depend on the integration. Do not assume every developer relationship is controller-to-processor or joint controller. Counsel must mark the role for each processing purpose before production onboarding.

Authorized purposes
Host the workspace, store advertising tokens, deliver attribution events, calculate fees, and produce recommendations for the tenant that owns the data.

Instructions
The developer’s documented integration and the business’s recorded authorizations are the instructions. SOLE will not use a tenant’s events to serve a different partner’s identifiable reporting.

Security
Access control, encryption in transit, server-side secrets, and audit logs of acceptance and spend authorizations. Credentials are not placed in browser snippets.

Subprocessors
[COUNSEL: list host, database, email, and payment processor before production.]

Retention and deletion
Delete or export tenant data on the schedule counsel sets after the developer closes the integration, except records that must be kept for fees, security, or law.

Data subject requests
The party counsel designates as responsible will forward requests that belong to the other party. SOLE will not invent a lawful basis.

Incidents
[COUNSEL: insert notice timing.]

Cross-border processing
[COUNSEL: insert transfer mechanism if data leaves the originating country.]

Training and cross-tenant models
Off unless the contract and the business permission both allow aggregated learning. Minimum cohort sizes apply. Identifiable tenant performance is not training data for another partner by default.

This addendum is not executed by downloading it. A developer acceptance record must name this version.`,
  }),
  doc({
    slug: "crm-data-sharing",
    title: "CRM to SOLE Data-Sharing Acknowledgment",
    audience: "business",
    requiredForBusiness: true,
    requiredForDeveloper: false,
    requiredBeforeSpend: false,
    summary: "What the CRM may send SOLE about leads and jobs, without customer identity.",
    body: `${COUNSEL}

Effective draft: ${SOLE_LEGAL_VERSION}

If the business uses SOLE inside a CRM such as Tradesman Systems, the business acknowledges:

• The CRM may send SOLE pseudonymous references when a lead is created, a conversation is established, a job is scheduled or won, or a lead is lost, plus optional category and amount.
• The CRM is not supposed to send the customer’s name, email, phone, address, notes, or a detailed job description on that contract.
• SOLE uses those events to measure cost per lead, conversation, and job, and to explain recommendations.
• Missing events stay unknown. SOLE will not call a lead lost merely because no later event arrived.
• The business can disconnect SOLE. Historical acceptance and fee records may be retained as the Privacy Policy states.
• Accepting Tradesman’s general terms, or any other CRM’s general terms, is not acceptance of this acknowledgment.

[COUNSEL: confirm this acknowledgment is sufficient for the CRM’s role, or replace it with a signed DPA exhibit.]`,
  }),
]

export const SOLE_BUSINESS_REQUIRED_SLUGS = SOLE_LEGAL_DOCUMENTS.filter((d) => d.requiredForBusiness).map((d) => d.slug)

export const SOLE_DEVELOPER_REQUIRED_SLUGS = SOLE_LEGAL_DOCUMENTS.filter((d) => d.requiredForDeveloper).map((d) => d.slug)

export const SOLE_SPEND_REQUIRED_SLUGS = SOLE_LEGAL_DOCUMENTS.filter((d) => d.requiredBeforeSpend).map((d) => d.slug)

export function soleLegalDocument(slug: string): SoleLegalDocument | undefined {
  const key = slug.trim().toLowerCase()
  return SOLE_LEGAL_DOCUMENTS.find((d) => d.slug === key)
}

export function soleLegalPath(slug: string): string {
  return `/sole/legal/${slug}`
}
