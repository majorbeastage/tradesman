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
  | "growth"
  | "email_client"

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
  "growth",
  "email_client",
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
  "growth",
  "email_client",
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

export type DashboardGridColumns = 2 | 3 | 4 | 5 | "auto"

export const DASHBOARD_GRID_COLS = 5
export const DASHBOARD_GRID_ROWS = 5
export const DASHBOARD_GRID_SLOT_COUNT = DASHBOARD_GRID_COLS * DASHBOARD_GRID_ROWS

/** Desktop customize editor: minimum visible rows (columns follow container width). */
export const DASHBOARD_CUSTOMIZE_MIN_ROWS_DESKTOP = 2
export const DASHBOARD_CUSTOMIZE_MIN_ROWS_MOBILE = 2
/** Upper cap when dragging to add more rows in the customize editor. */
export const DASHBOARD_CUSTOMIZE_MAX_ROWS_DESKTOP = 6
export const DASHBOARD_CUSTOMIZE_MAX_ROWS_MOBILE = 6

export const DASHBOARD_TILE_WIDTH_DESKTOP = 132
export const DASHBOARD_TILE_WIDTH_MOBILE = 78
export const DASHBOARD_TILE_GAP_DESKTOP = 10
export const DASHBOARD_TILE_GAP_MOBILE = 8

export function dashboardCustomizeMinRows(isMobile: boolean): number {
  return isMobile ? DASHBOARD_CUSTOMIZE_MIN_ROWS_MOBILE : DASHBOARD_CUSTOMIZE_MIN_ROWS_DESKTOP
}

export function dashboardCustomizeMaxRows(isMobile: boolean): number {
  return isMobile ? DASHBOARD_CUSTOMIZE_MAX_ROWS_MOBILE : DASHBOARD_CUSTOMIZE_MAX_ROWS_DESKTOP
}

/** Column count from container width and fixed tile size (matches display + editor). */
export function dashboardColsFromWidth(width: number, isMobile: boolean): number {
  const tileW = isMobile ? DASHBOARD_TILE_WIDTH_MOBILE : DASHBOARD_TILE_WIDTH_DESKTOP
  const gap = isMobile ? DASHBOARD_TILE_GAP_MOBILE : DASHBOARD_TILE_GAP_DESKTOP
  if (width < tileW) return 1
  return Math.max(1, Math.floor((width + gap) / (tileW + gap)))
}

export function customizeGridSlotCount(cols: number, rows: number): number {
  return cols * rows
}

export function customizeGridRowsFromLength(grid: DashboardTileGridSlot[], cols: number, minRows: number): number {
  if (cols < 1) return minRows
  let occupied = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] != null) occupied = Math.max(occupied, Math.floor(i / cols) + 1)
  }
  return Math.max(minRows, occupied, Math.ceil(grid.length / cols) || minRows)
}

export function emptyCustomizeGrid(cols: number, rows: number): DashboardTileGridSlot[] {
  return Array.from({ length: customizeGridSlotCount(cols, rows) }, () => null)
}

export function ensureCustomizeGridSize(
  grid: DashboardTileGridSlot[],
  cols: number,
  minRows: number,
): DashboardTileGridSlot[] {
  const rows = customizeGridRowsFromLength(grid, cols, minRows)
  const targetLen = customizeGridSlotCount(cols, rows)
  if (grid.length === targetLen) return grid
  const next = [...grid]
  while (next.length < targetLen) next.push(null)
  return next.slice(0, targetLen)
}

/** Move or swap a tile into a slot; grows the grid when dropping into a new bottom row. */
export function placeTileInCustomizeSlot(
  grid: DashboardTileGridSlot[],
  cols: number,
  isMobile: boolean,
  tileId: DashboardQuickLinkId,
  toSlot: number,
): DashboardTileGridSlot[] {
  const minRows = dashboardCustomizeMinRows(isMobile)
  const maxRows = dashboardCustomizeMaxRows(isMobile)
  let sized = ensureCustomizeGridSize(grid, cols, minRows)
  const targetRow = Math.floor(toSlot / cols)
  const neededRows = targetRow + 1
  let rows = customizeGridRowsFromLength(sized, cols, minRows)
  if (neededRows > rows) {
    if (neededRows > maxRows || toSlot < 0) return grid
    rows = neededRows
    while (sized.length < customizeGridSlotCount(cols, rows)) {
      sized = [...sized, ...Array(cols).fill(null)]
    }
  }
  if (toSlot < 0 || toSlot >= sized.length) return grid
  return moveTileToCustomizeSlot(sized, tileId, toSlot)
}

