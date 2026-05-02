import type { ReactNode } from "react"

export type LeadFitUi = "hot" | "maybe" | "bad" | null

export function leadFitBadgeEl(fit: LeadFitUi): ReactNode {
  if (!fit) return <span style={{ color: "#6b7280", fontSize: 12 }}>—</span>
  const colors: Record<string, { bg: string; fg: string; b: string }> = {
    hot: { bg: "#fef2f2", fg: "#b91c1c", b: "#fecaca" },
    maybe: { bg: "#fffbeb", fg: "#b45309", b: "#fde68a" },
    bad: { bg: "#f3f4f6", fg: "#374151", b: "#d1d5db" },
  }
  const c = colors[fit] ?? colors.bad
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.b}`,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {fit}
    </span>
  )
}
