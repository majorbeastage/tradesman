import { type DragEvent, type ReactNode } from "react"
import {
  DASHBOARD_GRID_COLS,
  DASHBOARD_GRID_SLOT_COUNT,
  placeTileInGridSlot,
  swapGridSlots,
  type DashboardQuickLinkId,
  type DashboardTileGridSlot,
} from "../lib/dashboardQuickLinksPrefs"

type Props = {
  grid: DashboardTileGridSlot[]
  customize: boolean
  isMobile: boolean
  dragId: DashboardQuickLinkId | null
  dragFromSlot: number | null
  onDragStart: (id: DashboardQuickLinkId, fromSlot: number | null) => void
  onDragEnd: () => void
  onGridChange: (grid: DashboardTileGridSlot[]) => void
  renderTile: (id: DashboardQuickLinkId) => ReactNode
  filterVisible: (id: DashboardQuickLinkId) => boolean
}

const CELL_MIN = 72

export default function DashboardQuickLinkGrid({
  grid,
  customize,
  isMobile,
  dragId,
  dragFromSlot,
  onDragStart,
  onDragEnd,
  onGridChange,
  renderTile,
  filterVisible,
}: Props) {
  const gap = isMobile ? 6 : 8

  const dropOnSlot = (slotIndex: number) => {
    if (!dragId) return
    if (dragFromSlot !== null) {
      onGridChange(swapGridSlots(grid, dragFromSlot, slotIndex))
    } else {
      onGridChange(placeTileInGridSlot(grid, dragId, slotIndex))
    }
    onDragEnd()
  }

  const slotHandlers = (slotIndex: number, hasTile: boolean) =>
    customize
      ? {
          onDragOver: (e: DragEvent) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            dropOnSlot(slotIndex)
          },
          ...(hasTile
            ? {}
            : {
                onDragOver: (e: DragEvent) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                },
              }),
        }
      : {}

  return (
    <div
      style={{
        marginTop: 14,
        display: "grid",
        gridTemplateColumns: `repeat(${DASHBOARD_GRID_COLS}, minmax(0, 1fr))`,
        gap,
        width: "100%",
      }}
    >
      {Array.from({ length: DASHBOARD_GRID_SLOT_COUNT }, (_, slotIndex) => {
        const id = grid[slotIndex] ?? null
        const showTile = id != null && (customize || filterVisible(id))
        const isDragSource = dragFromSlot === slotIndex
        const isDropTarget = Boolean(dragId && dragFromSlot !== slotIndex)

        const emptySlot = !showTile

        return (
          <div
            key={slotIndex}
            data-dash-grid-slot={slotIndex}
            {...slotHandlers(slotIndex, Boolean(showTile))}
            style={{
              aspectRatio: "1",
              minHeight: isMobile ? CELL_MIN - 8 : CELL_MIN,
              width: "100%",
              position: "relative",
              borderRadius: 12,
              outline: customize && isDropTarget && dragId ? "2px dashed rgba(14, 165, 233, 0.55)" : undefined,
              outlineOffset: customize && isDropTarget ? 2 : undefined,
              opacity: isDragSource ? 0.45 : 1,
              transition: "opacity 0.15s ease, outline 0.12s ease",
              visibility: emptySlot && !customize ? "hidden" : undefined,
            }}
          >
            {showTile ? (
              <div
                draggable={customize}
                onDragStart={(e: DragEvent) => {
                  if (!id) return
                  e.dataTransfer.setData("text/plain", id)
                  e.dataTransfer.effectAllowed = "move"
                  onDragStart(id, slotIndex)
                }}
                onDragEnd={() => onDragEnd()}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  cursor: customize ? (isDragSource ? "grabbing" : "grab") : undefined,
                }}
              >
                <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex" }}>
                  <div style={{ flex: 1, minHeight: 0, display: "flex", width: "100%" }} className="tm-dash-grid-tile-wrap">
                    {renderTile(id)}
                  </div>
                </div>
              </div>
            ) : customize ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 12,
                  border: "2px dashed rgba(148, 163, 184, 0.55)",
                  background: "rgba(148, 163, 184, 0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#64748b",
                  textAlign: "center",
                  padding: 4,
                }}
              >
                Drop here
              </div>
            ) : null}
          </div>
        )
      })}
      <style>{`
        .tm-dash-grid-tile-wrap .tm-dash-tile {
          width: 100%;
          height: 100%;
          min-height: 0 !important;
          flex: 1;
        }
      `}</style>
    </div>
  )
}