/** Move or swap a tile into a slot (from hidden palette or another slot). */
export function moveTileToCustomizeSlot(
  grid: DashboardTileGridSlot[],
  tileId: DashboardQuickLinkId,
  toSlot: number,
): DashboardTileGridSlot[] {
  if (toSlot < 0 || toSlot >= grid.length) return grid
  const next = [...grid]
  const fromSlot = next.findIndex((x) => x === tileId)
  const displaced = next[toSlot]
  if (fromSlot >= 0) next[fromSlot] = null
  next[toSlot] = tileId
  if (fromSlot >= 0 && displaced && displaced !== tileId) {
    next[fromSlot] = displaced
  }
  return next
}

export function removeTileFromCustomizeGrid(grid: DashboardTileGridSlot[], id: DashboardQuickLinkId): DashboardTileGridSlot[] {
  return grid.map((x) => (x === id ? null : x))
}

/** Preserve tile positions when column count changes (resize). */
export function resizeCustomizeGrid(
  grid: DashboardTileGridSlot[],
  oldCols: number,
  newCols: number,
  isMobile: boolean,
  savedRows?: number,
): DashboardTileGridSlot[] {
  const minRows = dashboardCustomizeMinRows(isMobile)
  const rows = savedRows && savedRows >= minRows ? savedRows : customizeGridRowsFromLength(grid, oldCols, minRows)
  const next = emptyCustomizeGrid(newCols, rows)
  const seen = new Set<DashboardQuickLinkId>()
  const oldMax = Math.max(1, oldCols)
  for (let i = 0; i < grid.length; i++) {
    const id = grid[i]
    if (!id || seen.has(id)) continue
    const row = Math.floor(i / oldMax)
    const col = i % oldMax
    if (row >= rows || col >= newCols) continue
    const ni = row * newCols + col
    if (ni < next.length) {
      next[ni] = id
      seen.add(id)
    }
  }
  return next
}

export function normalizeCustomizeGrid(
  saved: DashboardTileGridSlot[] | undefined,
  savedCols: number | undefined,
  savedRows: number | undefined,
  cols: number,
  isMobile: boolean,
  fallbackOrder: DashboardQuickLinkId[],
  fourthCalendar: DashboardCoreQuickLinkId = "team_management",
): DashboardTileGridSlot[] {
  const minRows = dashboardCustomizeMinRows(isMobile)
  const rows =
    savedRows && savedRows >= minRows
      ? savedRows
      : Array.isArray(saved) && saved.length > 0
        ? customizeGridRowsFromLength(saved, savedCols && savedCols > 0 ? savedCols : cols, minRows)
        : minRows
  const grid = emptyCustomizeGrid(cols, rows)
  const seen = new Set<DashboardQuickLinkId>()

  if (Array.isArray(saved) && saved.length > 0) {
    const inferredOldCols =
      savedCols && savedCols > 0
        ? savedCols
        : saved.length === DASHBOARD_GRID_SLOT_COUNT
          ? DASHBOARD_GRID_COLS
          : cols
    const resized = resizeCustomizeGrid(saved, inferredOldCols, cols, isMobile, rows)
    for (let i = 0; i < resized.length && i < grid.length; i++) {
      const ok = filterRowId(resized[i], seen, fourthCalendar)
      if (ok) grid[i] = ok
    }
  }

  for (const id of fallbackOrder) {
    if (seen.has(id)) continue
    const idx = grid.findIndex((x) => x === null)
    if (idx < 0) break
    const ok = filterRowId(id, seen, fourthCalendar)
    if (ok) grid[idx] = ok
  }
  return grid
}

export type DashboardTileGridSlot = DashboardQuickLinkId | null

