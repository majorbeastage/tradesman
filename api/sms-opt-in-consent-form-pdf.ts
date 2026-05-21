/**
 * GET /api/sms-opt-in-consent-form-pdf
 * Printable SMS opt-in consent PDF for businesses (linked from /sms-cta).
 *
 * Query:
 *   businessName — optional; fills disclosure + business name line
 *   businessPhone — optional
 *   download=1 — Content-Disposition: attachment (default inline for print preview)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { buildSmsOptInConsentFormPdfBytes, smsOptInConsentFormFilename } from "../src/lib/smsOptInConsentFormPdf.js"

function pickQueryString(v: string | string[] | undefined, maxLen: number): string {
  const raw = Array.isArray(v) ? v[0] : v
  return String(raw ?? "")
    .trim()
    .slice(0, maxLen)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "GET") {
    res.status(405).setHeader("Allow", "GET, OPTIONS").json({ error: "Method not allowed" })
    return
  }

  try {
    const businessName = pickQueryString(req.query.businessName, 120)
    const businessPhone = pickQueryString(req.query.businessPhone, 40)
    const download = pickQueryString(req.query.download, 4) === "1"

    const bytes = await buildSmsOptInConsentFormPdfBytes({ businessName: businessName || undefined, businessPhone })
    const filename = smsOptInConsentFormFilename(businessName || undefined)

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400")
    res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`)
    res.status(200).send(Buffer.from(bytes))
  } catch (e) {
    console.error("[api/sms-opt-in-consent-form-pdf]", e)
    res.status(500).json({ error: e instanceof Error ? e.message : "Could not generate PDF" })
  }
}
