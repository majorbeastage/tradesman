import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

type Props = {
  mine: boolean
  children: ReactNode
  onEdit: () => void
  onDelete: () => void
}

/**
 * Desktop: right-click context menu. Mobile: long-press.
 * Only meaningful for the sender's own messages (caller gates `mine`).
 */
export default function MessageActionTarget({ mine, children, onEdit, onDelete }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      close()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("touchstart", onDoc)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("touchstart", onDoc)
    }
  }, [menu, close])

  if (!mine) return <>{children}</>

  function openAt(clientX: number, clientY: number) {
    setMenu({ x: clientX, y: clientY })
  }

  return (
    <div
      ref={rootRef}
      style={{ position: "relative" }}
      onContextMenu={(e) => {
        e.preventDefault()
        openAt(e.clientX, e.clientY)
      }}
      onTouchStart={(e) => {
        const t = e.touches[0]
        if (!t) return
        longPressTimer.current = setTimeout(() => openAt(t.clientX, t.clientY), 480)
      }}
      onTouchEnd={() => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }}
      onTouchMove={() => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }}
    >
      {children}
      {menu ? (
        <div
          style={{
            position: "fixed",
            left: Math.min(menu.x, window.innerWidth - 140),
            top: Math.min(menu.y, window.innerHeight - 100),
            zIndex: 9999,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
            minWidth: 128,
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => {
              close()
              onEdit()
            }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              close()
              onDelete()
            }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", borderTop: "1px solid #e2e8f0", background: "#fff", color: "#b91c1c", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}
