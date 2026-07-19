import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react"
import type { UserRole } from "../contexts/AuthContext"
import { theme } from "../styles/theme"
import {
  queueCalendarSuiteNavigation,
  queueEstimatesLibraryOpen,
  queueOpenCustomReceiptModal,
  type QueuedCalendarSuite,
} from "../lib/workflowNavigation"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import {
  isOperationsPackageEnabled,
  isGrowthTabEnabled,
  operationsSubModuleEnabled,
} from "../types/portal-builder"
import {
  ALL_DASHBOARD_LINK_IDS,
  customizeGridRowsFromLength,
  dashboardCustomizeMinRows,
  dashboardColsFromWidth,
  defaultDashboardTileOrderForRole,
  migrateStoredTileOrder,
  mergeDashboardQuickLinksMetadata,
  parseDashboardQuickLinks,
  normalizeCustomizeGrid,
  normalizeDashboardTileOrder,
  orderToTileGrid,
  removeTileFromCustomizeGrid,
  resizeCustomizeGrid,
  tileGridToOrder,
  type DashboardOptionalQuickLinkId,
  type DashboardCoreQuickLinkId,
  type DashboardQuickLinkId,
  type DashboardTileGridSlot,
  type DashboardTileScheme,
  type DashboardTileStyle,
  fontCssForTile,
  operationsQuickLinkPage,
  thumbnailGlyph,
} from "../lib/dashboardQuickLinksPrefs"
import DashboardQuickLinkGrid from "./DashboardQuickLinkGrid"
import DashboardQuickLinkCustomizeZones from "./DashboardQuickLinkCustomizeZones"
import DashboardTodayTodoModal from "./DashboardTodayTodoModal"
import { OPEN_DASHBOARD_TODO_EVENT } from "../lib/dashboardTodoUi"
import { openMessenger } from "../lib/messengerBus"
import { openMessagingAppWithSession } from "../lib/messagingHandoff"
import { isNativeApp } from "../lib/capacitorMobile"
import DashboardTileStyleMenu from "./DashboardTileStyleMenu"
import PlatformAssistantField from "./PlatformAssistantField"
import { isOfficeManagerLikeRole } from "../lib/profileRoles"
import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"

const LS_TILE_GRID = "tradesman_dashboard_tile_grid_v1"
const LS_TILE_GRID_COLS = "tradesman_dashboard_tile_grid_cols_v1"
const LS_TILE_GRID_ROWS = "tradesman_dashboard_tile_grid_rows_v1"
const LS_TILE_GRID_UPDATED_AT = "tradesman_dashboard_tile_grid_updated_at_v1"
const DASHBOARD_LAYOUT_SAVE_DEBOUNCE_MS = 400

function scopedLsKey(base: string, profileUserId: string | null | undefined): string {
  const id = typeof profileUserId === "string" ? profileUserId.trim() : ""
  return id ? `${base}:${id}` : base
}

function readLocalDashboardLayoutUpdatedAt(profileUserId: string | null | undefined): number {
  if (typeof window === "undefined") return 0
  try {
    const scoped = localStorage.getItem(scopedLsKey(LS_TILE_GRID_UPDATED_AT, profileUserId))
    const raw = scoped ?? (!profileUserId ? null : localStorage.getItem(LS_TILE_GRID_UPDATED_AT))
    if (!raw) return 0
    const ts = Date.parse(raw)
    return Number.isFinite(ts) ? ts : 0
  } catch {
    return 0
  }
}

function writeLocalDashboardLayoutUpdatedAt(iso: string, profileUserId: string | null | undefined) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(scopedLsKey(LS_TILE_GRID_UPDATED_AT, profileUserId), iso)
  } catch {
    /* ignore */
  }
}

