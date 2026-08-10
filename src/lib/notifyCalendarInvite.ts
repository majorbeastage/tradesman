import type { SupabaseClient } from "@supabase/supabase-js"

export type CalendarInviteKind = "assign" | "video" | "both"

export type CalendarInviteNotifyResult = { ok: true } | { ok: false; error: string }

/** Notify teammates they were assigned or invited to a calendar event / call. */
export async function notifyCalendarInvitees(
  supabase: SupabaseClient,
  eventId: string,
  recipientUserIds: string[],
  inviteKind: CalendarInviteKind = "assign",
): Promise<CalendarInviteNotifyResult> {
  const ids = [...new Set(recipientUserIds.map((x) => x.trim()).filter(Boolean))]
  if (!eventId.trim() || ids.length === 0) return { ok: true }
  try {
    const { data, error } = await supabase.functions.invoke("notify-calendar-invite", {
      body: { eventId: eventId.trim(), recipientUserIds: ids, inviteKind },
    })
    if (error) {
      return { ok: false, error: error.message || "Calendar invite notification failed." }
    }
    const payload = data as { error?: string; ok?: boolean; notified?: number } | null
    if (payload?.error?.trim()) {
      return { ok: false, error: payload.error.trim() }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error:
        msg.includes("Failed to send a request to the Edge Function") ||
        msg.includes("Function not found")
          ? "Calendar invite service is not deployed. Run: supabase functions deploy notify-calendar-invite"
          : msg,
    }
  }
}
