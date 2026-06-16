/**
 * Curated pointers and copy for the in-app **Thimble** insurance toolkit.
 * Links are public marketing / app entry points — verify periodically with Thimble.
 */

export const thimbleOfficialLinks = {
  home: "https://www.thimble.com/",
  smallBusinessInsurance: "https://www.thimble.com/small-business-insurance",
  /** Entry to quote/onboarding flows — Thimble may A/B variants; this is the common marketing path. */
  quoteStart: "https://www.thimble.com/small-business-insurance",
  generalLiability: "https://www.thimble.com/general-liability",
  professionalLiability: "https://www.thimble.com/professional-liability-insurance",
  businessOwnersPolicy: "https://www.thimble.com/business-owners-policy",
  workersComp: "https://www.thimble.com/workers-compensation-insurance",
  /** Logged-in app base (customers manage policies/certificates here when they have accounts). */
  appHome: "https://app.thimble.com/",
  helpCenter: "https://help.thimble.com/",
} as const

/** Swap this builder for a native Thimble API handoff when partnership terms allow. */
export type ThimbleQuoteContext = {
  insuranceType: InsuranceTypeId
  reason?: InsuranceReasonId
  customerName?: string
  jobTitle?: string
}

export function buildThimbleQuoteUrl(ctx: ThimbleQuoteContext): string {
  const base = thimbleOfficialLinks.quoteStart
  const params = new URLSearchParams()
  params.set("utm_source", "tradesman")
  params.set("utm_medium", "insurance_assistant")
  params.set("utm_campaign", ctx.insuranceType)
  if (ctx.reason) params.set("utm_content", ctx.reason)
  if (ctx.customerName?.trim()) params.set("utm_term", ctx.customerName.trim().slice(0, 80))
  return `${base}?${params.toString()}`
}

export type InsuranceTypeId = "business" | "job_specific"

export type InsuranceReasonId =
  | "customer_requirement"
  | "general_contractor"
  | "municipality"
  | "property_manager"
  | "personal_protection"
  | "other"

export const INSURANCE_TYPES: { id: InsuranceTypeId; label: string; description: string }[] = [
  {
    id: "business",
    label: "Business Insurance",
    description: "Ongoing coverage for your company — vehicles, crew, shop, and year-round operations.",
  },
  {
    id: "job_specific",
    label: "Job-Specific Insurance",
    description: "Coverage tied to one customer, job site, and scheduled work — ideal for COI requests.",
  },
]

export const INSURANCE_REASONS: { id: InsuranceReasonId; label: string; hint: string }[] = [
  { id: "customer_requirement", label: "Customer requirement", hint: "Homeowner or commercial owner asked for proof before work starts." },
  { id: "general_contractor", label: "General contractor", hint: "Prime contractor or GC packet requires additional insured wording." },
  { id: "municipality", label: "Municipality", hint: "Permit, inspection, or city registration needs liability on file." },
  { id: "property_manager", label: "Property manager", hint: "Multi-family or commercial PM needs COI for vendor access." },
  { id: "personal_protection", label: "Personal protection", hint: "You want liability limits before taking on higher-risk scope." },
  { id: "other", label: "Other", hint: "Another compliance trigger — we'll still recommend baseline coverages." },
]

export type InsuranceCoverageCard = {
  id: string
  name: string
  shortDescription: string
  learnMore: string
  href: string
  priority: number
}

