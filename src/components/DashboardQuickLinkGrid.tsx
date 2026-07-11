import { useMemo, type ReactNode } from "react"
import {
  dashboardCustomizeMinRows,
  type DashboardQuickLinkId,
  type DashboardTileGridSlot,
} from "../lib/dashboardQuickLinksPrefs"
import {
  DASHBOARD_TILE_HEIGHT_DESKTOP,
  DASHBOARD_TILE_HEIGHT_MOBILE,
  DASHBOARD_TILE_WIDTH_DESKTOP,
  DASHBOARD_TILE_WIDTH_MOBILE,
} from "./DashboardQuickLinkCustomizeZones"

type Props = {
  grid: DashboardTileGridSlot[]
  gridCols: number
  isMobile: boolean
  renderTile: (id: DashboardQuickLinkId) => ReactNode
  filterVisible: (id: DashboardQuickLinkId) => boolean
}

export default function DashboardQuickLinkGrid({ grid, gridCols, isMobile, renderTile, filterVisible }: Props) {
  const gap = isMobile ? 8 : 10
  const tileW = isMobile ? DASHBOARD_TILE_WIDTH_MOBILE : DASHBOARD_TILE_WIDTH_DESKTOP
  const tileH = isMobile ? DASHBOARD_TILE_HEIGHT_MOBILE : DASHBOARD_TILE_HEIGHT_DESKTOP
  const minRows = dashboardCustomizeMinRows(isMobile)

  const displayRows = useMemo(() => {
    let lastRow = 0
    for (let i = 0; i < grid.length; i++) {
      const id = grid[i]
      if (id && filterVisible(id)) lastRow = Math.floor(i / gridCols) + 1
    }
    return Math.max(minRows, lastRow)
  }, [grid, gridCols, minRows, filterVisible])

  const slotCount = displayRows * gridCols

  const gridColumnsStyle = isMobile
    ? `repeat(${gridCols}, minmax(0, 1fr))`
    : `repeat(${gridCols}, ${tileW}px)`

  return (
    <div
      style={{
        marginTop: 14,
        display: "grid",
        gridTemplateColumns: gridColumnsStyle,
        gridTemplateRows: `repeat(${displayRows}, ${tileH}px)`,
        gap,
        width: "100%",
      }}
    >
      {Array.from({ length: slotCount }, (_, slotIndex) => {
        const id = slotIndex < grid.length ? grid[slotIndex] : null
        if (!id || !filterVisible(id)) {
          return (
            <div
              key={`empty-${slotIndex}`}
              style={{ width: isMobile ? "100%" : tileW, height: tileH }}
              aria-hidden
            />
          )
        }
        return (
          <div
            key={`${id}-${slotIndex}`}
            style={{ width: isMobile ? "100%" : tileW, height: tileH, display: "flex" }}
            className="tm-dash-grid-tile-wrap"
          >
            {renderTile(id)}
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
