import { useEffect, type CSSProperties, type ReactNode } from "react"

export type ContextMenuItem = {
  id: string
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}

type Props = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  theme?: { panelBackground: string; panelBorder: string; text: string; textMuted: string }
}

export default function EmailClientContextMenu({ x, y, items, onClose, theme }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const menuStyle: CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 10050,
    minWidth: 200,
    padding: 6,
    borderRadius: 10,
    border: `1px solid ${theme?.panelBorder ?? "#cbd5e1"}`,
    background: theme?.panelBackground ?? "#fff",
    boxShadow: "0 12px 40px rgba(15,23,42,0.18)",
  }

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
        style={{ position: "fixed", inset: 0, zIndex: 10040 }}
      />
      <div role="menu" style={menuStyle}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onClick()
              onClose()
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              border: "none",
              borderRadius: 8,
              background: "transparent",
              color: item.danger ? "#b91c1c" : theme?.text ?? "#111827",
              fontWeight: 600,
              fontSize: 13,
              cursor: item.disabled ? "not-allowed" : "pointer",
              opacity: item.disabled ? 0.5 : 1,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

export function ContextMenuHint({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
      {children}
    </span>
  )
}
