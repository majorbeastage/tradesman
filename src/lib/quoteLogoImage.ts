/** Fetches a logo for PDF/Word embedding (PNG or JPEG only). Requires CORS on the URL (e.g. Supabase public bucket). */
export type QuoteLogoBytes = { bytes: Uint8Array; kind: "png" | "jpeg" }

/**
 * Effective HTTPS URL for receipt PDF when "show logo on receipt" is enabled.
 * Uses receipt-specific URL if set; otherwise the same logo as Quotes → Estimate template (no duplicate upload).
 */
export function resolveReceiptTemplateLogoUrl(meta: Record<string, unknown>): string {
  const rec = typeof meta.receipt_template_logo_url === "string" ? meta.receipt_template_logo_url.trim() : ""
  if (rec) return rec
  const est = typeof meta.estimate_template_logo_url === "string" ? meta.estimate_template_logo_url.trim() : ""
  return est
}

/** Business logo already saved on MyT or the estimate template. */
export function resolveBusinessLogoUrl(meta: Record<string, unknown>): string {
  const fromTemplate = resolveReceiptTemplateLogoUrl(meta)
  if (fromTemplate) return fromTemplate
  const company = typeof meta.company_logo_url === "string" ? meta.company_logo_url.trim() : ""
  if (company) return company
  const quote = typeof meta.quote_logo_url === "string" ? meta.quote_logo_url.trim() : ""
  return quote
}

export async function fetchQuoteLogoForExport(url: string): Promise<QuoteLogoBytes | null> {
  const trimmed = url.trim()
  if (!trimmed.startsWith("http")) return null
  try {
    const res = await fetch(trimmed, { mode: "cors" })
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length < 8) return null
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { bytes: buf, kind: "png" }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      return { bytes: buf, kind: "jpeg" }
    }
    return null
  } catch {
    return null
  }
}
