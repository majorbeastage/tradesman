import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react"
import type { UserRole } from "../contexts/AuthContext"
import { theme } from "../styles/theme"
import {
  queueCalendarSuiteNavigation,
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
  addTileToOrder,
  flattenTileRows,
  type DashboardOptionalQuickLinkId,
  fontCssForTile,
  mergeDashboardQuickLinksMetadata,
  migrateStoredTileOrder,
  normalizeDashboardTileOrder,
  normalizeDashboardTileRows,
  operationsQuickLinkPage,
  orderFromTileRows,
  removeTileFromOrder,
  thumbnailGlyph,
  tileRowsFromOrder,
  type DashboardCoreQuickLinkId,
  type DashboardGridColumns,
  type DashboardQuickLinkId,
  type DashboardTileScheme,
  type DashboardTileStyle,
} from "../lib/dashboardQuickLinksPrefs"
import DashboardQuickLinkGrid from "./DashboardQuickLinkGrid"
import DashboardTodayTodoModal from "./DashboardTodayTodoModal"
import DashboardTileStyleMenu from "./DashboardTileStyleMenu"
import PlatformAssistantField from "./PlatformAssistantField"
import { isOfficeManagerLikeRole } from "../lib/profileRoles"
import { useGlobalAssistantOptional } from "../contexts/GlobalAssistantContext"
import { useJobTypesModalOptional } from "../contexts/JobTypesModalContext"

