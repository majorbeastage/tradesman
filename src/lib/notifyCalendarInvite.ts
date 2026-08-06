import type { SupabaseClient } from "@supabase/supabase-js"

export type CalendarInviteKind = "assign" | "video" | "both"

/** Best-effort: notify teammates they were assigned or invited to a calendar event / call. */
export async function notifyCalendarInvitees(
  supabase: SupabaseClient,
  eventId: string,
  recipientUserIds: string[],
  inviteKind: CalendarInviteKind = "assign",
): Promise<void> {
  const ids = [...new Set(recipientUserIds.map((x) => x.trim()).filter(Boolean))]
  if (!eventId.trim() || ids.length === 0) return
  try {
    await supabase.functions.invoke("notify-calendar-invite", {
      body: { eventId: eventId.trim(), recipientUserIds: ids, inviteKind },
    })
  } catch {
    /* best-effort */
  }
}
