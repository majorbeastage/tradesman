import type { PortalSettingItem } from "../types/portal-builder"

/** One-off event vs repeating series (materialized as multiple DB rows). */
export type RecurrenceSeries = {
  intervalKey: "day" | "week" | "biweek" | "month" | "quarter" | "year"
  /** Hard cap per save (safety). */
  maxOccurrences: number
}

const DEFAULT_MAX_OCCURRENCES = 52
const DEFAULT_HORIZON_MS = 18 * 30 * 24 * 60 * 60 * 1000

function mapFrequencyLabelToInterval(label: string): RecurrenceSeries["intervalKey"] {
  const n = label.trim().toLowerCase()
  if (n.includes("daily") || n === "day") return "day"
  if (n.includes("every 2 week") || n.includes("bi-week") || n.includes("biweek") || /\b2\s*week/.test(n)) return "biweek"
  if (n.includes("week")) return "week"
  if (n.includes("every 3 month") || n.includes("quarter")) return "quarter"
  if (n.includes("month")) return "month"
  if (n.includes("year") || n.includes("annual")) return "year"
  if (n.includes("custom")) return "week"
  return "week"
}

/**
 * Detect "make recurring" checkbox + optional frequency dropdown from portal items.
 * Recognizes id `make_event_recurring` or any checkbox whose id/label mentions "recurring".
 */
export function resolveRecurrenceFromPortal(
  items: PortalSettingItem[],
  values: Record<string, string>
): RecurrenceSeries | null {
  if (!items.length) return null
  const checkbox = items.find(
    (i) =>
      i.type === "checkbox" &&
      (i.id === "make_event_recurring" || /recurring/i.test(i.id) || /recurring/i.test(i.label))
  )
  if (!checkbox) return null
  if (values[checkbox.id] !== "checked") return null

  const frequencyItem =
    items.find(
      (i) =>
        i.type === "dropdown" &&
        i.dependency?.dependsOnItemId === checkbox.id &&
        i.dependency.showWhenValue === "checked"
    ) ??
    items.find((i) => i.type === "dropdown" && (/frequency|recur|interval/i.test(i.id) || /frequency|recur|interval/i.test(i.label)))

  const raw = frequencyItem ? (values[frequencyItem.id] ?? frequencyItem.options?.[0] ?? "Weekly") : "Weekly"
  return {
    intervalKey: mapFrequencyLabelToInterval(String(raw)),
    maxOccurrences: DEFAULT_MAX_OCCURRENCES,
  }
}

function addIntervalLocal(d: Date, key: RecurrenceSeries["intervalKey"]): Date {
  const x = new Date(d.getTime())
  switch (key) {
    case "day":
      x.setDate(x.getDate() + 1)
      return x
    case "week":
      x.setDate(x.getDate() + 7)
      return x
    case "biweek":
      x.setDate(x.getDate() + 14)
      return x
    case "month":
      x.setMonth(x.getMonth() + 1)
      return x
    case "quarter":
      x.setMonth(x.getMonth() + 3)
      return x
    case "year":
      x.setFullYear(x.getFullYear() + 1)
      return x
  }
}

/** Start datetimes for each occurrence (includes the first). */
export function computeOccurrenceStarts(
  start: Date,
  series: RecurrenceSeries,
  horizonMs: number = DEFAULT_HORIZON_MS
): Date[] {
  const out: Date[] = []
  let cur = new Date(start.getTime())
  const endHorizon = start.getTime() + horizonMs
  while (out.length < series.maxOccurrences && cur.getTime() <= endHorizon) {
    out.push(new Date(cur.getTime()))
    const next = addIntervalLocal(cur, series.intervalKey)
    if (next.getTime() <= cur.getTime()) break
    cur = next
  }
  return out
}

export function intervalsOverlap(a0: Date, a1: Date, b0: Date, b1: Date): boolean {
  return a0 < b1 && b0 < a1
}

export { DEFAULT_MAX_OCCURRENCES, DEFAULT_HORIZON_MS }