export type DashboardQuickLinksStored = {
  v: 2 | 3 | 4
  /** Fixed 5×5 layout — index 0–24 row-major; null = empty slot. */
  tile_grid?: DashboardTileGridSlot[]
  tile_order?: DashboardQuickLinkId[]
  /** @deprecated use tile_grid */
  tile_rows?: DashboardQuickLinkId[][]
  /** @deprecated use tile_grid */
  grid_columns?: DashboardGridColumns
  /** Measured column count for the quick-link grid. */
  tile_grid_cols?: number
  /** Row count for the variable-size quick-link grid (grows when user adds rows). */
  tile_grid_rows?: number
  tile_styles?: Partial<Record<string, DashboardTileStyle>>
  tile_scheme?: DashboardTileScheme
}

export function emptyDashboardTileGrid(): DashboardTileGridSlot[] {
  return Array.from({ length: DASHBOARD_GRID_SLOT_COUNT }, () => null)
}

export function orderToTileGrid(order: DashboardQuickLinkId[]): DashboardTileGridSlot[] {
  const grid = emptyDashboardTileGrid()
  order.slice(0, DASHBOARD_GRID_SLOT_COUNT).forEach((id, i) => {
    grid[i] = id
  })
  return grid
}

export function tileGridToOrder(grid: DashboardTileGridSlot[]): DashboardQuickLinkId[] {
  return grid.filter((x): x is DashboardQuickLinkId => x != null)
}

export function normalizeDashboardTileGrid(
  saved: DashboardTileGridSlot[] | undefined,
  fallbackOrder: DashboardQuickLinkId[],
  fourthCalendar: DashboardCoreQuickLinkId = "team_management",
): DashboardTileGridSlot[] {
  const grid = emptyDashboardTileGrid()
  const seen = new Set<DashboardQuickLinkId>()

  if (Array.isArray(saved) && saved.length === DASHBOARD_GRID_SLOT_COUNT) {
    for (let i = 0; i < DASHBOARD_GRID_SLOT_COUNT; i++) {
      const ok = filterRowId(saved[i], seen, fourthCalendar)
      if (ok) grid[i] = ok
    }
  }

  for (const id of fallbackOrder) {
    if (seen.has(id)) continue
    const idx = grid.findIndex((x) => x === null)
    if (idx < 0) break
    grid[idx] = id
    seen.add(id)
  }
  return grid
}

export function swapGridSlots(
  grid: DashboardTileGridSlot[],
  fromSlot: number,
  toSlot: number,
): DashboardTileGridSlot[] {
  if (fromSlot === toSlot) return grid
  if (fromSlot < 0 || toSlot < 0 || fromSlot >= DASHBOARD_GRID_SLOT_COUNT || toSlot >= DASHBOARD_GRID_SLOT_COUNT) {
    return grid
  }
  const next = [...grid]
  const tmp = next[fromSlot]
  next[fromSlot] = next[toSlot]
  next[toSlot] = tmp
  return next
}

export function placeTileInGridSlot(
  grid: DashboardTileGridSlot[],
  tileId: DashboardQuickLinkId,
  slotIndex: number,
): DashboardTileGridSlot[] {
  if (slotIndex < 0 || slotIndex >= DASHBOARD_GRID_SLOT_COUNT) return grid
  const next = grid.map((x) => (x === tileId ? null : x))
  next[slotIndex] = tileId
  return next
}

export function removeTileIdFromGrid(grid: DashboardTileGridSlot[], id: DashboardQuickLinkId): DashboardTileGridSlot[] {
  return grid.map((x) => (x === id ? null : x))
}

export function addTileToFirstEmptyGridSlot(
  grid: DashboardTileGridSlot[],
  id: DashboardQuickLinkId,
): DashboardTileGridSlot[] {
  if (grid.includes(id)) return grid
  const idx = grid.findIndex((x) => x === null)
  if (idx < 0) return grid
  return placeTileInGridSlot(grid, id, idx)
}

export type TileDropTarget =
  | { kind: "before"; row: number; col: number }
  | { kind: "append"; row: number }
  | { kind: "newRow"; afterRow: number }

export function flattenTileRows(rows: DashboardQuickLinkId[][]): DashboardQuickLinkId[] {
  return rows.flat()
}

export function orderToDefaultRows(order: DashboardQuickLinkId[], colsPerRow = 4): DashboardQuickLinkId[][] {
  if (!order.length) return []
  const rows: DashboardQuickLinkId[][] = []
  for (let i = 0; i < order.length; i += colsPerRow) {
    rows.push(order.slice(i, i + colsPerRow))
  }
  return rows
}

