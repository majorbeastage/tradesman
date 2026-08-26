/** Multi-lane Call Schedule — parallel product columns per day (forward, ring, menu, temp). */

import type { CallHuntException } from "./callHunting"
import { exceptionActiveOn } from "./callHunting"
import type { CallRoutingProfile, DayKey } from "./callRoutingProfile"
import { formatMinutesLabel, timeToMinutes } from "./callRoutingProfile"
import { resolveMenuLayout } from "./voiceAutoAttendant"

export type ScheduleFunctionId =
  | "auto_attendant"
  | "forwarding"
  | "ring_group"
  | "voicemail"
  | "temporary"
  | "backup"

export type ScheduleColorId = "green" | "yellow" | "red" | "blue" | "purple" | "teal" | "orange" | "gray"

export type ScheduleIconId =
  | "menu"
  | "forward"
  | "users"
  | "voicemail"
  | "calendar_off"
  | "user_switch"
  | "clock"
  | "phone"

export type ScheduleLaneVisual = {
  color?: ScheduleColorId
  icon?: ScheduleIconId
}

export type CallScheduleVisualSettings = {
  lanes?: Partial<Record<ScheduleFunctionId, ScheduleLaneVisual>>
}

export type TimeBlock = {
  startMin: number
  endMin: number
  kind?: "business_hours" | "after_hours" | "all_day" | "voicemail_gap"
}

export type LaneBlock = {
  functionId: ScheduleFunctionId
  label: string
  hint: string
  blocks: TimeBlock[]
  temporary?: boolean
  exceptionId?: string
}

export type DayLanePlan = {
  dayKey: DayKey
  isoDate: string
  openMin: number | null
  closeMin: number | null
  closed: boolean
  lanes: LaneBlock[]
  activeException: CallHuntException | null
}

export const SCHEDULE_COLOR_PALETTE: Record<
  ScheduleColorId,
  { background: string; border: string; color: string; label: string }
> = {
  green: { background: "rgba(187, 247, 208, 0.9)", border: "#86efac", color: "#166534", label: "Green" },
  yellow: { background: "rgba(254, 240, 138, 0.95)", border: "#fde047", color: "#854d0e", label: "Yellow" },
  red: { background: "rgba(254, 202, 202, 0.95)", border: "#f87171", color: "#991b1b", label: "Red" },
  blue: { background: "rgba(191, 219, 254, 0.9)", border: "#93c5fd", color: "#1e40af", label: "Blue" },
  purple: { background: "rgba(233, 213, 255, 0.9)", border: "#c4b5fd", color: "#6b21a8", label: "Purple" },
  teal: { background: "rgba(204, 251, 241, 0.9)", border: "#5eead4", color: "#0f766e", label: "Teal" },
  orange: { background: "rgba(254, 215, 170, 0.95)", border: "#fdba74", color: "#9a3412", label: "Orange" },
  gray: { background: "rgba(226, 232, 240, 0.95)", border: "#cbd5e1", color: "#475569", label: "Gray" },
}

export const SCHEDULE_ICON_OPTIONS: { id: ScheduleIconId; label: string; glyph: string }[] = [
  { id: "menu", label: "Menu", glyph: "☰" },
  { id: "forward", label: "Forward", glyph: "↪" },
  { id: "users", label: "Team ring", glyph: "👥" },
  { id: "voicemail", label: "Voicemail", glyph: "✉" },
  { id: "calendar_off", label: "Out of office", glyph: "🚫" },
  { id: "user_switch", label: "Backup cover", glyph: "↻" },
  { id: "clock", label: "Hours", glyph: "⏱" },
  { id: "phone", label: "Phone", glyph: "☎" },
]

export const FUNCTION_CATALOG: {
  id: ScheduleFunctionId
  title: string
  blurb: string
  defaultColor: ScheduleColorId
  defaultIcon: ScheduleIconId
}[] = [
  { id: "auto_attendant", title: "Auto-attendant", blurb: "Menu before calls connect", defaultColor: "purple", defaultIcon: "menu" },
  { id: "forwarding", title: "Forwarding", blurb: "Ring your primary line", defaultColor: "green", defaultIcon: "forward" },
  { id: "ring_group", title: "Ring group", blurb: "Ring team members", defaultColor: "yellow", defaultIcon: "users" },
  { id: "voicemail", title: "Voicemail", blurb: "When nobody answers", defaultColor: "orange", defaultIcon: "voicemail" },
  { id: "temporary", title: "Out of office", blurb: "Temporary coverage change", defaultColor: "red", defaultIcon: "calendar_off" },
  { id: "backup", title: "Backup cover", blurb: "Shows who is covering", defaultColor: "teal", defaultIcon: "user_switch" },
]

