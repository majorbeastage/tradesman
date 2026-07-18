import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Internal member-to-member instant messaging (org team chat): 1:1 + ad-hoc groups,
 * with optional customer *references* (a clickable card in chat — never messages the customer).
 * Backed by internal_threads / internal_thread_members / internal_messages
 * (see supabase/internal-messaging.sql). Separate from customer conversations/messages.
 */

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

export function isInternalMessagingUnavailable(message: string | null | undefined): boolean {
  // Only treat "table/function truly missing" errors as not-set-up. Do NOT match
  // messages that merely name the table (e.g. RLS "violates row-level security
  // policy for table internal_threads") — those mean it IS set up but the write
  // was rejected, and should surface their real message instead.
  return /(does not exist|schema cache|could not find the (table|function)|PGRST20[25])/i.test(message ?? "")
}

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

/** Load my threads with members, last message, and unread count — one pass. */
export async function loadThreadsWithMeta(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
): Promise<{ threads: ThreadSummary[]; unavailable: boolean }> {
  if (!supabase || !me) return { threads: [], unavailable: false }
  try {
    const { data: myMemberRows, error: mErr } = await supabase
      .from("internal_thread_members")
      .select("thread_id, last_read_at")
      .eq("user_id", me)
    if (mErr) return { threads: [], unavailable: isInternalMessagingUnavailable(mErr.message) }

    const threadIds = [...new Set((myMemberRows ?? []).map((r) => r.thread_id as string))]
    if (threadIds.length === 0) return { threads: [], unavailable: false }
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
    return { threads, unavailable: false }
  } catch {
    return { threads: [], unavailable: false }
  }
}

export async function loadThreadMessages(
  supabase: SupabaseClient | null,
  threadId: string | null | undefined,
  limit = 300,
): Promise<InternalMessage[]> {
  if (!supabase || !threadId) return []
  try {
    const { data, error } = await supabase
      .from("internal_messages")
      .select(MSG_COLS)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(limit)
    if (error) return []
    return ((data ?? []) as Record<string, unknown>[]).map(mapMessage)
  } catch {
    return []
  }
}

export async function sendThreadMessage(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
  threadId: string | null | undefined,
  body: string,
  customerRef?: CustomerRef | null,
): Promise<{ ok: boolean; message?: InternalMessage; error?: string }> {
  if (!supabase || !me || !threadId) return { ok: false, error: "Not signed in." }
  const trimmed = body.trim()
  if (!trimmed && !customerRef) return { ok: false, error: "Empty message." }
  try {
    const { data, error } = await supabase
      .from("internal_messages")
      .insert({ thread_id: threadId, sender_id: me, body: trimmed || (customerRef ? `Shared ${customerRef.name}` : ""), customer_ref: customerRef ?? null })
      .select(MSG_COLS)
      .single()
    if (error) return { ok: false, error: isInternalMessagingUnavailable(error.message) ? "Messaging is not set up yet." : error.message }
    return { ok: true, message: mapMessage(data as Record<string, unknown>) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function markThreadRead(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
  threadId: string | null | undefined,
): Promise<void> {
  if (!supabase || !me || !threadId) return
  try {
    await supabase
      .from("internal_thread_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("user_id", me)
  } catch {
    /* best-effort */
  }
}

/** Find an existing 1:1 thread with `other`, else create one. Returns the thread id. */
export async function findOrCreateDirectThread(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
  other: string | null | undefined,
): Promise<{ threadId: string | null; error?: string }> {
  if (!supabase || !me || !other) return { threadId: null, error: "Not signed in." }
  try {
    // Threads I'm in that are non-group and also contain `other`, with exactly 2 members.
    const { data: myRows } = await supabase.from("internal_thread_members").select("thread_id").eq("user_id", me)
    const myThreadIds = [...new Set((myRows ?? []).map((r) => r.thread_id as string))]
    if (myThreadIds.length) {
      const { data: threadRows } = await supabase
        .from("internal_threads")
        .select("id, is_group")
        .in("id", myThreadIds)
        .eq("is_group", false)
      const directIds = (threadRows ?? []).map((r) => r.id as string)
      if (directIds.length) {
        const { data: memRows } = await supabase
          .from("internal_thread_members")
          .select("thread_id, user_id")
          .in("thread_id", directIds)
        const byThread = new Map<string, Set<string>>()
        for (const r of (memRows ?? []) as { thread_id: string; user_id: string }[]) {
          const s = byThread.get(r.thread_id) ?? new Set<string>()
          s.add(r.user_id)
          byThread.set(r.thread_id, s)
        }
        for (const [tid, set] of byThread) {
          if (set.size === 2 && set.has(me) && set.has(other)) return { threadId: tid }
        }
      }
    }

    const { data: newId, error: rpcErr } = await supabase.rpc("create_internal_thread", {
      p_is_group: false,
      p_title: null,
      p_member_ids: [other],
    })
    if (rpcErr || !newId) {
      return {
        threadId: null,
        error: rpcErr ? (isInternalMessagingUnavailable(rpcErr.message) ? "Messaging is not set up yet." : rpcErr.message) : "Could not start chat.",
      }
    }
    return { threadId: newId as string }
  } catch (e) {
    return { threadId: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function createGroupThread(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
  memberIds: string[],
  title: string,
): Promise<{ threadId: string | null; error?: string }> {
  if (!supabase || !me) return { threadId: null, error: "Not signed in." }
  const others = [...new Set(memberIds.filter((id) => id && id !== me))]
  if (others.length === 0) return { threadId: null, error: "Pick at least one member." }
  try {
    const { data: newId, error: rpcErr } = await supabase.rpc("create_internal_thread", {
      p_is_group: true,
      p_title: title.trim() || "Group chat",
      p_member_ids: others,
    })
    if (rpcErr || !newId) {
      return {
        threadId: null,
        error: rpcErr ? (isInternalMessagingUnavailable(rpcErr.message) ? "Messaging is not set up yet." : rpcErr.message) : "Could not create group.",
      }
    }
    return { threadId: newId as string }
  } catch (e) {
    return { threadId: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export type MessengerCustomer = { id: string; name: string; phone: string | null }

/** Search the signed-in user's customers to reference in chat or dial. */
export async function searchMessengerCustomers(
  supabase: SupabaseClient | null,
  me: string | null | undefined,
  query: string,
  limit = 20,
): Promise<MessengerCustomer[]> {
  if (!supabase || !me) return []
  try {
    let q = supabase
      .from("customers")
      .select("id, display_name, customer_identifiers ( type, value )")
      .eq("user_id", me)
    const trimmed = query.trim()
    if (trimmed) q = q.ilike("display_name", `%${trimmed}%`)
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(limit)
    if (error) return []
    return (
      (data ?? []) as {
        id: string
        display_name: string | null
        customer_identifiers?: { type: string; value: string }[] | null
      }[]
    ).map((r) => {
      const phone =
        r.customer_identifiers?.find((i) => i.type === "phone" && String(i.value ?? "").trim())?.value?.trim() ?? null
      return {
        id: r.id,
        name: r.display_name?.trim() || "Unnamed customer",
        phone,
      }
    })
  } catch {
    return []
  }
}