export const INSURANCE_COVERAGE_CARDS: InsuranceCoverageCard[] = [
  {
    id: "general_liability",
    name: "General Liability",
    shortDescription: "Core third-party coverage for property damage and bodily injury on job sites.",
    learnMore:
      "General liability is the baseline most GCs, municipalities, and customers ask for first. Limits are often stated as per-occurrence / aggregate (for example $1M / $2M). Match the contract schedule before you mobilize.",
    href: thimbleOfficialLinks.generalLiability,
    priority: 1,
  },
  {
    id: "workers_comp",
    name: "Workers Compensation",
    shortDescription: "Statutory coverage for employee injuries — usually required when you have W-2 crew.",
    learnMore:
      "Workers comp rules vary by state and payroll. If anyone on your payroll steps on the job site, assume you need it unless a licensed advisor tells you otherwise.",
    href: thimbleOfficialLinks.workersComp,
    priority: 2,
  },
  {
    id: "professional_liability",
    name: "Professional Liability",
    shortDescription: "Errors & omissions when design, engineering judgment, or sign-off language is in scope.",
    learnMore:
      "Professional liability protects against claims that your advice or professional work caused a financial loss — not just physical damage. Relevant when estimates include compliance sign-offs or design-build language.",
    href: thimbleOfficialLinks.professionalLiability,
    priority: 3,
  },
  {
    id: "bop",
    name: "Business Owner's Policy (BOP)",
    shortDescription: "Bundles property (tools, office, stock) with liability when you have fixed assets.",
    learnMore:
      "A BOP can cover owned gear, small shop stock, and liability together. Useful when you maintain a yard, warehouse, or office — not just field labor.",
    href: thimbleOfficialLinks.businessOwnersPolicy,
    priority: 4,
  },
  {
    id: "tools_equipment",
    name: "Tools & Equipment",
    shortDescription: "Theft or damage to owned gear in the field or in transit between sites.",
    learnMore:
      "When offered, tools coverage can fill gaps left by GL. Inventory high-value saws, lasers, and specialty gear before you quote limits.",
    href: thimbleOfficialLinks.smallBusinessInsurance,
    priority: 5,
  },
]

const REASON_COVERAGE: Record<InsuranceReasonId, string[]> = {
  customer_requirement: ["general_liability", "workers_comp"],
  general_contractor: ["general_liability", "workers_comp", "professional_liability"],
  municipality: ["general_liability", "workers_comp"],
  property_manager: ["general_liability", "bop", "workers_comp"],
  personal_protection: ["general_liability", "professional_liability"],
  other: ["general_liability", "workers_comp", "professional_liability", "bop"],
}

export function recommendedCoverageCards(
  reason: InsuranceReasonId,
  insuranceType: InsuranceTypeId,
): InsuranceCoverageCard[] {
  const ids = new Set(REASON_COVERAGE[reason] ?? REASON_COVERAGE.other)
  if (insuranceType === "business") {
    ids.add("bop")
    ids.add("tools_equipment")
  }
  return INSURANCE_COVERAGE_CARDS.filter((c) => ids.has(c.id)).sort((a, b) => a.priority - b.priority)
}

export type ThimbleToolkitStep = {
  title: string
  body: string
  bullets?: string[]
}

export const thimbleQuoteWorkflow: ThimbleToolkitStep[] = [
  {
    title: "Define how you operate",
    body:
      "Thimble is built around **flexible policies** — many trades buy coverage **by job, month, or season** rather than guessing a yearly premium upfront. Expect questions about trade class, geography, payroll or subcontractor use, and whether you touch ladders, roofs, excavation, or other higher-hazard scopes.",
    bullets: [
      "Have your **trade / NAICS-style description**, **states** you work in, and **typical crew size** ready.",
      "If you subcontract, know **1099 vs W-2 split** roughly — insurers treat risk differently.",
    ],
  },
  {
    title: "Pick the coverages that match your ticket size",
    body:
      "**General liability (GL)** is the baseline for slips, accidental property damage, and many third‑party bodily injury scenarios on site. **Professional liability** matters when your contract includes design, engineering judgment, or sign‑off language. **Tools & equipment** (when offered) can cover theft or damage to owned gear in the field.",
    bullets: [
      "Match **limits** to what your GCs and municipalities put in **COI requirements** (often $1M occurrence / $2M aggregate is a starting ask — not a guarantee).",
      "If you **rent a shop or office**, ask about **BOP** bundles that pair property with liability.",
    ],
  },
  {
    title: "Bind and download proof",
    body:
      "After purchase, you usually get **instant documentation** (policy docs and **certificates of insurance**). Store these in the same place as your license, W‑9, and safety program — many jobs won’t mobilize without a current COI on file.",
    bullets: [
      "Set a **calendar reminder** 30 days before renewal or end of a short-term policy.",
      "When a GC adds an **additional insured** or **waiver of subrogation**, update the policy or endorsement — don’t send an old COI.",
    ],
  },
]