function filterRowId(
  id: unknown,
  seen: Set<DashboardQuickLinkId>,
  fourthCalendar: DashboardCoreQuickLinkId,
): DashboardQuickLinkId | null {
  if (typeof id !== "string" || !ALL_DASHBOARD_LINK_IDS.has(id as DashboardQuickLinkId)) return null
  const linkId = id as DashboardQuickLinkId
  if (linkId === "reporting") return null
  if (linkId === "team_management" && fourthCalendar === "scheduling_tools") return null
  if (linkId === "scheduling_tools" && fourthCalendar === "team_management") return null
  if (seen.has(linkId)) return null
  seen.add(linkId)
  return linkId
}

export function normalizeDashboardTileRows(
  saved: DashboardQuickLinkId[][] | undefined,
  fallbackOrder: DashboardQuickLinkId[],
  fourthCalendar: DashboardCoreQuickLinkId = "team_management",
): DashboardQuickLinkId[][] {
  const orderNorm = normalizeDashboardTileOrder(fallbackOrder, fourthCalendar)
  const seen = new Set<DashboardQuickLinkId>()
  const rows: DashboardQuickLinkId[][] = []

  if (saved?.length) {
    for (const row of saved) {
      if (!Array.isArray(row)) continue
      const outRow: DashboardQuickLinkId[] = []
      for (const id of row) {
        const ok = filterRowId(id, seen, fourthCalendar)
        if (ok) outRow.push(ok)
      }
      if (outRow.length) rows.push(outRow)
    }
  }

  for (const id of orderNorm) {
    if (seen.has(id)) continue
    seen.add(id)
    if (rows.length) rows[rows.length - 1].push(id)
    else rows.push([id])
  }

  if (rows.length) return rows
  return orderToDefaultRows(orderNorm)
}

export function moveTileInRows(
  rows: DashboardQuickLinkId[][],
  tileId: DashboardQuickLinkId,
  target: TileDropTarget,
): DashboardQuickLinkId[][] {
  let next = rows.map((r) => r.filter((id) => id !== tileId))
  next = next.filter((r) => r.length > 0)

  const placeAt = (rowIdx: number, colIdx: number) => {
    while (next.length <= rowIdx) next.push([])
    next[rowIdx].splice(colIdx, 0, tileId)
  }

  switch (target.kind) {
    case "before":
      placeAt(target.row, target.col)
      break
    case "append":
      if (target.row < 0 || target.row >= next.length) next.push([tileId])
      else next[target.row] = [...next[target.row], tileId]
      break
    case "newRow":
      next.splice(target.afterRow + 1, 0, [tileId])
      break
  }

  return next.filter((r) => r.length > 0)
}

export function removeTileFromRows(rows: DashboardQuickLinkId[][], id: DashboardQuickLinkId): DashboardQuickLinkId[][] {
  return rows.map((r) => r.filter((x) => x !== id)).filter((r) => r.length > 0)
}

export function appendTileToRows(rows: DashboardQuickLinkId[][], id: DashboardQuickLinkId): DashboardQuickLinkId[][] {
  const cleaned = removeTileFromRows(rows, id)
  if (!cleaned.length) return [[id]]
  const last = cleaned.length - 1
  return cleaned.map((r, i) => (i === last ? [...r, id] : r))
}

/** Flat order helpers — dashboard UI uses a single draggable list. */
export function moveTileInOrder(
  order: DashboardQuickLinkId[],
  dragId: DashboardQuickLinkId,
  beforeId: DashboardQuickLinkId | null,
): DashboardQuickLinkId[] {
  const next = order.filter((id) => id !== dragId)
  if (beforeId === null) return [...next, dragId]
  const idx = next.indexOf(beforeId)
  if (idx < 0) return [...next, dragId]
  next.splice(idx, 0, dragId)
  return next
}

export function removeTileFromOrder(order: DashboardQuickLinkId[], id: DashboardQuickLinkId): DashboardQuickLinkId[] {
  return order.filter((x) => x !== id)
}

export function addTileToOrder(order: DashboardQuickLinkId[], id: DashboardQuickLinkId): DashboardQuickLinkId[] {
  if (order.includes(id)) return order
  return [...order, id]
}

