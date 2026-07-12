import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
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
export const DASHBOARD_TILE_WIDTH_MOBILE = 78
export const DASHBOARD_TILE_HEIGHT_DESKTOP = 80
export const DASHBOARD_TILE_HEIGHT_MOBILE = 56

type Zone = "visible" | "hidden"

type DragSession = { id: DashboardQuickLinkId; zone: Zone }
type SelectedTile = { id: DashboardQuickLinkId; zone: Zone }

const MOBILE_DRAG_THRESHOLD_PX = 12

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
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null)
  const sessionRef = useRef<DragSession | null>(null)
  const pointerStartRef = useRef<{
    x: number
    y: number
    id: DashboardQuickLinkId
    zone: Zone
    pointerId: number
    target: HTMLElement
  } | null>(null)
  const dragActiveRef = useRef(false)
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
      const cellW = isMobile
        ? (rect.width - gap * Math.max(0, gridCols - 1)) / gridCols
        : tileW
      const col = Math.min(gridCols - 1, Math.max(0, Math.floor(x / (cellW + gap))))
      const row = Math.min(displayRows - 1, Math.max(0, Math.floor(y / (tileH + gap))))
      return row * gridCols + col
    },
    [gridCols, displayRows, tileW, tileH, gap, isMobile],
  )

  const finishDrag = useCallback(() => {
    sessionRef.current = null
    pointerStartRef.current = null
    dragActiveRef.current = false
    setDraggingId(null)
    clearHover()
  }, [])

  const placeAtSlot = useCallback(
    (id: DashboardQuickLinkId, slotIndex: number) => {
      onGridChange(placeTileInCustomizeSlot(grid, gridCols, isMobile, id, slotIndex))
      finishDrag()
      setSelectedTile(null)
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
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      id,
      zone,
      pointerId: e.pointerId,
      target: e.currentTarget as HTMLElement,
    }
    dragActiveRef.current = false
  }

  const activateDrag = (start: NonNullable<typeof pointerStartRef.current>) => {
    dragActiveRef.current = true
    sessionRef.current = { id: start.id, zone: start.zone }
    setDraggingId(start.id)
    setSelectedTile(null)
    try {
      start.target.setPointerCapture(start.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      const start = pointerStartRef.current
      if (!start) return
      if (!dragActiveRef.current) {
        const dx = clientX - start.x
        const dy = clientY - start.y
        const threshold = isMobile ? MOBILE_DRAG_THRESHOLD_PX : 6
        if (Math.hypot(dx, dy) < threshold) return
        activateDrag(start)
      }
      if (!sessionRef.current) return
      updateHoverFromPoint(clientX, clientY)
    },
    [isMobile, updateHoverFromPoint],
  )

  const handlePointerUp = useCallback(
    (clientX: number, clientY: number, pointerId: number) => {
      const start = pointerStartRef.current
      pointerStartRef.current = null
      if (!start) return

      if (!dragActiveRef.current && isMobile) {
        setSelectedTile((prev) =>
          prev?.id === start.id && prev.zone === start.zone ? null : { id: start.id, zone: start.zone },
        )
        return
      }

      if (!dragActiveRef.current) return

      try {
        start.target.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      commitDropAtPoint(clientX, clientY)
      dragActiveRef.current = false
    },
    [isMobile, commitDropAtPoint],
  )

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return
    if (!dragActiveRef.current) {
      const start = pointerStartRef.current
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      const threshold = isMobile ? MOBILE_DRAG_THRESHOLD_PX : 6
      if (Math.hypot(dx, dy) >= threshold) {
        activateDrag(start)
        e.preventDefault()
      }
    }
    handlePointerMove(e.clientX, e.clientY)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    handlePointerUp(e.clientX, e.clientY, e.pointerId)
  }

  const onPointerCancel = () => {
    finishDrag()
  }

  const onDocCancel = useCallback(() => finishDrag(), [finishDrag])

  useEffect(() => {
    if (!isDragging) return
    const onDocMove = (e: PointerEvent) => {
      if (!pointerStartRef.current) return
      handlePointerMove(e.clientX, e.clientY)
    }
    const onDocUp = (e: PointerEvent) => {
      if (!pointerStartRef.current) return
      handlePointerUp(e.clientX, e.clientY, e.pointerId)
    }
    document.addEventListener("pointermove", onDocMove)
    document.addEventListener("pointerup", onDocUp)
    document.addEventListener("pointercancel", onDocCancel)
    return () => {
      document.removeEventListener("pointermove", onDocMove)
      document.removeEventListener("pointerup", onDocUp)
      document.removeEventListener("pointercancel", onDocCancel)
    }
  }, [isDragging, handlePointerMove, handlePointerUp, onDocCancel])

  const placeSelectedAtSlot = useCallback(
    (slotIndex: number) => {
      if (!selectedTile) return
      placeAtSlot(selectedTile.id, slotIndex)
    },
    [selectedTile, placeAtSlot],
  )

  const hideSelectedTile = useCallback(() => {
    if (!selectedTile || selectedTile.zone !== "visible" || !grid.includes(selectedTile.id)) return
    onGridChange(removeTileFromCustomizeGrid(grid, selectedTile.id))
    setSelectedTile(null)
  }, [selectedTile, grid, onGridChange])

  const tileShell = (id: DashboardQuickLinkId, zone: Zone) => {
    const isSource = draggingId === id
    const isSelected = selectedTile?.id === id && selectedTile.zone === zone
    return (
      <div
        key={`${zone}-${id}`}
        onPointerDown={(e) => beginPointerDrag(e, id, zone)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? (zone === "hidden" ? tileW : "100%") : tileW,
          height: tileH,
          flexShrink: 0,
          opacity: isSource ? 0.45 : 1,
          cursor: isSource ? "grabbing" : isMobile ? "pointer" : "grab",
          touchAction: isDragging ? "none" : "pan-y",
          outline: isSelected ? "2px solid rgba(14, 165, 233, 0.85)" : undefined,
          outlineOffset: 2,
          borderRadius: 8,
        }}
        className="tm-dash-customize-tile-wrap"
      >
        {renderTile(id)}
      </div>
    )
  }

  const zoneShell: React.CSSProperties = {
    borderRadius: isMobile ? 10 : 12,
    border: "1px dashed rgba(100, 116, 139, 0.35)",
    background: "rgba(255,255,255,0.35)",
    padding: isMobile ? 8 : 12,
    minHeight: isMobile ? undefined : tileH * displayRows + gap * Math.max(0, displayRows - 1) + 24,
  }

  const gridColumnsStyle = isMobile
    ? `repeat(${gridCols}, minmax(0, 1fr))`
    : `repeat(${gridCols}, ${tileW}px)`

  const hasVisible = grid.some((x) => x != null)
  const expansionRow = canExpand ? gridRows : -1
  const slotTapActive = isMobile && selectedTile != null

  const renderEmptySlot = (slotIndex: number) => {
    const row = Math.floor(slotIndex / gridCols)
    const isExpansion = row === expansionRow
    const active = (hoverSlot === slotIndex && isDragging) || (slotTapActive && hoverSlot === slotIndex)

    return (
      <button
        key={`slot-${slotIndex}`}
        type="button"
        onPointerEnter={() => {
          if (slotTapActive) setHoverSlot(slotIndex)
        }}
        onPointerLeave={() => {
          if (slotTapActive && hoverSlot === slotIndex) clearHover()
        }}
        onClick={() => placeSelectedAtSlot(slotIndex)}
        style={{
          width: isMobile ? "100%" : tileW,
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
          padding: 0,
          cursor: slotTapActive ? "pointer" : "default",
          touchAction: isDragging ? "none" : "pan-y",
        }}
        aria-label={slotTapActive ? "Place selected shortcut here" : undefined}
        disabled={!slotTapActive}
      />
    )
  }

  return (
    <div style={{ marginTop: isMobile ? 10 : 14, display: "flex", flexDirection: "column", gap: isMobile ? 8 : 12 }}>
      {isMobile ? (
        <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>
          {selectedTile
            ? "Tap an open slot above to place the selected shortcut. Tap the hidden area below to remove it from the dashboard."
            : "Tap a shortcut to select it, then tap where you want it on your dashboard."}
        </p>
      ) : null}
      <div ref={visibleZoneRef} style={zoneShell}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{visibleTitle}</div>
        {!hasVisible && !isDragging && !selectedTile ? (
          <button
            type="button"
            onClick={() => {
              if (selectedTile) placeSelectedAtSlot(0)
            }}
            style={{
              width: "100%",
              minHeight: tileH,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              border:
                hoverSlot === 0 && (isDragging || selectedTile)
                  ? "2px dashed rgba(14, 165, 233, 0.55)"
                  : "1px dashed rgba(148, 163, 184, 0.4)",
              color: "#64748b",
              fontSize: 12,
              fontWeight: 600,
              padding: 8,
              background: selectedTile ? "rgba(14, 165, 233, 0.06)" : "transparent",
              cursor: selectedTile ? "pointer" : "default",
            }}
            disabled={!selectedTile}
          >
            {selectedTile ? "Tap here to place the selected shortcut" : "Drag shortcuts here to show on your dashboard"}
          </button>
        ) : (
          <div
            ref={gridRef}
            style={{
              display: "grid",
              gridTemplateColumns: gridColumnsStyle,
              gridTemplateRows: `repeat(${displayRows}, ${tileH}px)`,
              gap,
              width: "100%",
              touchAction: isDragging ? "none" : "pan-y",
            }}
          >
            {Array.from({ length: slotCount }, (_, slotIndex) => {
              const id = slotIndex < grid.length ? grid[slotIndex] : null
              const active = hoverSlot === slotIndex && (isDragging || slotTapActive)
              if (id) {
                return (
                  <div
                    key={`slot-${slotIndex}`}
                    style={{
                      outline: active ? "2px dashed rgba(14, 165, 233, 0.65)" : undefined,
                      outlineOffset: 2,
                      borderRadius: 8,
                    }}
                    onClick={() => {
                      if (slotTapActive && selectedTile && selectedTile.id !== id) {
                        placeSelectedAtSlot(slotIndex)
                      }
                    }}
                  >
                    {tileShell(id, "visible")}
                  </div>
                )
              }
              return renderEmptySlot(slotIndex)
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
        role={isMobile && selectedTile?.zone === "visible" ? "button" : undefined}
        tabIndex={isMobile && selectedTile?.zone === "visible" ? 0 : undefined}
        onClick={(e) => {
          if (!isMobile || selectedTile?.zone !== "visible") return
          if ((e.target as HTMLElement).closest(".tm-dash-customize-tile-wrap")) return
          hideSelectedTile()
        }}
        onKeyDown={(e) => {
          if (isMobile && selectedTile?.zone === "visible" && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault()
            hideSelectedTile()
          }
        }}
        style={{
          ...zoneShell,
          minHeight: tileH + 24,
          outline:
            hoverSlot === "hidden" && isDragging
              ? "2px dashed rgba(14, 165, 233, 0.45)"
              : isMobile && selectedTile?.zone === "visible"
                ? "2px dashed rgba(14, 165, 233, 0.35)"
                : undefined,
          cursor: isMobile && selectedTile?.zone === "visible" ? "pointer" : undefined,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{hiddenTitle}</div>
        {hiddenIds.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            {isMobile && selectedTile?.zone === "visible"
              ? "Tap here to hide the selected shortcut from your dashboard."
              : "All available shortcuts are on your dashboard."}
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: isMobile ? "nowrap" : "wrap",
              gap,
              overflowX: isMobile ? "auto" : undefined,
              WebkitOverflowScrolling: isMobile ? "touch" : undefined,
              paddingBottom: isMobile ? 4 : undefined,
              touchAction: isDragging ? "none" : "pan-x pan-y",
            }}
          >
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
