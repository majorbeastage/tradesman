import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

function extractMessageIdsFromBody(body: string | null | undefined): string[] {
  if (!body) return []
  const out: string[] = []
  const re = /\[Message-ID:\s*([^\]]+)\]/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const t = m[1].trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

function normalizeMessageIdToken(id: string): string {
  const t = id.trim()
  if (!t) return ""
  return t.startsWith("<") ? t : `<${t.replace(/^<|>$/g, "")}>`
}

export function extractMessageIdsFromHeaders(headers: Record<string, unknown> | null | undefined): string[] {
  if (!headers || typeof headers !== "object") return []
  const keys = ["in-reply-to", "references", "message-id", "In-Reply-To", "References", "Message-ID"]
  const out: string[] = []
  const pushToken = (raw: string) => {
    const matches = raw.match(/<[^>]+>/g)
    if (matches) {
      for (const m of matches) {
        const t = m.trim()
        if (t && !out.includes(t)) out.push(t)
      }
      return
    }
    const t = raw.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  for (const key of keys) {
    const v = headers[key]
    if (typeof v === "string" && v.trim()) pushToken(v)
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim()) pushToken(item)
      }
    }
  }
  return out
}

type CommEventRow = {
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

export async function findConversationIdByEmailThread(
  supabase: SupabaseClient,
  userId: string,
  messageIds: string[],
): Promise<string | null> {
  const ids = [...new Set(messageIds.map((x) => x.trim()).filter(Boolean))]
  if (!ids.length || !userId) return null

  const { data, error } = await supabase
    .from("communication_events")
    .select("conversation_id, metadata, body, external_id")
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
