import { type ReactNode, useCallback, useRef, useState } from "react"
import {
  customizeGridRowsFromLength,
  dashboardCustomizeMaxRows,
  dashboardCustomizeMinRows,
  placeTileInCustomizeSlot,
  removeTileFromCustomizeGrid,
  type DashboardQuickLinkId,
  type DashboardTileGridSlot,
} from "../lib/dashboardQuickLinksPrefs"

export const DASHBOARD_TILE_WIDTH_DESKTOP = 132
export const DASHBOARD_TILE_WIDTH_MOBILE = 124
export const DASHBOARD_TILE_HEIGHT_DESKTOP = 80
export const DASHBOARD_TILE_HEIGHT_MOBILE = 76

type Zone = "visible" | "hidden"

type DragSession = { id: DashboardQuickLinkId; zone: Zone }

type Props = {
  grid: DashboardTileGridSlot[]
  gridCols: number
  hiddenIds: DashboardQuickLinkId[]
  isMobile: boolean
  onGridChange: (grid: DashboardTileGridSlot[]) => void
  renderTile: (id: DashboardQuickLinkId) => ReactNode
  visibleTitle: string
  hiddenTitle: string
}

export default function DashboardQuickLinkCustomizeZones({
  grid,
  gridCols,
  hiddenIds,
  isMobile,
  onGridChange,
  renderTile,
  visibleTitle,
  hiddenTitle,
}: Props) {
  const [hoverSlot, setHoverSlot] = useState<number | "hidden" | null>(null)
  const [draggingId, setDraggingId] = useState<DashboardQuickLinkId | null>(null)
  const sessionRef = useRef<DragSession | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const visibleZoneRef = useRef<HTMLDivElement>(null)
  const hiddenZoneRef = useRef<HTMLDivElement>(null)

  const tileW = isMobile ? DASHBOARD_TILE_WIDTH_MOBILE : DASHBOARD_TILE_WIDTH_DESKTOP
  const tileH = isMobile ? DASHBOARD_TILE_HEIGHT_MOBILE : DASHBOARD_TILE_HEIGHT_DESKTOP
  const gap = isMobile ? 8 : 10
  const minRows = dashboardCustomizeMinRows(isMobile)
  const maxRows = dashboardCustomizeMaxRows(isMobile)
  const gridRows = customizeGridRowsFromLength(grid, gridCols, minRows)
  const isDragging = draggingId != null
  const canExpand = isDragging && gridRows < maxRows
  const displayRows = canExpand ? gridRows + 1 : gridRows
  const slotCount = displayRows * gridCols

  const clearHover = () => setHoverSlot(null)

  const slotFromPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      const el = gridRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
      const col = Math.min(gridCols - 1, Math.max(0, Math.floor(x / (tileW + gap))))
      const row = Math.min(displayRows - 1, Math.max(0, Math.floor(y / (tileH + gap))))
      return row * gridCols + col
    },
    [gridCols, displayRows, tileW, tileH, gap],
  )

  const finishDrag = useCallback(() => {
    sessionRef.current = null
    setDraggingId(null)
    clearHover()
  }, [])

  const placeAtSlot = useCallback(
    (id: DashboardQuickLinkId, slotIndex: number) => {
      onGridChange(placeTileInCustomizeSlot(grid, gridCols, isMobile, id, slotIndex))
      finishDrag()
    },
    [grid, gridCols, isMobile, onGridChange, finishDrag],
  )

  const pointInRect = (x: number, y: number, el: HTMLElement | null) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  const updateHoverFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const session = sessionRef.current
      if (!session) return
      if (pointInRect(clientX, clientY, hiddenZoneRef.current) && session.zone === "visible" && grid.includes(session.id)) {
        setHoverSlot("hidden")
        return
      }
      if (pointInRect(clientX, clientY, visibleZoneRef.current)) {
        const slot = slotFromPoint(clientX, clientY)
        if (slot != null) {
          setHoverSlot(slot)
          return
        }
        if (!grid.some((x) => x != null)) {
          setHoverSlot(0)
          return
        }
      }
      clearHover()
    },
    [grid, slotFromPoint],
  )

  const commitDropAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const session = sessionRef.current
      if (!session) return

      if (
        session.zone === "visible" &&
        grid.includes(session.id) &&
        pointInRect(clientX, clientY, hiddenZoneRef.current)
      ) {
        onGridChange(removeTileFromCustomizeGrid(grid, session.id))
        finishDrag()
        return
      }

      if (pointInRect(clientX, clientY, visibleZoneRef.current)) {
        const slot = slotFromPoint(clientX, clientY)
        if (slot != null) {
          placeAtSlot(session.id, slot)
          return
        }
        if (!grid.some((x) => x != null)) {
          placeAtSlot(session.id, 0)
          return
        }
      }

      finishDrag()
    },
    [grid, slotFromPoint, placeAtSlot, onGridChange, finishDrag],
  )

  const beginPointerDrag = (e: React.PointerEvent, id: DashboardQuickLinkId, zone: Zone) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest("[data-dash-remove-chip]")) return
    sessionRef.current = { id, zone }
    setDraggingId(id)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!sessionRef.current) return
    updateHoverFromPoint(e.clientX, e.clientY)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!sessionRef.current) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    commitDropAtPoint(e.clientX, e.clientY)
  }

  const onPointerCancel = () => {
    finishDrag()
  }

  const tileShell = (id: DashboardQuickLinkId, zone: Zone) => {
    const isSource = draggingId === id
    return (
      <div
        key={`${zone}-${id}`}
        onPointerDown={(e) => beginPointerDrag(e, id, zone)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          width: tileW,
          height: tileH,
          flexShrink: 0,
          opacity: isSource ? 0.45 : 1,
          cursor: isSource ? "grabbing" : "grab",
          touchAction: "none",
        }}
        className="tm-dash-customize-tile-wrap"
      >
        {renderTile(id)}
      </div>
    )
  }

  const zoneShell: React.CSSProperties = {
    borderRadius: 12,
    border: "1px dashed rgba(100, 116, 139, 0.35)",
    background: "rgba(255,255,255,0.35)",
    padding: isMobile ? 10 : 12,
    minHeight: tileH * displayRows + gap * Math.max(0, displayRows - 1) + 24,
  }

  const hasVisible = grid.some((x) => x != null)
  const expansionRow = canExpand ? gridRows : -1

  const renderSlot = (slotIndex: number) => {
    const id = slotIndex < grid.length ? grid[slotIndex] : null
    const row = Math.floor(slotIndex / gridCols)
    const isExpansion = row === expansionRow
    const active = hoverSlot === slotIndex && isDragging

    if (id) {
      return tileShell(id, "visible")
    }

    return (
      <div
        key={`slot-${slotIndex}`}
        style={{
          width: tileW,
          height: tileH,
          borderRadius: 8,
          border: active
            ? "2px dashed rgba(14, 165, 233, 0.55)"
            : isExpansion
              ? "2px dashed rgba(14, 165, 233, 0.35)"
              : "1px dashed rgba(148, 163, 184, 0.28)",
          background: active
            ? "rgba(14, 165, 233, 0.08)"
            : isExpansion
              ? "rgba(14, 165, 233, 0.04)"
              : "rgba(255,255,255,0.2)",
          boxSizing: "border-box",
        }}
        aria-hidden={!isExpansion}
      />
    )
  }

  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div ref={visibleZoneRef} style={zoneShell}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{visibleTitle}</div>
        {!hasVisible && !isDragging ? (
          <div
            style={{
              minHeight: tileH,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              border:
                hoverSlot === 0 && isDragging
                  ? "2px dashed rgba(14, 165, 233, 0.55)"
                  : "1px dashed rgba(148, 163, 184, 0.4)",
              color: "#64748b",
              fontSize: 12,
              fontWeight: 600,
              padding: 8,
            }}
          >
            Drag shortcuts here to show on your dashboard
          </div>
        ) : (
          <div
            ref={gridRef}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${gridCols}, ${tileW}px)`,
              gridTemplateRows: `repeat(${displayRows}, ${tileH}px)`,
              gap,
              width: "100%",
            }}
          >
            {Array.from({ length: slotCount }, (_, slotIndex) => {
              const id = slotIndex < grid.length ? grid[slotIndex] : null
              const active = hoverSlot === slotIndex && isDragging
              if (id) {
                return (
                  <div
                    key={`slot-${slotIndex}`}
                    style={{
                      outline: active ? "2px dashed rgba(14, 165, 233, 0.65)" : undefined,
                      outlineOffset: 2,
                      borderRadius: 8,
                    }}
                  >
                    {tileShell(id, "visible")}
                  </div>
                )
              }
              return renderSlot(slotIndex)
            })}
          </div>
        )}
        {canExpand ? (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
            Drag to the highlighted row below to add another row.
          </p>
        ) : null}
      </div>

      <div
        ref={hiddenZoneRef}
        style={{
          ...zoneShell,
          minHeight: tileH + 24,
          outline: hoverSlot === "hidden" && isDragging ? "2px dashed rgba(14, 165, 233, 0.45)" : undefined,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{hiddenTitle}</div>
        {hiddenIds.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            All available shortcuts are on your dashboard.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap }}>
            {hiddenIds.map((id) => tileShell(id, "hidden"))}
          </div>
        )}
      </div>
      <style>{`
        .tm-dash-customize-tile-wrap .tm-dash-tile {
          width: 100%;
          height: 100%;
          min-height: 0 !important;
          pointer-events: none !important;
          user-select: none;
        }
        .tm-dash-customize-tile-wrap [data-dash-remove-chip] {
          pointer-events: auto;
        }
      `}</style>
    </div>
  )
}
