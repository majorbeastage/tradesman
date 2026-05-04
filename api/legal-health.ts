/**
 * GET /api/legal-health — JSON: whether Supabase URL + anon key are set on this deployment (no secrets returned).
 * Use after assigning tradesman-us.com to confirm Production env on the **same** Vercel project as this build.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"
import { legalSupabaseEnvPresent } from "./_legalSupabaseEnv.js"

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const url = pickSupabaseUrlForServer().trim()
  const key = pickSupabaseAnonKeyForServer().trim()
  res.status(200).json({
    ok: legalSupabaseEnvPresent(),
    supabaseUrlConfigured: Boolean(url),
    supabaseAnonKeyConfigured: Boolean(key),
    hint:
      "Crawlable legal pages call Supabase platform_settings with the anon key. Set VITE_SUPABASE_URL (or SUPABASE_URL) and VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY) on this Vercel project for Production. If ok is false here but /privacy works, you are seeing baked-in defaults, not live DB copy.",
  })
}
