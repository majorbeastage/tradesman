/** Best-effort COI expiration extraction from certificate text (PDF text layer or OCR paste). */

const DATE_PATTERNS = [
  /(?:policy\s*)?(?:expir(?:ation|es|y)|exp\.?\s*date|valid\s*(?:through|until|thru)|coverage\s*ends?)[:\s#-]*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/gi,
  /(?:policy\s*)?(?:expir(?:ation|es|y)|exp\.?\s*date|valid\s*(?:through|until|thru))[^0-9]{0,24}(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/gi,
]

const POLICY_NUMBER_PATTERN =
  /(?:policy\s*(?:number|no\.?|#)|policy\s*id)[:\s#-]*([A-Z0-9][A-Z0-9\-\/]{4,})/gi

function parseLooseDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const iso = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(t)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 23, 59, 59, 999)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  const us = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(t)
  if (us) {
    let y = Number(us[3])
    if (y < 100) y += y >= 70 ? 1900 : 2000
    const d = new Date(y, Number(us[1]) - 1, Number(us[2]), 23, 59, 59, 999)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  const parsed = Date.parse(t)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export function parseCoiExpirationFromText(text: string): string | null {
  const hay = text.slice(0, 120_000)
  for (const re of DATE_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(hay)) !== null) {
      const iso = parseLooseDate(m[1] ?? "")
      if (iso) return iso
    }
  }
  return null
}

export function parseCoiPolicyNumberFromText(text: string): string | null {
  const hay = text.slice(0, 80_000)
  POLICY_NUMBER_PATTERN.lastIndex = 0
  const m = POLICY_NUMBER_PATTERN.exec(hay)
  return m?.[1]?.trim() ?? null
}

export async function readCoiFileAsSearchText(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let out = ""
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i]
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) out += String.fromCharCode(c)
    }
    if (out.length > 500) return out
    return await file.text()
  } catch {
    try {
      return await file.text()
    } catch {
      return ""
    }
  }
}

export async function inferCoiMetadataFromFile(file: File): Promise<{
  expiresAt: string | null
  policyNumber: string | null
}> {
  const text = await readCoiFileAsSearchText(file)
  return {
    expiresAt: parseCoiExpirationFromText(text),
    policyNumber: parseCoiPolicyNumberFromText(text),
  }
}

export type CoiExpiryStatus = "ok" | "expiring_soon" | "expired" | "unknown"

export function coiExpiryStatus(expiresAt: string | null | undefined, now = Date.now()): CoiExpiryStatus {
  if (!expiresAt) return "unknown"
  const t = Date.parse(expiresAt)
  if (!Number.isFinite(t)) return "unknown"
  if (t < now) return "expired"
  const days = (t - now) / 86400000
  if (days <= 30) return "expiring_soon"
  return "ok"
}

export function formatCoiExpiryLabel(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "Expiration unknown"
  const t = Date.parse(expiresAt)
  if (!Number.isFinite(t)) return "Expiration unknown"
  const status = coiExpiryStatus(expiresAt)
  const date = new Date(t).toLocaleDateString(undefined, { dateStyle: "medium" })
  if (status === "expired") return `Expired ${date}`
  if (status === "expiring_soon") return `Expires ${date}`
  return `Valid through ${date}`
}

export function daysUntilCoiExpiry(expiresAt: string | null | undefined, now = Date.now()): number | null {
  if (!expiresAt) return null
  const t = Date.parse(expiresAt)
  if (!Number.isFinite(t)) return null
  return Math.ceil((t - now) / 86400000)
}
