/** RFC 5322 Message-ID tokens from email headers (shared by Vercel + Edge). */

export function parseEmailAddressFromHeader(from: string): string {
  const trimmed = from.trim()
  const angle = trimmed.match(/<([^>]+)>/)
  return (angle ? angle[1] : trimmed).trim().toLowerCase()
}

export function extractBareEmailFromFormattedFrom(from: string): string {
  return parseEmailAddressFromHeader(from)
}

/** Pull Message-ID values from In-Reply-To, References, and related headers. */
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

/** Message-IDs embedded in stored message bodies (`[Message-ID: …]`). */
export function extractMessageIdsFromBody(body: string | null | undefined): string[] {
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

export function normalizeMessageIdToken(id: string): string {
  const t = id.trim()
  if (!t) return ""
  return t.startsWith("<") ? t : `<${t.replace(/^<|>$/g, "")}>`
}
