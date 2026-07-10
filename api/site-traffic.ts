import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, verifyAdminJwtAnonOrServiceSupabase } from "./_communications.js"
import { insertSiteTrafficEvent, loadSiteTrafficStats, type SiteTrafficRecordBody } from "./_siteTraffic.js"

/**
 * POST /api/site-traffic — record anonymous marketing page view (no auth).
 * GET  /api/site-traffic — admin traffic stats (Bearer Supabase JWT, role=admin).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type")

  if (req.method === "OPTIONS") return res.status(204).end()

  const supabase = createServiceSupabase()
  if (!supabase) return res.status(500).json({ error: "Server database not configured." })

  if (req.method === "POST") {
    const body = (req.body ?? {}) as SiteTrafficRecordBody
    const result = await insertSiteTrafficEvent(supabase, req, body)
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.status(204).end()
  }

  if (req.method === "GET") {
    const auth = typeof req.headers.authorization === "string" ? req.headers.authorization : ""
    const token = auth.replace(/^Bearer\s+/i, "").trim()
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" })

    const authz = await verifyAdminJwtAnonOrServiceSupabase(token)
    if (!authz.ok) return res.status(authz.status).json(authz.body)

    try {
      const daysRaw = typeof req.query?.days === "string" ? Number.parseInt(req.query.days, 10) : 30
      const stats = await loadSiteTrafficStats(supabase, Number.isFinite(daysRaw) ? daysRaw : 30)
      return res.status(200).json(stats)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: "Method not allowed" })
}
