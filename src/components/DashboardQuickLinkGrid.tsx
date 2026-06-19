import { type DragEvent, type ReactNode } from "react"
import { moveTileInOrder, type DashboardQuickLinkId } from "../lib/dashboardQuickLinksPrefs"

type Props = {
  order: DashboardQuickLinkId[]
  customize: boolean
  isMobile: boolean
  dragId: DashboardQuickLinkId | null
  onDragStart: (id: DashboardQuickLinkId) => void
  onDragEnd: () => void
  onOrderChange: (order: DashboardQuickLinkId[]) => void
  renderTile: (id: DashboardQuickLinkId) => ReactNode
  filterVisible: (id: DashboardQuickLinkId) => boolean
}

export default function DashboardQuickLinkGrid({
  order,
  customize,
  isMobile,
  dragId,
  onDragStart,
  onDragEnd,
  onOrderChange,
  renderTile,
  filterVisible,
}: Props) {
  const ids = customize ? order : order.filter(filterVisible)
  const gap = isMobile ? 8 : 10
  const minCol = isMobile ? 136 : 152

  const applyDrop = (beforeId: DashboardQuickLinkId | null) => {
    if (!dragId) return
    onOrderChange(moveTileInOrder(order, dragId, beforeId))
    onDragEnd()
  }

  const dragHandlers = (id: DashboardQuickLinkId) =>
    customize
      ? {
          draggable: true as const,
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData("text/plain", id)
            e.dataTransfer.effectAllowed = "move"
            onDragStart(id)
          },
          onDragEnd: () => onDragEnd(),
          onDragOver: (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = "move"
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            applyDrop(id)
          },
        }
      : {}

  return (
    <div
      style={{
        marginTop: 14,
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${minCol}px, 1fr))`,
        gap,
      }}
      onDragOver={
        customize
          ? (e: DragEvent) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
            }
          : undefined
      }
      onDrop={
        customize
          ? (e: DragEvent) => {
              if ((e.target as HTMLElement).closest("[data-dash-tile-slot]")) return
              e.preventDefault()
              applyDrop(null)
            }
          : undefined
      }
    >
      {ids.map((id) => {
        const isDragSource = dragId === id
        const isDropTarget = Boolean(dragId && dragId !== id)
        return (
          <div
            key={id}
            data-dash-tile-slot
            {...dragHandlers(id)}
            style={{
              opacity: isDragSource ? 0.45 : 1,
              cursor: customize ? (isDragSource ? "grabbing" : "grab") : undefined,
              borderRadius: 12,
              outline: isDropTarget && dragId ? "2px dashed rgba(14, 165, 233, 0.55)" : undefined,
              outlineOffset: isDropTarget ? 2 : undefined,
              transition: "opacity 0.15s ease, outline 0.12s ease",
            }}
          >
            {renderTile(id)}
          </div>
        )
      })}
      {customize && dragId ? (
        <div
          role="presentation"
          onDragOver={(e: DragEvent) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
          }}
          onDrop={(e: DragEvent) => {
            e.preventDefault()
            applyDrop(null)
          }}
          style={{
            minHeight: isMobile ? 72 : 88,
            borderRadius: 12,
            border: "2px dashed rgba(14, 165, 233, 0.45)",
            background: "rgba(14, 165, 233, 0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#0369a1",
          }}
        >
          Drop here
        </div>
      ) : null}
    </div>
  )
}
