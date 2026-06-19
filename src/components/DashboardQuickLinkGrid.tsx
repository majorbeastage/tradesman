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

const TILE_HEIGHT = 80
const TILE_HEIGHT_MOBILE = 76
const MIN_COL_WIDTH = 136

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
  const gap = isMobile ? 8 : 10
  const tileHeight = isMobile ? TILE_HEIGHT_MOBILE : TILE_HEIGHT

  const dropOnSlot = (slotIndex: number) => {
    if (!dragId) return
    if (dragFromSlot !== null) {
      onGridChange(swapGridSlots(grid, dragFromSlot, slotIndex))
    } else {
      onGridChange(placeTileInGridSlot(grid, dragId, slotIndex))
    }
    onDragEnd()
  }

  const slotHandlers = (slotIndex: number) =>
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
        }
      : {}

  if (!customize) {
    const filled = grid
      .map((id, slotIndex) => ({ id, slotIndex }))
      .filter((s): s is { id: DashboardQuickLinkId; slotIndex: number } => s.id != null && filterVisible(s.id))

    return (
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? MIN_COL_WIDTH - 8 : MIN_COL_WIDTH}px, 1fr))`,
          gap,
          width: "100%",
        }}
      >
        {filled.map(({ id, slotIndex }) => (
          <div
            key={`${id}-${slotIndex}`}
            style={{ height: tileHeight, minWidth: 0, display: "flex" }}
            className="tm-dash-grid-tile-wrap"
          >
            {renderTile(id)}
          </div>
        ))}
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
        const showTile = id != null
        const isDragSource = dragFromSlot === slotIndex
        const isDropTarget = Boolean(dragId && dragFromSlot !== slotIndex)

        return (
          <div
            key={slotIndex}
            data-dash-grid-slot={slotIndex}
            {...slotHandlers(slotIndex)}
            style={{
              height: tileHeight,
              width: "100%",
              position: "relative",
              borderRadius: 10,
              background: !showTile ? "rgba(148, 163, 184, 0.05)" : undefined,
              outline: isDropTarget && dragId ? "2px dashed rgba(14, 165, 233, 0.45)" : undefined,
              outlineOffset: isDropTarget ? 1 : undefined,
              opacity: isDragSource ? 0.5 : 1,
              transition: "opacity 0.15s ease, outline 0.12s ease",
            }}
          >
            {showTile ? (
              <div
                draggable
                onDragStart={(e: DragEvent) => {
                  if (!id) return
                  e.dataTransfer.setData("text/plain", id)
                  e.dataTransfer.effectAllowed = "move"
                  onDragStart(id, slotIndex)
                }}
                onDragEnd={() => onDragEnd()}
                style={{
                  height: "100%",
                  display: "flex",
                  cursor: isDragSource ? "grabbing" : "grab",
                }}
                className="tm-dash-grid-tile-wrap"
              >
                {renderTile(id)}
              </div>
            ) : (
              <div
                style={{
                  height: "100%",
                  borderRadius: 10,
                  border: "1px dashed rgba(148, 163, 184, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#94a3b8",
                  padding: 4,
                  textAlign: "center",
                }}
              >
                Drop
              </div>
            )}
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
