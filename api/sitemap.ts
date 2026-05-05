/**
 * GET /api/sitemap — XML sitemap for legal/compliance URLs on this host (rewritten as /sitemap.xml).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { publicRequestOrigin } from "./_requestOrigin.js"

const PATHS = ["/privacy", "/terms", "/sms", "/sms-consent"] as const

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).setHeader("Allow", "GET, HEAD").end()
    return
  }
  const origin = publicRequestOrigin(req)
  if (!origin) {
    res.status(500).setHeader("Content-Type", "text/plain; charset=utf-8").send("Missing Host")
    return
  }
  const urls = PATHS.map(
    (path) =>
      `  <url><loc>${escXml(origin + path)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
  ).join("\n")
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
  res.setHeader("Content-Type", "application/xml; charset=utf-8")
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400")
  res.status(200).send(xml)
}
