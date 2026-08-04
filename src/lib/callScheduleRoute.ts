/** Route visualization + voicemail timing for Call Schedule (mirrors incoming-call.ts behavior). */

import type { CallHuntingSettings } from "./callHunting"
import { exceptionActiveOn } from "./callHunting"
import type { CallRoutingProfile } from "./callRoutingProfile"
import type { DayKey } from "./callRoutingProfile"

export type RouteKind =
  | "direct_voicemail"
  | "ring_then_voicemail"
  | "forward_primary"
  | "ring_group"
  | "auto_attendant"
  | "after_hours_voicemail"
  | "after_hours_forward"
  | "closed_all_day"

export type RouteSegment = {
  kind: RouteKind
  label: string
  detail: string
  ringSeconds: number
  maxRingSeconds: number
}

export const ROUTE_LEGEND: { kind: RouteKind; label: string; swatch: string; border: string }[] = [
  { kind: "auto_attendant", label: "Auto-attendant", swatch: "rgba(233, 213, 255, 0.85)", border: "#c4b5fd" },
  { kind: "ring_group", label: "Ring group", swatch: "rgba(187, 247, 208, 0.85)", border: "#86efac" },
  { kind: "forward_primary", label: "Forward to primary", swatch: "rgba(191, 219, 254, 0.85)", border: "#93c5fd" },
  { kind: "ring_then_voicemail", label: "Ring, then voicemail", swatch: "rgba(254, 215, 170, 0.9)", border: "#fdba74" },
  { kind: "direct_voicemail", label: "Straight to voicemail", swatch: "rgba(254, 202, 202, 0.9)", border: "#fca5a5" },
  { kind: "after_hours_voicemail", label: "After hours → voicemail", swatch: "rgba(226, 232, 240, 0.95)", border: "#cbd5e1" },
  { kind: "after_hours_forward", label: "After hours → forward", swatch: "rgba(204, 251, 241, 0.9)", border: "#5eead4" },
  { kind: "closed_all_day", label: "Closed all day", swatch: "rgba(241, 245, 249, 0.95)", border: "#94a3b8" },
]

export function routeStyle(kind: RouteKind): { background: string; border: string; color: string } {
  const row = ROUTE_LEGEND.find((r) => r.kind === kind)
  if (!row) return { background: "#f1f5f9", border: "#cbd5e1", color: "#334155" }
  const text =
    kind === "direct_voicemail" || kind === "ring_then_voicemail"
      ? "#9a3412"
      : kind === "auto_attendant"
        ? "#6b21a8"
        : kind === "ring_group"
          ? "#166534"
          : kind === "forward_primary" || kind === "after_hours_forward"
            ? "#1e40af"
            : "#475569"
  return { background: row.swatch, border: row.border, color: text }
}

function defaultRingSeconds(hunting: CallHuntingSettings): number {
  return hunting.enabled ? hunting.ringSeconds : 30
}

function countHuntLegs(profile: CallRoutingProfile, duringBusinessHours: boolean): number {
  const { callHunting: hunting } = profile
  if (!hunting.enabled || hunting.mode === "primary_only") return hunting.enabled ? 0 : 1
  let legs = 0
  if (
    profile.communicationLine?.forwardToPhone &&
    (hunting.primarySchedule === "always" ||
      (hunting.primarySchedule === "business_hours" && duringBusinessHours) ||
      (hunting.primarySchedule === "after_hours" && !duringBusinessHours))
  ) {
    legs += 1
  }
  for (const t of hunting.targets) {
    if (!t.enabled) continue
    if (t.schedule === "always") legs += 1
    else if (t.schedule === "business_hours" && duringBusinessHours) legs += 1
    else if (t.schedule === "after_hours" && !duringBusinessHours) legs += 1
  }
  return Math.max(1, legs)
}

function forwardingAllowed(profile: CallRoutingProfile, duringBusinessHours: boolean): boolean {
  if (!profile.callForwardingEnabled) return false
  if (duringBusinessHours) return true
  return profile.callForwardingOutsideBusinessHours
}

