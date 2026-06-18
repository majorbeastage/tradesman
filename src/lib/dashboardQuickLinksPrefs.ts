/** Persisted under `profiles.metadata.dashboard_quick_links`. */

export type DashboardCoreQuickLinkId =
  | "customers"
  | "estimates"
  | "calendar"
  | "team_management"
  | "scheduling_tools"

export type DashboardOptionalQuickLinkId =
  | "setup_guide"
  | "settings"
  | "payments"
  | "insurance"
  | "customer_payments_soon"
  | "reporting"
  | "job_types"
  | "today_todo"
  | "time_clock"
  | "custom_receipt"
  | "business_workflow"
  | "organization_chart"
  | "operations"
  | "operations_work_orders"
  | "operations_purchase_orders"
  | "operations_invoicing"
  | "operations_inventory"

export type DashboardQuickLinkId = DashboardCoreQuickLinkId | DashboardOptionalQuickLinkId

export const ALL_DASHBOARD_CORE_IDS = new Set<DashboardCoreQuickLinkId>([
  "customers",
  "estimates",
  "calendar",
  "team_management",
  "scheduling_tools",
])

export const ALL_DASHBOARD_OPTIONAL_IDS = new Set<DashboardOptionalQuickLinkId>([
  "setup_guide",
  "settings",
  "payments",
  "insurance",
  "customer_payments_soon",
  "reporting",
  "job_types",
  "today_todo",
  "time_clock",
  "custom_receipt",
  "business_workflow",
  "organization_chart",
  "operations",
  "operations_work_orders",
  "operations_purchase_orders",
  "operations_invoicing",
  "operations_inventory",
])

export const ALL_DASHBOARD_LINK_IDS = new Set<DashboardQuickLinkId>([
  ...(ALL_DASHBOARD_CORE_IDS as Set<DashboardQuickLinkId>),
  ...(ALL_DASHBOARD_OPTIONAL_IDS as Set<DashboardQuickLinkId>),
])

/** @deprecated palette is computed dynamically — kept for type re-exports */
export const DASHBOARD_PALETTE_ONLY_IDS: DashboardOptionalQuickLinkId[] = [
  "setup_guide",
  "settings",
  "customer_payments_soon",
  "payments",
  "insurance",
  "job_types",
  "today_todo",
  "time_clock",
  "custom_receipt",
  "business_workflow",
  "organization_chart",
  "operations",
  "operations_work_orders",
  "operations_purchase_orders",
  "operations_invoicing",
  "operations_inventory",
]

export const DEFAULT_DASHBOARD_OPTIONAL_ORDER: DashboardOptionalQuickLinkId[] = [
  "setup_guide",
  "insurance",
  "customer_payments_soon",
  "settings",
  "payments",
]

export const DEFAULT_DASHBOARD_CORE_ORDER: DashboardCoreQuickLinkId[] = [
  "customers",
  "estimates",
  "calendar",
  "team_management",
]

export type DashboardTileFontId = "system" | "serif" | "mono" | "rounded"

export type DashboardTileStyle = {
  blockBg?: string
  blockBorder?: string
  accent?: string
  labelColor?: string
  fontFamily?: DashboardTileFontId
  /** Preset thumbnail id — replaces accent circle when set (not "none"). */
  thumbnail?: string
}

export const DASHBOARD_TILE_THUMBNAILS: { id: string; label: string; glyph: string }[] = [
  { id: "none", label: "Circle only", glyph: "" },
  { id: "users", label: "People", glyph: "👥" },
  { id: "clipboard", label: "Estimates", glyph: "📋" },
  { id: "calendar", label: "Calendar", glyph: "📅" },
  { id: "phone", label: "Phone", glyph: "📞" },
  { id: "gear", label: "Settings", glyph: "⚙️" },
  { id: "card", label: "Payments", glyph: "💳" },
  { id: "shield", label: "Insurance", glyph: "🛡️" },
  { id: "chart", label: "Reports", glyph: "📊" },
  { id: "tools", label: "Tools", glyph: "🔧" },
  { id: "clock", label: "Time", glyph: "⏱️" },
  { id: "receipt", label: "Receipt", glyph: "🧾" },
  { id: "flow", label: "Workflow", glyph: "🔀" },
  { id: "org", label: "Org chart", glyph: "🏢" },
  { id: "ops", label: "Operations", glyph: "📦" },
  { id: "star", label: "Star", glyph: "⭐" },
  { id: "check", label: "Done", glyph: "✓" },
]

export const DASHBOARD_TILE_BLOCK_SWATCHES = [
  "#ffffff",
  "#f8fafc",
  "#e0f2fe",
  "#fef3c7",
  "#fce7f3",
  "#dcfce7",
  "#1e293b",
  "#334155",
  "#0f172a",
]

