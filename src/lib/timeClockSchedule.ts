/** Weekly shift schedule + late-punch alert configuration (stored on business metadata + per-user policy). */

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

export type WorkDayShiftBlock = {
  enabled: boolean
  startTime: string
  endTime: string
}

export type UserWeeklySchedule = {
  userId: string
  timezone: string
  days: Record<WeekdayIndex, WorkDayShiftBlock>
}

export type LatePunchAlertConfig = {
  enabled: boolean
  /** Minutes after scheduled start before considered late. */
  graceMinutes: number
  notifyManagerUserIds: string[]
}

export type OrgWorkforceScheduleV1 = {
  _v: 1
  schedules: Record<string, UserWeeklySchedule>
  latePunchByUser: Record<string, LatePunchAlertConfig>
}

export function defaultWorkDayShift(): WorkDayShiftBlock {
  return { enabled: false, startTime: "08:00", endTime: "17:00" }
}

export function defaultWeeklySchedule(userId: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): UserWeeklySchedule {
  const days = {} as Record<WeekdayIndex, WorkDayShiftBlock>
  for (let i = 0; i <= 6; i++) {
    const d = i as WeekdayIndex
    days[d] = {
      enabled: d >= 1 && d <= 5,
      startTime: "08:00",
      endTime: "17:00",
    }
  }
  return { userId, timezone, days }
}

export function defaultLatePunchConfig(): LatePunchAlertConfig {
  return { enabled: false, graceMinutes: 5, notifyManagerUserIds: [] }
}

export function defaultOrgWorkforceSchedule(): OrgWorkforceScheduleV1 {
  return { _v: 1, schedules: {}, latePunchByUser: {} }
}

export function parseOrgWorkforceSchedule(metadata: unknown): OrgWorkforceScheduleV1 {
  const base = defaultOrgWorkforceSchedule()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>).workforce_schedule_v1
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const schedules: Record<string, UserWeeklySchedule> = {}
  if (o.schedules && typeof o.schedules === "object" && !Array.isArray(o.schedules)) {
    for (const [userId, val] of Object.entries(o.schedules as Record<string, unknown>)) {
      const parsed = parseUserSchedule(userId, val)
      if (parsed) schedules[userId] = parsed
    }
  }
  const latePunchByUser: Record<string, LatePunchAlertConfig> = {}
  if (o.latePunchByUser && typeof o.latePunchByUser === "object" && !Array.isArray(o.latePunchByUser)) {
    for (const [userId, val] of Object.entries(o.latePunchByUser as Record<string, unknown>)) {
      const parsed = parseLatePunch(val)
      if (parsed) latePunchByUser[userId] = parsed
    }
  }
  return { _v: 1, schedules, latePunchByUser }
}

function parseLatePunch(raw: unknown): LatePunchAlertConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  return {
    enabled: o.enabled === true,
    graceMinutes: typeof o.graceMinutes === "number" && o.graceMinutes >= 0 ? o.graceMinutes : 5,
    notifyManagerUserIds: Array.isArray(o.notifyManagerUserIds)
      ? o.notifyManagerUserIds.filter((x): x is string => typeof x === "string")
      : [],
  }
}

function parseUserSchedule(userId: string, raw: unknown): UserWeeklySchedule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const timezone = typeof o.timezone === "string" ? o.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone
  const base = defaultWeeklySchedule(userId, timezone)
  const daysRaw = o.days
  if (!daysRaw || typeof daysRaw !== "object" || Array.isArray(daysRaw)) return base
  for (let i = 0; i <= 6; i++) {
    const d = i as WeekdayIndex
    const block = (daysRaw as Record<string, unknown>)[String(i)]
    if (block && typeof block === "object" && !Array.isArray(block)) {
      const b = block as Record<string, unknown>
      base.days[d] = {
        enabled: b.enabled === true,
        startTime: typeof b.startTime === "string" ? b.startTime : base.days[d].startTime,
        endTime: typeof b.endTime === "string" ? b.endTime : base.days[d].endTime,
      }
    }
  }
  return base
}

export function mergeOrgWorkforceSchedule(metadata: unknown, patch: Partial<OrgWorkforceScheduleV1>): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  const prev = parseOrgWorkforceSchedule(metadata)
  base.workforce_schedule_v1 = { ...prev, ...patch, _v: 1 as const }
  return base
}

/** Returns scheduled start for today if enabled, else null. */
export function scheduledStartToday(schedule: UserWeeklySchedule, at = new Date()): Date | null {
  const day = at.getDay() as WeekdayIndex
  const block = schedule.days[day]
  if (!block?.enabled) return null
  const [h, m] = block.startTime.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const d = new Date(at)
  d.setHours(h, m, 0, 0)
  return d
}

export function isLatePunch(schedule: UserWeeklySchedule, clockedInAt: Date, config: LatePunchAlertConfig): boolean {
  if (!config.enabled) return false
  const expected = scheduledStartToday(schedule, clockedInAt)
  if (!expected) return false
  const graceMs = config.graceMinutes * 60_000
  return clockedInAt.getTime() > expected.getTime() + graceMs
}

export function formatScheduleDaySummary(schedule: UserWeeklySchedule): string {
  const parts: string[] = []
  for (let i = 0; i <= 6; i++) {
    const d = i as WeekdayIndex
    const block = schedule.days[d]
    if (!block.enabled) continue
    parts.push(`${WEEKDAY_LABELS[d].slice(0, 3)} ${block.startTime}–${block.endTime}`)
  }
  return parts.length ? parts.join(" · ") : "No scheduled days"
}
