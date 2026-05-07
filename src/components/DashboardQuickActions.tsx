import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react"
import type { UserRole } from "../contexts/AuthContext"
import { theme } from "../styles/theme"
import {
  queueCalendarSuiteNavigation,
  type QueuedCalendarSuite,
} from "../lib/workflowNavigation"
import { supabase } from "../lib/supabase"
import {
  ALL_DASHBOARD_OPTIONAL_IDS,
  DASHBOARD_PALETTE_ONLY_IDS,
  DEFAULT_DASHBOARD_TILE_SCHEME,
  DASHBOARD_TILE_SCHEMES,
  mergeDashboardQuickLinksMetadata,
  normalizeDashboardOptionalOrder,
  parseDashboardQuickLinks,
  type DashboardOptionalQuickLinkId,
  type DashboardTileScheme,
} from "../lib/dashboardQuickLinksPrefs"
import DashboardTodayTodoModal from "./DashboardTodayTodoModal"

const LS_OPTIONAL_ORDER = "tradesman_dashboard_optional_link_order_v2"

export type OptionalQuickLinkId = DashboardOptionalQuickLinkId

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
  }
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

function resolveFourthCalendarState(
  p: Pick<Props, "officeManager" | "authRole" | "managedByOfficeManager" | "managedSchedulingToolsEnabled">,
  labels: Props["labels"],
): { label: string; suite: QueuedCalendarSuite } {
  if (p.officeManager) {
    return { label: labels.teamManagement, suite: { id: "team_management", panel: "team_members" } }
  }
  const role = p.authRole
  const isOmOrAdmin = role === "office_manager" || role === "admin"
  if (isOmOrAdmin) {
    return { label: labels.teamManagement, suite: { id: "team_management", panel: "team_members" } }
  }
  const showSchedulingStandalone =
    (role === "user" || role === "new_user" || role === "demo_user" || role == null) &&
    !isOmOrAdmin &&
    (!p.managedByOfficeManager || p.managedSchedulingToolsEnabled)
  if (showSchedulingStandalone) {
    return { label: labels.schedulingTools, suite: { id: "scheduling_tools", panel: "job_types" } }
  }
  if (p.managedByOfficeManager) {
    return { label: labels.schedulingTools, suite: { id: "managed_job_types" } }
  }
  return { label: labels.schedulingTools, suite: { id: "scheduling_tools", panel: "job_types" } }
}

function Tile({
  scheme,
  label,
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
  customize,
  onRemove,
  removeChipLabel,
}: {
  scheme: DashboardTileScheme
  label: string
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
}) {
  const labelColor = tileLabelColor(scheme, Boolean(primaryRow))
  const optionalArrowColor = tileArrowColor(scheme, Boolean(primaryRow), accent)
  const btn: CSSProperties = tileButtonStyle(scheme, {
    primaryRow: Boolean(primaryRow),
    compact,
    disabled,
    dimmed,
  })
  return (
    <button
      type="button"
      className="tm-dash-tile"
      disabled={disabled}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
          borderRadius: "50%",
          background: `linear-gradient(145deg, ${accent}35, ${accent}14)`,
          border: `1px solid ${accent}55`,
          boxShadow: primaryRow ? `0 0 18px ${accent}38` : `0 0 12px ${accent}22`,
        }}
      />
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
      </span>
    </button>
  )
}

