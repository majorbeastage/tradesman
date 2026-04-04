/** Tech / account help (matches SupportTicketForm tech channel). */
export const TRADESMAN_TECH_SUPPORT_EMAIL = "admin@tradesman-us.com"

/** mailto: for users who cannot open in-app Tech Support (e.g. deactivated account on login). */
export function techSupportMailtoDeactivatedAccount(): string {
  const subject = encodeURIComponent("Tradesman — account access / deactivated account")
  return `mailto:${TRADESMAN_TECH_SUPPORT_EMAIL}?subject=${subject}`
}
