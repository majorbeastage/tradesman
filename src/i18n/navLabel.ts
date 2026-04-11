import { TAB_ID_LABELS } from "../types/portal-builder"

/** Resolves sidebar / header tab label: custom portal label wins; else locale string; else English default. */
export function formatPortalTabLabel(
  tab_id: string,
  label: string | null | undefined,
  t: (key: string) => string,
): string {
  const enFallback = TAB_ID_LABELS[tab_id] ?? tab_id
  if (label != null && label.trim() !== "" && label !== enFallback) return label.trim()
  const key = `nav.${tab_id}`
  const tr = t(key)
  return tr !== key ? tr : enFallback
}