const LS_TILE_ORDER = "tradesman_dashboard_tile_order_v5"
const LS_TILE_ROWS = "tradesman_dashboard_tile_rows_v4"

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
    customizeHint: string
    customizeDone: string
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
  opts: { primaryRow: boolean; compact: boolean; disabled?: boolean; dimmed?: boolean },
): CSSProperties {
  const { primaryRow, compact, disabled, dimmed } = opts
  const minHeight = compact ? 88 : 96
  switch (scheme) {
    case "ocean":
      return {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        minHeight,
        padding: "14px 14px 13px",
        borderRadius: 12,
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
        padding: "14px 14px 13px",
        borderRadius: 12,
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
        padding: "14px 14px 13px",
        borderRadius: 12,
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
        padding: "14px 14px 13px",
        borderRadius: 12,
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
  const effectiveAccent = tileStyle?.accent ?? accent
  const labelColor = tileStyle?.labelColor ?? tileLabelColor(scheme, Boolean(primaryRow))
  const optionalArrowColor = tileArrowColor(scheme, Boolean(primaryRow), effectiveAccent)
  const btn: CSSProperties = {
    ...tileButtonStyle(scheme, {
      primaryRow: Boolean(primaryRow),
      compact,
      disabled,
      dimmed,
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
            top: 6,
            right: 6,
            zIndex: 2,
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 7px",
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
          top: primaryRow ? 10 : 11,
          right: primaryRow ? 10 : 11,
          width: primaryRow ? 34 : 28,
          height: primaryRow ? 34 : 28,
          borderRadius: thumb ? 8 : "50%",
          background: thumb
            ? "rgba(255,255,255,0.92)"
            : `linear-gradient(145deg, ${effectiveAccent}35, ${effectiveAccent}14)`,
          border: thumb ? `1px solid ${effectiveAccent}44` : `1px solid ${effectiveAccent}55`,
          boxShadow: primaryRow ? `0 0 18px ${effectiveAccent}38` : `0 0 12px ${effectiveAccent}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: thumb ? (primaryRow ? 18 : 15) : undefined,
          lineHeight: 1,
        }}
      >
        {thumb || null}
      </span>
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
      <span
        style={{
          marginTop: 2,
          paddingRight: 22,
          fontSize: compact ? 14 : 15,
          fontWeight: 800,
          color: labelColor,
          lineHeight: 1.25,
          letterSpacing: primaryRow ? -0.02 : undefined,
        }}
      >
        {label}
        {sublabel ? (
          <span
            style={{
              display: "block",
              marginTop: 4,
              fontSize: compact ? 10 : 11,
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
      return orderFromTileRows(normalizeDashboardTileRows(rows, [], fourth))
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
    showSettingsShortcut,
    showPaymentsShortcut,
    profileUserId,
    dashboardDataUserId,
    onOpenSetupGuide,
  } = props
  const ga = useGlobalAssistantOptional()
  const { portalConfig } = useAuth()

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
  const jobTypesModal = useJobTypesModalOptional()
  const fourth = resolveFourthCalendarState(props, labels)
  const fourthLinkId = fourth.linkId
  const tileScheme: DashboardTileScheme = "paper"

  const go = (page: string, calendarSuite?: QueuedCalendarSuite) => {
    if (calendarSuite) queueCalendarSuiteNavigation(calendarSuite)
    setPage(page)
  }

  const [tileOrder, setTileOrder] = useState<DashboardQuickLinkId[]>(() => {
    const fallback = normalizeDashboardTileOrder(undefined, fourthLinkId)
    if (typeof window === "undefined") return fallback
    const v5 = parseLegacyLocalOrder(localStorage.getItem(LS_TILE_ORDER), fourthLinkId)
    if (v5?.length) return v5
    const localRows = parseLegacyLocalOrder(localStorage.getItem(LS_TILE_ROWS), fourthLinkId)
    if (localRows?.length) return localRows
    const legacyOrder = parseLegacyLocalOrder(localStorage.getItem("tradesman_dashboard_tile_order_v3"), fourthLinkId)
    if (legacyOrder?.length) return legacyOrder
    const v2 = parseLegacyLocalOrder(localStorage.getItem("tradesman_dashboard_optional_link_order_v2"), fourthLinkId)
    if (v2?.length) return v2
    return fallback
  })
  const [tileStyles, setTileStyles] = useState<Partial<Record<string, DashboardTileStyle>>>({})
  const [gridColumns, setGridColumns] = useState<DashboardGridColumns>("auto")
  const [persistNote, setPersistNote] = useState<"idle" | "cloud" | "local">("idle")
  const [customize, setCustomize] = useState(false)
  const [dragId, setDragId] = useState<DashboardQuickLinkId | null>(null)
  const [styleMenu, setStyleMenu] = useState<{ id: DashboardQuickLinkId; x: number; y: number } | null>(null)
  const [todayOpen, setTodayOpen] = useState(false)
  const [prefsHydrated, setPrefsHydrated] = useState(false)
  const userModifiedRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(LS_TILE_ORDER, JSON.stringify(tileOrder))
      localStorage.setItem(LS_TILE_ROWS, JSON.stringify(tileRowsFromOrder(tileOrder)))
    } catch {
      /* ignore */
    }
  }, [tileOrder])

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
        const migrated = migrateStoredTileOrder(raw, fourthLinkId)
        if (migrated.rows.length) {
          setTileOrder(flattenTileRows(migrated.rows))
          setTileStyles(migrated.styles)
          setGridColumns(migrated.gridColumns)
          setPersistNote("cloud")
        } else {
          const loc =
            typeof window !== "undefined"
              ? parseLegacyLocalOrder(localStorage.getItem(LS_TILE_ORDER), fourthLinkId) ??
                parseLegacyLocalOrder(localStorage.getItem(LS_TILE_ROWS), fourthLinkId)
              : null
          if (loc?.length) setTileOrder(loc)
        }
        setPrefsHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [profileUserId, fourthLinkId])

  useEffect(() => {
    if (!prefsHydrated) return
    if (!supabase || !profileUserId) {
      setPersistNote("local")
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { data, error: fetchErr } = await supabase.from("profiles").select("metadata").eq("id", profileUserId).maybeSingle()
        if (cancelled) return
        if (fetchErr) throw fetchErr
        const prevMeta =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? { ...(data.metadata as Record<string, unknown>) }
            : {}
        const nextMeta = mergeDashboardQuickLinksMetadata(
          prevMeta,
          { tile_rows: tileRowsFromOrder(tileOrder), tile_order: tileOrder, tile_styles: tileStyles, tile_scheme: "paper", grid_columns: gridColumns },
          fourthLinkId,
        )
        const { error: upErr } = await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", profileUserId)
        if (cancelled) return
        if (upErr) throw upErr
        setPersistNote("cloud")
      } catch {
        if (!cancelled) setPersistNote("local")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tileOrder, tileStyles, gridColumns, profileUserId, prefsHydrated, fourthLinkId])

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
      return true
    },
    [
      fourthLinkId,
      showSettingsShortcut,
      showPaymentsShortcut,
      props.showTimeClockShortcut,
      props.showCustomReceiptShortcut,
      onOpenSetupGuide,
      operationsQuickLinkVisible,
      portalConfig,
    ],
  )

  const visibleTiles = useMemo(
    () => tileOrder.filter((id) => linkAvailable(id)),
    [tileOrder, linkAvailable],
  )

  const paletteAvailable = useMemo(() => {
    const onBar = new Set(visibleTiles)
    return (Array.from(ALL_DASHBOARD_LINK_IDS) as DashboardQuickLinkId[]).filter((id) => {
      if (onBar.has(id)) return false
      return linkAvailable(id)
    })
  }, [visibleTiles, linkAvailable])

  const onTileDragStart = useCallback((id: DashboardQuickLinkId) => {
    setDragId(id)
  }, [])

  const onTileDragEnd = useCallback(() => {
    setDragId(null)
  }, [])

  const onOrderChange = useCallback((order: DashboardQuickLinkId[]) => {
    userModifiedRef.current = true
    setTileOrder(order)
  }, [])

  const removeFromBar = useCallback((id: DashboardQuickLinkId) => {
    userModifiedRef.current = true
    setTileOrder((prev) => removeTileFromOrder(prev, id))
  }, [])

  const addPaletteId = useCallback((id: DashboardQuickLinkId) => {
    userModifiedRef.current = true
    setTileOrder((prev) => addTileToOrder(prev, id))
  }, [])

  const patchTileStyle = useCallback((id: DashboardQuickLinkId, patch: Partial<DashboardTileStyle>) => {
    userModifiedRef.current = true
    setTileStyles((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }))
  }, [])

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

    if (id === "customers") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
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
    if (id === "job_types") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
          label={labels.jobTypes}
          accent="#0ea5e9"
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          onContextMenu={(e) => openStyleMenu(id, e)}
          tileStyle={tileStyle}
          onClick={() => !customize && jobTypesModal?.openJobTypesModal()}
        />
      )
    }
    if (id === "today_todo") {
      return (
        <Tile
          key={id}
          scheme={tileScheme}
          compact={isMobile}
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
            go("calendar")
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
          maxWidth: 1100,
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
      <DashboardTodayTodoModal open={todayOpen} onClose={() => setTodayOpen(false)} dataUserId={dashboardDataUserId ?? null} />

      <div>
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
          <div style={{ margin: "10px 0 0", fontSize: 11, color: "rgba(15,23,42,0.72)", maxWidth: 720, lineHeight: 1.45 }}>
            <span>{labels.customizeAddHint}</span>
            <span style={{ display: "block", marginTop: 4, opacity: 0.85 }}>
              Drag any tile and drop it on another to move it — or drop on the empty slot at the end. Right-click a tile for colors and style.
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
              <span style={{ fontWeight: 700 }}>Columns:</span>
              {(["auto", 2, 3, 4, 5] as const).map((c) => (
                <button
                  key={String(c)}
                  type="button"
                  onClick={() => setGridColumns(c)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: gridColumns === c ? "2px solid #0ea5e9" : "1px solid rgba(51,65,85,0.35)",
                    background: gridColumns === c ? "rgba(14,165,233,0.12)" : "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  {c === "auto" ? "Auto" : c}
                </button>
              ))}
            </div>
            {persistNote === "cloud" ? (
              <span style={{ display: "block", marginTop: 4, color: "rgba(16,185,129,0.95)" }}>{labels.savedCloud}</span>
            ) : persistNote === "local" ? (
              <span style={{ display: "block", marginTop: 4 }}>{labels.savedDeviceOnly}</span>
            ) : null}
          </div>
        ) : null}

        <DashboardQuickLinkGrid
          order={tileOrder}
          gridColumns={gridColumns}
          customize={customize}
          isMobile={isMobile}
          dragId={dragId}
          onDragStart={onTileDragStart}
          onDragEnd={onTileDragEnd}
          onOrderChange={onOrderChange}
          renderTile={renderTile}
          filterVisible={linkAvailable}
        />

        {customize && paletteAvailable.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>{labels.customizePaletteTitle}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 8 : 10 }}>
              {paletteAvailable.map((id) => (
                <button
                  key={id}
                  type="button"
                  draggable={customize}
                  onDragStart={() => onTileDragStart(id)}
                  onDragEnd={onTileDragEnd}
                  onClick={() => addPaletteId(id)}
                  style={{
                    minHeight: isMobile ? 72 : 76,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: `1px dashed rgba(51,65,85,0.45)`,
                    background: "rgba(255,255,255,0.35)",
                    cursor: customize ? "grab" : "pointer",
                    textAlign: "left",
                    fontWeight: 700,
                    fontSize: compactFont(isMobile),
                    color: "#0f172a",
                  }}
                >
                  + {quickLinkLabel(id, labels)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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

function compactFont(isMobile: boolean) {
  return isMobile ? 13 : 14
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
    default:
      return id
  }
}