export type ThimbleCoverageRow = {
  name: string
  blurb: string
  href: string
}

export const thimbleCoverageMatrix: ThimbleCoverageRow[] = [
  {
    name: "General liability",
    blurb:
      "Core third-party coverage for many field trades — often the first line item on commercial bid packets and municipal registrations.",
    href: thimbleOfficialLinks.generalLiability,
  },
  {
    name: "Professional liability (E&O)",
    blurb:
      "Protects against claims that your **professional work** or advice caused a financial loss — relevant when estimates, engineering notes, or compliance sign-offs are in scope.",
    href: thimbleOfficialLinks.professionalLiability,
  },
  {
    name: "Business Owner’s Policy (BOP)",
    blurb:
      "Combine **property** (tools, office, stock) with **liability** in one package when you have a fixed location or meaningful assets on the books.",
    href: thimbleOfficialLinks.businessOwnersPolicy,
  },
  {
    name: "Workers’ compensation",
    blurb:
      "Statutory coverage for employee injuries; requirements vary **by state** and payroll. If you have W‑2 crew, this is usually non‑optional.",
    href: thimbleOfficialLinks.workersComp,
  },
]

export const thimbleFieldChecklist: string[] = [
  "Job name, site address, and **owner / GC legal name** for the certificate holder line.",
  "**Additional insured** and **primary & noncontributory** wording if the contract requires it.",
  "**Waiver of subrogation** when the prime flow‑down says so (endorsement, not a text box on a PDF).",
  "**Aggregate** vs **per-project** limits if you run multiple large jobs in parallel.",
  "Auto / **hired & non-owned auto** if your crew drives to sites in personal vehicles for work.",
  "Umbrella / excess if your contract floor is **above** your base GL limit.",
]

export const thimbleFaq: { q: string; a: string }[] = [
  {
    q: "Is Thimble a replacement for my agent?",
    a:
      "No. Thimble is a **carrier / platform** path for many small businesses. Complex multi-state programs, surety, heavy commercial auto fleets, or admitted vs non-admitted nuances may still need a **licensed broker** who can shop multiple markets.",
  },
  {
    q: "Why does my COI get rejected?",
    a:
      "Nine times out of ten: **wrong legal name**, **expired policy**, **missing additional insured**, or **limits** below the contract schedule. Fix the **endorsement** first, then re-issue the COI — don’t edit PDFs by hand.",
  },
  {
    q: "Does short-term insurance affect my long-term pricing?",
    a:
      "Underwriting rules change by carrier and state. Treat every policy — even a **short job** — as part of your **loss history** and carrier profile. Maintain continuous coverage when you can; gaps read as risk.",
  },
  {
    q: "What should I track next to policies in Tradesman?",
    a:
      "For now: **expiration dates**, **certificate holder contacts**, contract **insurance exhibits**, and claims notes alongside the job folder. Dedicated policy objects and customer-facing attestations are on our roadmap as partnerships mature.",
  },
]

/** Internal product roadmap copy — adjust as Thimble conversations land. */
export const tradesmanThimblePartnershipBullets = [
  "**Deep link or embedded quote** prefilled from your trade vertical and service territory in Tradesman.",
  "**Certificate vault** synced to jobs, customers, and office packet exports.",
  "**Renewal pings** wired to Calendar + Notifications when a COI window is closing.",
  "Optional **Tradesman-negotiated bundles** once underwriting and affiliate terms are finalized.",
]
