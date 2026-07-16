import type { SupabaseClient } from "@supabase/supabase-js"
import { parseNotificationPrefs, triggerWantsDesktop, type NotificationTriggerId } from "./notificationPrefs"

export type UserNotificationKind = NotificationTriggerId

export type UserNotification = {
  id: string
  created_at: string
  read_at: string | null
  user_id: string
  kind: string
  title: string
  body: string | null
  customer_id: string | null
  quote_id: string | null
  calendar_event_id: string | null
  metadata: Record<string, unknown> | null
}

const SELECT_COLS = "id, created_at, read_at, user_id, kind, title, body, customer_id, quote_id, calendar_event_id, metadata"

/** True when the notifications backend is missing (table not yet created). */
function isMissingTableError(message: string | null | undefined): boolean {
  return /user_notifications|does not exist|relation|schema cache/i.test(message ?? "")
}

export async function loadUserNotifications(
  supabase: SupabaseClient | null,
  userId: string | null | undefined,
  limit = 40,
): Promise<UserNotification[]> {
  if (!supabase || !userId) return []
  try {
    const { data, error } = await supabase
      .from("user_notifications")
      .select(SELECT_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) {
      if (isMissingTableError(error.message)) return []
      throw error
    }
    return (data ?? []) as UserNotification[]
  } catch {
    return []
  }
}

export async function markNotificationRead(supabase: SupabaseClient | null, id: string): Promise<void> {
  if (!supabase || !id) return
  try {
    await supabase.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null)
  } catch {
    /* best-effort */
  }
}

export async function markAllNotificationsRead(supabase: SupabaseClient | null, userId: string | null | undefined): Promise<void> {
  if (!supabase || !userId) return
  try {
    await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null)
  } catch {
    /* best-effort */
  }
}

export async function deleteNotification(supabase: SupabaseClient | null, id: string): Promise<void> {
  if (!supabase || !id) return
  try {
    await supabase.from("user_notifications").delete().eq("id", id)
  } catch {
    /* best-effort */
  }
}

export type EmitNotificationInput = {
  ownerUserId: string
  kind: UserNotificationKind
  title: string
  body?: string | null
  customerId?: string | null
  quoteId?: string | null
  calendarEventId?: string | null
  /** Which page to open on click (defaults derived from kind). */
  page?: string
}

function defaultPageForKind(kind: UserNotificationKind): string {
  switch (kind) {
    case "new_lead":
      return "leads"
    case "estimate_approved":
      return "quotes"
    case "calendar_upcoming":
    case "calendar_completed":
      return "calendar"
    default:
      return "customers"
  }
}

/**
 * Create a desktop notification-center row for `kind` when the owner has desktop
 * delivery enabled for it. Best-effort — never throws.
 * Returns true when a row was inserted.
 */
export async function emitUserNotification(
  supabase: SupabaseClient | null,
  input: EmitNotificationInput,
): Promise<boolean> {
  try {
    if (!supabase || !input.ownerUserId) return false
    const { data: profile } = await supabase
      .from("profiles")
      .select("metadata")
      .eq("id", input.ownerUserId)
      .maybeSingle()
    const prefs = parseNotificationPrefs((profile as { metadata?: unknown } | null)?.metadata)
    if (!triggerWantsDesktop(prefs, input.kind)) return false

    const { error } = await supabase.from("user_notifications").insert({
      user_id: input.ownerUserId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      customer_id: input.customerId ?? null,
      quote_id: input.quoteId ?? null,
      calendar_event_id: input.calendarEventId ?? null,
      metadata: { page: input.page ?? defaultPageForKind(input.kind) },
    })
    if (error) {
      if (isMissingTableError(error.message)) return false
      console.warn("[userNotifications] insert", error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn("[userNotifications]", e instanceof Error ? e.message : e)
    return false
  }
}
