/** Stable 1-based index for a team member in the office-manager roster (same order → same color on map). */
export function teamMemberDisplayIndex(userId: string, orderedMemberIds: string[]): number {
  const idx = orderedMemberIds.indexOf(userId)
  return idx < 0 ? 0 : idx + 1
}

/** Distinct fill/stroke for Leaflet markers from roster index (1-based). */
export function teamMarkerColors(displayIndex: number): { fill: string; stroke: string } {
  if (displayIndex <= 0) return { fill: "#94a3b8", stroke: "#475569" }
  const golden = 137.508
  const hue = ((displayIndex * golden) % 360 + 360) % 360
  const fill = `hsl(${Math.round(hue)} 72% 46%)`
  const stroke = `hsl(${Math.round(hue)} 85% 28%)`
  return { fill, stroke }
}