const DEFAULT_LANE_VISUAL: Record<ScheduleFunctionId, ScheduleLaneVisual> = {
  auto_attendant: { color: "purple", icon: "menu" },
  forwarding: { color: "green", icon: "forward" },
  ring_group: { color: "yellow", icon: "users" },
  voicemail: { color: "orange", icon: "voicemail" },
  temporary: { color: "red", icon: "calendar_off" },
  backup: { color: "teal", icon: "user_switch" },
}

export function parseCallScheduleVisual(raw: unknown): CallScheduleVisualSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const lanesRaw = o.lanes
  if (!lanesRaw || typeof lanesRaw !== "object" || Array.isArray(lanesRaw)) return {}
  const lanes: Partial<Record<ScheduleFunctionId, ScheduleLaneVisual>> = {}
  for (const fn of FUNCTION_CATALOG) {
    const row = (lanesRaw as Record<string, unknown>)[fn.id]
    if (!row || typeof row !== "object" || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const color = typeof r.color === "string" ? (r.color as ScheduleColorId) : undefined
    const icon = typeof r.icon === "string" ? (r.icon as ScheduleIconId) : undefined
    if (color || icon) lanes[fn.id] = { color, icon }
  }
  return { lanes }
}

export function mergeCallScheduleVisualMetadata(
  prev: Record<string, unknown>,
  next: CallScheduleVisualSettings,
): Record<string, unknown> {
  return { ...prev, call_schedule_visual_v1: next }
}

export function laneVisual(
  functionId: ScheduleFunctionId,
  settings: CallScheduleVisualSettings | null | undefined,
): ScheduleLaneVisual & { color: ScheduleColorId; icon: ScheduleIconId } {
  const base = DEFAULT_LANE_VISUAL[functionId]
  const patch = settings?.lanes?.[functionId]
  return {
    color: patch?.color ?? base.color ?? "gray",
    icon: patch?.icon ?? base.icon ?? "phone",
  }
}

export function laneStyle(functionId: ScheduleFunctionId, settings?: CallScheduleVisualSettings | null) {
  const { color } = laneVisual(functionId, settings)
  const row = SCHEDULE_COLOR_PALETTE[color] ?? SCHEDULE_COLOR_PALETTE.gray
  return row
}

export function laneGlyph(functionId: ScheduleFunctionId, settings?: CallScheduleVisualSettings | null): string {
  const { icon } = laneVisual(functionId, settings)
  return SCHEDULE_ICON_OPTIONS.find((o) => o.id === icon)?.glyph ?? "•"
}

export const SCHEDULE_DAY_START_HOUR = 6
export const SCHEDULE_DAY_END_HOUR = 22
const DAY_START = SCHEDULE_DAY_START_HOUR * 60
const DAY_END = SCHEDULE_DAY_END_HOUR * 60
function afterHourWindows(openMin: number | null, closeMin: number | null, outsideForward: boolean): TimeBlock[] {
  if (!outsideForward) return []
  if (openMin == null || closeMin == null) {
    return [{ startMin: DAY_START, endMin: DAY_END, kind: "all_day" }]
  }
  const out: TimeBlock[] = []
  if (openMin > DAY_START) out.push({ startMin: DAY_START, endMin: openMin, kind: "after_hours" })
  if (closeMin < DAY_END) out.push({ startMin: closeMin, endMin: DAY_END, kind: "after_hours" })
  return out
}

function businessHourWindow(openMin: number | null, closeMin: number | null): TimeBlock[] {
  if (openMin == null || closeMin == null || closeMin <= openMin) return []
  return [{ startMin: openMin, endMin: closeMin, kind: "business_hours" }]
}

