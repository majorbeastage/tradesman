/** Safe text for UI — nested JSON becomes readable text, never "[object Object]". */
export function formatDisplayText(value: unknown, fallback = ""): string {
  if (value == null) return fallback
  if (typeof value === "string") {
    const t = value.trim()
    return t || fallback
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((v) => formatDisplayText(v, "")).filter(Boolean)
    return parts.length ? parts.join(", ") : fallback
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>
    for (const key of ["text", "value", "email", "message", "body", "subject", "label", "name", "description", "content"]) {
      if (key in o) {
        const inner = formatDisplayText(o[key], "")
        if (inner) return inner
      }
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return fallback
    }
  }
  return fallback
}
