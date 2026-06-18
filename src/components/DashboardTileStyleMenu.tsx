import { useEffect, useRef, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import {
  DASHBOARD_TILE_ACCENT_SWATCHES,
  DASHBOARD_TILE_BLOCK_SWATCHES,
  DASHBOARD_TILE_FONT_OPTIONS,
  DASHBOARD_TILE_THUMBNAILS,
  type DashboardQuickLinkId,
  type DashboardTileStyle,
} from "../lib/dashboardQuickLinksPrefs"

type Props = {
  open: boolean
  x: number
  y: number
  linkId: DashboardQuickLinkId
  label: string
  style: DashboardTileStyle
  onChange: (patch: Partial<DashboardTileStyle>) => void
  onClose: () => void
}

const panelStyle: CSSProperties = {
  position: "fixed",
  zIndex: 12000,
  minWidth: 260,
  maxWidth: 300,
  padding: 14,
  borderRadius: 12,
  background: "#fff",
  border: `1px solid ${theme.border}`,
  boxShadow: "0 16px 48px rgba(15,23,42,0.18)",
  fontSize: 13,
  color: theme.text,
}

function SwatchRow({
  colors,
  value,
  onPick,
}: {
  colors: string[]
  value?: string
  onPick: (c: string) => void
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onPick(c)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            border: value === c ? "2px solid #0ea5e9" : "1px solid rgba(15,23,42,0.15)",
            background: c,
            cursor: "pointer",
            padding: 0,
          }}
        />
      ))}
    </div>
  )
}

export default function DashboardTileStyleMenu({ open, x, y, linkId, label, style, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const clampedX = Math.min(x, typeof window !== "undefined" ? window.innerWidth - 320 : x)
  const clampedY = Math.min(y, typeof window !== "undefined" ? window.innerHeight - 420 : y)

  return (
    <div ref={ref} style={{ ...panelStyle, left: clampedX, top: clampedY }} role="dialog" aria-label={`Style ${label}`}>
      <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 14 }}>Tile style</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>{label}</div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Block background</div>
        <SwatchRow colors={DASHBOARD_TILE_BLOCK_SWATCHES} value={style.blockBg} onPick={(c) => onChange({ blockBg: c })} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Circle / accent</div>
        <SwatchRow colors={DASHBOARD_TILE_ACCENT_SWATCHES} value={style.accent} onPick={(c) => onChange({ accent: c })} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Text color</div>
        <SwatchRow
          colors={["#0f172a", "#1e293b", "#ffffff", "#f8fafc", "#0369a1", "#b45309"]}
          value={style.labelColor}
          onPick={(c) => onChange({ labelColor: c })}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Font</div>
        <select
          value={style.fontFamily ?? "system"}
          onChange={(e) => onChange({ fontFamily: e.target.value as DashboardTileStyle["fontFamily"] })}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 13 }}
        >
          {DASHBOARD_TILE_FONT_OPTIONS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Thumbnail (replaces circle)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
          {DASHBOARD_TILE_THUMBNAILS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              onClick={() => onChange({ thumbnail: t.id })}
              style={{
                padding: "6px 2px",
                borderRadius: 8,
                border: (style.thumbnail ?? "none") === t.id ? "2px solid #0ea5e9" : `1px solid ${theme.border}`,
                background: "#f8fafc",
                cursor: "pointer",
                fontSize: t.glyph ? 16 : 10,
                lineHeight: 1.1,
              }}
            >
              {t.glyph || "○"}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onChange({
            blockBg: undefined,
            blockBorder: undefined,
            accent: undefined,
            labelColor: undefined,
            fontFamily: undefined,
            thumbnail: undefined,
          })
        }
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: "#f1f5f9",
          fontWeight: 600,
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        Reset tile to default
      </button>
      <input type="hidden" value={linkId} readOnly aria-hidden />
    </div>
  )
}
