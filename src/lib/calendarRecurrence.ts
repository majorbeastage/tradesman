import { getPortalItemDependencyList, type PortalSettingItem } from "../types/portal-builder"

/** One recurring submission (materialized as multiple DB rows). */
export type RecurrenceSeries = {
  intervalKey: "day" | "week" | "biweek" | "month" | "quarter" | "year"
  maxOccurrences: number
  horizonMs: number
  /** Inclusive end of last calendar day (local) for occurrences, or null */
  untilDate: Date | null
}

export const DEFAULT_MAX_OCCURRENCES = 52
export const DEFAULT_HORIZON_MS = 18 * 30 * 24 * 60 * 60 * 1000
const ABSOLUTE_MAX_INSTANCES = 500
const LONG_HORIZON_MS = 100 * 365 * 24 * 60 * 60 * 1000

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

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function parseLocalYmd(input: string): Date | null {
  const t = input.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10) - 1
  const da = parseInt(m[3], 10)
  const d = new Date(y, mo, da)
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null
  return d
}

function parsePositiveInt(raw: string | undefined): number {
  const n = parseInt(String(raw ?? "").trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : NaN
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
        getPortalItemDependencyList(i).some((d) => d.dependsOnItemId === checkbox.id && d.showWhenValue === "checked"),
    ) ??
    items.find((i) => i.type === "dropdown" && (/frequency|recur|interval/i.test(i.id) || /frequency|recur|interval/i.test(i.label)))

  const raw = frequencyItem ? (values[frequencyItem.id] ?? frequencyItem.options?.[0] ?? "Weekly") : "Weekly"
  return {
    intervalKey: mapFrequencyLabelToInterval(String(raw)),
    maxOccurrences: DEFAULT_MAX_OCCURRENCES,
    horizonMs: DEFAULT_HORIZON_MS,
    untilDate: null,
  }
}

/**
 * Apply optional portal fields for how long the series runs:
 * - Dropdown id `recurrence_end_mode` (or label heuristics): indefinite, occurrences, until date, or time span.
 * - `recurrence_occurrence_count` (custom_field): max instances.
 * - `recurrence_until_date` (custom_field): YYYY-MM-DD.
 * - `recurrence_period_amount` + `recurrence_period_unit` (dropdown: Weeks / Months / Years).
 */
