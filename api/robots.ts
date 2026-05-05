/**
 * GET /api/robots — dynamic robots.txt with Sitemap URL for this host (rewritten as /robots.txt in vercel.json).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { publicRequestOrigin } from "./_requestOrigin.js"

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).setHeader("Allow", "GET, HEAD").end()
    return
  }
  const origin = publicRequestOrigin(req)
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    origin ? `Sitemap: ${origin}/sitemap.xml` : "# Sitemap: set when Host header is present",
    "",
  ].join("\n")
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400")
  res.status(200).send(body)
}