function tileGridsEqual(a: DashboardTileGridSlot[], b: DashboardTileGridSlot[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export type OptionalQuickLinkId = DashboardQuickLinkId

type Props = {
  isMobile: boolean
  setPage: (page: string) => void
  sectionTitle: string
  authRole: UserRole | null
  managedByOfficeManager: boolean
  managedSchedulingToolsEnabled: boolean
  officeManager?: boolean
  showSettingsShortcut?: boolean
  showPaymentsShortcut?: boolean
  showTimeClockShortcut?: boolean
  showCustomReceiptShortcut?: boolean
  showEmailClientShortcut?: boolean
  /** Saves quick-link order under this profile's `metadata.dashboard_quick_links`. */
  profileUserId?: string | null
  /** Calendar/customer scope for Today&apos;s to-do (managed user when in office portal). */
  dashboardDataUserId?: string | null
  labels: {
    customers: string
    estimates: string
    calendar: string
    teamManagement: string
    schedulingTools: string
    settings: string
    payments: string
    insurance: string
    customerPaymentsSoon: string
    reporting: string
    jobTypes: string
    todayTodo: string
    timeClock: string
    customReceipt: string
    businessWorkflow: string
    businessWorkflowSub: string
    organizationChart: string
    operations: string
    operationsWorkOrders: string
    operationsPurchaseOrders: string
    operationsInvoicing: string
    operationsInventory: string
    growth: string
    growthSub: string
    emailClient: string
    customizeHint: string
    customizeDone: string
    customizeRestart: string
    customizeVisibleTitle: string
    customizeHiddenTitle: string
    customizePaletteTitle: string
    customizeAddHint: string
    customizeRemove: string
    savedCloud: string
    savedDeviceOnly: string
    cardLookLabel: string
    cardLookHint: string
    cardLookEmber: string
    cardLookOcean: string
    cardLookSlate: string
    cardLookPaper: string
    setupGuide: string
    assistantPlaceholder: string
  }
  onOpenSetupGuide?: () => void
}

function schemeHoverBorder(scheme: DashboardTileScheme): string {
  switch (scheme) {
    case "ocean":
      return "rgba(14, 165, 233, 0.65)"
    case "slate":
      return "rgba(71, 85, 105, 0.55)"
    case "paper":
      return "rgba(14, 165, 233, 0.45)"
    default:
      return "rgba(249, 115, 22, 0.58)"
  }
}

function dashShellStyle(isMobile: boolean, scheme: DashboardTileScheme): CSSProperties {
  const pad = isMobile ? "12px 12px 14px" : "16px 16px 18px"
  const base: CSSProperties = {
    padding: pad,
    borderRadius: 12,
    marginBottom: 8,
  }
  switch (scheme) {
    case "ocean":
      return {
        ...base,
        background: "linear-gradient(175deg, #e0f2fe 0%, #bae6fd 50%, #93c5fd 100%)",
        border: "1px solid rgba(14, 116, 144, 0.32)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.65), 0 12px 32px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.04)",
      }
    case "slate":
      return {
        ...base,
        background: "linear-gradient(175deg, #e2e8f0 0%, #cbd5e1 52%, #94a3b8 100%)",
        border: "1px solid rgba(30, 41, 59, 0.38)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.5), 0 10px 28px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.06)",
      }
    case "paper":
      return {
        ...base,
        background: "#f8fafc",
        border: `1px solid ${theme.border}`,
        boxShadow: "0 8px 26px rgba(15, 23, 42, 0.07)",
      }
    default:
      return {
        ...base,
        background: "linear-gradient(175deg, #cbd5e1 0%, #b8c4d4 52%, #a8b6ca 100%)",
        border: "1px solid rgba(30, 41, 59, 0.35)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.55), 0 12px 32px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.04)",
      }
  }
}

function tileButtonStyle(
  scheme: DashboardTileScheme,
  opts: { primaryRow: boolean; compact: boolean; disabled?: boolean; dimmed?: boolean; mobileGrid?: boolean },
): CSSProperties {
  const { primaryRow, compact, disabled, dimmed, mobileGrid } = opts
  const minHeight = mobileGrid ? 0 : compact ? 88 : 96
  const padding = mobileGrid ? "6px 7px 5px" : "14px 14px 13px"
  const borderRadius = mobileGrid ? 10 : 12
  switch (scheme) {
    case "ocean":
      return {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        minHeight,
        padding,
        borderRadius,
        border: primaryRow ? "1px solid rgba(14, 165, 233, 0.42)" : "1px solid rgba(100, 116, 139, 0.42)",
        background: primaryRow
          ? "linear-gradient(165deg, rgba(15, 118, 110, 0.88) 0%, rgba(15, 118, 110, 0.92) 45%, rgba(17, 94, 89, 0.96) 100%)"
          : "linear-gradient(160deg, #f0fdfa 0%, #e0f2fe 55%, #dbeafe 100%)",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        overflow: "hidden",
        boxShadow: primaryRow
          ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 18px rgba(14, 165, 233, 0.18), 0 8px 22px rgba(0,0,0,0.2)"
          : "inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 10px rgba(15, 23, 42, 0.1)",
        opacity: disabled ? 0.72 : dimmed ? 0.82 : 1,
      }
    case "slate":
      return {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        minHeight,
        padding,
        borderRadius,
        border: primaryRow ? "1px solid rgba(51, 65, 85, 0.45)" : "1px solid rgba(100, 116, 139, 0.4)",
        background: primaryRow
          ? "linear-gradient(165deg, rgba(51, 65, 85, 0.92) 0%, rgba(30, 41, 59, 0.95) 52%, rgba(15, 23, 42, 0.98) 100%)"
          : "linear-gradient(160deg, #f1f5f9 0%, #e2e8f0 46%, #cbd5e1 100%)",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        overflow: "hidden",
        boxShadow: primaryRow
          ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 14px rgba(15, 23, 42, 0.35)"
          : "inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px rgba(15, 23, 42, 0.12)",
        opacity: disabled ? 0.72 : dimmed ? 0.82 : 1,
      }
    case "paper":
      return {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        minHeight,
        padding,
        borderRadius,
        border: primaryRow ? `1px solid ${theme.border}` : "1px solid #e2e8f0",
        background: primaryRow ? "#ffffff" : "#f1f5f9",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        overflow: "hidden",
        boxShadow: primaryRow ? "0 2px 14px rgba(15, 23, 42, 0.07)" : "0 1px 8px rgba(15, 23, 42, 0.05)",
        opacity: disabled ? 0.72 : dimmed ? 0.82 : 1,
      }
    default:
      return {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        minHeight,
        padding,
        borderRadius,
        border: primaryRow ? `1px solid rgba(249, 115, 22, 0.35)` : `1px solid rgba(100, 116, 139, 0.42)`,
        background: primaryRow
          ? "linear-gradient(165deg, rgba(51, 65, 85, 0.84) 0%, rgba(30, 41, 59, 0.88) 58%, rgba(30, 41, 59, 0.95) 100%)"
          : "linear-gradient(160deg, #eef2f7 0%, #e2e8f0 46%, #dbe4ef 100%)",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        overflow: "hidden",
        boxShadow: primaryRow
          ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 18px rgba(249, 115, 22, 0.12), 0 8px 22px rgba(0,0,0,0.22)"
          : "inset 0 1px 0 rgba(255,255,255,0.65), 0 2px 10px rgba(15, 23, 42, 0.12)",
        opacity: disabled ? 0.72 : dimmed ? 0.82 : 1,
      }
  }
}

function tileLabelColor(scheme: DashboardTileScheme, primaryRow: boolean): string {
  if (scheme === "paper") return "#0f172a"
  return primaryRow ? "#f8fafc" : "#0f172a"
}

function tileArrowColor(scheme: DashboardTileScheme, primaryRow: boolean, accent: string): string {
  if (primaryRow) {
    if (scheme === "paper") return accent
    return accent
  }
  return "#334155"
}

function resolveFourthCalendarLinkId(
  p: Pick<Props, "officeManager" | "authRole" | "managedByOfficeManager" | "managedSchedulingToolsEnabled">,
): DashboardCoreQuickLinkId {
  if (p.officeManager || isOfficeManagerLikeRole(p.authRole)) return "team_management"
  const role = p.authRole
  const isOmLike = isOfficeManagerLikeRole(role)
  const showSchedulingStandalone =
    (role === "user" ||
      role === "new_user" ||
      role === "demo_user" ||
      role === "corporate_external" ||
      role === "corporate_internal" ||
      role == null) &&
    !isOmLike &&
    (!p.managedByOfficeManager || p.managedSchedulingToolsEnabled)
  if (showSchedulingStandalone || p.managedByOfficeManager) return "scheduling_tools"
  return "scheduling_tools"
}

function resolveFourthCalendarState(
  p: Pick<Props, "officeManager" | "authRole" | "managedByOfficeManager" | "managedSchedulingToolsEnabled">,
  labels: Props["labels"],
): { label: string; suite: QueuedCalendarSuite; linkId: DashboardCoreQuickLinkId } {
  const linkId = resolveFourthCalendarLinkId(p)
  if (linkId === "team_management") {
    return { label: labels.teamManagement, suite: { id: "team_management", panel: "team_members" }, linkId }
  }
  if (p.managedByOfficeManager) {
    return { label: labels.schedulingTools, suite: { id: "managed_job_types" }, linkId }
  }
  return { label: labels.schedulingTools, suite: { id: "scheduling_tools", panel: "job_types" }, linkId }
}

function Tile({
  scheme,
  label,
  sublabel,
  onClick,
  accent,
  compact,
  disabled,
  dimmed,
  draggable,
  primaryRow,
  uniformGrid,
  mobileGrid,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  customize,
  onRemove,
  removeChipLabel,
  tileStyle,
  onContextMenu,
  dragOver,
}: {
  scheme: DashboardTileScheme
  label: string
  sublabel?: string
  onClick: () => void
  accent: string
  compact: boolean
  disabled?: boolean
  dimmed?: boolean
  draggable?: boolean
  primaryRow?: boolean
  uniformGrid?: boolean
  mobileGrid?: boolean
  customize?: boolean
  onRemove?: () => void
  removeChipLabel?: string
  onDragStart?: () => void
  onDragOver?: (e: DragEvent) => void
  onDrop?: (e: DragEvent) => void
  onDragEnd?: () => void
  tileStyle?: DashboardTileStyle
  onContextMenu?: (e: React.MouseEvent) => void
  dragOver?: boolean
}) {
  const gridCompact = uniformGrid ? true : compact
  const gridPrimary = uniformGrid ? false : Boolean(primaryRow)
  const effectiveAccent = tileStyle?.accent ?? accent
  const labelColor = tileStyle?.labelColor ?? tileLabelColor(scheme, gridPrimary)
  const optionalArrowColor = tileArrowColor(scheme, gridPrimary, effectiveAccent)
  const btn: CSSProperties = {
    ...tileButtonStyle(scheme, {
      primaryRow: gridPrimary,
      compact: gridCompact,
      disabled,
      dimmed,
      mobileGrid,
    }),
    ...(tileStyle?.blockBg ? { background: tileStyle.blockBg } : null),
    ...(tileStyle?.blockBorder ? { border: `1px solid ${tileStyle.blockBorder}` } : null),
    ...(dragOver ? { outline: "2px dashed #0ea5e9", outlineOffset: 2 } : null),
    fontFamily: fontCssForTile(tileStyle?.fontFamily),
  }
  const thumb = thumbnailGlyph(tileStyle?.thumbnail)
  return (
    <button
      type="button"
      className="tm-dash-tile"
      disabled={disabled}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      onClick={onClick}
      style={btn}
    >
      {customize && onRemove ? (
        <span
          data-dash-remove-chip
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemove()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              e.stopPropagation()
              onRemove()
            }
          }}
          style={{
            position: "absolute",
            top: mobileGrid ? 4 : 6,
            right: mobileGrid ? 4 : 6,
            zIndex: 2,
            fontSize: mobileGrid ? 9 : 11,
            fontWeight: 700,
            padding: mobileGrid ? "2px 5px" : "3px 7px",
            borderRadius: 8,
            background:
              scheme === "ocean"
                ? "rgba(14,165,233,0.2)"
                : scheme === "slate"
                  ? "rgba(71,85,105,0.2)"
                  : scheme === "paper"
                    ? "rgba(14,165,233,0.12)"
                    : "rgba(249,115,22,0.22)",
            border:
              scheme === "ocean"
                ? "1px solid rgba(14,165,233,0.4)"
                : scheme === "slate"
                  ? "1px solid rgba(71,85,105,0.35)"
                  : scheme === "paper"
                    ? "1px solid rgba(14,165,233,0.35)"
                    : "1px solid rgba(249,115,22,0.35)",
            color: scheme === "paper" ? "#0f172a" : "#ffedd5",
            cursor: "pointer",
            lineHeight: 1.2,
          }}
        >
          {removeChipLabel ?? "Remove"}
        </span>
      ) : null}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: gridPrimary ? 10 : mobileGrid ? 6 : 11,
          right: gridPrimary ? 10 : mobileGrid ? 6 : 11,
          width: gridPrimary ? 34 : mobileGrid ? 20 : 28,
          height: gridPrimary ? 34 : mobileGrid ? 20 : 28,
          borderRadius: thumb ? 8 : "50%",
          background: thumb
            ? "rgba(255,255,255,0.92)"
            : `linear-gradient(145deg, ${effectiveAccent}35, ${effectiveAccent}14)`,
          border: thumb ? `1px solid ${effectiveAccent}44` : `1px solid ${effectiveAccent}55`,
          boxShadow: gridPrimary ? `0 0 18px ${effectiveAccent}38` : `0 0 12px ${effectiveAccent}22`,
          display: mobileGrid && !thumb ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: thumb ? (gridPrimary ? 18 : mobileGrid ? 12 : 15) : undefined,
          lineHeight: 1,
        }}
      >
        {thumb || null}
      </span>
      {!mobileGrid ? (
      <span
        aria-hidden
        style={{
          position: "absolute",
          bottom: 11,
          right: 13,
          fontSize: 17,
          fontWeight: 700,
          color: optionalArrowColor,
          opacity: 0.85,
          lineHeight: 1,
          pointerEvents: "none",
        }}
      >
        →
      </span>
      ) : null}
      <span
        style={{
          marginTop: mobileGrid ? 0 : 2,
          paddingRight: mobileGrid ? 4 : 22,
          fontSize: mobileGrid ? 10 : gridCompact ? 14 : 15,
          fontWeight: 800,
          color: labelColor,
          lineHeight: mobileGrid ? 1.15 : 1.25,
          letterSpacing: gridPrimary ? -0.02 : undefined,
        }}
      >
        {label}
        {sublabel ? (
          <span
            style={{
              display: "block",
              marginTop: 4,
              fontSize: gridCompact ? 10 : 11,
              fontWeight: 600,
              color: labelColor,
              opacity: 0.82,
              lineHeight: 1.3,
            }}
          >
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
  )
}

