/** Format customer notes fields for AI estimate / scope context packs. */

export type CustomerNotePastEntry = { id?: string; text: string; saved_at?: string }

export function parseCustomerNotesPast(raw: unknown): CustomerNotePastEntry[] {
  if (!Array.isArray(raw)) return []
  const out: CustomerNotePastEntry[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    if (typeof o.text !== "string" || !o.text.trim()) continue
    out.push({
      id: typeof o.id === "string" ? o.id : undefined,
      text: o.text.trim(),
      saved_at: typeof o.saved_at === "string" ? o.saved_at : undefined,
    })
  }
  return out
}

/** Flatten `notes_past` + legacy `notes` into a single text block for AI. */
export function formatCustomerNotesForAiPack(input: {
  notes?: string | null
  notes_past?: unknown
  maxChars?: number
}): string {
  const maxChars = input.maxChars ?? 6000
  const lines: string[] = []
  const past = parseCustomerNotesPast(input.notes_past)
    .slice()
    .sort((a, b) => String(b.saved_at ?? "").localeCompare(String(a.saved_at ?? "")))
  for (const n of past) {
    const when = n.saved_at
      ? (() => {
          try {
            return new Date(n.saved_at).toLocaleString()
          } catch {
            return n.saved_at
          }
        })()
      : ""
    lines.push(when ? `[${when}] ${n.text}` : n.text)
  }
  const legacy = typeof input.notes === "string" ? input.notes.trim() : ""
  if (legacy && past.length === 0) {
    lines.push(legacy)
  } else if (legacy && !past.some((n) => n.text === legacy)) {
    lines.push(`[older notes field] ${legacy}`)
  }
  return lines.join("\n\n").trim().slice(0, maxChars)
}
