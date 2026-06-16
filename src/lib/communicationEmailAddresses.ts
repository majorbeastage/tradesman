import { formatDisplayText } from "./formatDisplayText"

function emailFromUnknown(value: unknown): string | null {
  const text = formatDisplayText(value, "")
  if (!text || !text.includes("@")) return null
  const match = text.match(/[^\s<>,"]+@[^\s<>,"]+/)
  return match?.[0]?.trim().toLowerCase() ?? null
}

export function parseEmailAddressList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()]
  if (Array.isArray(value)) {
    return value.flatMap((v) => {
      if (typeof v === "string" && v.trim()) return [v.trim()]
      const parsed = emailFromUnknown(v)
      return parsed ? [parsed] : []
    })
  }
  const parsed = emailFromUnknown(value)
  return parsed ? [parsed] : []
}

export function extractCommEventEmailAddresses(metadata: unknown): { from: string | null; to: string[] } {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {}
  const fromRaw = meta.from ?? meta.from_email ?? meta.sender ?? null
  const from =
    typeof fromRaw === "string" && fromRaw.trim()
      ? fromRaw.trim()
      : emailFromUnknown(fromRaw)
  const to = parseEmailAddressList(meta.to ?? meta.to_email)
  return { from, to }
}

export function formatCommEventEmailFromLabel(ev: {
  event_type?: string | null
  metadata?: unknown
}): string | null {
  if (ev.event_type !== "email") return null
  return extractCommEventEmailAddresses(ev.metadata).from
}

export function formatCommEventEmailAddressSummary(ev: {
  metadata?: unknown
}): string | null {
  const { from, to } = extractCommEventEmailAddresses(ev.metadata)
  const parts: string[] = []
  if (from) parts.push(`From: ${from}`)
  if (to.length) parts.push(`To: ${to.join(", ")}`)
  return parts.length ? parts.join(" · ") : null
}
