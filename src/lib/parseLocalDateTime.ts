/** Parse YYYY-MM-DD + time (HH:MM or HH:MM:SS) as **local** wall time (avoids ISO parsing quirks). */
export function parseLocalDateTime(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split("-").map((x) => parseInt(x, 10))
  const parts = timeStr.trim().split(":")
  const h = parseInt(parts[0] ?? "0", 10) || 0
  const m = parseInt(parts[1] ?? "0", 10) || 0
  const s = parseInt(parts[2] ?? "0", 10) || 0
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return new Date(NaN)
  }
  return new Date(y, mo - 1, d, h, m, s, 0)
}