function parseLegacyLocalOrder(raw: string | null, fourth: DashboardCoreQuickLinkId): DashboardQuickLinkId[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      return normalizeDashboardTileOrder(v as DashboardQuickLinkId[], fourth)
    }
    if (Array.isArray(v) && v.every((row) => Array.isArray(row))) {
      const rows = (v as unknown[][])
        .map((row) =>
          row.filter((x): x is DashboardQuickLinkId => typeof x === "string" && ALL_DASHBOARD_LINK_IDS.has(x as DashboardQuickLinkId)),
        )
        .filter((row) => row.length > 0)
      return normalizeDashboardTileOrder(rows.flat(), fourth)
    }
    return null
  } catch {
    return null
  }
}

export default function DashboardQuickActions(props: Props) {
  const {
    isMobile,
    setPage,
    labels,
    sectionTitle,
    authRole,
    officeManager,
    showSettingsShortcut,
    showPaymentsShortcut,
    profileUserId,
    dashboardDataUserId,
    onOpenSetupGuide,
  } = props
  const ga = useGlobalAssistantOptional()
  const { portalConfig, user } = useAuth()

  const operationsQuickLinkVisible = useCallback(
    (id: DashboardOptionalQuickLinkId): boolean => {
      if (id === "operations") return isOperationsPackageEnabled(portalConfig)
      if (id === "operations_work_orders") return operationsSubModuleEnabled("work_orders", portalConfig)
      if (id === "operations_purchase_orders") return operationsSubModuleEnabled("purchase_orders", portalConfig)
      if (id === "operations_invoicing") return operationsSubModuleEnabled("invoicing", portalConfig)
      if (id === "operations_inventory") return operationsSubModuleEnabled("inventory", portalConfig)
      return true
    },
    [portalConfig],
  )
  const fourth = resolveFourthCalendarState(props, labels)
  const fourthLinkId = fourth.linkId
  const tileScheme: DashboardTileScheme = "paper"
  const gridRef = useRef<HTMLDivElement>(null)

  const [gridCols, setGridCols] = useState(() => dashboardColsFromWidth(isMobile ? 360 : 1400, isMobile))

  const quickLinksRole = officeManager ? "office_manager" : authRole

  const fallbackOrder = useMemo(
    () => defaultDashboardTileOrderForRole(quickLinksRole, fourthLinkId),
    [quickLinksRole, fourthLinkId],
  )

  const buildCustomizeGrid = useCallback(
    (
      raw: DashboardTileGridSlot[] | undefined,
      savedCols: number | undefined,
      savedRows: number | undefined,
      cols: number,
      fillEmptyFromFallback?: boolean,
    ) =>
      normalizeCustomizeGrid(raw, savedCols, savedRows, cols, isMobile, fallbackOrder, fourthLinkId, {
        fillEmptyFromFallback,
      }),
    [isMobile, fallbackOrder, fourthLinkId],
  )

  const gridColsRef = useRef(gridCols)
  useEffect(() => {
    gridColsRef.current = gridCols
  }, [gridCols])

  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setGridCols(dashboardColsFromWidth(w, isMobile))
    }
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [isMobile])

  const go = (page: string, calendarSuite?: QueuedCalendarSuite) => {
    if (calendarSuite) queueCalendarSuiteNavigation(calendarSuite)
    setPage(page)
  }

  type AuthorLayout = { grid: DashboardTileGridSlot[]; cols: number; rows: number }

  const readAuthorLayoutFromLs = useCallback((): AuthorLayout | null => {
    if (typeof window === "undefined") return null
    try {
      const uid = profileUserId ?? null
      const guessed = dashboardColsFromWidth(isMobile ? 360 : 1400, isMobile)
      const rawCols =
        localStorage.getItem(scopedLsKey(LS_TILE_GRID_COLS, uid)) ??
        (uid ? localStorage.getItem(LS_TILE_GRID_COLS) : null)
      const savedCols = rawCols ? Number.parseInt(rawCols, 10) : undefined
      const rawRows =
        localStorage.getItem(scopedLsKey(LS_TILE_GRID_ROWS, uid)) ??
        (uid ? localStorage.getItem(LS_TILE_GRID_ROWS) : null)
      const savedRows = rawRows ? Number.parseInt(rawRows, 10) : undefined
      const raw =
        localStorage.getItem(scopedLsKey(LS_TILE_GRID, uid)) ??
        (uid ? localStorage.getItem(LS_TILE_GRID) : null)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cols = savedCols && savedCols > 0 ? savedCols : guessed
          const grid = buildCustomizeGrid(parsed as DashboardTileGridSlot[], savedCols, savedRows, cols, false)
          const rows = customizeGridRowsFromLength(grid, cols, dashboardCustomizeMinRows(isMobile))
          return { grid, cols, rows }
        }
      }
      const v5 = parseLegacyLocalOrder(localStorage.getItem("tradesman_dashboard_tile_order_v5"), fourthLinkId)
      if (v5?.length) {
        const grid = buildCustomizeGrid(orderToTileGrid(v5), 5, undefined, 5, false)
        return { grid, cols: 5, rows: customizeGridRowsFromLength(grid, 5, dashboardCustomizeMinRows(isMobile)) }
      }
      const localRows = parseLegacyLocalOrder(localStorage.getItem("tradesman_dashboard_tile_rows_v4"), fourthLinkId)
      if (localRows?.length) {
        const grid = buildCustomizeGrid(orderToTileGrid(localRows), 5, undefined, 5, false)
        return { grid, cols: 5, rows: customizeGridRowsFromLength(grid, 5, dashboardCustomizeMinRows(isMobile)) }
      }
      const legacyOrder = parseLegacyLocalOrder(localStorage.getItem("tradesman_dashboard_tile_order_v3"), fourthLinkId)
      if (legacyOrder?.length) {
        const grid = buildCustomizeGrid(orderToTileGrid(legacyOrder), 5, undefined, 5, false)
        return { grid, cols: 5, rows: customizeGridRowsFromLength(grid, 5, dashboardCustomizeMinRows(isMobile)) }
      }
    } catch {
      /* ignore */
    }
    return null
  }, [buildCustomizeGrid, profileUserId, isMobile, fourthLinkId])

  const [tileGrid, setTileGrid] = useState<DashboardTileGridSlot[]>(() => {
    const guessed = dashboardColsFromWidth(isMobile ? 360 : 1400, isMobile)
    if (typeof window === "undefined") return buildCustomizeGrid(undefined, undefined, undefined, guessed, true)
    const local = readAuthorLayoutFromLs()
    if (local) return local.grid
    return buildCustomizeGrid(undefined, undefined, undefined, guessed, true)
  })
  /** Column count the saved/author grid was last edited at — never overwritten by viewport measure. */
  const [authorCols, setAuthorCols] = useState(() => {
    const guessed = dashboardColsFromWidth(isMobile ? 360 : 1400, isMobile)
    if (typeof window === "undefined") return guessed
    return readAuthorLayoutFromLs()?.cols ?? guessed
  })
  const authorRows = useMemo(
    () => customizeGridRowsFromLength(tileGrid, authorCols, dashboardCustomizeMinRows(isMobile)),
    [tileGrid, authorCols, isMobile],
  )
  /** Viewport remapping for display/edit only — never written back unless the user edits. */
  const displayGrid = useMemo(() => {
    if (authorCols === gridCols) return tileGrid
    return resizeCustomizeGrid(tileGrid, authorCols, gridCols, isMobile, authorRows)
  }, [tileGrid, authorCols, gridCols, isMobile, authorRows])
  const [tileStyles, setTileStyles] = useState<Partial<Record<string, DashboardTileStyle>>>({})
  const [persistNote, setPersistNote] = useState<"idle" | "saving" | "cloud" | "local">("idle")
  const [customize, setCustomize] = useState(false)
  const [styleMenu, setStyleMenu] = useState<{ id: DashboardQuickLinkId; x: number; y: number } | null>(null)
  const [todayOpen, setTodayOpen] = useState(false)

  useEffect(() => {
    const open = () => setTodayOpen(true)
    window.addEventListener(OPEN_DASHBOARD_TODO_EVENT, open)
    return () => window.removeEventListener(OPEN_DASHBOARD_TODO_EVENT, open)
  }, [])
  const [prefsHydrated, setPrefsHydrated] = useState(false)
  const userModifiedRef = useRef(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveGenerationRef = useRef(0)
  const latestPersistRef = useRef({
    tileGrid,
    tileStyles,
    authorCols,
    authorRows,
    fourthLinkId,
    profileUserId: profileUserId ?? null,
  })

  useEffect(() => {
    latestPersistRef.current = {
      tileGrid,
      tileStyles,
      authorCols,
      authorRows,
      fourthLinkId,
      profileUserId: profileUserId ?? null,
    }
  }, [tileGrid, tileStyles, authorCols, authorRows, fourthLinkId, profileUserId])

  const writeAuthorLayoutToLs = useCallback(
    (grid: DashboardTileGridSlot[], cols: number, rows: number) => {
      const uid = profileUserId ?? null
      try {
        localStorage.setItem(scopedLsKey(LS_TILE_GRID, uid), JSON.stringify(grid))
        localStorage.setItem(scopedLsKey(LS_TILE_GRID_COLS, uid), String(cols))
        localStorage.setItem(scopedLsKey(LS_TILE_GRID_ROWS, uid), String(rows))
      } catch {
        /* ignore */
      }
    },
    [profileUserId],
  )

  /** Mirror author layout only after hydrate — never persist viewport remaps. */
  useEffect(() => {
    if (!prefsHydrated) return
    writeAuthorLayoutToLs(tileGrid, authorCols, authorRows)
  }, [tileGrid, authorCols, authorRows, prefsHydrated, writeAuthorLayoutToLs])

  useEffect(() => {
    if (!profileUserId) {
      setPrefsHydrated(true)
      return
    }
    if (!supabase) {
      setPrefsHydrated(true)
      return
    }
    setPrefsHydrated(false)
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", profileUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (userModifiedRef.current) {
          setPrefsHydrated(true)
          return
        }
        const raw =
          data?.metadata && typeof data.metadata === "object"
            ? (data.metadata as Record<string, unknown>).dashboard_quick_links
            : null
        const parsed = parseDashboardQuickLinks(raw)
        const migrated = migrateStoredTileOrder(raw, fourthLinkId, quickLinksRole)
        const cloudTs = migrated.updatedAt ? Date.parse(migrated.updatedAt) : 0
        const localTs = readLocalDashboardLayoutUpdatedAt(profileUserId)
        const localAuthor = readAuthorLayoutFromLs()
        const hasCloudSaved = Boolean(parsed?.tile_grid?.length || parsed?.tile_order?.length)
        const cloudCols =
          migrated.gridCols && migrated.gridCols > 0
            ? migrated.gridCols
            : gridColsRef.current
        const cloudGrid = hasCloudSaved
          ? buildCustomizeGrid(migrated.grid, migrated.gridCols, migrated.gridRows, cloudCols, false)
          : null

        // Prefer cloud unless this device has a newer explicit edit (updated_at only on user edits).
        if (
          localAuthor &&
          localTs > cloudTs &&
          (!cloudGrid || !tileGridsEqual(localAuthor.grid, cloudGrid))
        ) {
          setTileGrid(localAuthor.grid)
          setAuthorCols(localAuthor.cols)
          setPersistNote("local")
          userModifiedRef.current = true
        } else if (cloudGrid) {
          setTileGrid(cloudGrid)
          setAuthorCols(cloudCols)
          setTileStyles(migrated.styles)
          if (migrated.updatedAt) writeLocalDashboardLayoutUpdatedAt(migrated.updatedAt, profileUserId)
          writeAuthorLayoutToLs(
            cloudGrid,
            cloudCols,
            customizeGridRowsFromLength(cloudGrid, cloudCols, dashboardCustomizeMinRows(isMobile)),
          )
          setPersistNote("cloud")
        } else if (localAuthor?.grid.length) {
          setTileGrid(localAuthor.grid)
          setAuthorCols(localAuthor.cols)
          setPersistNote("local")
        }
        setPrefsHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    profileUserId,
    fourthLinkId,
    quickLinksRole,
    buildCustomizeGrid,
    readAuthorLayoutFromLs,
    writeAuthorLayoutToLs,
    isMobile,
  ])

  const flushCloudPersist = useCallback(async () => {
    const snapshot = latestPersistRef.current
    if (!supabase || !snapshot.profileUserId || !prefsHydrated) return
    const generation = ++saveGenerationRef.current
    setPersistNote("saving")
    const updatedAt = new Date().toISOString()
    try {
      const { data, error: fetchErr } = await supabase
        .from("profiles")
        .select("metadata")
        .eq("id", snapshot.profileUserId)
        .maybeSingle()
      if (fetchErr) throw fetchErr
      const prevMeta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      const nextMeta = mergeDashboardQuickLinksMetadata(
        prevMeta,
        {
          tile_grid: snapshot.tileGrid,
          tile_grid_cols: snapshot.authorCols,
          tile_grid_rows: snapshot.authorRows,
          tile_styles: snapshot.tileStyles,
          tile_scheme: "paper",
          updated_at: updatedAt,
        },
        snapshot.fourthLinkId,
      )
      const { error: upErr } = await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", snapshot.profileUserId)
      if (upErr) throw upErr
      if (generation !== saveGenerationRef.current) return
      writeLocalDashboardLayoutUpdatedAt(updatedAt, snapshot.profileUserId)
      setPersistNote("cloud")
    } catch {
      if (generation === saveGenerationRef.current) setPersistNote("local")
    }
  }, [prefsHydrated])

  useEffect(() => {
    if (!prefsHydrated) return
    if (!userModifiedRef.current) {
      if (!supabase || !profileUserId) setPersistNote("local")
      return
    }
    if (!supabase || !profileUserId) {
      setPersistNote("local")
      return
    }
    setPersistNote("saving")
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      void flushCloudPersist()
    }, DASHBOARD_LAYOUT_SAVE_DEBOUNCE_MS)
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
  }, [tileGrid, tileStyles, authorCols, authorRows, profileUserId, prefsHydrated, fourthLinkId, flushCloudPersist])

  // Flush pending edits once when leaving the dashboard (not on every deps change).
  useEffect(() => {
    return () => {
      if (userModifiedRef.current) void flushCloudPersist()
    }
  }, [flushCloudPersist])

  const linkAvailable = useCallback(
    (id: DashboardQuickLinkId): boolean => {
      if (id === "customers" || id === "estimates" || id === "calendar") return true
      if (id === "team_management") return fourthLinkId === "team_management"
      if (id === "scheduling_tools") return fourthLinkId === "scheduling_tools"
      if (id === "settings") return Boolean(showSettingsShortcut)
      if (id === "payments") return Boolean(showPaymentsShortcut)
      if (id === "time_clock") return Boolean(props.showTimeClockShortcut)
      if (id === "custom_receipt") return Boolean(props.showCustomReceiptShortcut)
      if (id === "setup_guide") return Boolean(onOpenSetupGuide)
      if (id.startsWith("operations")) return operationsQuickLinkVisible(id as DashboardOptionalQuickLinkId)
      if (id === "growth") return isGrowthTabEnabled(portalConfig)
      if (id === "email_client") return Boolean(props.showEmailClientShortcut)
      return true
    },
    [
      fourthLinkId,
      showSettingsShortcut,
      showPaymentsShortcut,
      props.showTimeClockShortcut,
      props.showCustomReceiptShortcut,
      props.showEmailClientShortcut,
      onOpenSetupGuide,
      operationsQuickLinkVisible,
      portalConfig,
    ],
  )

  const visibleOrder = useMemo(
    () => tileGridToOrder(displayGrid).filter((id) => linkAvailable(id)),
    [displayGrid, linkAvailable],
  )

  const hiddenIds = useMemo(() => {
    const onBar = new Set(visibleOrder)
    return (Array.from(ALL_DASHBOARD_LINK_IDS) as DashboardQuickLinkId[]).filter((id) => {
      if (onBar.has(id)) return false
      return linkAvailable(id)
    })
  }, [visibleOrder, linkAvailable])

  const onGridChange = useCallback(
    (grid: DashboardTileGridSlot[]) => {
      userModifiedRef.current = true
      writeLocalDashboardLayoutUpdatedAt(new Date().toISOString(), profileUserId ?? null)
      // User edited at the current viewport width — that becomes the new author layout.
      setTileGrid(grid)
      setAuthorCols(gridCols)
      writeAuthorLayoutToLs(
        grid,
        gridCols,
        customizeGridRowsFromLength(grid, gridCols, dashboardCustomizeMinRows(isMobile)),
      )
    },
    [gridCols, profileUserId, writeAuthorLayoutToLs, isMobile],
  )

  const restartTileOrder = useCallback(() => {
    userModifiedRef.current = true
    writeLocalDashboardLayoutUpdatedAt(new Date().toISOString(), profileUserId ?? null)
    const next = buildCustomizeGrid(undefined, undefined, undefined, gridCols, true)
    setTileGrid(next)
    setAuthorCols(gridCols)
  }, [buildCustomizeGrid, gridCols, profileUserId])

  const removeFromBar = useCallback(
    (id: DashboardQuickLinkId) => {
      onGridChange(removeTileFromCustomizeGrid(displayGrid, id))
    },
    [onGridChange, displayGrid],
  )

  const patchTileStyle = useCallback(
    (id: DashboardQuickLinkId, patch: Partial<DashboardTileStyle>) => {
      userModifiedRef.current = true
      writeLocalDashboardLayoutUpdatedAt(new Date().toISOString(), profileUserId ?? null)
      setTileStyles((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }))
    },
    [profileUserId],
  )

  const openStyleMenu = useCallback((id: DashboardQuickLinkId, e: React.MouseEvent) => {
    e.preventDefault()
    setStyleMenu({ id, x: e.clientX, y: e.clientY })
  }, [])

  const shell = dashShellStyle(isMobile, tileScheme)

  const renderTile = (id: DashboardQuickLinkId) => {
    const isCore = id === "customers" || id === "estimates" || id === "calendar" || id === "team_management" || id === "scheduling_tools"
    const rm = customize ? () => removeFromBar(id) : undefined
    const tileStyle = tileStyles[id]
    const label = quickLinkLabel(id, labels)
    const accentDefault =
      id === "customers" || id === "estimates" || id === "calendar" || isCore ? theme.primary : "#6366f1"
    const uniformGrid = true
    const mobileGrid = isMobile

    if (id === "customers") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={label}
          accent={accentDefault}
          primaryRow={!tileStyle?.blockBg}
          tileStyle={tileStyle}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          onClick={() => !customize && go("customers")}
        />
      )
    }
    if (id === "estimates") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={label}
          accent={accentDefault}
          primaryRow={!tileStyle?.blockBg}
          tileStyle={tileStyle}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          onClick={() => !customize && go("quotes")}
        />
      )
    }
    if (id === "calendar") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={label}
          accent={accentDefault}
          primaryRow={!tileStyle?.blockBg}
          tileStyle={tileStyle}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          onClick={() => !customize && go("calendar")}
        />
      )
    }
    if (id === "team_management") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={label}
          accent={accentDefault}
          primaryRow={!tileStyle?.blockBg}
          tileStyle={tileStyle}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          onClick={() => !customize && go("calendar", { id: "team_management", panel: "team_members" })}
        />
      )
    }
    if (id === "scheduling_tools") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={label}
          accent={accentDefault}
          primaryRow={!tileStyle?.blockBg}
          tileStyle={tileStyle}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          onClick={() => !customize && go("calendar", fourth.suite)}
        />
      )
    }

    if (id === "setup_guide" && onOpenSetupGuide) {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.setupGuide}
          accent="#6366f1"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && onOpenSetupGuide()}
        />
      )
    }
    if (id === "settings" && showSettingsShortcut) {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.settings}
          accent="#475569"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("settings")}
        />
      )
    }
    if (id === "payments" && showPaymentsShortcut) {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.payments}
          accent={theme.primary}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("payments")}
        />
      )
    }
    if (id === "insurance") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.insurance}
          accent={theme.primary}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("insurance-options")}
        />
      )
    }
    if (id === "customer_payments_soon") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.customerPaymentsSoon}
          accent="#0ea5e9"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => {
            if (customize) return
            try {
              window.location.hash = "customer-pay"
            } catch {
              /* ignore */
            }
            go("payments")
            window.requestAnimationFrame(() =>
              window.setTimeout(() => {
                document.getElementById("customer-pay-collection")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }, 280),
            )
          }}
        />
      )
    }
    if (id === "reporting") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.reporting}
          accent={theme.primary}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("reporting")}
        />
      )
    }
    if (id === "growth") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.growth}
          sublabel={labels.growthSub}
          accent="#16a34a"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("growth")}
        />
      )
    }
    if (id === "email_client") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.emailClient}
          accent="#0ea5e9"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("customers-email")}
        />
      )
    }
    if (id === "instant_messaging") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label="Instant messaging"
          accent="#F97316"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => {
            if (customize) return
            // Mobile web + native apps: open Tradesman Messaging (or Play Store if not installed).
            // Desktop browser: keep the in-app messenger widget.
            if (isMobile || isNativeApp()) {
              void openMessagingAppWithSession()
              return
            }
            openMessenger()
          }}
        />
      )
    }
    if (id === "job_types") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.jobTypes}
          accent="#0ea5e9"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => {
            if (customize) return
            queueEstimatesLibraryOpen({ section: "job_types_line_items", tab: "job_types" })
            go("quotes")
          }}
        />
      )
    }
    if (id === "today_todo") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.todayTodo}
          accent="#8b5cf6"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && setTodayOpen(true)}
        />
      )
    }
    if (id === "time_clock" && props.showTimeClockShortcut) {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.timeClock}
          accent="#334155"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("calendar", { id: "time_clock" })}
        />
      )
    }
    if (id === "custom_receipt" && props.showCustomReceiptShortcut) {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.customReceipt}
          accent="#059669"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => {
            if (customize) return
            queueOpenCustomReceiptModal()
            go("operations")
          }}
        />
      )
    }
    if (id === "business_workflow") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.businessWorkflow}
          sublabel={labels.businessWorkflowSub}
          accent="#7c3aed"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("business-workflow")}
        />
      )
    }
    if (id === "organization_chart") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={labels.organizationChart}
          accent="#0d9488"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go("organization-chart")}
        />
      )
    }
    if (id.startsWith("operations")) {
      const opLabels: Record<string, string> = {
        operations: labels.operations,
        operations_work_orders: labels.operationsWorkOrders,
        operations_purchase_orders: labels.operationsPurchaseOrders,
        operations_invoicing: labels.operationsInvoicing,
        operations_inventory: labels.operationsInventory,
      }
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          uniformGrid={uniformGrid}
          mobileGrid={mobileGrid}
          label={opLabels[id] ?? labels.operations}
          accent="#0369a1"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && go(operationsQuickLinkPage(id as DashboardOptionalQuickLinkId))}
        />
      )
    }
    return null
  }

  const hoverBorder = schemeHoverBorder(tileScheme)

  return (
    <section
      style={
        {
          maxWidth: isMobile ? 1100 : "100%",
          marginLeft: "auto",
          marginRight: "auto",
          marginBottom: 6,
          ...shell,
          ["--dash-hover-border" as string]: hoverBorder,
        } as CSSProperties
      }
    >
      <style>{`
        .tm-dash-tile {
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }
        .tm-dash-tile:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 12px 32px rgba(15, 23, 42, 0.2),
            0 8px 22px rgba(0, 0, 0, 0.28);
          border-color: var(--dash-hover-border, rgba(249, 115, 22, 0.58)) !important;
        }
        .tm-dash-tile:active:not(:disabled) {
          transform: translateY(-1px);
        }
      `}</style>
      <DashboardTodayTodoModal
        open={todayOpen}
        onClose={() => setTodayOpen(false)}
        dataUserId={dashboardDataUserId ?? null}
        viewerUserId={user?.id ?? null}
      />

      <div ref={gridRef}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
            color: "#0f172a",
              letterSpacing: -0.02,
            }}
          >
            {sectionTitle}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {onOpenSetupGuide && !customize ? (
              <button
                type="button"
                onClick={onOpenSetupGuide}
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#6366f1",
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
                }}
              >
                {labels.setupGuide}
              </button>
            ) : null}
            {customize ? (
              <button
                type="button"
                onClick={restartTileOrder}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${hoverBorder}`,
                  background: "rgba(255,255,255,0.25)",
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                {labels.customizeRestart}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCustomize((c) => !c)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${hoverBorder}`,
                background: customize ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.3)",
                color: "#0f172a",
                cursor: "pointer",
              }}
            >
              {customize ? labels.customizeDone : labels.customizeHint}
            </button>
          </div>
        </div>
        {ga && !customize ? (
          <div style={{ marginTop: 10 }}>
            <PlatformAssistantField
              value={ga.assistantText}
              onChange={ga.setAssistantText}
              onApply={(t) => ga.runAssistantCommand(t)}
              placeholder={labels.assistantPlaceholder}
              busy={ga.assistantBusy}
              note={ga.assistantNote}
              compact={isMobile}
              autoApplyOnVoiceEnd
              clearVoiceOnStart
            />
          </div>
        ) : null}
        {customize ? (
          <div style={{ margin: "10px 0 0", fontSize: 11, color: "rgba(15,23,42,0.72)", maxWidth: 960, lineHeight: 1.45 }}>
            <span>{labels.customizeAddHint}</span>
            {persistNote === "saving" ? (
              <span style={{ display: "block", marginTop: 4, color: "rgba(100, 116, 139, 0.95)" }}>Saving…</span>
            ) : persistNote === "cloud" ? (
              <span style={{ display: "block", marginTop: 4, color: "rgba(16,185,129,0.95)" }}>{labels.savedCloud}</span>
            ) : persistNote === "local" ? (
              <span style={{ display: "block", marginTop: 4 }}>{labels.savedDeviceOnly}</span>
            ) : null}
          </div>
        ) : null}

        {customize ? (
          <DashboardQuickLinkCustomizeZones
            grid={displayGrid}
            gridCols={gridCols}
            hiddenIds={hiddenIds}
            isMobile={isMobile}
            onGridChange={onGridChange}
            renderTile={renderTile}
            visibleTitle={labels.customizeVisibleTitle}
            hiddenTitle={labels.customizeHiddenTitle}
          />
        ) : (
          <DashboardQuickLinkGrid
            grid={displayGrid}
            gridCols={gridCols}
            isMobile={isMobile}
            renderTile={renderTile}
            filterVisible={linkAvailable}
          />
        )}
      </div>
      {styleMenu ? (
        <DashboardTileStyleMenu
          open
          x={styleMenu.x}
          y={styleMenu.y}
          linkId={styleMenu.id}
          label={quickLinkLabel(styleMenu.id, labels)}
          style={tileStyles[styleMenu.id] ?? {}}
          onChange={(patch) => patchTileStyle(styleMenu.id, patch)}
          onClose={() => setStyleMenu(null)}
        />
      ) : null}
    </section>
  )
}