function forwardingWindows(profile: CallRoutingProfile, openMin: number | null, closeMin: number | null): TimeBlock[] {
  if (!profile.callForwardingEnabled) return []
  const out = [...businessHourWindow(openMin, closeMin)]
  if (profile.callForwardingOutsideBusinessHours) {
    out.push(...afterHourWindows(openMin, closeMin, true))
  }
  return mergeOverlapping(out)
}

function ringGroupActiveDuringBusiness(hunting: CallRoutingProfile["callHunting"]): boolean {
  if (!hunting.enabled || hunting.mode === "primary_only") return false
  if (hunting.primarySchedule === "always" || hunting.primarySchedule === "business_hours") return true
  return hunting.targets.some((t) => t.enabled && (t.schedule === "always" || t.schedule === "business_hours"))
}

function ringGroupActiveAfterHours(hunting: CallRoutingProfile["callHunting"]): boolean {
  if (!hunting.enabled || hunting.mode === "primary_only") return false
  if (hunting.primarySchedule === "always" || hunting.primarySchedule === "after_hours") return true
  return hunting.targets.some((t) => t.enabled && (t.schedule === "always" || t.schedule === "after_hours"))
}

function ringGroupWindows(profile: CallRoutingProfile, openMin: number | null, closeMin: number | null): TimeBlock[] {
  const hunting = profile.callHunting
  if (!hunting.enabled || hunting.mode === "primary_only") return []
  if (!profile.callForwardingEnabled) return []

  const out: TimeBlock[] = []
  if (ringGroupActiveDuringBusiness(hunting)) {
    out.push(...businessHourWindow(openMin, closeMin))
  }
  if (ringGroupActiveAfterHours(hunting) && profile.callForwardingOutsideBusinessHours) {
    out.push(...afterHourWindows(openMin, closeMin, true))
  }
  return mergeOverlapping(out)
}

function voicemailWindows(
  profile: CallRoutingProfile,
  openMin: number | null,
  closeMin: number | null,
): TimeBlock[] {
  if (!profile.callForwardingEnabled) {
    return [{ startMin: DAY_START, endMin: DAY_END, kind: "all_day" }]
  }
  const forwardBlocks = forwardingWindows(profile, openMin, closeMin)
  if (forwardBlocks.length === 0) {
    return [{ startMin: DAY_START, endMin: DAY_END, kind: "all_day" }]
  }
  const gaps: TimeBlock[] = []
  let cursor = DAY_START
  const sorted = [...forwardBlocks].sort((a, b) => a.startMin - b.startMin)
  for (const block of sorted) {
    if (block.startMin > cursor) {
      gaps.push({ startMin: cursor, endMin: block.startMin, kind: "voicemail_gap" })
    }
    cursor = Math.max(cursor, block.endMin)
  }
  if (cursor < DAY_END) {
    gaps.push({ startMin: cursor, endMin: DAY_END, kind: "voicemail_gap" })
  }
  return gaps.filter((g) => g.endMin - g.startMin >= 15)
}

