/**
 * Public legal / compliance URLs. Defaults are same-origin paths.
 * If privacy/terms live on www.tradesman-us.com and SMS consent on tradesman.vercel.app,
 * set the env vars in each Vercel project so cross-links resolve correctly.
 */
function trimOrEmpty(value: string | undefined): string {
  return value?.trim() ?? ""
}

export const LEGAL_LINKS = {
  privacy: trimOrEmpty(import.meta.env.VITE_PUBLIC_PRIVACY_URL) || "/privacy",
  terms: trimOrEmpty(import.meta.env.VITE_PUBLIC_TERMS_URL) || "/terms",
  smsConsent: trimOrEmpty(import.meta.env.VITE_PUBLIC_SMS_CONSENT_URL) || "/sms-consent",
  /** Account deletion (Google Play / data safety); default same-origin public page. */
  accountDeletion: trimOrEmpty(import.meta.env.VITE_PUBLIC_ACCOUNT_DELETION_URL) || "/account-deletion",
} as const
