/** Apply Call Schedule block edits to CallRoutingProfile (maps UI → live routing fields). */

import type { CallHuntSchedule } from "./callHunting"
import { newHuntExceptionId } from "./callHunting"
import type { BusinessHours, CallRoutingProfile, DayKey } from "./callRoutingProfile"
import { DAY_KEYS, timeToMinutes } from "./callRoutingProfile"
import type { ScheduleFunctionId, TimeBlock } from "./callScheduleLanes"

export type ScheduleApplyScope = "this_day" | "weekday" | "weekdays" | "all_days" | "date_range" | "custom_days"

export type BlockTimeKind = "business_hours" | "after_hours" | "all_day" | "voicemail_gap"

export type BlockEditContext = {
  functionId: ScheduleFunctionId
  isoDate: string
  dayKey: DayKey
  block: TimeBlock
  timeKind: BlockTimeKind
  exceptionId?: string
}

const DAY_START_MIN = 6 * 60
const DAY_END_MIN = 22 * 60

export function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export function hhmmToMinutes(hhmm: string): number {
  return timeToMinutes(hhmm)
}

/** Classify a rendered block relative to business hours for that day. */
export function classifyBlockTimeKind(
  block: TimeBlock,
  openMin: number | null,
  closeMin: number | null,
): BlockTimeKind {
  if (openMin == null || closeMin == null) return "all_day"
  const tol = 10
  if (Math.abs(block.startMin - openMin) < tol && Math.abs(block.endMin - closeMin) < tol) {
    return "business_hours"
  }
  if (block.endMin <= openMin + tol || block.startMin >= closeMin - tol) return "after_hours"
  if (block.startMin <= DAY_START_MIN + tol && block.endMin >= DAY_END_MIN - tol) return "all_day"
  return "business_hours"
}

function dayKeysForScope(scope: ScheduleApplyScope, dayKey: DayKey, customDays?: DayKey[]): DayKey[] {
  if (scope === "custom_days" && customDays?.length) return customDays
  if (scope === "weekdays") return ["mon", "tue", "wed", "thu", "fri"]
  if (scope === "all_days") return [...DAY_KEYS]
  return [dayKey]
}

function patchBusinessHours(
  hours: BusinessHours,
  keys: DayKey[],
  patch: Partial<BusinessHours[DayKey]>,
): BusinessHours {
  const next = { ...hours }
  for (const key of keys) {
    next[key] = { ...next[key], ...patch }
  }
  return next
}

export type BlockSchedulePatch = {
  scope: ScheduleApplyScope
  startMin: number
  endMin: number
  enabled: boolean
  rangeStart?: string
  rangeEnd?: string
  customDays?: DayKey[]
}

