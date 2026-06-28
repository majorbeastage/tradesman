import type { ProductPackageId } from "./productPackages"

export type PricingFeatureGroup = {
  title: string
  items: string[]
}

export type PricingTierContent = {
  id: ProductPackageId
  title: string
  priceMonthly: number
  seats: string
  tagline: string
  featured?: boolean
  /** Shown on every card — monthly voice/SMS allocation for this package. */
  usageDisclaimer: string
  /** When true, show “Includes everything in lower tiers” plus tier-specific groups. */
  buildsOnLowerTiers?: boolean
  chooseOneTools?: string[]
  featureGroups: PricingFeatureGroup[]
  /** Extra bullets only on this tier (when buildsOnLowerTiers). */
  tierAdds?: PricingFeatureGroup[]
}

/** Standard monthly allocations before overage (shown in hero + per-card footnotes). */
export const PRICING_USAGE_ALLOCATIONS = {
  officeManager: { voiceMinutes: 1000, sms: 500, label: "Office Manager login" },
  externalUser: { voiceMinutes: 600, sms: 300, label: "External User login" },
  baseSingleUser: { voiceMinutes: 1000, sms: 500, label: "Base Package — single user" },
} as const

export const PRICING_ADD_ONS = [
  { label: "1 Additional Office Manager login", price: 59.99 },
  { label: "1 Additional User login", price: 49.99 },
  { label: "1 Additional Internal User (no external phone traffic)", price: 29.99 },
  { label: "Upgrade Internal User to External User (per user)", price: 19.99 },
] as const

export const PRICING_TIERS: PricingTierContent[] = [
  {
    id: "estimate_tools_only",
    title: "1 Tool · 1 User",
    priceMonthly: 49.99,
    seats: "1 user sign-in",
    tagline: "Start with one focused module — integrate slowly or run a single workflow without the full platform.",
    usageDisclaimer:
      "Usage limits follow the tool you select. Customer Communications on this tier follows External User limits (600 voice minutes and 300 SMS per month) unless you upgrade to Base or Office Manager plans.",
    chooseOneTools: [
      "Estimates",
      "Scheduling and Receipts",
      "Team Management",
      "Customer Communications",
      "Future Internal Instant Messaging and internal soft phone (requires Office Manager Entry Level or above)",
    ],
    featureGroups: [
      {
        title: "Included with every 1 Tool plan",
        items: ["Payments tab", "Account (My T)"],
      },
    ],
  },
  {
    id: "base",
    title: "Base Package · 1 User",
    priceMonthly: 124.99,
    seats: "1 user sign-in",
    tagline: "Full customer communications, estimates, scheduling, and payments for a solo operator or owner-operator.",
    usageDisclaimer:
      "This package includes 1,000 voice minutes and 500 SMS messages per month before overage charges may apply (same allocation as an Office Manager login).",
    featureGroups: [
      {
        title: "Customer Communications",
        items: [
          "Auto attendant",
          "Call forwarding",
          "Lead capturing, scoring, filtering, and growth management tools",
          "Integrated phone calls, voicemail, SMS, and email",
        ],
      },
      {
        title: "Estimates Module",
        items: [
          "Quick Estimate Wizard",
          "AI-assisted line items",
          "PDF template options with integrated Job Type tool",
          "Catalogued estimate history",
          "Export attachment with signature blocks",
        ],
      },
      {
        title: "Scheduling Tools",
        items: [
          "Estimate-integrated calendar events",
          "Receipts builder",
          "Customer job map options",
        ],
      },
      {
        title: "Payments & platform",
        items: [
          "Customer payment tools via Helcim, Square, PayPal, and similar processors",
          "Additional core platform tools available upon request",
        ],
      },
    ],
  },
  {
    id: "office_manager_entry",
    title: "Office Manager Entry Level",
    priceMonthly: 159.99,
    seats: "1 Office Manager + 1 User",
    tagline: "Add team visibility, permissions, and schedule control on top of the Base Package.",
    buildsOnLowerTiers: true,
    usageDisclaimer:
      "Office Manager login: 1,000 voice minutes and 500 SMS per month. Each User login: 600 voice minutes and 300 SMS per month before overages.",
    tierAdds: [
      {
        title: "Team Management",
        items: [
          "Time clock in and out",
          "Customize user or employee views and permissions",
          "Create Job Types assigned to qualified users",
          "Schedule management for your team",
        ],
      },
    ],
    featureGroups: [],
  },
  {
    id: "office_manager_pro",
    title: "Office Manager Pro",
    priceMonthly: 199.99,
    seats: "1 Office Manager + 4 Users",
    tagline: "Most growing crews land here — full modules, customer database, and map-based job tracking.",
    featured: true,
    buildsOnLowerTiers: true,
    usageDisclaimer:
      "Office Manager login: 1,000 voice minutes and 500 SMS per month. Each User login: 600 voice minutes and 300 SMS per month before overages.",
    tierAdds: [
      {
        title: "Operations visibility",
        items: ["Employee map and job tracking"],
      },
    ],
    featureGroups: [],
  },
  {
    id: "office_manager_elite",
    title: "Office Manager Elite",
    priceMonthly: 369.99,
    seats: "2 Office Managers + 8 Users",
    tagline: "Custom workflows, org charts, and operations tooling for larger field organizations.",
    buildsOnLowerTiers: true,
    usageDisclaimer:
      "Each Office Manager login: 1,000 voice minutes and 500 SMS per month. Each User login: 600 voice minutes and 300 SMS per month before overages.",
    tierAdds: [
      {
        title: "Custom organization & workflow",
        items: [
          "VISIO-style custom workflow management, integrated with customer statuses",
          "Visual organizational chart — internal and external roles and departments",
          "Work order, purchase order, and invoice tools",
          "Custom inventory, document, and inventory database",
        ],
      },
    ],
    featureGroups: [],
  },
  {
    id: "corporate",
    title: "Corporate",
    priceMonthly: 649.99,
    seats: "3 Office Managers · 10 External · 10 Internal",
    tagline: "Multi-department operations with internal-only users and first access to upcoming platform tools.",
    buildsOnLowerTiers: true,
    usageDisclaimer:
      "Office Manager logins: 1,000 voice minutes and 500 SMS each per month. External User logins: 600 voice minutes and 300 SMS each. Internal users have no external calling — internal conversation and forwards only; upgrade any internal user to external for $19.99/month each.",
    tierAdds: [
      {
        title: "Corporate additions",
        items: [
          "Future development for internal instant messaging and internal soft phone client",
          "Create custom requirements for development staff",
          "First access to future tools and developments",
        ],
      },
    ],
    featureGroups: [],
  },
]

export function tierById(id: ProductPackageId): PricingTierContent | undefined {
  return PRICING_TIERS.find((t) => t.id === id)
}

export function formatPrice(usd: number): string {
  return `$${usd.toFixed(2)}`
}
