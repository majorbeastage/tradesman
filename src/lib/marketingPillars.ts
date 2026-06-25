/** Seven platform pillars — short copy for marketing previews (not yet wired to production home). */

import imgWorkflow from "../assets/homepage/Screenshot 2026-06-24 075437.png"
import imgWorkflowProgress from "../assets/homepage/Screenshot 2026-06-24 073959.png"
import imgScreening from "../assets/homepage/Screenshot 2026-06-24 074510.png"
import imgComms from "../assets/homepage/Screenshot 2026-06-24 074400.png"
import imgGrowth from "../assets/homepage/Screenshot 2026-06-24 075145.png"
import imgPayments from "../assets/homepage/Screenshot 2026-06-24 075630.png"
import imgScheduling from "../assets/homepage/Screenshot 2026-06-24 073711.png"
import imgArchive from "../assets/homepage/Screenshot 2026-06-24 074242.png"
import imgHero from "../assets/homepage/Screenshot 2026-06-24 075353.png"

export type MarketingPillarId =
  | "workflow"
  | "screening"
  | "comms"
  | "growth"
  | "payments"
  | "scheduling"
  | "archive"

export type MarketingImagePresentation = {
  objectFit?: "cover" | "contain"
  objectPosition?: string
  minHeight?: number
  frameBg?: string
  zoom?: number
  /** Give the screenshot column extra width on desktop */
  imageEmphasis?: boolean
}

export type MarketingPillar = {
  id: MarketingPillarId
  title: string
  tagline: string
  body: string
  bullets?: string[]
  image: string
  /** Optional alternate for dense UI (e.g. flowchart vs progress list) */
  imageAlt?: string
  imagePresentation?: MarketingImagePresentation
  accent: string
}

export const MARKETING_HERO = {
  headline: "Run the office. Run the job. Get paid.",
  subhead:
    "One platform for customer conversations, estimates, scheduling, team workflows, and payments—built for trades and field service.",
  trialNote: "Try free trial mode with sample customers before you sign up.",
}

export const MARKETING_PILLARS: MarketingPillar[] = [
  {
    id: "workflow",
    title: "Workflows",
    tagline: "Jobs move through your team—not your inbox.",
    body: "Estimates, purchase orders, and work orders follow your org chart. Approvers see their step; nothing goes to the customer until you’re ready.",
    bullets: ["Org chart + process map", "Send to approvers or customer", "PO / WO / inventory tied in"],
    image: imgWorkflowProgress,
    imageAlt: imgWorkflow,
    imagePresentation: {
      objectFit: "contain",
      objectPosition: "top center",
      minHeight: 480,
      frameBg: "#f1f5f9",
      imageEmphasis: true,
    },
    accent: "#0ea5e9",
  },
  {
    id: "screening",
    title: "Call screening",
    tagline: "Missed calls get a text-back—not a dead end.",
    body: "Auto-replies, opt-in capture, and smart filtering so real leads land on the customer record instead of voicemail limbo.",
    bullets: ["Missed-call text-back", "SMS consent on file", "Spam & screening options"],
    image: imgScreening,
    accent: "#8b5cf6",
  },
  {
    id: "comms",
    title: "Communications",
    tagline: "Calls, texts, and email in one timeline.",
    body: "Quick actions from the customer list or full profile. Every touchpoint stays on the job—no copying between apps.",
    bullets: ["Unified customer thread", "Auto responses", "AI-assisted replies"],
    image: imgComms,
    imagePresentation: {
      objectFit: "contain",
      objectPosition: "top center",
      minHeight: 540,
      frameBg: "#e0f2fe",
      zoom: 1.06,
      imageEmphasis: true,
    },
    accent: "#06b6d4",
  },
  {
    id: "growth",
    title: "Growth",
    tagline: "Track profiles, grade visibility, run campaigns.",
    body: "Save website and social profile URLs, grade what AI can read, set a marketing budget, and compare traffic before and after campaign pushes.",
    bullets: ["Business & social profiles", "AI visibility grades", "Before/after campaign snapshots"],
    image: imgGrowth,
    accent: "#10b981",
  },
  {
    id: "payments",
    title: "Payments",
    tagline: "Text a pay link from the job.",
    body: "Create payment requests tied to an estimate or calendar job. Customer pays online; you stay in Tradesman.",
    bullets: ["Helcim & provider settings", "SMS / email delivery", "Linked to estimates"],
    image: imgPayments,
    accent: "#f97316",
  },
  {
    id: "scheduling",
    title: "Scheduling",
    tagline: "Calendar, map, and crew in one view.",
    body: "Assign field techs, clock shifts, and see live pins on the map. Office managers control who sees what.",
    bullets: ["Team map + job pins", "Shift & job clock", "Permissions per role"],
    image: imgScheduling,
    accent: "#eab308",
  },
  {
    id: "archive",
    title: "Archive & records",
    tagline: "Every job documented and searchable.",
    body: "Customer profiles hold estimates, receipts, notes, and workflow history—active jobs and completed work in one database.",
    bullets: ["Full customer profile", "Reports & exports", "Archive when done"],
    image: imgArchive,
    accent: "#64748b",
  },
]

export const MARKETING_HERO_SCREENSHOT = imgHero

export const MARKETING_HERO_PRESENTATION: MarketingImagePresentation = {
  objectFit: "contain",
  objectPosition: "top center",
  minHeight: 520,
  frameBg: "#f8fafc",
  zoom: 1.04,
}

export type MarketingPreviewVariant = "bento" | "story" | "grid"

export const MARKETING_PREVIEW_VARIANTS: { id: MarketingPreviewVariant; label: string; blurb: string }[] = [
  { id: "bento", label: "Bento", blurb: "Hero + asymmetric product grid" },
  { id: "story", label: "Story scroll", blurb: "Sticky stacked slides on scroll" },
  { id: "grid", label: "Compact grid", blurb: "Dense seven-pillar cards" },
]
