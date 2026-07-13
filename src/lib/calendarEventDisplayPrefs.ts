/** Calendar event label composition + per-event display overrides (metadata). */

export const CALENDAR_DISPLAY_PREFS_KEY = "tradesman_calendar_display_prefs_v1"

export type CalendarTitleFieldId =
  | "time"
  | "title"
  | "customer"
  | "job_type"
  | "assignee"
  | "icon"

export type CalendarDisplayPrefs = {
  /** Ordered fragments used to build the on-grid event label. */
  titleFields: CalendarTitleFieldId[]
}

export const DEFAULT_CALENDAR_DISPLAY_PREFS: CalendarDisplayPrefs = {
  titleFields: ["time", "title"],
}

export const CALENDAR_TITLE_FIELD_OPTIONS: Array<{ id: CalendarTitleFieldId; label: string }> = [
  { id: "time", label: "Start time" },
  { id: "title", label: "Event title / description" },
  { id: "customer", label: "Customer name" },
  { id: "job_type", label: "Job type name" },
  { id: "assignee", label: "Assigned user" },
  { id: "icon", label: "Job type icon" },
]

export function loadCalendarDisplayPrefs(): CalendarDisplayPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_CALENDAR_DISPLAY_PREFS }
  try {
    const raw = localStorage.getItem(CALENDAR_DISPLAY_PREFS_KEY)
    if (!raw) return { ...DEFAULT_CALENDAR_DISPLAY_PREFS }
    const parsed = JSON.parse(raw) as CalendarDisplayPrefs
    const fields = Array.isArray(parsed?.titleFields)
      ? parsed.titleFields.filter((f): f is CalendarTitleFieldId =>
          CALENDAR_TITLE_FIELD_OPTIONS.some((o) => o.id === f),
        )
      : []
    return { titleFields: fields.length ? fields : [...DEFAULT_CALENDAR_DISPLAY_PREFS.titleFields] }
  } catch {
    return { ...DEFAULT_CALENDAR_DISPLAY_PREFS }
  }
}

export function saveCalendarDisplayPrefs(prefs: CalendarDisplayPrefs): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(CALENDAR_DISPLAY_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

export type CalendarEventLabelInput = {
  title?: string | null
  startAt?: string | null
  customerName?: string | null
  jobTypeName?: string | null
  assigneeLabel?: string | null
  iconGlyph?: string | null
  /** Override color hex from event metadata */
  colorOverride?: string | null
}

export function formatCalendarEventStartTime(startAt: string | null | undefined): string {
  if (!startAt) return ""
  try {
    const d = new Date(startAt)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  } catch {
    return ""
  }
}

export function formatCalendarEventLabel(ev: CalendarEventLabelInput, prefs?: CalendarDisplayPrefs): string {
  const p = prefs ?? loadCalendarDisplayPrefs()
  const parts: string[] = []
  for (const field of p.titleFields) {
    switch (field) {
      case "time": {
        const t = formatCalendarEventStartTime(ev.startAt)
        if (t) parts.push(t)
        break
      }
      case "title": {
        const t = (ev.title ?? "").trim()
        if (t) parts.push(t)
        break
      }
      case "customer": {
        const c = (ev.customerName ?? "").trim()
        if (c) parts.push(c)
        break
      }
      case "job_type": {
        const j = (ev.jobTypeName ?? "").trim()
        if (j) parts.push(j)
        break
      }
      case "assignee": {
        const a = (ev.assigneeLabel ?? "").trim()
        if (a) parts.push(a)
        break
      }
      case "icon": {
        const g = (ev.iconGlyph ?? "").trim()
        if (g) parts.push(g)
        break
      }
    }
  }
  return parts.join(" · ") || (ev.title ?? "").trim() || "Event"
}

export type CalendarEventDisplayMeta = {
  color_hex?: string
  icon_id?: string
}

export function readCalendarEventDisplayMeta(metadata: unknown): CalendarEventDisplayMeta {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const o = metadata as Record<string, unknown>
  const display =
    o.display && typeof o.display === "object" && !Array.isArray(o.display)
      ? (o.display as Record<string, unknown>)
      : o
  return {
    color_hex: typeof display.color_hex === "string" ? display.color_hex : undefined,
    icon_id: typeof display.icon_id === "string" ? display.icon_id : undefined,
  }
}

export function mergeCalendarEventDisplayMeta(
  prevMeta: Record<string, unknown> | null | undefined,
  patch: CalendarEventDisplayMeta,
): Record<string, unknown> {
  const base = prevMeta && typeof prevMeta === "object" && !Array.isArray(prevMeta) ? { ...prevMeta } : {}
  const prevDisplay =
    base.display && typeof base.display === "object" && !Array.isArray(base.display)
      ? { ...(base.display as Record<string, unknown>) }
      : {}
  if (patch.color_hex !== undefined) {
    if (patch.color_hex) prevDisplay.color_hex = patch.color_hex
    else delete prevDisplay.color_hex
  }
  if (patch.icon_id !== undefined) {
    if (patch.icon_id && patch.icon_id !== "none") prevDisplay.icon_id = patch.icon_id
    else delete prevDisplay.icon_id
  }
  base.display = prevDisplay
  return base
}
