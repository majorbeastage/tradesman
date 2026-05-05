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
  mergeDashboardQuickLinksMetadata,
  normalizeDashboardOptionalOrder,
  parseDashboardQuickLinks,
  type DashboardOptionalQuickLinkId,
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
  }
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
  const btn: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    minHeight: compact ? 76 : 84,
    padding: "12px 12px 12px",
    borderRadius: 9,
    border: primaryRow ? `1px solid rgba(249, 115, 22, 0.38)` : `1px solid rgba(51, 65, 85, 0.35)`,
    background: primaryRow
      ? "linear-gradient(152deg, #dce6f2 0%, #d6dfec 46%, #c7d2df 100%)"
      : "linear-gradient(148deg, #e4e9f0 0%, #dbe2eb 45%, #cfd9e6 100%)",
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "left",
    overflow: "hidden",
    boxShadow: primaryRow
      ? "0 2px 8px rgba(249, 115, 22, 0.14), 0 6px 16px rgba(15, 23, 42, 0.1)"
      : "0 1px 5px rgba(15, 23, 42, 0.08)",
    opacity: disabled ? 0.72 : dimmed ? 0.82 : 1,
  }
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
            padding: "2px 6px",
            borderRadius: 6,
            background: "rgba(15,23,42,0.75)",
            color: "#f8fafc",
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
          top: primaryRow ? 8 : 10,
          right: primaryRow ? 8 : 10,
          width: primaryRow ? 30 : 26,
          height: primaryRow ? 30 : 26,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${accent}40, ${accent}72)`,
          border: `1px solid ${accent}66`,
          boxShadow: primaryRow ? `0 0 14px ${accent}44` : undefined,
        }}
      />
      <span
        style={{
          marginTop: 2,
          fontSize: compact ? 14 : 15,
          fontWeight: 800,
          color: "#0f172a",
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
        const nextMeta = mergeDashboardQuickLinksMetadata(prevMeta, { v: 1, optional_order: optionalOrder })
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
  }, [optionalOrder, profileUserId, prefsHydrated])

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

  const shell: CSSProperties = {
    padding: isMobile ? "12px 12px 14px" : "16px 16px 18px",
    borderRadius: 12,
    background: "linear-gradient(175deg, #cbd5e1 0%, #b8c4d4 52%, #a8b6ca 100%)",
    border: "1px solid rgba(30, 41, 59, 0.35)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.55), 0 12px 32px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.04)",
    marginBottom: 8,
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
          compact={isMobile}
          label={labels.customerPaymentsSoon}
          accent="#64748b"
          dimmed={!customize}
          customize={customize}
          onRemove={rm}
          removeChipLabel={labels.customizeRemove}
          {...dragProps}
          onClick={() => {}}
        />
      )
    }
    if (id === "reporting") {
      return (
        <Tile
          key={id}
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

  return (
    <section style={{ marginBottom: 6 }}>
      <style>{`
        .tm-dash-tile {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .tm-dash-tile:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 14px 32px rgba(249, 115, 22, 0.22), 0 8px 20px rgba(15, 23, 42, 0.14);
          border-color: rgba(249, 115, 22, 0.65) !important;
        }
        .tm-dash-tile:active:not(:disabled) {
          transform: translateY(-1px);
        }
      `}</style>
      <DashboardTodayTodoModal open={todayOpen} onClose={() => setTodayOpen(false)} dataUserId={dashboardDataUserId ?? null} />

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
            border: `1px solid rgba(249,115,22,0.45)`,
            background: customize ? "rgba(249,115,22,0.22)" : "rgba(255,255,255,0.3)",
            color: "#0f172a",
            cursor: "pointer",
          }}
        >
          {customize ? labels.customizeDone : labels.customizeHint}
        </button>
      </div>
      {customize ? (
        <div style={{ margin: "8px 0 0", fontSize: 11, color: "rgba(15,23,42,0.7)", maxWidth: 640, lineHeight: 1.45 }}>
          <span>{labels.customizeAddHint}</span>
          {persistNote === "cloud" ? (
            <span style={{ display: "block", marginTop: 4, color: "rgba(167,243,208,0.95)" }}>{labels.savedCloud}</span>
          ) : persistNote === "local" ? (
            <span style={{ display: "block", marginTop: 4 }}>{labels.savedDeviceOnly}</span>
          ) : null}
        </div>
      ) : null}

      <div style={shell}>
        <div style={grid4}>
          <Tile
            compact={isMobile}
            label={labels.customers}
            accent={theme.primary}
            primaryRow
            onClick={() => go("customers")}
          />
          <Tile
            compact={isMobile}
            label={labels.estimates}
            accent={theme.primary}
            primaryRow
            onClick={() => go("quotes")}
          />
          <Tile
            compact={isMobile}
            label={labels.calendar}
            accent={theme.primary}
            primaryRow
            onClick={() => go("calendar")}
          />
          <Tile
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
