import { useEffect, type CSSProperties } from "react"
import { theme } from "../../styles/theme"

export type DiagramMenuAction = {
  id: string
  label: string
  disabled?: boolean
  danger?: boolean
}

type Props = {
  x: number
  y: number
  actions: DiagramMenuAction[]
  onSelect: (actionId: string) => void
  onClose: () => void
}

export function DiagramContextMenu({ x, y, actions, onSelect, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div
        role="presentation"
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        role="menu"
        style={{
          ...menuPanel,
          left: Math.min(x, window.innerWidth - 220),
          top: Math.min(y, window.innerHeight - actions.length * 36 - 16),
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            disabled={a.disabled}
            onClick={() => {
              if (!a.disabled) onSelect(a.id)
              onClose()
            }}
            style={{
              ...menuItem,
              color: a.danger ? "#b91c1c" : theme.text,
              opacity: a.disabled ? 0.45 : 1,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </>
  )
}

const menuPanel: CSSProperties = {
  position: "fixed",
  zIndex: 9999,
  minWidth: 168,
  padding: "6px 0",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  boxShadow: "0 8px 28px rgba(15,23,42,0.14)",
}

const menuItem: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "transparent",
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}