function quickLinkLabel(id: DashboardQuickLinkId, labels: Props["labels"]): string {
  switch (id) {
    case "customers":
      return labels.customers
    case "estimates":
      return labels.estimates
    case "calendar":
      return labels.calendar
    case "team_management":
      return labels.teamManagement
    case "scheduling_tools":
      return labels.schedulingTools
    default:
      return optionalQuickLinkLabel(id as DashboardOptionalQuickLinkId, labels)
  }
}

function optionalQuickLinkLabel(id: DashboardOptionalQuickLinkId, labels: Props["labels"]): string {
  switch (id) {
    case "settings":
      return labels.settings
    case "payments":
      return labels.payments
    case "insurance":
      return labels.insurance
    case "customer_payments_soon":
      return labels.customerPaymentsSoon
    case "reporting":
      return labels.reporting
    case "job_types":
      return labels.jobTypes
    case "today_todo":
      return labels.todayTodo
    case "time_clock":
      return labels.timeClock
    case "custom_receipt":
      return labels.customReceipt
    case "business_workflow":
      return labels.businessWorkflow
    case "organization_chart":
      return labels.organizationChart
    case "operations":
      return labels.operations
    case "operations_work_orders":
      return labels.operationsWorkOrders
    case "operations_purchase_orders":
      return labels.operationsPurchaseOrders
    case "operations_invoicing":
      return labels.operationsInvoicing
    case "operations_inventory":
      return labels.operationsInventory
    case "growth":
      return labels.growth
    case "setup_guide":
      return labels.setupGuide
    case "email_client":
      return labels.emailClient
    case "instant_messaging":
      return "Instant messaging"
    default:
      return id
  }
}
