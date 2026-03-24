import type { CSSProperties, ReactNode } from "react"
import { theme } from "../../styles/theme"
import { useAdminVisibility } from "../../contexts/AdminVisibilityContext"

const hideLabelStyleLight: CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  display: "flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
}

const hideLabelStyleDark: CSSProperties = {
  ...hideLabelStyleLight,
  color: "rgba(255,255,255,0.7)",
}

/**
 * Wraps one admin UI block. Persists "Hide from Admin" in localStorage (per browser).
 * When hidden and "Show hidden settings" is off, children are not rendered.
 */
export function AdminSettingBlock({
  id,
  children,
  variant = "light",
}: {
  id: string
  children: ReactNode
  /** Use "dark" inside the charcoal admin sidebar so the label stays readable. */
  variant?: "light" | "dark"
}) {
  const { showHiddenSettings, isHidden, setHidden } = useAdminVisibility()
  const hidden = isHidden(id)
  if (hidden && !showHiddenSettings) return null
  const hideLabelStyle = variant === "dark" ? hideLabelStyleDark : hideLabelStyleLight
  const hiddenSurface =
    variant === "dark"
      ? { background: hidden && showHiddenSettings ? "rgba(255,255,255,0.06)" : undefined }
      : { background: hidden && showHiddenSettings ? "rgba(249,115,22,0.06)" : undefined }

  return (
    <div
      style={{
        position: "relative",
        marginBottom: 10,
        padding: hidden && showHiddenSettings ? 8 : 0,
        borderRadius: 8,
        outline: hidden && showHiddenSettings ? `1px dashed ${theme.primary}` : undefined,
        ...hiddenSurface,
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <label style={hideLabelStyle}>
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(id, e.target.checked)} />
          Hide from Admin
        </label>
      </div>
      {children}
    </div>
  )
}

export function AdminVisibilityFooter() {
  const { showHiddenSettings, setShowHiddenSettings } = useAdminVisibility()
  return (
    <div
      style={{
        marginTop: "auto",
        paddingTop: 20,
        paddingBottom: 8,
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: theme.text,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={showHiddenSettings}
          onChange={(e) => setShowHiddenSettings(e.target.checked)}
        />
        Show hidden settings
      </label>
      <p style={{ fontSize: 11, color: "#6b7280", margin: "6px 0 0", maxWidth: 520, lineHeight: 1.4 }}>
        Blocks you marked “Hide from Admin” stay out of the way until you enable this. New admin areas should wrap rows in{" "}
        <code style={{ fontSize: 10 }}>AdminSettingBlock</code> with a stable <code style={{ fontSize: 10 }}>id</code>.
      </p>
    </div>
  )
}
