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

/** Visual preset for dashboard quick-link tiles (saved on profile). */
export type DashboardTileScheme = "ember" | "ocean" | "slate" | "paper"

export const DASHBOARD_TILE_SCHEMES: DashboardTileScheme[] = ["ember", "ocean", "slate", "paper"]

export const DEFAULT_DASHBOARD_TILE_SCHEME: DashboardTileScheme = "ember"

export type DashboardQuickLinksStored = {
  v: 1
  optional_order?: DashboardOptionalQuickLinkId[]
  tile_scheme?: DashboardTileScheme
}

export function parseDashboardQuickLinks(raw: unknown): DashboardQuickLinksStored | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return null
  const ord = o.optional_order
  const allowed = ALL_DASHBOARD_OPTIONAL_IDS
  const parsed = Array.isArray(ord)
    ? ord.filter((x): x is DashboardOptionalQuickLinkId => typeof x === "string" && allowed.has(x as DashboardOptionalQuickLinkId))
    : []
  const ts = o.tile_scheme
  const tile_scheme =
    ts === "ember" || ts === "ocean" || ts === "slate" || ts === "paper" ? (ts as DashboardTileScheme) : undefined
  const out: DashboardQuickLinksStored = { v: 1, tile_scheme }
  if (parsed.length) out.optional_order = parsed
  return out
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
  patch: Partial<Pick<DashboardQuickLinksStored, "optional_order" | "tile_scheme">>,
): Record<string, unknown> {
  const existing = parseDashboardQuickLinks(prevMeta.dashboard_quick_links)
  const next: DashboardQuickLinksStored = {
    v: 1,
    optional_order:
      patch.optional_order !== undefined
        ? normalizeDashboardOptionalOrder(patch.optional_order)
        : normalizeDashboardOptionalOrder(existing?.optional_order),
    tile_scheme: patch.tile_scheme ?? existing?.tile_scheme ?? DEFAULT_DASHBOARD_TILE_SCHEME,
  }
  return { ...prevMeta, dashboard_quick_links: next }
}
