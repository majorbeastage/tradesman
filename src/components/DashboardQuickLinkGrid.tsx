import { Fragment, type DragEvent, type ReactNode } from "react"
import {
  moveTileInRows,
  type DashboardQuickLinkId,
  type TileDropTarget,
} from "../lib/dashboardQuickLinksPrefs"

type Props = {
  rows: DashboardQuickLinkId[][]
  customize: boolean
  isMobile: boolean
  dragId: DashboardQuickLinkId | null
  onDragStart: (id: DashboardQuickLinkId) => void
  onDragEnd: () => void
  onRowsChange: (rows: DashboardQuickLinkId[][]) => void
  renderTile: (id: DashboardQuickLinkId) => ReactNode
  filterVisible: (id: DashboardQuickLinkId) => boolean
}

function DropZone({
  target,
  active,
  horizontal,
  onDrop,
  label,
}: {
  target: TileDropTarget
  active: boolean
  horizontal?: boolean
  onDrop: (target: TileDropTarget) => void
  label?: string
}) {
  const hot = active
  return (
    <div
      role="presentation"
      onDragOver={(e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = "move"
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop(target)
      }}
      style={
        horizontal
          ? {
              alignSelf: "stretch",
              width: hot ? 24 : 8,
              minWidth: hot ? 24 : 8,
              margin: "0 1px",
              borderRadius: 8,
              flexShrink: 0,
              background: hot ? "rgba(14, 165, 233, 0.14)" : "transparent",
              border: hot ? "2px dashed rgba(14, 165, 233, 0.75)" : "1px dashed transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 800,
              color: "#0369a1",
              transition: "width 0.12s ease",
            }
          : {
              width: "100%",
              height: hot ? 26 : 8,
              minHeight: hot ? 26 : 8,
              margin: "2px 0",
              borderRadius: 8,
              background: hot ? "rgba(14, 165, 233, 0.12)" : "transparent",
              border: hot ? "2px dashed rgba(14, 165, 233, 0.65)" : "1px dashed transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: "#0369a1",
              transition: "height 0.12s ease",
            }
      }
    >
      {hot && label ? label : null}
    </div>
  )
}

export default function DashboardQuickLinkGrid({
  rows,
  customize,
  isMobile,
  dragId,
  onDragStart,
  onDragEnd,
  onRowsChange,
  renderTile,
  filterVisible,
}: Props) {
  const gap = isMobile ? 8 : 10
  const minTile = isMobile ? 110 : 128
  const dragging = Boolean(dragId)

  const applyDrop = (target: TileDropTarget) => {
    if (!dragId) return
    onRowsChange(moveTileInRows(rows, dragId, target))
    onDragEnd()
  }

  const renderRow = (rowIdx: number, ids: DashboardQuickLinkId[]) => {
    if (!ids.length) return null
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          gap: customize ? 0 : gap,
          width: "100%",
        }}
      >
        {customize ? (
          <DropZone target={{ kind: "before", row: rowIdx, col: 0 }} active={dragging} horizontal onDrop={applyDrop} />
        ) : null}
        {ids.map((id, col) => (
          <Fragment key={id}>
            <div
              draggable={customize}
              onDragStart={
                customize
                  ? (e: DragEvent) => {
                      e.dataTransfer.setData("text/plain", id)
                      e.dataTransfer.effectAllowed = "move"
                      onDragStart(id)
                    }
                  : undefined
              }
              onDragEnd={customize ? onDragEnd : undefined}
              style={{
                flex: "1 1 0",
                minWidth: minTile,
                maxWidth: "100%",
                opacity: dragId === id ? 0.45 : 1,
                cursor: customize ? "grab" : undefined,
              }}
            >
              {renderTile(id)}
            </div>
            {customize ? (
              <DropZone
                target={{ kind: "before", row: rowIdx, col: col + 1 }}
                active={dragging}
                horizontal
                onDrop={applyDrop}
              />
            ) : null}
          </Fragment>
        ))}
        {customize ? (
          <DropZone target={{ kind: "append", row: rowIdx }} active={dragging} horizontal onDrop={applyDrop} label="+" />
        ) : null}
      </div>
    )
  }

  const visibleRows = rows
    .map((row, rowIdx) => ({
      rowIdx,
      row,
      ids: customize ? row : row.filter(filterVisible),
    }))
    .filter(({ ids }) => ids.length > 0)

  if (!customize) {
    return (
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap }}>
        {visibleRows.map(({ rowIdx, ids }) => (
          <div key={`r-${rowIdx}-${ids.join("-")}`}>{renderRow(rowIdx, ids)}</div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column" }} onDragOver={(e) => e.preventDefault()}>
      <DropZone target={{ kind: "newRow", afterRow: -1 }} active={dragging} onDrop={applyDrop} label="New row above" />
      {visibleRows.length === 0 ? (
        <DropZone target={{ kind: "newRow", afterRow: -1 }} active={dragging} onDrop={applyDrop} label="Drop tile here" />
      ) : (
        visibleRows.map(({ rowIdx, ids }, visIdx) => (
          <div key={`cr-${rowIdx}-${ids.join("-")}`}>
            {renderRow(rowIdx, ids)}
            <DropZone
              target={{ kind: "newRow", afterRow: rowIdx }}
              active={dragging}
              onDrop={applyDrop}
              label={visIdx === visibleRows.length - 1 ? "New row below" : undefined}
            />
          </div>
        ))
      )}
    </div>
  )
}
