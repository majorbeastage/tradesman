import type { SupabaseClient } from "@supabase/supabase-js"

/** Shared with the main platform (src/lib/internalMessaging.ts). Keep in sync. */

export type CustomerRef = { customerId: string; name: string }

export type InternalMessage = {
  id: string
  created_at: string
  thread_id: string
  sender_id: string
  body: string
  customer_ref: CustomerRef | null
}

export type InternalThread = {
  id: string
  is_group: boolean
  title: string | null
  created_by: string
  members: string[]
  myLastReadAt: string | null
}

export type ThreadSummary = InternalThread & {
  lastMessage: InternalMessage | null
  unread: number
}

const MSG_COLS = "id, created_at, thread_id, sender_id, body, customer_ref"

function parseCustomerRef(raw: unknown): CustomerRef | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const customerId = typeof o.customerId === "string" ? o.customerId : null
  const name = typeof o.name === "string" ? o.name : null
  if (!customerId) return null
  return { customerId, name: name ?? "Customer" }
}

function mapMessage(row: Record<string, unknown>): InternalMessage {
  return {
    id: row.id as string,
    created_at: row.created_at as string,
    thread_id: row.thread_id as string,
    sender_id: row.sender_id as string,
    body: (row.body as string) ?? "",
    customer_ref: parseCustomerRef(row.customer_ref),
  }
}

export async function loadThreadsWithMeta(
  supabase: SupabaseClient,
  me: string,
): Promise<ThreadSummary[]> {
  const { data: myMemberRows, error } = await supabase
    .from("internal_thread_members")
    .select("thread_id, last_read_at")
    .eq("user_id", me)
  if (error) return []

  const threadIds = [...new Set((myMemberRows ?? []).map((r) => r.thread_id as string))]
  if (threadIds.length === 0) return []
  const lastReadByThread = new Map<string, string | null>()
  for (const r of myMemberRows ?? []) lastReadByThread.set(r.thread_id as string, (r.last_read_at as string) ?? null)

  const [threadsRes, membersRes, msgsRes] = await Promise.all([
    supabase.from("internal_threads").select("id, is_group, title, created_by").in("id", threadIds),
    supabase.from("internal_thread_members").select("thread_id, user_id").in("thread_id", threadIds),
    supabase.from("internal_messages").select(MSG_COLS).in("thread_id", threadIds).order("created_at", { ascending: false }).limit(500),
  ])

  const membersByThread = new Map<string, string[]>()
  for (const r of (membersRes.data ?? []) as { thread_id: string; user_id: string }[]) {
    const arr = membersByThread.get(r.thread_id) ?? []
    arr.push(r.user_id)
    membersByThread.set(r.thread_id, arr)
  }

  const lastMsgByThread = new Map<string, InternalMessage>()
  const unreadByThread = new Map<string, number>()
  for (const raw of (msgsRes.data ?? []) as Record<string, unknown>[]) {
    const m = mapMessage(raw)
    if (!lastMsgByThread.has(m.thread_id)) lastMsgByThread.set(m.thread_id, m)
    const lastRead = lastReadByThread.get(m.thread_id) ?? null
    const isUnread = m.sender_id !== me && (!lastRead || new Date(m.created_at).getTime() > new Date(lastRead).getTime())
    if (isUnread) unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1)
  }

  const threads: ThreadSummary[] = ((threadsRes.data ?? []) as Record<string, unknown>[]).map((t) => {
    const id = t.id as string
    return {
      id,
      is_group: Boolean(t.is_group),
      title: (t.title as string) ?? null,
      created_by: t.created_by as string,
      members: membersByThread.get(id) ?? [],
      myLastReadAt: lastReadByThread.get(id) ?? null,
      lastMessage: lastMsgByThread.get(id) ?? null,
      unread: unreadByThread.get(id) ?? 0,
    }
  })

  threads.sort((a, b) => {
    const at = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0
    const bt = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0
    return bt - at
  })
  return threads
}

export async function loadThreadMessages(supabase: SupabaseClient, threadId: string, limit = 300): Promise<InternalMessage[]> {
  const { data, error } = await supabase
    .from("internal_messages")
    .select(MSG_COLS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map(mapMessage)
}

export async function sendThreadMessage(
  supabase: SupabaseClient,
  me: string,
  threadId: string,
  body: string,
): Promise<InternalMessage | null> {
  const trimmed = body.trim()
  if (!trimmed) return null
  const { data, error } = await supabase
    .from("internal_messages")
    .insert({ thread_id: threadId, sender_id: me, body: trimmed })
    .select(MSG_COLS)
    .single()
  if (error || !data) return null
  return mapMessage(data as Record<string, unknown>)
}

export async function markThreadRead(supabase: SupabaseClient, me: string, threadId: string): Promise<void> {
  try {
    await supabase.from("internal_thread_members").update({ last_read_at: new Date().toISOString() }).eq("thread_id", threadId).eq("user_id", me)
  } catch {
    /* best-effort */
  }
}

export async function findOrCreateDirectThread(supabase: SupabaseClient, me: string, other: string): Promise<string | null> {
  const { data: myRows } = await supabase.from("internal_thread_members").select("thread_id").eq("user_id", me)
  const myThreadIds = [...new Set((myRows ?? []).map((r) => r.thread_id as string))]
  if (myThreadIds.length) {
    const { data: threadRows } = await supabase.from("internal_threads").select("id, is_group").in("id", myThreadIds).eq("is_group", false)
    const directIds = (threadRows ?? []).map((r) => r.id as string)
    if (directIds.length) {
      const { data: memRows } = await supabase.from("internal_thread_members").select("thread_id, user_id").in("thread_id", directIds)
      const byThread = new Map<string, Set<string>>()
      for (const r of (memRows ?? []) as { thread_id: string; user_id: string }[]) {
        const s = byThread.get(r.thread_id) ?? new Set<string>()
        s.add(r.user_id)
        byThread.set(r.thread_id, s)
      }
      for (const [tid, set] of byThread) {
        if (set.size === 2 && set.has(me) && set.has(other)) return tid
      }
    }
  }
  const { data: created, error } = await supabase.from("internal_threads").insert({ created_by: me, is_group: false }).select("id").single()
  if (error || !created) return null
  const threadId = created.id as string
  const { error: memErr } = await supabase.from("internal_thread_members").insert([{ thread_id: threadId, user_id: me }, { thread_id: threadId, user_id: other }])
  if (memErr) return null
  return threadId
}

export async function loadPeerNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return map
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", unique)
  for (const r of (data ?? []) as { id: string; display_name: string | null }[]) map.set(r.id, r.display_name?.trim() || "Member")
  return map
}

export async function loadOrgPeers(supabase: SupabaseClient, me: string): Promise<{ id: string; name: string }[]> {
  const { data: self } = await supabase.from("profiles").select("client_id").eq("id", me).maybeSingle()
  const clientId = (self?.client_id as string) || "00000000-0000-0000-0000-000000000001"
  const { data } = await supabase.from("profiles").select("id, display_name").eq("client_id", clientId).neq("id", me)
  return ((data ?? []) as { id: string; display_name: string | null }[])
    .map((r) => ({ id: r.id, name: r.display_name?.trim() || "Member" }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
