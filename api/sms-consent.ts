import type { VercelRequest, VercelResponse } from "@vercel/node"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

/**
 * Serves the SMS consent document as HTML (no client JS required).
 * Used by Vercel rewrite: GET /sms-consent → this handler.
 * File source: public/sms-consent.html (bundled via vercel.json includeFiles).
 */
function loadSmsConsentHtml(): string {
  const candidates = [
    join(process.cwd(), "public", "sms-consent.html"),
    join(process.cwd(), "dist", "sms-consent.html"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8")
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>SMS consent</title></head><body><p>SMS consent document is not deployed. Ensure public/sms-consent.html exists and api/sms-consent.ts has includeFiles in vercel.json.</p></body></html>`
}

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  const html = loadSmsConsentHtml()
  res.setHeader("Content-Type", "text/html; charset=utf-8")
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600")
  res.status(200).send(html)
}
