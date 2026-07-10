import type { CSSProperties } from "react"
import { theme } from "../../styles/theme"

/** Secondary admin action — explicit dark text on white (avoids inheriting :root light text). */
export const adminSecondaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
}

export const adminSecondaryButtonCompactStyle: CSSProperties = {
  ...adminSecondaryButtonStyle,
  fontSize: 12,
  padding: "6px 10px",
}

export const adminPrimaryButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: "pointer",
}
