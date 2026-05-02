/** Best-effort last token for filenames / PDF search (display names vary). */
export function lastNameTokenFromDisplayName(displayName: string | null | undefined): string {
  const raw = (displayName ?? "").trim()
  if (!raw) return ""
  const parts = raw.split(/\s+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ""
}

export function slugForFilenameSegment(name: string, maxLen = 40): string {
  const s = name
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, maxLen)
  return s || "customer"
}
