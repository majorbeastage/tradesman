/**
 * Same contract as Supabase Edge `billing-portal-config`, but reads Helcim URL from **Vercel server env**
 * so the Payments tab works when the Edge function is missing, mis-deployed, or blocked (CORS / gateway).
 *
 * Set on Vercel: HELCIM_PAYMENT_PORTAL_URL (preferred) or VITE_HELCIM_PAYMENT_PORTAL_URL.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { firstEnv, pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    res.status(405).json({ error: "POST only" })
    return
  }

  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : ""
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization" })
    return
  }

  const supabaseUrl = pickSupabaseUrlForServer().replace(/\/+$/, "")
  const anonKey = pickSupabaseAnonKeyForServer()
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({ error: "Supabase URL/anon key not configured on server" })
    return
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const token = authHeader.slice("Bearer ".length).trim()
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData.user) {
    res.status(401).json({ error: "Invalid session" })
    return
  }

  const portalUrl = firstEnv("HELCIM_PAYMENT_PORTAL_URL", "VITE_HELCIM_PAYMENT_PORTAL_URL").trim() || null
  res.status(200).json({ portalUrl: portalUrl || null, source: "vercel" })
}
