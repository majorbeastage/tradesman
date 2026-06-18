import type { SupabaseClient } from "@supabase/supabase-js"
import { extractMessageIdsFromBody, normalizeMessageIdToken } from "./_emailThreadHeaders.js"

type CommEventRow = {
  id: string
  conversation_id: string | null
  metadata: unknown
  body: string | null
  external_id: string | null
}

function metaMessageIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return []
  const m = metadata as Record<string, unknown>
  const out: string[] = []
  for (const key of ["message_id", "resend_send_id", "resend_email_id"]) {
    const v = m[key]
    if (typeof v === "string" && v.trim()) {
      const t = normalizeMessageIdToken(v.trim())
      if (t && !out.includes(t)) out.push(t)
      if (v.trim() && !out.includes(v.trim())) out.push(v.trim())
    }
  }
  return out
}

function eventMatchesAnyId(row: CommEventRow, needles: string[]): boolean {
  const normalizedNeedles = new Set(needles.map((n) => n.trim()).filter(Boolean))
  if (normalizedNeedles.size === 0) return false
  for (const id of metaMessageIds(row.metadata)) {
    if (normalizedNeedles.has(id) || normalizedNeedles.has(normalizeMessageIdToken(id))) return true
  }
  if (row.external_id && normalizedNeedles.has(row.external_id)) return true
  for (const id of extractMessageIdsFromBody(row.body)) {
    if (normalizedNeedles.has(id) || normalizedNeedles.has(normalizeMessageIdToken(id))) return true
  }
  return false
}

/**
 * If inbound mail replies to a prior Tradesman outbound, attach to that conversation.
 */
export async function findConversationIdByEmailThread(
  supabase: SupabaseClient,
  userId: string,
  messageIds: string[],
): Promise<string | null> {
  const ids = [...new Set(messageIds.map((x) => x.trim()).filter(Boolean))]
  if (!ids.length || !userId) return null

  const { data, error } = await supabase
    .from("communication_events")
    .select("id, conversation_id, metadata, body, external_id")
    .eq("user_id", userId)
    .eq("event_type", "email")
    .order("created_at", { ascending: false })
    .limit(80)

  if (error) throw error
  for (const row of (data ?? []) as CommEventRow[]) {
    if (!row.conversation_id) continue
    if (eventMatchesAnyId(row, ids)) return String(row.conversation_id)
  }
  return null
}