function parseLegacyLocalOrder(raw: string | null): DashboardOptionalQuickLinkId[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return null
    const allowed = ALL_DASHBOARD_OPTIONAL_IDS
    const out = v.filter((x): x is DashboardOptionalQuickLinkId => typeof x === "string" && allowed.has(x as DashboardOptionalQuickLinkId))
    return normalizeDashboardOptionalOrder(out)
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
    authRole,
  } = props
  const fourth = resolveFourthCalendarState(props, labels)
  const reportingAllowed = authRole === "office_manager" || authRole === "admin"

  const go = (page: string, calendarSuite?: QueuedCalendarSuite) => {
    if (calendarSuite) queueCalendarSuiteNavigation(calendarSuite)
    setPage(page)
  }

  const [optionalOrder, setOptionalOrder] = useState<DashboardOptionalQuickLinkId[]>(() => {
    if (typeof window === "undefined") return normalizeDashboardOptionalOrder(undefined)
    const legacy = parseLegacyLocalOrder(localStorage.getItem(LS_OPTIONAL_ORDER))
    if (legacy) return legacy
    return normalizeDashboardOptionalOrder(undefined)
  })
  const [tileScheme, setTileScheme] = useState<DashboardTileScheme>(DEFAULT_DASHBOARD_TILE_SCHEME)
  const [persistNote, setPersistNote] = useState<"idle" | "cloud" | "local">("idle")
  const [customize, setCustomize] = useState(false)
  const [dragId, setDragId] = useState<DashboardOptionalQuickLinkId | null>(null)
  const [todayOpen, setTodayOpen] = useState(false)
  const [prefsHydrated, setPrefsHydrated] = useState(false)
  /** True after user reorders/adds/removes — avoids remote profile fetch overwriting local edits. */
  const userModifiedRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(LS_OPTIONAL_ORDER, JSON.stringify(optionalOrder))
    } catch {
      /* ignore */
    }
  }, [optionalOrder])

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
        const parsed = parseDashboardQuickLinks(data?.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>).dashboard_quick_links : null)
        const fromCloud = parsed?.optional_order?.length ? normalizeDashboardOptionalOrder(parsed.optional_order) : null
        if (parsed?.tile_scheme) setTileScheme(parsed.tile_scheme)
        else setTileScheme(DEFAULT_DASHBOARD_TILE_SCHEME)
        if (fromCloud) {
          setOptionalOrder(fromCloud)
          setPersistNote("cloud")
        } else {
          const loc = typeof window !== "undefined" ? parseLegacyLocalOrder(localStorage.getItem(LS_OPTIONAL_ORDER)) : null
          if (loc) setOptionalOrder(loc)
        }
        setPrefsHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [profileUserId])

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
        const nextMeta = mergeDashboardQuickLinksMetadata(prevMeta, { optional_order: optionalOrder, tile_scheme: tileScheme })
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
  }, [optionalOrder, tileScheme, profileUserId, prefsHydrated])

  const optionalTiles = useMemo(() => {
    const vis: { id: DashboardOptionalQuickLinkId; show: boolean }[] = [
      { id: "settings", show: Boolean(showSettingsShortcut) },
      { id: "payments", show: Boolean(showPaymentsShortcut) },
      { id: "insurance", show: true },
      { id: "customer_payments_soon", show: true },
      { id: "reporting", show: reportingAllowed },
      { id: "job_types", show: true },
      { id: "today_todo", show: true },
    ]
    const visSet = new Set(vis.filter((x) => x.show).map((x) => x.id))
    return optionalOrder.filter((id) => visSet.has(id))
  }, [optionalOrder, showSettingsShortcut, showPaymentsShortcut, reportingAllowed])

  const paletteAvailable = useMemo(() => {
    const onBar = new Set(optionalTiles)
    return DASHBOARD_PALETTE_ONLY_IDS.filter((id) => !onBar.has(id))
  }, [optionalTiles])

  const onOptionalDragStart = useCallback((id: DashboardOptionalQuickLinkId) => {
    setDragId(id)
  }, [])

  const onOptionalDrop = useCallback(
    (target: DashboardOptionalQuickLinkId) => {
      if (!dragId || dragId === target) return
      userModifiedRef.current = true
      setOptionalOrder((prev) => {
        const filtered = optionalTiles
        if (!filtered.includes(dragId) || !filtered.includes(target)) return prev
        const arr = [...prev]
        const from = arr.indexOf(dragId)
        const to = arr.indexOf(target)
        if (from < 0 || to < 0) return prev
        arr.splice(from, 1)
        arr.splice(to, 0, dragId)
        return arr
      })
      setDragId(null)
    },
    [dragId, optionalTiles],
  )

  const removeFromBar = useCallback((id: DashboardOptionalQuickLinkId) => {
    userModifiedRef.current = true
    setOptionalOrder((prev) => prev.filter((x) => x !== id))
  }, [])

  const addPaletteId = useCallback((id: DashboardOptionalQuickLinkId) => {
    userModifiedRef.current = true
    setOptionalOrder((prev) => {
      if (prev.includes(id)) return prev
      return [...prev, id]
    })
  }, [])

  const shell = dashShellStyle(isMobile, tileScheme)

  const schemeChoiceLabel = (id: DashboardTileScheme): string => {
    switch (id) {
      case "ocean":
        return labels.cardLookOcean
      case "slate":
        return labels.cardLookSlate
      case "paper":
        return labels.cardLookPaper
      default:
        return labels.cardLookEmber
    }
  }

  const grid4: CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
    gap: isMobile ? 8 : 10,
    marginTop: 10,
  }

  const gridOpt: CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(160px, 1fr))",
    gap: isMobile ? 8 : 10,
    marginTop: 10,
  }

  const renderOptionalTile = (id: DashboardOptionalQuickLinkId) => {
    const dragProps = {
      draggable: customize,
      onDragStart: () => customize && onOptionalDragStart(id),
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        onOptionalDrop(id)
      },
    }
    const rm = customize ? () => removeFromBar(id) : undefined

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
          {...dragProps}
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
          {...dragProps}
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
          {...dragProps}
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
          {...dragProps}
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
          {...dragProps}
          onClick={() => !customize && go("reporting")}
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
          {...dragProps}
          onClick={() => !customize && go("calendar", { id: "scheduling_tools", panel: "job_types" })}
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
          {...dragProps}
          onClick={() => !customize && setTodayOpen(true)}
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
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(15,23,42,0.75)", marginBottom: 6 }}>{labels.cardLookLabel}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {DASHBOARD_TILE_SCHEMES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  userModifiedRef.current = true
                  setTileScheme(id)
                }}
                style={{
                  padding: "5px 10px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: tileScheme === id ? `2px solid ${hoverBorder}` : "1px solid rgba(51,65,85,0.35)",
                  background: tileScheme === id ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)",
                  color: "#0f172a",
                }}
              >
                {schemeChoiceLabel(id)}
              </button>
            ))}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 10, color: "rgba(15,23,42,0.62)", maxWidth: 560, lineHeight: 1.4 }}>{labels.cardLookHint}</p>
        </div>
        {customize ? (
          <div style={{ margin: "10px 0 0", fontSize: 11, color: "rgba(15,23,42,0.72)", maxWidth: 640, lineHeight: 1.45 }}>
            <span>{labels.customizeAddHint}</span>
            {persistNote === "cloud" ? (
              <span style={{ display: "block", marginTop: 4, color: "rgba(16,185,129,0.95)" }}>{labels.savedCloud}</span>
            ) : persistNote === "local" ? (
              <span style={{ display: "block", marginTop: 4 }}>{labels.savedDeviceOnly}</span>
            ) : null}
          </div>
        ) : null}

        <div style={{ ...grid4, marginTop: customize ? 12 : 14 }}>
          <Tile
            scheme={tileScheme}
            compact={isMobile}
            label={labels.customers}
            accent={theme.primary}
            primaryRow
            onClick={() => go("customers")}
          />
          <Tile
            scheme={tileScheme}
            compact={isMobile}
            label={labels.estimates}
            accent={theme.primary}
            primaryRow
            onClick={() => go("quotes")}
          />
          <Tile
            scheme={tileScheme}
            compact={isMobile}
            label={labels.calendar}
            accent={theme.primary}
            primaryRow
            onClick={() => go("calendar")}
          />
          <Tile
            scheme={tileScheme}
            compact={isMobile}
            label={fourth.label}
            accent={theme.primary}
            primaryRow
            onClick={() => go("calendar", fourth.suite)}
          />
        </div>

        {optionalTiles.length > 0 ? <div style={gridOpt}>{optionalTiles.map((id) => renderOptionalTile(id))}</div> : null}

        {customize && paletteAvailable.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>{labels.customizePaletteTitle}</div>
            <div style={gridOpt}>
              {paletteAvailable.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => addPaletteId(id)}
                  style={{
                    minHeight: isMobile ? 72 : 76,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: `1px dashed rgba(51,65,85,0.45)`,
                    background: "rgba(255,255,255,0.35)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontWeight: 700,
                    fontSize: compactFont(isMobile),
                    color: "#0f172a",
                  }}
                >
                  + {id === "job_types" ? labels.jobTypes : labels.todayTodo}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function compactFont(isMobile: boolean) {
  return isMobile ? 13 : 14
}
