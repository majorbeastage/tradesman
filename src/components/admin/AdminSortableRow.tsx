import type { CSSProperties, ReactNode } from "react"
import { theme } from "../../styles/theme"

const DRAG_PREFIX = "tm-admin-sort:"

export function encodeAdminSortPayload(scope: string, index: number): string {
  return `${DRAG_PREFIX}${scope}:${index}`
}

export function parseAdminSortPayload(data: string): { scope: string; index: number } | null {
  if (!data.startsWith(DRAG_PREFIX)) return null
  const rest = data.slice(DRAG_PREFIX.length)
  const colon = rest.lastIndexOf(":")
  if (colon <= 0) return null
  const scope = rest.slice(0, colon)
  const index = parseInt(rest.slice(colon + 1), 10)
  if (!scope || Number.isNaN(index)) return null
  return { scope, index }
}

type Props = {
  /** Unique among simultaneous lists (e.g. portal-tabs, account-sections). */
  scope: string
  index: number
  onReorder: (fromIndex: number, toIndex: number) => void
  children: ReactNode
  rowStyle?: CSSProperties
  /** When false, omit handle and drag (read-only list). */
  reorderable?: boolean
}

/**
 * HTML5 drag-and-drop row with ⋮⋮ handle (same pattern as About Us blocks).
 * Drop only accepts drags started with the same `scope`.
 */
export function AdminSortableRow({ scope, index, onReorder, children, rowStyle, reorderable = true }: Props) {
  if (!reorderable) {
    return <div style={rowStyle}>{children}</div>
  }
  return (
    <div
      style={rowStyle}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
      }}
      onDrop={(e) => {
        e.preventDefault()
        const parsed = parseAdminSortPayload(e.dataTransfer.getData("text/plain"))
        if (!parsed || parsed.scope !== scope) return
        onReorder(parsed.index, index)
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <button
          type="button"
          draggable
          onDragStart={(ev) => {
            ev.dataTransfer.setData("text/plain", encodeAdminSortPayload(scope, index))
            ev.dataTransfer.effectAllowed = "move"
          }}
          onDragEnd={(ev) => {
            ev.preventDefault()
          }}
          title="Drag to reorder"
          aria-label="Drag to reorder"
          style={{
            cursor: "grab",
            padding: "8px 6px",
            border: `1px dashed ${theme.border}`,
            borderRadius: 6,
            background: "#f9fafb",
            color: theme.text,
            fontSize: 14,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ⋮⋮
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    </div>
  )
}