export function orderFromTileRows(rows: DashboardQuickLinkId[][] | undefined): DashboardQuickLinkId[] {
  return flattenTileRows(rows ?? [])
}

export function tileRowsFromOrder(order: DashboardQuickLinkId[]): DashboardQuickLinkId[][] {
  return order.length ? [order] : []
}

export function parseDashboardQuickLinks(raw: unknown): DashboardQuickLinksStored | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (o.v === 2 || o.v === 3 || o.v === 4) {
    const gridRaw = o.tile_grid
    let tile_grid: DashboardTileGridSlot[] | undefined
    if (Array.isArray(gridRaw) && gridRaw.length > 0) {
      tile_grid = gridRaw.map((x) =>
        x === null || x === undefined
          ? null
          : typeof x === "string" && ALL_DASHBOARD_LINK_IDS.has(x as DashboardQuickLinkId)
            ? (x as DashboardQuickLinkId)
            : null,
      )
    }
    const tgc = o.tile_grid_cols
    const tile_grid_cols = typeof tgc === "number" && tgc > 0 ? Math.floor(tgc) : undefined
    const tgr = o.tile_grid_rows
    const tile_grid_rows = typeof tgr === "number" && tgr > 0 ? Math.floor(tgr) : undefined
    const ord = o.tile_order
    const parsed = Array.isArray(ord)
      ? ord.filter((x): x is DashboardQuickLinkId => typeof x === "string" && ALL_DASHBOARD_LINK_IDS.has(x as DashboardQuickLinkId))
      : []
    const rowsRaw = o.tile_rows
    let tile_rows: DashboardQuickLinkId[][] | undefined
    if (Array.isArray(rowsRaw)) {
      tile_rows = rowsRaw
        .filter((row): row is DashboardQuickLinkId[] => Array.isArray(row))
        .map((row) =>
          row.filter(
            (x): x is DashboardQuickLinkId => typeof x === "string" && ALL_DASHBOARD_LINK_IDS.has(x as DashboardQuickLinkId),
          ),
        )
        .filter((row) => row.length > 0)
      if (!tile_rows.length) tile_rows = undefined
    }
    const ts = o.tile_scheme
    const tile_scheme =
      ts === "ember" || ts === "ocean" || ts === "slate" || ts === "paper" ? (ts as DashboardTileScheme) : undefined
    const gc = o.grid_columns
    const grid_columns: DashboardGridColumns | undefined =
      gc === 2 || gc === 3 || gc === 4 || gc === 5 || gc === "auto" ? gc : undefined
    const stylesRaw = o.tile_styles
    const tile_styles: Partial<Record<string, DashboardTileStyle>> = {}
    if (stylesRaw && typeof stylesRaw === "object" && !Array.isArray(stylesRaw)) {
      for (const [k, v] of Object.entries(stylesRaw as Record<string, unknown>)) {
        if (!ALL_DASHBOARD_LINK_IDS.has(k as DashboardQuickLinkId)) continue
        if (!v || typeof v !== "object" || Array.isArray(v)) continue
        tile_styles[k] = v as DashboardTileStyle
      }
    }
    return {
      v: o.v === 4 ? 4 : o.v === 3 ? 3 : 2,
      tile_grid,
      tile_order: parsed.length ? parsed : undefined,
      tile_rows,
      grid_columns,
      tile_grid_cols,
      tile_grid_rows,
      tile_scheme,
      tile_styles,
    }
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
): {
  order: DashboardQuickLinkId[]
  rows: DashboardQuickLinkId[][]
  grid: DashboardTileGridSlot[]
  gridCols: number | undefined
  gridRows: number | undefined
  styles: Partial<Record<string, DashboardTileStyle>>
  scheme: DashboardTileScheme
  gridColumns: DashboardGridColumns
} {
  const fallbackOrder = defaultDashboardTileOrder(fourthCalendar)
  const defaultGrid = orderToTileGrid(fallbackOrder)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      order: fallbackOrder,
      rows: orderToDefaultRows(fallbackOrder),
      grid: defaultGrid,
      gridCols: undefined,
      gridRows: undefined,
      styles: {},
      scheme: DEFAULT_DASHBOARD_TILE_SCHEME,
      gridColumns: 5,
    }
  }
  const o = raw as Record<string, unknown>
  if (o.v === 2 || o.v === 3 || o.v === 4) {
    const parsed = parseDashboardQuickLinks(raw)
    const order = normalizeDashboardTileOrder(parsed?.tile_order ?? parsed?.tile_rows?.flat(), fourthCalendar)
    const rows = normalizeDashboardTileRows(parsed?.tile_rows, order, fourthCalendar)
    const legacyGrid = parsed?.tile_grid ?? orderToTileGrid(flattenTileRows(rows))
    const grid =
      parsed?.tile_grid_cols != null || (Array.isArray(parsed?.tile_grid) && parsed.tile_grid.length !== DASHBOARD_GRID_SLOT_COUNT)
        ? legacyGrid
        : normalizeDashboardTileGrid(legacyGrid, order, fourthCalendar)
    return {
      order: tileGridToOrder(grid),
      rows,
      grid,
      gridCols: parsed?.tile_grid_cols,
      gridRows: parsed?.tile_grid_rows,
      styles: parsed?.tile_styles ?? {},
      scheme: parsed?.tile_scheme ?? DEFAULT_DASHBOARD_TILE_SCHEME,
      gridColumns: 5,
    }
  }
  if (o.v === 1) {
    const optional = normalizeDashboardOptionalOrder((o.optional_order as DashboardOptionalQuickLinkId[] | undefined) ?? undefined)
    const core: DashboardCoreQuickLinkId[] = ["customers", "estimates", "calendar", fourthCalendar]
    const ts = o.tile_scheme
    const scheme =
      ts === "ember" || ts === "ocean" || ts === "slate" || ts === "paper" ? (ts as DashboardTileScheme) : DEFAULT_DASHBOARD_TILE_SCHEME
    const order = normalizeDashboardTileOrder([...core, ...optional], fourthCalendar)
    return {
      order,
      rows: orderToDefaultRows(order),
      grid: orderToTileGrid(order),
      gridCols: undefined,
      gridRows: undefined,
      styles: {},
      scheme,
      gridColumns: 5,
    }
  }
  return {
    order: fallbackOrder,
    rows: orderToDefaultRows(fallbackOrder),
    grid: defaultGrid,
    gridCols: undefined,
    gridRows: undefined,
    styles: {},
    scheme: DEFAULT_DASHBOARD_TILE_SCHEME,
    gridColumns: 5,
  }
}