export const DASHBOARD_TILE_ACCENT_SWATCHES = [
  "#f97316",
  "#0ea5e9",
  "#6366f1",
  "#059669",
  "#8b5cf6",
  "#334155",
  "#dc2626",
  "#ca8a04",
]

export const DASHBOARD_TILE_FONT_OPTIONS: { id: DashboardTileFontId; label: string; css: string }[] = [
  { id: "system", label: "System", css: "inherit" },
  { id: "serif", label: "Classic serif", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Technical mono", css: "'Consolas', 'Monaco', monospace" },
  { id: "rounded", label: "Friendly UI", css: "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif" },
]

/** Visual preset for dashboard shell (saved on profile). */
export type DashboardTileScheme = "ember" | "ocean" | "slate" | "paper"

export const DASHBOARD_TILE_SCHEMES: DashboardTileScheme[] = ["ember", "ocean", "slate", "paper"]

export const DEFAULT_DASHBOARD_TILE_SCHEME: DashboardTileScheme = "paper"

export type DashboardQuickLinksStoredV1 = {
  v: 1
  optional_order?: DashboardOptionalQuickLinkId[]
  tile_scheme?: DashboardTileScheme
}

export type DashboardQuickLinksStored = {
  v: 2
  tile_order?: DashboardQuickLinkId[]
  tile_styles?: Partial<Record<string, DashboardTileStyle>>
  tile_scheme?: DashboardTileScheme
}

export function parseDashboardQuickLinks(raw: unknown): DashboardQuickLinksStored | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v === 2) {
    const ord = o.tile_order
    const parsed = Array.isArray(ord)
      ? ord.filter((x): x is DashboardQuickLinkId => typeof x === "string" && ALL_DASHBOARD_LINK_IDS.has(x as DashboardQuickLinkId))
      : []
    const ts = o.tile_scheme
    const tile_scheme =
      ts === "ember" || ts === "ocean" || ts === "slate" || ts === "paper" ? (ts as DashboardTileScheme) : undefined
    const stylesRaw = o.tile_styles
    const tile_styles: Partial<Record<string, DashboardTileStyle>> = {}
    if (stylesRaw && typeof stylesRaw === "object" && !Array.isArray(stylesRaw)) {
      for (const [k, v] of Object.entries(stylesRaw as Record<string, unknown>)) {
        if (!ALL_DASHBOARD_LINK_IDS.has(k as DashboardQuickLinkId)) continue
        if (!v || typeof v !== "object" || Array.isArray(v)) continue
        tile_styles[k] = v as DashboardTileStyle
      }
    }
    return { v: 2, tile_order: parsed.length ? parsed : undefined, tile_scheme, tile_styles }
  }
  if (o.v === 1) {
    const legacy = o as DashboardQuickLinksStoredV1
    const ts = legacy.tile_scheme
    const tile_scheme =
      ts === "ember" || ts === "ocean" || ts === "slate" || ts === "paper" ? (ts as DashboardTileScheme) : undefined
    return { v: 2, tile_order: undefined, tile_scheme, tile_styles: {} }
  }
  return null
}

