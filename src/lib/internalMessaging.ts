import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Internal member-to-member instant messaging (org team chat).
 * Backed by the internal_messages table (see supabase/internal-messaging.sql).
 * Kept fully separate from customer conversations/messages.
 */

export type InternalMessage = {
  id: string
  created_at: string
  sender_id: string
  recipient_id: string
  body: string
  read_at: string | null
}

const COLS = "id, created_at, sender_id, recipient_id, body, read_at"

/** True when the backend table is missing (migration not yet run). */
export function isInternalMessagingUnavailable(message: string | null | undefined): boolean {
  return /internal_messages|does not exist|relation|schema cache/i.test(message ?? "")
}

/** All messages between the signed-in user and one other member, oldest first. */
export async function loadConversation(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
  other: string | null | undefined,
  limit = 200,
): Promise<{ messages: InternalMessage[]; unavailable: boolean }> {
  if (!supabase || !me || !other) return { messages: [], unavailable: false }
  try {
    const { data, error } = await supabase
      .from("internal_messages")
      .select(COLS)
      .or(
        `and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`,
      )
      .order("created_at", { ascending: true })
      .limit(limit)
    if (error) {
      return { messages: [], unavailable: isInternalMessagingUnavailable(error.message) }
    }
    return { messages: (data ?? []) as InternalMessage[], unavailable: false }
  } catch {
    return { messages: [], unavailable: false }
  }
}

export async function sendInternalMessage(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
  other: string | null | undefined,
  body: string,
): Promise<{ ok: boolean; message?: InternalMessage; error?: string }> {
  if (!supabase || !me || !other) return { ok: false, error: "Not signed in." }
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: "Empty message." }
  try {
    const { data, error } = await supabase
      .from("internal_messages")
      .insert({ sender_id: me, recipient_id: other, body: trimmed })
      .select(COLS)
      .single()
    if (error) {
      return { ok: false, error: isInternalMessagingUnavailable(error.message) ? "Messaging is not set up yet." : error.message }
    }
    return { ok: true, message: data as InternalMessage }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Mark all messages from `other` to me as read. */
export async function markConversationRead(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
  other: string | null | undefined,
): Promise<void> {
  if (!supabase || !me || !other) return
  try {
    await supabase
      .from("internal_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", me)
      .eq("sender_id", other)
      .is("read_at", null)
  } catch {
    /* best-effort */
  }
}

/** Unread counts keyed by the sending member id. */
export async function loadUnreadBySender(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
): Promise<Record<string, number>> {
  if (!supabase || !me) return {}
  try {
    const { data, error } = await supabase
      .from("internal_messages")
      .select("sender_id")
      .eq("recipient_id", me)
      .is("read_at", null)
      .limit(1000)
    if (error) return {}
    const counts: Record<string, number> = {}
    for (const row of (data ?? []) as { sender_id: string }[]) {
      counts[row.sender_id] = (counts[row.sender_id] ?? 0) + 1
    }
    return counts
  } catch {
    return {}
  }
}