function mergeOverlapping(blocks: TimeBlock[]): TimeBlock[] {
  if (blocks.length === 0) return []
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin)
  const out: TimeBlock[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]
    const cur = sorted[i]
    if (cur.startMin <= last.endMin && cur.kind === last.kind) {
      last.endMin = Math.max(last.endMin, cur.endMin)
    } else if (cur.startMin <= last.endMin) {
      out.push({ ...cur })
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

function clipBlocksToDay(blocks: TimeBlock[]): TimeBlock[] {
  return blocks
    .map((b) => ({
      ...b,
      startMin: Math.max(DAY_START, b.startMin),
      endMin: Math.min(DAY_END, b.endMin),
    }))
    .filter((b) => b.endMin - b.startMin >= 12)
}

export function buildDayLanePlan(profile: CallRoutingProfile, dayKey: DayKey, isoDate: string): DayLanePlan {
  const day = profile.businessHours[dayKey]
  const openMin = day.enabled ? timeToMinutes(day.open) : null
  const closeMin = day.enabled ? timeToMinutes(day.close) : null
  const activeException = profile.callHunting.exceptions.find((ex) => exceptionActiveOn(ex, isoDate)) ?? null

  const forwardBlocks = clipBlocksToDay(forwardingWindows(profile, openMin, closeMin))
  const ringBlocks = clipBlocksToDay(ringGroupWindows(profile, openMin, closeMin))
  const vmBlocks = clipBlocksToDay(voicemailWindows(profile, openMin, closeMin))

  const lanes: LaneBlock[] = []

  if (profile.autoAttendant.enabled && profile.autoAttendant.mode !== "off" && forwardBlocks.length > 0) {
    lanes.push({
      functionId: "auto_attendant",
      label: "Menu",
      hint: resolveMenuLayout(profile.autoAttendant) === "custom" ? "Custom menu" : "Standard template",
      blocks: forwardBlocks,
    })
  }

  if (forwardBlocks.length > 0) {
    const phone = profile.communicationLine?.forwardToPhone
    lanes.push({
      functionId: "forwarding",
      label: "Forward",
      hint: phone ? `→ ${phone}` : "Set primary line in MyT",
      blocks: forwardBlocks,
    })
  }

  if (ringBlocks.length > 0) {
    const mode =
      profile.callHunting.mode === "sequential"
        ? "In order"
        : profile.callHunting.mode === "simultaneous"
          ? "All at once"
          : ""
    lanes.push({
      functionId: "ring_group",
      label: "Ring group",
      hint: mode ? `${mode} · ${profile.callHunting.ringSeconds}s` : `${profile.callHunting.ringSeconds}s`,
      blocks: ringBlocks,
    })
  }

  if (vmBlocks.length > 0) {
    lanes.push({
      functionId: "voicemail",
      label: "Voicemail",
      hint: "No live answer",
      blocks: vmBlocks,
    })
  }

  if (activeException) {
    const tempBlocks = clipBlocksToDay(
      openMin != null && closeMin != null
        ? [{ startMin: openMin, endMin: closeMin, kind: "business_hours" as const }]
        : [{ startMin: DAY_START, endMin: DAY_END, kind: "all_day" as const }],
    )
    lanes.push({
      functionId: "temporary",
      label: activeException.label || "Out of office",
      hint: activeException.unavailableUserId ? "Adjust routing" : "Temporary",
      blocks: tempBlocks,
      temporary: true,
      exceptionId: activeException.id,
    })
    if (activeException.coverLabel || activeException.coverPhone) {
      lanes.push({
        functionId: "backup",
        label: "Backup",
        hint: activeException.coverLabel || activeException.coverPhone,
        blocks: tempBlocks,
        temporary: true,
        exceptionId: activeException.id,
      })
    }
  }

  return {
    dayKey,
    isoDate,
    openMin,
    closeMin,
    closed: !day.enabled,
    lanes: lanes.filter((lane) => lane.blocks.length > 0),
    activeException,
  }
}

export function minutesToTopPct(minutes: number, hourStart: number, hourEnd: number): number {
  const start = hourStart * 60
  const span = (hourEnd - hourStart) * 60
  return ((minutes - start) / span) * 100
}

export function blockPosition(block: TimeBlock, hourStart: number, hourEnd: number): { topPct: number; heightPct: number } {
  const start = hourStart * 60
  const span = (hourEnd - hourStart) * 60
  const top = Math.max(0, block.startMin - start)
  const bottom = Math.min(span, block.endMin - start)
  const height = Math.max(2, bottom - top)
  return { topPct: (top / span) * 100, heightPct: (height / span) * 100 }
}

export function formatBlockTime(block: TimeBlock): string {
  return `${formatMinutesLabel(block.startMin)} – ${formatMinutesLabel(block.endMin)}`
}

export function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Monday-start week containing `anchor`. */
export function weekDatesContaining(anchor: Date): Date[] {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  const dow = d.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + mondayOffset)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    return x
  })
}

export function functionEnabled(profile: CallRoutingProfile, id: ScheduleFunctionId): boolean {
  if (id === "auto_attendant") return profile.autoAttendant.enabled && profile.autoAttendant.mode !== "off"
  if (id === "forwarding") return profile.callForwardingEnabled
  if (id === "ring_group") return profile.callHunting.enabled && profile.callHunting.mode !== "primary_only"
  if (id === "voicemail") return true
  if (id === "temporary") return profile.callHunting.exceptions.length > 0
  if (id === "backup") return profile.callHunting.exceptions.some((e) => e.coverLabel || e.coverPhone)
  return false
}
