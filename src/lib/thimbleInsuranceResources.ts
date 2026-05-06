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
