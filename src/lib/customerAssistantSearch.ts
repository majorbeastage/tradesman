import type { SupabaseClient } from "@supabase/supabase-js"

export type CustomerSearchHit = {
  id: string
  display_name: string
  phone?: string
  email?: string
}

/** Extract a name/query from natural language customer lookup phrases. */
export function extractCustomerSearchQuery(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  const patterns = [
    /\b(?:open|find|show|view|go\s+to|pull\s+up|load)\s+(?:the\s+)?(?:customer|client)\s+(.+)/i,
    /\b(?:customer|client)\s+(?:named\s+|called\s+)?(.+)/i,
    /^(.+?)(?:'s|’s)?\s+(?:customer|client)\s*(?:record|file|profile)?\s*$/i,
    /\bfor\s+(.+?)\s*$/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m?.[1]) {
      const q = m[1].replace(/\b(please|now|up)\b/gi, "").trim()
      if (q.length >= 2) return q.slice(0, 80)
    }
  }
  if (/\b(customer|client)\b/i.test(text)) {
    const stripped = text.replace(/\b(open|find|show|view|go to|customer|client|the|my|a)\b/gi, " ").trim()
    if (stripped.length >= 2) return stripped.slice(0, 80)
  }
  return null
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function scoreName(query: string, displayName: string | null): number {
  const q = normalizeName(query)
  const n = normalizeName(displayName ?? "")
  if (!q || !n) return 0
  if (n === q) return 100
  if (n.startsWith(q) || q.startsWith(n)) return 88
  if (n.includes(q) || q.includes(n)) return 75
  const qParts = q.split(" ").filter(Boolean)
  if (qParts.length > 1 && qParts.every((p) => n.includes(p))) return 82
  return 0
}

export async function searchCustomersByQuery(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit = 8,
): Promise<CustomerSearchHit[]> {
  const q = query.trim()
  if (!q || !userId) return []

  const { data, error } = await supabase
    .from("customers")
    .select("id, display_name, customer_identifiers(type, value)")
    .eq("user_id", userId)
    .ilike("display_name", `%${q}%`)
    .order("display_name", { ascending: true })
    .limit(Math.min(limit, 12))

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Array<{
    id: string
    display_name: string | null
    customer_identifiers?: Array<{ type: string; value: string | null }>
  }>

  const scored = rows
    .map((row) => {
      const ids = row.customer_identifiers ?? []
      return {
        id: row.id,
        display_name: row.display_name?.trim() || "Unnamed customer",
        phone: ids.find((i) => i.type === "phone")?.value?.trim(),
        email: ids.find((i) => i.type === "email")?.value?.trim(),
        score: scoreName(q, row.display_name),
      }
    })
    .filter((r) => r.score >= 65)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, limit).map(({ id, display_name, phone, email }) => ({
    id,
    display_name,
    phone,
    email,
  }))
}