export function normalizeDashboardOptionalOrder(saved: DashboardOptionalQuickLinkId[] | undefined): DashboardOptionalQuickLinkId[] {
  const hasSaved = Boolean(saved?.length)
  const base = hasSaved ? [...saved!] : [...DEFAULT_DASHBOARD_OPTIONAL_ORDER]
  const seen = new Set<DashboardOptionalQuickLinkId>()
  const out: DashboardOptionalQuickLinkId[] = []
  for (const id of base) {
    if (id === "reporting") continue
    if (!ALL_DASHBOARD_OPTIONAL_IDS.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  if (!hasSaved) {
    for (const id of DEFAULT_DASHBOARD_OPTIONAL_ORDER) {
      if (!seen.has(id)) out.push(id)
    }
  }
  return out
}

export function defaultFourthCalendarLinkId(): DashboardCoreQuickLinkId {
  return "team_management"
}

/** Build default tile order (core row + optional shortcuts). */
export function defaultDashboardTileOrder(fourthCalendar: DashboardCoreQuickLinkId = "team_management"): DashboardQuickLinkId[] {
  const core: DashboardCoreQuickLinkId[] = ["customers", "estimates", "calendar", fourthCalendar]
  const optional = normalizeDashboardOptionalOrder(undefined)
  return normalizeDashboardTileOrder([...core, ...optional])
}

export function normalizeDashboardTileOrder(
  saved: DashboardQuickLinkId[] | undefined,
  fourthCalendar: DashboardCoreQuickLinkId = "team_management",
): DashboardQuickLinkId[] {
  const hasSaved = Boolean(saved?.length)
  const base = hasSaved ? [...saved!] : defaultDashboardTileOrder(fourthCalendar)
  const seen = new Set<DashboardQuickLinkId>()
  const out: DashboardQuickLinkId[] = []
  for (const id of base) {
    if (id === "reporting") continue
    if (id === "team_management" && fourthCalendar === "scheduling_tools") continue
    if (id === "scheduling_tools" && fourthCalendar === "team_management") continue
    if (!ALL_DASHBOARD_LINK_IDS.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  if (!hasSaved) return out
  return out
}

export function migrateStoredTileOrder(
  raw: unknown,
  fourthCalendar: DashboardCoreQuickLinkId,
): { order: DashboardQuickLinkId[]; styles: Partial<Record<string, DashboardTileStyle>>; scheme: DashboardTileScheme } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      order: defaultDashboardTileOrder(fourthCalendar),
      styles: {},
      scheme: DEFAULT_DASHBOARD_TILE_SCHEME,
    }
  }
  const o = raw as Record<string, unknown>
  if (o.v === 2) {
    const parsed = parseDashboardQuickLinks(raw)
    return {
      order: normalizeDashboardTileOrder(parsed?.tile_order, fourthCalendar),
      styles: parsed?.tile_styles ?? {},
      scheme: parsed?.tile_scheme ?? DEFAULT_DASHBOARD_TILE_SCHEME,
    }
  }
  if (o.v === 1) {
    const optional = normalizeDashboardOptionalOrder((o.optional_order as DashboardOptionalQuickLinkId[] | undefined) ?? undefined)
    const core: DashboardCoreQuickLinkId[] = ["customers", "estimates", "calendar", fourthCalendar]
    const ts = o.tile_scheme
    const scheme =
      ts === "ember" || ts === "ocean" || ts === "slate" || ts === "paper" ? (ts as DashboardTileScheme) : DEFAULT_DASHBOARD_TILE_SCHEME
    return {
      order: normalizeDashboardTileOrder([...core, ...optional], fourthCalendar),
      styles: {},
      scheme,
    }
  }
  return {
    order: defaultDashboardTileOrder(fourthCalendar),
    styles: {},
    scheme: DEFAULT_DASHBOARD_TILE_SCHEME,
  }
}

export function mergeDashboardQuickLinksMetadata(
  prevMeta: Record<string, unknown>,
  patch: Partial<Pick<DashboardQuickLinksStored, "tile_order" | "tile_styles" | "tile_scheme">> & {
    optional_order?: DashboardOptionalQuickLinkId[]
  },
  fourthCalendar: DashboardCoreQuickLinkId = "team_management",
): Record<string, unknown> {
  const existing = parseDashboardQuickLinks(prevMeta.dashboard_quick_links)
  const legacyV1 = prevMeta.dashboard_quick_links as DashboardQuickLinksStoredV1 | undefined
  const migrated = migrateStoredTileOrder(prevMeta.dashboard_quick_links, fourthCalendar)
  const next: DashboardQuickLinksStored = {
    v: 2,
    tile_order:
      patch.tile_order !== undefined
        ? normalizeDashboardTileOrder(patch.tile_order, fourthCalendar)
        : patch.optional_order !== undefined
          ? normalizeDashboardTileOrder(
              [
                ...DEFAULT_DASHBOARD_CORE_ORDER.filter((c) => c !== "team_management" || fourthCalendar !== "scheduling_tools"),
                ...(fourthCalendar === "scheduling_tools" ? (["scheduling_tools"] as DashboardQuickLinkId[]) : (["team_management"] as DashboardQuickLinkId[])),
                ...normalizeDashboardOptionalOrder(patch.optional_order),
              ],
              fourthCalendar,
            )
          : normalizeDashboardTileOrder(existing?.tile_order ?? migrated.order, fourthCalendar),
    tile_styles: patch.tile_styles ?? existing?.tile_styles ?? migrated.styles,
    tile_scheme: patch.tile_scheme ?? existing?.tile_scheme ?? legacyV1?.tile_scheme ?? DEFAULT_DASHBOARD_TILE_SCHEME,
  }
  return { ...prevMeta, dashboard_quick_links: next }
}

export function operationsQuickLinkPage(id: DashboardOptionalQuickLinkId): string {
  switch (id) {
    case "operations":
      return "operations"
    case "operations_work_orders":
      return "operations-work_orders"
    case "operations_purchase_orders":
      return "operations-purchase_orders"
    case "operations_invoicing":
      return "operations-invoicing"
    case "operations_inventory":
      return "operations-inventory"
    default:
      return "operations"
  }
}

export function fontCssForTile(fontId: DashboardTileFontId | undefined): string {
  return DASHBOARD_TILE_FONT_OPTIONS.find((f) => f.id === fontId)?.css ?? "inherit"
}

export function thumbnailGlyph(thumbnailId: string | undefined): string {
  if (!thumbnailId || thumbnailId === "none") return ""
  return DASHBOARD_TILE_THUMBNAILS.find((t) => t.id === thumbnailId)?.glyph ?? ""
}
