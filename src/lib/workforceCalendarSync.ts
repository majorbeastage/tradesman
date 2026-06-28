import type { SupabaseClient } from "@supabase/supabase-js"
import type { EmailClientOutOfOffice } from "./emailClientWorkspace"
import { mergeEmailClientWorkspace, parseEmailClientWorkspace } from "./emailClientWorkspace"
import type { PtoRequest } from "./timeClockPto"

export type WorkforceCalendarBlockKind = "out_of_office" | "pto" | "busy"

const BLOCK_META_KIND = "workforce_block"

export async function upsertWorkforceCalendarBlock(
  supabase: SupabaseClient,
  opts: {
    accountUserId: string
    assigneeUserId: string
    title: string
    startAt: string
    endAt: string
    kind: WorkforceCalendarBlockKind
    sourceId: string
    notes?: string
    existingEventId?: string | null
  },
): Promise<string | null> {
  const row = {
    user_id: opts.accountUserId,
    title: opts.title,
    start_at: opts.startAt,
    end_at: opts.endAt,
    notes: opts.notes?.trim() || null,
    metadata: {
      kind: BLOCK_META_KIND,
      block_kind: opts.kind,
      source_id: opts.sourceId,
      assigned_user_id: opts.assigneeUserId,
    },
  }

  if (opts.existingEventId) {
    const { data, error } = await supabase
      .from("calendar_events")
      .update({ ...row, removed_at: null })
      .eq("id", opts.existingEventId)
      .select("id")
      .maybeSingle()
    if (!error && data?.id) return data.id as string
  }

  const { data, error } = await supabase.from("calendar_events").insert(row).select("id").maybeSingle()
  if (error || !data?.id) {
    console.warn("[workforceCalendarSync]", error?.message ?? "insert failed")
    return opts.existingEventId ?? null
  }
  return data.id as string
}

export async function removeWorkforceCalendarBlock(supabase: SupabaseClient, eventId: string | null | undefined): Promise<void> {
  if (!eventId) return
  const now = new Date().toISOString()
  await supabase.from("calendar_events").update({ removed_at: now }).eq("id", eventId)
}

export async function syncOutOfOfficeToCalendar(
  supabase: SupabaseClient,
  accountUserId: string,
  assigneeUserId: string,
  ooo: EmailClientOutOfOffice,
  existingEventId?: string | null,
): Promise<string | null> {
  if (!ooo.syncCalendar || !ooo.enabled || !ooo.startAt || !ooo.endAt) {
    await removeWorkforceCalendarBlock(supabase, existingEventId)
    return null
  }
  return upsertWorkforceCalendarBlock(supabase, {
    accountUserId,
    assigneeUserId,
    title: "Out of office",
    startAt: ooo.startAt,
    endAt: ooo.endAt,
    kind: "out_of_office",
    sourceId: `ooo:${assigneeUserId}`,
    notes: ooo.message.slice(0, 500),
    existingEventId,
  })
}

export async function syncApprovedPtoToCalendar(
  supabase: SupabaseClient,
  accountUserId: string,
  request: PtoRequest,
): Promise<string | null> {
  if (request.status !== "approved" || !request.startAt || !request.endAt) return null
  return upsertWorkforceCalendarBlock(supabase, {
    accountUserId,
    assigneeUserId: request.userId,
    title: "PTO",
    startAt: request.startAt,
    endAt: request.endAt,
    kind: "pto",
    sourceId: `pto:${request.id}`,
    notes: request.note?.trim() || undefined,
    existingEventId: request.calendarEventId,
  })
}

export async function enableEmailOutOfOfficeForPto(
  supabase: SupabaseClient,
  userId: string,
  request: PtoRequest,
  accountUserId?: string,
): Promise<void> {
  if (!request.createOutOfOfficeEmail || request.status !== "approved") return
  const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const prevWs = parseEmailClientWorkspace(meta)
  const ooo = {
    enabled: true,
    message: `I am out of the office until ${new Date(request.endAt).toLocaleDateString()}. I will respond when I return.`,
    startAt: request.startAt,
    endAt: request.endAt,
    shareWithOrg: true,
    syncCalendar: true,
    calendarEventId: prevWs.outOfOffice.calendarEventId ?? null,
  }
  const nextMeta = mergeEmailClientWorkspace(meta, { outOfOffice: ooo })
  await supabase.from("profiles").update({ metadata: nextMeta }).eq("id", userId)

  if (ooo.syncCalendar && accountUserId) {
    const eventId = await syncOutOfOfficeToCalendar(supabase, accountUserId, userId, ooo, ooo.calendarEventId)
    if (eventId && eventId !== ooo.calendarEventId) {
      const withCal = mergeEmailClientWorkspace(nextMeta, {
        outOfOffice: { ...ooo, calendarEventId: eventId },
      })
      await supabase.from("profiles").update({ metadata: withCal }).eq("id", userId)
    }
  }
}
