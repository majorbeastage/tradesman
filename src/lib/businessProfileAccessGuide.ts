/**
 * Client-facing guide: how to grant Tradesman access to each business profile.
 * Rendered in Growth → Business profiles.
 */

export type BusinessProfileAccessGuide = {
  id: string
  label: string
  why: string
  inviteTarget: string
  steps: string[]
  notes?: string
}

/** Prefer inviting the assigned marketing contact; this is the fallback ops mailbox. */
export const TRADESMAN_ACCESS_INVITE_EMAIL = "admin@tradesman-us.com"

export const BUSINESS_PROFILE_ACCESS_GUIDE: BusinessProfileAccessGuide[] = [
  {
    id: "website",
    label: "Website",
    why: "We need the live URL for landing pages, tracking, and grading. CMS login is only needed if you want us to publish pages for you.",
    inviteTarget: "Share the public site URL in this Growth tab. For edit access, invite us in your website host (WordPress, Squarespace, Wix, GoDaddy, etc.).",
    steps: [
      "Paste your homepage URL above (https://…).",
      "If we will edit the site: open your host’s Users / Team settings.",
      `Invite ${TRADESMAN_ACCESS_INVITE_EMAIL} (or the email your Tradesman contact gives you) as Editor — not Owner unless you intend full ownership.`,
      "Tell us which pages we may change (home, services, contact, landing pages).",
    ],
    notes: "Never share your personal password in chat. Always use an invite / team seat.",
  },
  {
    id: "google",
    label: "Google Business Profile",
    why: "Required for Maps, local search, Google posts, and (later) Reserve with Google. Manager access lets us update hours, photos, posts, and review replies without taking ownership.",
    inviteTarget: "Google Business Profile → Users → Add users",
    steps: [
      "Open Google Business Profile Manager (business.google.com) while signed in as Owner.",
      "Select your location → Users (or People and access).",
      `Add ${TRADESMAN_ACCESS_INVITE_EMAIL} (or your assigned Tradesman marketing email).`,
      "Role: Managers (can edit listing). Owners keep full control.",
      "Paste your public Maps / g.page link in Business profiles above and check “I manage this Google Business listing” when you control the listing.",
      "Accept any verification prompts Google sends to the Owner account.",
    ],
    notes: "Do not transfer Ownership unless you explicitly want Tradesman to own the listing.",
  },
  {
    id: "facebook",
    label: "Facebook Page",
    why: "Needed for Page posts, Meta ads, Messenger intake, and Instagram linking through Meta Business Suite.",
    inviteTarget: "Meta Business Suite / Facebook Page settings → Page access",
    steps: [
      "Open Meta Business Suite (business.facebook.com) or your Facebook Page → Settings → Page access (or Professional dashboard → Access).",
      `Invite ${TRADESMAN_ACCESS_INVITE_EMAIL} (or your Tradesman contact email) with full control or at least content + ads permissions.`,
      "If you use Meta Business Manager: Partners → Add partner → share the Page (and Ad Account if we will run ads).",
      "Confirm the invite from email / Notifications.",
      "Paste your public Page URL (facebook.com/…) in Business profiles above.",
    ],
    notes: "Facebook and Instagram are both managed under Meta. Granting Page access is the usual first step.",
  },
  {
    id: "instagram",
    label: "Instagram",
    why: "Used for creative, Stories/Reels, and Meta ads that use Instagram placements.",
    inviteTarget: "Instagram professional account linked to your Facebook Page / Meta Business Suite",
    steps: [
      "Convert to a Professional (Business or Creator) Instagram account if it is still personal.",
      "In Meta Business Suite or Instagram Settings → Connected tools / Page, link Instagram to your Facebook Page.",
      "In Business Suite → Settings → Instagram accounts, assign Tradesman the same partner/people access you gave the Facebook Page.",
      "Alternatively: Instagram → Settings → Account Center / Business → add a partner with content rights.",
      "Paste your profile URL (instagram.com/…) above.",
    ],
    notes: "If Instagram is not linked to the Facebook Page, ads and scheduling are much harder — link them before inviting us.",
  },
  {
    id: "linkedin",
    label: "LinkedIn Company Page",
    why: "Useful for B2B trades, hiring, and LinkedIn Campaign Manager ads.",
    inviteTarget: "LinkedIn Company Page → Admin tools → Manage admins",
    steps: [
      "Open your Company Page → Admin tools → Manage admins.",
      `Invite ${TRADESMAN_ACCESS_INVITE_EMAIL} (or your Tradesman contact) as Content admin (or Sponsored Content poster if ads only).`,
      "For ads: open Campaign Manager and grant that same person access to the ad account.",
      "Paste your company URL (linkedin.com/company/…) above.",
    ],
  },
  {
    id: "yelp",
    label: "Yelp",
    why: "Local discovery and review presence. Access lets us claim updates and respond to reviews when you approve it.",
    inviteTarget: "Yelp for Business → Account / Users",
    steps: [
      "Claim or sign in to Yelp for Business for your listing.",
      "Open Account settings → Users (or Account info → Add user).",
      `Invite ${TRADESMAN_ACCESS_INVITE_EMAIL} (or your Tradesman contact) with manager permissions.`,
      "Paste your Yelp biz URL above.",
    ],
    notes: "Yelp advertising is separate from the free listing — tell us if you want paid Yelp campaigns.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    why: "Short-form video and TikTok Ads. Business Center access is required for ads and multi-user posting.",
    inviteTarget: "TikTok → Settings → Manage account / Business Center",
    steps: [
      "Use or create a TikTok Business account for the brand.",
      "Open TikTok Business Center (or in-app Settings → Manage permissions).",
      `Invite ${TRADESMAN_ACCESS_INVITE_EMAIL} (or your Tradesman contact) as an Analyst or Advertiser (higher roles only if you want posting).`,
      "Share the Ad Account if we will spend media on TikTok.",
      "Paste your profile URL (tiktok.com/@…) above.",
    ],
  },
  {
    id: "x",
    label: "X (Twitter)",
    why: "Brand presence and optional X Ads. Team access avoids sharing the password.",
    inviteTarget: "X → Settings → Security and account access → Delegate / Teams (or Ads account users)",
    steps: [
      "Open X Settings → Security and account access → Delegate access (or Teams, depending on account type).",
      `Invite ${TRADESMAN_ACCESS_INVITE_EMAIL} (or your Tradesman contact) as Admin or Contributor.`,
      "For ads: X Ads → Account access → Invite users with Ad manager rights.",
      "Paste your profile URL (x.com/…) above.",
    ],
    notes: "If Delegate/Teams is unavailable on a free account, create a strong unique password for a shared ops login only as a last resort — prefer invite-based access.",
  },
  {
    id: "youtube",
    label: "YouTube",
    why: "Video presence for how-to and project content, plus YouTube/Google video ads. Channel access lets us upload, optimize, and manage without your password.",
    inviteTarget: "YouTube channel → Google (Brand) account managers, or Google Ads for video campaigns",
    steps: [
      "Confirm the channel uses a Brand Account (Settings → Advanced settings → 'Move channel to a Brand Account' if it is on a personal login).",
      "Open studio.youtube.com → Settings → Permissions (Brand Account channels), or account.google.com → the Brand Account → Manage permissions.",
      `Invite ${TRADESMAN_ACCESS_INVITE_EMAIL} (or your Tradesman contact) as a Manager or Editor.`,
      "For video ads, link the channel to your Google Ads account and grant us access there.",
      "Paste your channel URL (youtube.com/@… or /channel/…) above.",
    ],
    notes: "Manager access requires a Brand Account. A channel tied to a personal Google login cannot add managers until it is converted.",
  },
]

export const BUSINESS_PROFILE_ACCESS_INTRO = {
  title: "How to give Tradesman access",
  summary:
    "Save each public profile URL above, then invite Tradesman as a Manager / Partner on the platforms you want us to run or monitor. You keep Ownership. Never send passwords in text or email — always use the platform’s invite flow.",
  checklist: [
    "Add the public URL for every profile you use.",
    "Invite Tradesman with Manager (not Owner) access where possible.",
    "Use the email your Tradesman contact provides, or admin@tradesman-us.com.",
    "Tell us when the invite is sent so we can accept it the same day.",
    "After access is accepted, we can post, reply, and run ads under your approval and campaign budget rules.",
  ],
}
