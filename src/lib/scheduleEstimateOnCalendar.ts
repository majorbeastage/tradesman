import type { SupabaseClient } from "@supabase/supabase-js"
import {
  applyRecurrenceEndLimitsFromPortal,
  computeOccurrenceStarts,
  intervalsOverlap,
  resolveRecurrenceFromPortal,
  type RecurrenceSeries,
} from "./calendarRecurrence"
import { mergeMaterialsListsForCalendar, materialDescriptionsFromQuoteItemRows } from "./quoteItemMath"
import { parseLocalDateTime } from "./parseLocalDateTime"
import { clampAppointmentDurationMinutes, readCalendarWorkingHoursFromStorage } from "./scheduleDurationDefaults"
import { findCalendarScheduleConflicts, readCalendarNoDuplicateTimesSetting } from "./calendarOverlap"
import { refreshCustomerPipelineOnEngagement } from "./customerPipelineStatus"
import type { PortalSettingItem } from "../types/portal-builder"

export type ScheduleEstimateOnCalendarInput = {
  supabase: SupabaseClient
  userId: string
  authUserId: string
  quoteId: string
  customerId: string | null
  title: string
  dateStr: string
  timeStr: string
  durationMinutes: number
  jobTypeId: string
  notes: string
  mileageMiles: number | null
  targetUserId: string
  assignToScopedUser: boolean
  quoteItems: Array<{ description?: string; item_description?: string; name?: string }>
  jobTypes: Array<{
    id: string
    name: string
    duration_minutes: number
    materials_list?: string | null
    track_mileage?: boolean | null
  }>
  quoteTotal: number
  contactTarget: string
  portalItems: PortalSettingItem[]
  portalValues: Record<string, string>
  recurrenceExplicitlyEnabled: (values: Record<string, string>) => boolean
}

export type ScheduleEstimateOnCalendarResult =
  | { ok: true; eventIds: string[]; occurrenceCount: number; firstStartIso: string }
  | { ok: false; error: string }

function buildCalRows(
  ranges: Array<{ s: Date; e: Date }>,
  rowBase: Record<string, unknown>,
  materialsCombined: string | null,
  mileageMiles: number | null,
  contactTarget: string,
): Array<Record<string, unknown>> {
  return ranges.map(({ s, e }) => {
    const row: Record<string, unknown> = {
      ...rowBase,
      start_at: s.toISOString(),
      end_at: e.toISOString(),
      metadata: { contact_target: contactTarget },
    }
    if (materialsCombined) row.materials_list = materialsCombined
    if (mileageMiles != null) row.mileage_miles = mileageMiles
    return row
  })
}

