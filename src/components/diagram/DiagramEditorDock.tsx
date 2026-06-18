import type { CSSProperties, ReactNode } from "react"
import { theme } from "../../styles/theme"

type Props = {
  title: string
  subtitle?: string
  children: ReactNode
}

/** Stationary properties panel below diagram canvas. */
export function DiagramEditorDock({ title, subtitle, children }: Props) {
  return (
    <div style={dockWrap}>
      <div style={dockHeader}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: theme.text }}>{title}</h2>
        {subtitle ? <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{subtitle}</p> : null}
      </div>
      <div style={dockBody}>{children}</div>
    </div>
  )
}

const dockWrap: CSSProperties = {
  marginTop: 12,
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  overflow: "hidden",
}

const dockHeader: CSSProperties = {
  padding: "12px 14px",
  borderBottom: `1px solid ${theme.border}`,
  background: "#f8fafc",
}

const dockBody: CSSProperties = {
  padding: "14px 14px",
  display: "grid",
  gap: 12,
}