/** Analyze how inbound calls behave for a time window (business vs after hours). */
export function analyzeRouteSegment(profile: CallRoutingProfile, duringBusinessHours: boolean): RouteSegment {
  const ringSec = defaultRingSeconds(profile.callHunting)
  const hasForward = Boolean(profile.communicationLine?.forwardToPhone?.trim())

  if (!duringBusinessHours) {
    if (!forwardingAllowed(profile, false)) {
      return {
        kind: "after_hours_voicemail",
        label: "Voicemail",
        detail: hasForward ? "After hours — no forward (straight to voicemail)" : "After hours — no primary forward number",
        ringSeconds: 0,
        maxRingSeconds: 0,
      }
    }
    if (profile.callHunting.enabled && profile.callHunting.mode !== "primary_only") {
      const legs = profile.callHunting.mode === "sequential" ? countHuntLegs(profile, false) : 1
      const maxRing = profile.callHunting.mode === "sequential" ? ringSec * legs : ringSec
      return {
        kind: "after_hours_forward",
        label: "After hours ring",
        detail: `${profile.callHunting.mode === "sequential" ? "Sequential" : "Simultaneous"} ring · ${ringSec}s${profile.callHunting.mode === "sequential" ? `/leg (up to ${maxRing}s)` : ""} → voicemail`,
        ringSeconds: ringSec,
        maxRingSeconds: maxRing,
      }
    }
    return {
      kind: "after_hours_forward",
      label: "After hours forward",
      detail: `Ring primary ${ringSec}s → voicemail if no answer`,
      ringSeconds: ringSec,
      maxRingSeconds: ringSec,
    }
  }

  if (!forwardingAllowed(profile, true)) {
    return {
      kind: "direct_voicemail",
      label: "Voicemail",
      detail: "Call forwarding is off — callers go straight to voicemail",
      ringSeconds: 0,
      maxRingSeconds: 0,
    }
  }

  if (!hasForward && !profile.callHunting.enabled) {
    return {
      kind: "direct_voicemail",
      label: "Voicemail",
      detail: "No primary forward number on this line — straight to voicemail",
      ringSeconds: 0,
      maxRingSeconds: 0,
    }
  }

  if (profile.autoAttendant.enabled && profile.autoAttendant.mode !== "off") {
    const legs = profile.callHunting.enabled && profile.callHunting.mode === "sequential" ? countHuntLegs(profile, true) : 1
    const maxRing = profile.callHunting.enabled && profile.callHunting.mode === "sequential" ? ringSec * legs : ringSec
    return {
      kind: "auto_attendant",
      label: "Auto-attendant",
      detail: `Menu first, then ${profile.callHunting.enabled ? "ring group" : "forward"} · ${ringSec}s${profile.callHunting.mode === "sequential" ? `/leg (up to ${maxRing}s)` : ""} → voicemail`,
      ringSeconds: ringSec,
      maxRingSeconds: maxRing,
    }
  }

  if (profile.callHunting.enabled && profile.callHunting.mode !== "primary_only") {
    const legs = profile.callHunting.mode === "sequential" ? countHuntLegs(profile, true) : 1
    const maxRing = profile.callHunting.mode === "sequential" ? ringSec * legs : ringSec
    return {
      kind: "ring_group",
      label: profile.callHunting.mode === "sequential" ? "Ring in order" : "Ring all",
      detail: `${ringSec}s${profile.callHunting.mode === "sequential" ? ` per number (up to ${maxRing}s total)` : " simultaneous"} → voicemail`,
      ringSeconds: ringSec,
      maxRingSeconds: maxRing,
    }
  }

  return {
    kind: "forward_primary",
    label: "Forward",
    detail: `Ring primary ${ringSec}s → voicemail if no answer`,
    ringSeconds: ringSec,
    maxRingSeconds: ringSec,
  }
}

export function dayKeyFromDate(d: Date): DayKey {
  const idx = d.getDay()
  const map: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
  return map[idx] ?? "mon"
}

/** Exception on this calendar date may change coverage (shown as ring_group tint in month view). */
export function exceptionForDate(profile: CallRoutingProfile, isoDate: string) {
  return profile.callHunting.exceptions.find((ex) => exceptionActiveOn(ex, isoDate))
}

export function segmentForDay(profile: CallRoutingProfile, dayKey: DayKey, isoDate?: string): RouteSegment {
  const day = profile.businessHours[dayKey]
  if (!day.enabled) {
    const after = analyzeRouteSegment(profile, false)
    return {
      kind: "closed_all_day",
      label: "Closed",
      detail: `All day: ${after.label.toLowerCase()} — ${after.detail}`,
      ringSeconds: after.ringSeconds,
      maxRingSeconds: after.maxRingSeconds,
    }
  }
  if (isoDate) {
    const ex = exceptionForDate(profile, isoDate)
    if (ex) {
      return {
        kind: "ring_group",
        label: "Coverage exception",
        detail: `${ex.label}: ${ex.startsOn}–${ex.endsOn}${ex.coverLabel ? ` · cover ${ex.coverLabel}` : ""}`,
        ringSeconds: profile.callHunting.ringSeconds,
        maxRingSeconds: profile.callHunting.ringSeconds,
      }
    }
  }
  return analyzeRouteSegment(profile, true)
}
