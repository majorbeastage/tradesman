import type { CSSProperties, ReactNode } from "react"
import { theme } from "../../styles/theme"

type Props = {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  busy?: boolean
}

export function EditorModalShell({ title, subtitle, onClose, children, footer, busy }: Props) {
  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13000,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(88vh, 720px)",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          opacity: busy ? 0.92 : 1,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: theme.text }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.4 }}>{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "#f1f5f9",
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: "pointer",
              fontSize: 16,
              color: "#64748b",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "grid", gap: 12 }}>{children}</div>
        {footer ? (
          <div
            style={{
              padding: "12px 16px",
              borderTop: `1px solid ${theme.border}`,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const editorFieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: theme.text,
}

export const editorReadOnlyBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "#f8fafc",
  border: `1px solid ${theme.border}`,
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.45,
}
