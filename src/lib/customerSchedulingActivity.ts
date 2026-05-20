import type { SupabaseClient } from "@supabase/supabase-js"

/** Record estimate → calendar scheduling on the customer timeline (email channel log). */
export async function logEstimateScheduledCommunicationEvent(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  opts: {
    title: string
    startAtIso: string
    quoteId: string
    calendarEventIds: string[]
    conversationId?: string | null
  },
): Promise<void> {
  const cid = customerId.trim()
  if (!cid || !userId.trim()) return
  const when = new Date(opts.startAtIso)
  const whenLabel = Number.isNaN(when.getTime())
    ? opts.startAtIso
    : when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
  const body = [
    `Estimate scheduled on calendar: ${opts.title.trim() || "Job"}`,
    `When: ${whenLabel}`,
    opts.quoteId ? `Estimate ID: ${opts.quoteId.slice(0, 8)}…` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const { error } = await supabase.from("communication_events").insert({
    user_id: userId,
    customer_id: cid,
    conversation_id: opts.conversationId ?? null,
    event_type: "email",
    direction: "outbound",
    subject: "Estimate scheduled on calendar",
    body,
    unread: false,
    metadata: {
      source: "estimate_scheduled",
      quote_id: opts.quoteId,
      calendar_event_ids: opts.calendarEventIds,
    },
  })
  if (error) console.warn("[customerSchedulingActivity] communication_events", error.message)
}

export async function bumpCustomerLastActivityAt(
  supabase: SupabaseClient,
  customerId: string,
): Promise<void> {
  const cid = customerId.trim()
  if (!cid) return
  const nowIso = new Date().toISOString()
  const { error } = await supabase.from("customers").update({ last_activity_at: nowIso }).eq("id", cid)
  if (error && !String(error.message || "").toLowerCase().includes("last_activity")) {
    console.warn("[customerSchedulingActivity] last_activity_at", error.message)
  }
}

export type CustomerCalendarEventRow = {
  id: string
  title: string
  start_at: string
  end_at: string
  quote_id: string | null
  notes: string | null
  completed_at: string | null
}

export async function loadCustomerCalendarEvents(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  limit = 24,
): Promise<CustomerCalendarEventRow[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, title, start_at, end_at, quote_id, notes, completed_at")
    .eq("user_id", userId)
    .eq("customer_id", customerId.trim())
    .is("removed_at", null)
    .order("start_at", { ascending: false })
    .limit(limit)
  if (error) {
    console.warn("[customerSchedulingActivity] calendar_events", error.message)
    return []
  }
  return (data ?? []) as CustomerCalendarEventRow[]
}
