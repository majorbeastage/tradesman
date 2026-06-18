import type { ClientPackageContext } from "./clientPackageContext"

export type SetupGuideStepId =
  | "welcome"
  | "dashboard"
  | "customers"
  | "estimates"
  | "operations"
  | "scheduling"
  | "myt"
  | "corporate_tools"
  | "payments"
  | "finish"

export type SetupGuideStep = {
  id: SetupGuideStepId
  title: string
  body: string
  page?: string
  bullets?: string[]
  question?: string
}

function baseSteps(ctx: ClientPackageContext): SetupGuideStep[] {
  const pkgLine = ctx.packageLabel
    ? `Your account is on the ${ctx.packageLabel} plan — steps below match what is enabled for you.`
    : "Steps below match the tabs enabled on your portal."

  const steps: SetupGuideStep[] = [
    {
      id: "welcome",
      title: "Welcome",
      body: "This walkthrough introduces the main areas of Tradesman and points you to focused setup wizards inside each tab. You can reopen Setup Guide anytime from Dashboard → Quick Links.",
      bullets: [
        pkgLine,
        "We open each tab behind this panel so you can see where settings live.",
        "Short wizards inside Customers, Estimates, Scheduling, and My T handle detailed choices (voice + AI where noted).",
        "Nothing here locks you in — change settings anytime.",
      ],
    },
    {
      id: "dashboard",
      title: "Dashboard",
      page: "dashboard",
      body: "Your home base: quick links, today’s work, and the platform assistant (“What would you like to do today?”). Use voice or type to jump to a tab or task.",
      bullets: [
        "Quick Links use the paper tile style; Operations, workflow, and org chart appear when your package includes them.",
        "The indigo microphone (bottom-right) talks to the same assistant from any page when enabled — it knows your product package.",
      ],
      question: "Do you want the floating assistant microphone visible on every page? (You choose at the end of this walkthrough.)",
    },
  ]

  if (!ctx.isEstimateToolsOnly) {
    steps.push({
      id: "customers",
      title: "Customers",
      page: "customers",
      body: "Clients, conversation history, SMS/email from the contact card, and specialty reports. Lead fit and urgency also show on this tab.",
      bullets: [
        "Automatic replies — wizard will ask simple questions and map answers to your reply templates.",
        "Lead filter preferences & Alerts — separate wizards for who you hear from and how you get notified.",
        "First outbound texts include a compliance footer; the composer shows what will be appended.",
      ],
      question: "Will you use automatic text or email replies? (Use the Automatic replies wizard below when it is available.)",
    })
  }

  steps.push({
    id: "estimates",
    title: "Estimates",
    page: "quotes",
    body: "Quotes, PDF/email send, scope assistant, and the Estimates Library for reusable content.",
    bullets: [
      "Estimate line items — speak or type; AI fills title, description, and cost from what you say.",
      "Job types — step-by-step wizard (criteria, linked line items, defaults).",
      "Start Quote guide on new estimates walks job details and customer copy options.",
    ],
    question: "Do you already have standard prices or job types to import? (Line items and job type wizards below.)",
  })

  if (ctx.hasOperations && !ctx.isEstimateToolsOnly) {
    steps.push({
      id: "operations",
      title: "Operations",
      page: "operations",
      body: "The Operations hub groups work orders, purchase orders, inventory, invoicing, and team management in one place — especially for Corporate and multi-module accounts.",
      bullets: [
        "Work orders — track field jobs from intake through completion.",
        "Purchase orders & inventory — parts and vendor orders when enabled on your portal.",
        "Team management — assign technicians and calendar policies (office managers and corporate management).",
      ],
      question: "Will your team use work orders or inventory modules, or scheduling only?",
    })
  }

  if (!ctx.isEstimateToolsOnly) {
    steps.push({
      id: "scheduling",
      title: "Scheduling",
      page: "calendar",
      body: "Calendar views, job completion, team assignment, and customer notifications tied to events.",
      bullets: [
        "Alerts wizard — push, email, and SMS preferences for calendar events.",
        "Receipt template wizard — intro text, logo, and line layout for completion receipts.",
        ctx.hasOperations
          ? "Team management lives under Operations when your package includes it."
          : "Team management is optional; solo contractors can use Scheduling tools only.",
      ],
      question: "Will you schedule jobs yourself or assign work to a team?",
    })
  }

  steps.push({
    id: "myt",
    title: "My T",
    page: "account",
    body: "Your Tradesman phone identity: forwarding, optional call screening, voicemail, push/GPS prefs, and profile photo on the mobile app.",
    bullets: [
      "Call forwarding — wizard explains forwarding your business line to your cell in plain language.",
      "Optional call screening — AI or recorded menu before forwarding; off by default so whisper/forward behave as today.",
      "Voicemail greeting — record or upload what callers hear; PIN flow for phone updates.",
    ],
    question: "Have you set call forwarding and decided whether to enable call screening?",
  })

  if (ctx.isCorporate) {
    steps.push({
      id: "corporate_tools",
      title: "Corporate tools",
      page: "organization-chart",
      body: "Corporate accounts include organization chart and business workflow builders for roles, handoffs, and process maps.",
      bullets: [
        "Organization chart — define roles and reporting lines for your company.",
        "Business workflow — map steps, arrows, and assigned users for repeatable jobs.",
        "Corporate External users get a business phone; Corporate Internal users are back-office logins without an assigned line.",
      ],
      question: "Do you want to sketch your org chart or a workflow for your most common job type first?",
    })
  }

  steps.push({
    id: "payments",
    title: "Payments",
    page: "payments",
    body: "Subscription billing for your Tradesman account and (when enabled) Helcim links to collect from customers.",
    bullets: [
      "Payments tab visibility depends on your role and admin configuration.",
      "Customer payment requests are created from the customer record when collections are enabled.",
      ctx.isCorporate
        ? "Corporate billing may include add-on External, Internal, and Office Manager seats — your admin tracks these under Billing & Helcim."
        : "Additional user and office manager seats can be added to your subscription when you grow the team.",
    ],
    question: "Do you need to collect payments from customers through Tradesman?",
  })

  steps.push({
    id: "finish",
    title: "All set",
    page: "dashboard",
    body: "Initial setup is marked complete. Reopen Setup Guide from Quick Links for changes, or use adjustment mode with the AI assistant.",
    bullets: [
      "Per-area setup wizards appear inside each settings panel as you explore.",
      "The platform assistant understands your package — ask for Operations, call screening, org chart, or workflow when enabled.",
    ],
  })

  return steps
}

export function buildSetupGuideSteps(ctx: ClientPackageContext): SetupGuideStep[] {
  return baseSteps(ctx)
}
