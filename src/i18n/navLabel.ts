import { TAB_ID_LABELS } from "../types/portal-builder"
import { isIosNativeApp } from "../lib/publicSite"

/** App Store shell label. Web and Android keep "Payments". */
export const IOS_CUSTOMER_PAYMENTS_LABEL = "Customer payments"

/** Resolves sidebar / header tab label: custom portal label wins; else locale string; else English default. */
export function formatPortalTabLabel(
  tab_id: string,
  label: string | null | undefined,
  t: (key: string) => string,
): string {
  if (tab_id === "payments" && isIosNativeApp()) return IOS_CUSTOMER_PAYMENTS_LABEL
  const enFallback = TAB_ID_LABELS[tab_id] ?? tab_id
  if (label != null && label.trim() !== "" && label !== enFallback) return label.trim()
  const key = `nav.${tab_id}`
  const tr = t(key)
  return tr !== key ? tr : enFallback
}

/** Dashboard tile for the payments tab. iOS must not say "Tradesman payments". */
export function dashboardPaymentsQuickLabel(translated: string): string {
  return isIosNativeApp() ? IOS_CUSTOMER_PAYMENTS_LABEL : translated
}
