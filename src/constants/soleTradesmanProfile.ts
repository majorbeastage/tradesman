/** Tradesman workspace identity for User-zero marketing (not a SOLE-systems login). */
export const SOLE_TRADESMAN_PROFILE_EMAIL = "sole@tradesman-us.com"

export const ADMIN_OPS_SITE_LOGINS_SETTING_KEY = "admin_ops_site_logins_v1"

export type SoleSiteLogin = {
  id: string
  siteKey: string
  siteLabel: string
  url: string
  username: string
  password: string
  notes: string
  updatedAt: string | null
}

export const DEFAULT_SOLE_SITE_LOGINS: Array<Pick<SoleSiteLogin, "siteKey" | "siteLabel" | "url">> = [
  { siteKey: "meta", siteLabel: "Meta (Facebook / Instagram)", url: "https://business.facebook.com" },
  { siteKey: "tiktok", siteLabel: "TikTok", url: "https://www.tiktok.com/login" },
  { siteKey: "google", siteLabel: "Google Business Profile", url: "https://business.google.com" },
  { siteKey: "yelp", siteLabel: "Yelp", url: "https://biz.yelp.com" },
  { siteKey: "linkedin", siteLabel: "LinkedIn", url: "https://www.linkedin.com/login" },
  { siteKey: "apple", siteLabel: "Apple Business Connect", url: "https://businessconnect.apple.com" },
]