export function applyRecurrenceEndLimitsFromPortal(
  items: PortalSettingItem[],
  values: Record<string, string>,
  series: RecurrenceSeries
): RecurrenceSeries {
  const modeItem = items.find(
    (i) =>
      i.type === "dropdown" &&
      (i.id === "recurrence_end_mode" ||
        i.id === "recurring_duration" ||
        /recurrence_end|how.*(long|ends)|duration.*mode|ends.*after/i.test(i.id) ||
        /recurrence.*end|how long|series.*end|duration/i.test(i.label))
  )
  const modeRaw = modeItem ? String(values[modeItem.id] ?? modeItem.options?.[0] ?? "").toLowerCase() : ""

  const countItem = items.find(
    (i) =>
      (i.type === "custom_field" && i.customFieldSubtype !== "dropdown") &&
      (i.id === "recurrence_occurrence_count" ||
        /number of (occurrence|instance)|occurrence count|instance count|how many/i.test(i.label))
  )
  const untilItem = items.find(
    (i) =>
      (i.type === "custom_field" && i.customFieldSubtype !== "dropdown") &&
      (i.id === "recurrence_until_date" || /until (date|end)|end date|series end date/i.test(i.label))
  )
  const spanAmtItem = items.find(
    (i) =>
      (i.type === "custom_field" && i.customFieldSubtype !== "dropdown") &&
      (i.id === "recurrence_period_amount" || /^period (length|amount|count)$/i.test(i.label) || /for how many/i.test(i.label))
  )
  const spanUnitItem = items.find(
    (i) =>
      i.type === "dropdown" &&
      (i.id === "recurrence_period_unit" || /period unit|time unit|for (weeks|months|years)/i.test(i.label))
  )

  let maxOcc = series.maxOccurrences
  let horizon = series.horizonMs
  let untilDate: Date | null = series.untilDate

  const withInstances = (n: number) => {
    maxOcc = Math.min(ABSOLUTE_MAX_INSTANCES, Math.max(1, n))
    horizon = LONG_HORIZON_MS
    untilDate = null
  }

  if (modeRaw && /indefinite|no end|ongoing|forever|unlimited/.test(modeRaw)) {
    return {
      ...series,
      maxOccurrences: ABSOLUTE_MAX_INSTANCES,
      horizonMs: 10 * 365 * 24 * 60 * 60 * 1000,
      untilDate: null,
    }
  }

  if (modeRaw && /occurrence|instance/.test(modeRaw) && !/until|date/.test(modeRaw)) {
    const n = parsePositiveInt(countItem ? values[countItem.id] : undefined)
    if (Number.isFinite(n)) withInstances(n)
    return { ...series, maxOccurrences: maxOcc, horizonMs: horizon, untilDate }
  }

  if (modeRaw && (/until|by date|end date/).test(modeRaw)) {
    const rawD = untilItem ? String(values[untilItem.id] ?? "").trim() : ""
    const d = parseLocalYmd(rawD)
    if (d) {
      untilDate = endOfLocalDay(d)
      maxOcc = ABSOLUTE_MAX_INSTANCES
      horizon = LONG_HORIZON_MS
    }
    return { ...series, maxOccurrences: maxOcc, horizonMs: horizon, untilDate }
  }

  if (modeRaw && (/week|month|year|period|span|length/).test(modeRaw)) {
    const amt = parsePositiveInt(spanAmtItem ? values[spanAmtItem.id] : undefined)
    const unitRaw = spanUnitItem ? String(values[spanUnitItem.id] ?? "").toLowerCase() : ""
    if (Number.isFinite(amt)) {
      let ms = amt * 7 * 24 * 60 * 60 * 1000
      if (unitRaw.includes("year")) ms = amt * 365 * 24 * 60 * 60 * 1000
      else if (unitRaw.includes("month")) ms = amt * 30 * 24 * 60 * 60 * 1000
      horizon = Math.min(Math.max(ms, 24 * 60 * 60 * 1000), LONG_HORIZON_MS)
      maxOcc = ABSOLUTE_MAX_INSTANCES
      untilDate = null
    }
    return { ...series, maxOccurrences: maxOcc, horizonMs: horizon, untilDate }
  }

  // No explicit mode: still honor filled helper fields (depend on recurring checkbox in builder)
  const n0 = parsePositiveInt(countItem ? values[countItem.id] : undefined)
  if (countItem && String(values[countItem.id] ?? "").trim() && Number.isFinite(n0)) {
    withInstances(n0)
    return { ...series, maxOccurrences: maxOcc, horizonMs: horizon, untilDate }
  }
  if (untilItem && String(values[untilItem.id] ?? "").trim()) {
    const ud = parseLocalYmd(String(values[untilItem.id] ?? ""))
    if (ud) {
      untilDate = endOfLocalDay(ud)
      maxOcc = ABSOLUTE_MAX_INSTANCES
      horizon = LONG_HORIZON_MS
    }
    return { ...series, maxOccurrences: maxOcc, horizonMs: horizon, untilDate }
  }
  if (spanAmtItem && String(values[spanAmtItem.id] ?? "").trim()) {
    const amt = parsePositiveInt(values[spanAmtItem.id])
    const unitRaw = spanUnitItem ? String(values[spanUnitItem.id] ?? "").toLowerCase() : "weeks"
    if (Number.isFinite(amt)) {
      let ms = amt * 7 * 24 * 60 * 60 * 1000
      if (unitRaw.includes("year")) ms = amt * 365 * 24 * 60 * 60 * 1000
      else if (unitRaw.includes("month")) ms = amt * 30 * 24 * 60 * 60 * 1000
      horizon = Math.min(Math.max(ms, 24 * 60 * 60 * 1000), LONG_HORIZON_MS)
      maxOcc = ABSOLUTE_MAX_INSTANCES
      untilDate = null
    }
    return { ...series, maxOccurrences: maxOcc, horizonMs: horizon, untilDate }
  }

  return series
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
export function computeOccurrenceStarts(start: Date, series: RecurrenceSeries): Date[] {
  const out: Date[] = []
  let cur = new Date(start.getTime())
  const horizonEnd = start.getTime() + series.horizonMs
  const untilEnd = series.untilDate ? series.untilDate.getTime() : Infinity

  while (out.length < series.maxOccurrences) {
    if (cur.getTime() > horizonEnd) break
    if (cur.getTime() > untilEnd) break
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