export function applyBlockScheduleEdit(
  profile: CallRoutingProfile,
  ctx: BlockEditContext,
  patch: BlockSchedulePatch,
): CallRoutingProfile {
  const keys =
    patch.scope === "date_range"
      ? [ctx.dayKey]
      : dayKeysForScope(patch.scope, ctx.dayKey, patch.customDays)
  let next: CallRoutingProfile = { ...profile }

  const open = minutesToHhmm(patch.startMin)
  const close = minutesToHhmm(patch.endMin)

  if (ctx.functionId === "forwarding" || ctx.functionId === "auto_attendant") {
    if (!patch.enabled) {
      if (ctx.functionId === "auto_attendant") {
        return {
          ...next,
          autoAttendant: { ...next.autoAttendant, enabled: false, mode: "off" },
        }
      }
      if (ctx.timeKind === "after_hours" || patch.scope === "all_days") {
        next = { ...next, callForwardingOutsideBusinessHours: false }
      } else {
        next = {
          ...next,
          businessHours: patchBusinessHours(next.businessHours, keys, { enabled: false }),
        }
      }
      if (patch.scope === "all_days" || keys.length === DAY_KEYS.length) {
        next = { ...next, callForwardingEnabled: false, callForwardingOutsideBusinessHours: false }
      }
    } else {
      if (ctx.timeKind === "after_hours") {
        next = { ...next, callForwardingEnabled: true, callForwardingOutsideBusinessHours: true }
      } else {
        next = {
          ...next,
          callForwardingEnabled: true,
          businessHours: patchBusinessHours(next.businessHours, keys, {
            enabled: true,
            open,
            close,
          }),
        }
      }
      if (ctx.functionId === "auto_attendant" && patch.enabled) {
        next = {
          ...next,
          autoAttendant: {
            ...next.autoAttendant,
            enabled: true,
            mode: next.autoAttendant.mode === "off" ? "ai_menu" : next.autoAttendant.mode,
          },
        }
      }
    }
    return next
  }

  if (ctx.functionId === "ring_group") {
    if (!patch.enabled) {
      if (ctx.timeKind === "after_hours") {
        next = {
          ...next,
          callHunting: {
            ...next.callHunting,
            primarySchedule:
              next.callHunting.primarySchedule === "after_hours" ? "business_hours" : next.callHunting.primarySchedule,
            targets: next.callHunting.targets.map((t) =>
              t.schedule === "after_hours" ? { ...t, enabled: false } : t,
            ),
          },
        }
      } else if (patch.scope === "all_days" || keys.length === DAY_KEYS.length) {
        next = {
          ...next,
          callHunting: { ...next.callHunting, enabled: false },
        }
      } else {
        next = {
          ...next,
          businessHours: patchBusinessHours(next.businessHours, keys, { enabled: false }),
        }
      }
      return next
    }

    const schedule: CallHuntSchedule =
      ctx.timeKind === "after_hours" ? "after_hours" : ctx.timeKind === "all_day" ? "always" : "business_hours"

    next = {
      ...next,
      callForwardingEnabled: true,
      callHunting: {
        ...next.callHunting,
        enabled: true,
        mode: next.callHunting.mode === "primary_only" ? "simultaneous" : next.callHunting.mode,
        primarySchedule: schedule === "always" ? "always" : schedule,
      },
      businessHours:
        schedule === "business_hours"
          ? patchBusinessHours(next.businessHours, keys, { enabled: true, open, close })
          : next.businessHours,
    }
    if (ctx.timeKind === "after_hours") {
      next = { ...next, callForwardingOutsideBusinessHours: true }
    }
    return next
  }

  if (ctx.functionId === "voicemail") {
    if (ctx.timeKind === "after_hours" && patch.enabled) {
      next = { ...next, callForwardingOutsideBusinessHours: false }
    }
    if (ctx.timeKind === "business_hours" && !patch.enabled) {
      next = { ...next, callForwardingEnabled: false }
    }
    return next
  }

  if (ctx.functionId === "temporary" || ctx.functionId === "backup") {
    const rangeStart = patch.rangeStart ?? ctx.isoDate
    const rangeEnd = patch.rangeEnd ?? ctx.isoDate
    const exceptions = [...next.callHunting.exceptions]
    const idx = ctx.exceptionId ? exceptions.findIndex((e) => e.id === ctx.exceptionId) : -1
    if (!patch.enabled && idx >= 0) {
      exceptions.splice(idx, 1)
    } else if (idx >= 0) {
      exceptions[idx] = {
        ...exceptions[idx],
        startsOn: rangeStart,
        endsOn: rangeEnd,
      }
    } else if (patch.enabled) {
      exceptions.push({
        id: newHuntExceptionId(),
        label: "Out of office",
        startsOn: rangeStart,
        endsOn: rangeEnd,
        unavailableUserId: next.profileUserId,
        coverUserId: null,
        coverPhone: "",
        coverLabel: "",
        skipPrimary: false,
      })
    }
    next = { ...next, callHunting: { ...next.callHunting, exceptions } }
    return next
  }

  return next
}

export function defaultBlockPatch(ctx: BlockEditContext): BlockSchedulePatch {
  return {
    scope: ctx.functionId === "temporary" || ctx.functionId === "backup" ? "date_range" : "weekday",
    startMin: ctx.block.startMin,
    endMin: ctx.block.endMin,
    enabled: true,
    rangeStart: ctx.isoDate,
    rangeEnd: ctx.isoDate,
  }
}

export function startOfYear(y: number): Date {
  return new Date(y, 0, 1)
}

export function addYears(d: Date, n: number): Date {
  return new Date(d.getFullYear() + n, 0, 1)
}