export async function scheduleEstimateOnCalendar(
  input: ScheduleEstimateOnCalendarInput,
): Promise<ScheduleEstimateOnCalendarResult> {
  const start = parseLocalDateTime(input.dateStr, input.timeStr)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: "Invalid date or time." }
  }
  if (input.durationMinutes < 15) {
    return { ok: false, error: "Enter a valid duration (at least 15 minutes)." }
  }

  const working = readCalendarWorkingHoursFromStorage()
  const durationMinutes = clampAppointmentDurationMinutes(input.durationMinutes, {
    start,
    workingStart: working.enabled ? working.start : undefined,
    workingEnd: working.enabled ? working.end : undefined,
  })

  let series: RecurrenceSeries | null = null
  if (input.recurrenceExplicitlyEnabled(input.portalValues)) {
    const recurrenceFromQuote = resolveRecurrenceFromPortal(input.portalItems, input.portalValues)
    if (recurrenceFromQuote) {
      series = applyRecurrenceEndLimitsFromPortal(input.portalItems, input.portalValues, recurrenceFromQuote)
    }
  }
  const durationMs = durationMinutes * 60 * 1000
  const starts = series ? computeOccurrenceStarts(start, series) : [start]
  const newRanges = starts.map((s) => ({ s, e: new Date(s.getTime() + durationMs) }))

  const noDup = readCalendarNoDuplicateTimesSetting()
  const selectedTarget = input.targetUserId || input.userId
  const eventOwnerUserId = input.assignToScopedUser ? selectedTarget : input.authUserId || selectedTarget
  if (noDup && newRanges.length > 0) {
    try {
      const conflicts = await findCalendarScheduleConflicts(input.supabase, {
        userId: eventOwnerUserId,
        ranges: newRanges,
      })
      if (conflicts.length > 0) {
        return { ok: false, error: "One or more recurring times overlap an existing calendar event." }
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    for (let i = 0; i < newRanges.length; i += 1) {
      for (let j = i + 1; j < newRanges.length; j += 1) {
        if (intervalsOverlap(newRanges[i].s, newRanges[i].e, newRanges[j].s, newRanges[j].e)) {
          return { ok: false, error: "Recurring instances overlap each other. Adjust duration or frequency." }
        }
      }
    }
  }

  const targetUserId = input.assignToScopedUser ? selectedTarget : input.authUserId || selectedTarget
  const recurrenceSeriesId = starts.length > 1 ? crypto.randomUUID() : null
  const jtRow = input.jobTypeId ? input.jobTypes.find((j) => j.id === input.jobTypeId) : null
  const materialsFromJobType =
    jtRow && typeof jtRow.materials_list === "string" && jtRow.materials_list.trim()
      ? jtRow.materials_list.trim()
      : null
  const quoteMaterialsBlock = materialDescriptionsFromQuoteItemRows(input.quoteItems)
  const materialsCombined = mergeMaterialsListsForCalendar(
    quoteMaterialsBlock.trim() ? quoteMaterialsBlock : null,
    materialsFromJobType,
  )

  const rowBase: Record<string, unknown> = {
    user_id: targetUserId,
    title: input.title.trim(),
    start_at: "",
    end_at: "",
    job_type_id: input.jobTypeId || null,
    quote_id: input.quoteId,
    customer_id: input.customerId,
    notes: input.notes.trim() || null,
    quote_total: input.quoteTotal > 0 ? input.quoteTotal : null,
    ...(recurrenceSeriesId ? { recurrence_series_id: recurrenceSeriesId } : {}),
  }

  const calAttempts: [boolean, boolean][] = [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]
  let insertError: { message: string } | null = null
  let inserted: Array<{ id: string }> | null = null
  for (const [incMat, incMile] of calAttempts) {
    const rows = buildCalRows(
      newRanges,
      rowBase,
      incMat ? materialsCombined : null,
      incMile && jtRow?.track_mileage ? input.mileageMiles : null,
      input.contactTarget,
    )
    const r = await input.supabase.from("calendar_events").insert(rows).select("id")
    if (!r.error) {
      insertError = null
      inserted = (r.data ?? []) as Array<{ id: string }>
      break
    }
    insertError = r.error
    const em = (r.error.message ?? "").toLowerCase()
    if (!em.includes("materials_list") && !em.includes("mileage_miles")) break
  }
  if (insertError) return { ok: false, error: insertError.message }

  const eventIds = (inserted ?? []).map((r) => r.id).filter(Boolean)
  const { error: updateErr } = await input.supabase
    .from("quotes")
    .update({ scheduled_at: new Date().toISOString() })
    .eq("id", input.quoteId)
  if (updateErr) return { ok: false, error: updateErr.message }

  if (input.customerId) {
    await refreshCustomerPipelineOnEngagement(input.supabase, input.customerId, "scheduled")
  }

  return {
    ok: true,
    eventIds,
    occurrenceCount: newRanges.length,
    firstStartIso: newRanges[0].s.toISOString(),
  }
}

export async function notifyCalendarStatusScheduled(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<void> {
  if (!eventIds.length) return
  try {
    const { error } = await supabase.functions.invoke("notify-calendar-status", {
      body: { calendarEventIds: eventIds, previousStatus: "", newStatus: "Scheduled" },
    })
    if (error) console.warn("notify-calendar-status:", error.message)
  } catch (e) {
    console.warn("notify-calendar-status:", e instanceof Error ? e.message : e)
  }
}