export function mergeDashboardQuickLinksMetadata(
  prevMeta: Record<string, unknown>,
  patch: Partial<
    Pick<
      DashboardQuickLinksStored,
      "tile_grid" | "tile_order" | "tile_rows" | "tile_styles" | "tile_scheme" | "grid_columns" | "tile_grid_cols" | "tile_grid_rows"
    >
  > & {
    optional_order?: DashboardOptionalQuickLinkId[]
  },
  fourthCalendar: DashboardCoreQuickLinkId = "team_management",
): Record<string, unknown> {
  const existing = parseDashboardQuickLinks(prevMeta.dashboard_quick_links)
  const legacyV1 = prevMeta.dashboard_quick_links as DashboardQuickLinksStoredV1 | undefined
  const migrated = migrateStoredTileOrder(prevMeta.dashboard_quick_links, fourthCalendar)
  const fallbackOrder =
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
        : normalizeDashboardTileOrder(existing?.tile_order ?? migrated.order, fourthCalendar)
  const gridCols = patch.tile_grid_cols ?? existing?.tile_grid_cols
  const gridRows = patch.tile_grid_rows ?? existing?.tile_grid_rows
  const grid =
    patch.tile_grid !== undefined
      ? patch.tile_grid
      : gridCols != null
        ? (existing?.tile_grid ?? migrated.grid)
        : normalizeDashboardTileGrid(existing?.tile_grid ?? migrated.grid, fallbackOrder, fourthCalendar)
  const next: DashboardQuickLinksStored = {
    v: 4,
    tile_grid: grid,
    tile_order: tileGridToOrder(grid),
    ...(gridCols != null ? { tile_grid_cols: gridCols } : {}),
    ...(gridRows != null ? { tile_grid_rows: gridRows } : {}),
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
