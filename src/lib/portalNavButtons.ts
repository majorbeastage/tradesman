import type { CSSProperties } from "react"
import { theme } from "../styles/theme"

/** Readable secondary nav button (e.g. back to Dashboard from operations sub-pages). */
export const portalDashboardBackBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
  color: theme.text,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
}
