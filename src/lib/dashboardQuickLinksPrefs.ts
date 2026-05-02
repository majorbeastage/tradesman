/** Persisted under `profiles.metadata.dashboard_quick_links`. */

export type DashboardOptionalQuickLinkId =
  | "settings"
  | "payments"
  | "insurance"
  | "customer_payments_soon"
  | "reporting"
  | "job_types"
  | "today_todo"

export const ALL_DASHBOARD_OPTIONAL_IDS = new Set<DashboardOptionalQuickLinkId>([
  "settings",
  "payments",
  "insurance",
  "customer_payments_soon",
  "reporting",
  "job_types",
  "today_todo",
])

/** Extra shortcuts offered in customize mode (not on the bar until added). */
export const DASHBOARD_PALETTE_ONLY_IDS: DashboardOptionalQuickLinkId[] = ["job_types", "today_todo"]

export const DEFAULT_DASHBOARD_OPTIONAL_ORDER: DashboardOptionalQuickLinkId[] = [
  "insurance",
  "customer_payments_soon",
  "reporting",
  "settings",
  "payments",
]

export type DashboardQuickLinksStored = {
  v: 1
  optional_order?: DashboardOptionalQuickLinkId[]
}

export function parseDashboardQuickLinks(raw: unknown): DashboardQuickLinksStored | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return null
  const ord = o.optional_order
  if (!Array.isArray(ord)) return { v: 1 }
  const allowed = ALL_DASHBOARD_OPTIONAL_IDS
  const parsed = ord.filter((x): x is DashboardOptionalQuickLinkId => typeof x === "string" && allowed.has(x as DashboardOptionalQuickLinkId))
  return { v: 1, optional_order: parsed }
}

export function normalizeDashboardOptionalOrder(saved: DashboardOptionalQuickLinkId[] | undefined): DashboardOptionalQuickLinkId[] {
  const base = saved?.length ? [...saved] : [...DEFAULT_DASHBOARD_OPTIONAL_ORDER]
  const seen = new Set<DashboardOptionalQuickLinkId>()
  const out: DashboardOptionalQuickLinkId[] = []
  for (const id of base) {
    if (!ALL_DASHBOARD_OPTIONAL_IDS.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of DEFAULT_DASHBOARD_OPTIONAL_ORDER) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

export function mergeDashboardQuickLinksMetadata(
  prevMeta: Record<string, unknown>,
  prefs: DashboardQuickLinksStored,
): Record<string, unknown> {
  return { ...prevMeta, dashboard_quick_links: prefs }
}
