import type { VercelRequest } from "@vercel/node"

/**
 * Public site origin for canonical / sitemap / absolute legal links (uses forwarded host on Vercel).
 */
export function publicRequestOrigin(req: VercelRequest): string {
  const rawProto = req.headers["x-forwarded-proto"]
  const proto = typeof rawProto === "string" ? rawProto.split(",")[0].trim() : "https"
  const hostRaw = req.headers["x-forwarded-host"] ?? req.headers.host
  const host = typeof hostRaw === "string" ? hostRaw.split(",")[0].trim() : ""
  if (!host) return ""
  const safe = proto === "http" || proto === "https" ? proto : "https"
  return `${safe}://${host}`
}
