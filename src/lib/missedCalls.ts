import type { SupabaseClient } from "@supabase/supabase-js"

export type MissedCallRow = {
  id: string
  callee_id: string
  caller_id: string
  caller_name: string | null
  video: boolean
  room_id: string | null
  status: "missed" | "declined" | "canceled"
  seen_at: string | null
  created_at: string
}

export async function recordMissedCall(
  client: SupabaseClient,
  params: {
    calleeId: string
    callerId: string
    callerName: string
    video: boolean
    roomId?: string | null
    status?: "missed" | "declined" | "canceled"
    /** When true, nudge the callee via Messaging push. */
    notify?: boolean
  },
): Promise<{ id: string | null }> {
  const status = params.status ?? "missed"
  const { data, error } = await client
    .from("internal_missed_calls")
    .insert({
      callee_id: params.calleeId,
      caller_id: params.callerId,
      caller_name: params.callerName || null,
      video: params.video,
      room_id: params.roomId ?? null,
      status,
    })
    .select("id")
    .maybeSingle()
  if (error) {
    console.warn("[missed-call] insert", error.message)
    return { id: null }
  }
  const id = (data?.id as string | undefined) ?? null
  if (id && params.notify !== false && status === "missed") {
    try {
      await client.functions.invoke("notify-missed-call", { body: { missedCallId: id } })
    } catch (e) {
      console.warn("[missed-call] notify", e)
    }
  }
  return { id }
}

export async function loadMissedCalls(
  client: SupabaseClient,
  calleeId: string,
  limit = 40,
): Promise<MissedCallRow[]> {
  const { data, error } = await client
    .from("internal_missed_calls")
    .select("id, callee_id, caller_id, caller_name, video, room_id, status, seen_at, created_at")
    .eq("callee_id", calleeId)
    .eq("status", "missed")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    console.warn("[missed-call] load", error.message)
    return []
  }
  return (data ?? []) as MissedCallRow[]
}

export async function markMissedCallsSeen(client: SupabaseClient, calleeId: string, ids?: string[]): Promise<void> {
  let q = client
    .from("internal_missed_calls")
    .update({ seen_at: new Date().toISOString() })
    .eq("callee_id", calleeId)
    .is("seen_at", null)
  if (ids?.length) q = q.in("id", ids)
  const { error } = await q
  if (error) console.warn("[missed-call] mark seen", error.message)
}

export async function dismissMissedCall(client: SupabaseClient, calleeId: string, id: string): Promise<void> {
  const { error } = await client.from("internal_missed_calls").delete().eq("id", id).eq("callee_id", calleeId)
  if (error) console.warn("[missed-call] dismiss", error.message)
}

export function formatMissedCallWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  if (sameDay) return time
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`
}
