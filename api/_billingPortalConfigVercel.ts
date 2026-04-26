/**
 * Vercel Helcim portal URL (merged into platform-tools to stay within Hobby function count).
 * Same contract as Supabase Edge billing-portal-config.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { firstEnv, firstEnvCaseInsensitive, pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"

function pickHelcimPaymentPortalUrlForServer(): string | null {
  const direct = firstEnv("HELCIM_PAYMENT_PORTAL_URL", "VITE_HELCIM_PAYMENT_PORTAL_URL").trim()
  if (direct) return direct
  const ci1 = firstEnvCaseInsensitive("HELCIM_PAYMENT_PORTAL_URL").trim()
  if (ci1) return ci1
  const ci2 = firstEnvCaseInsensitive("VITE_HELCIM_PAYMENT_PORTAL_URL").trim()
  if (ci2) return ci2
  return null
}

export async function handleBillingPortalConfigVercel(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  const portalUrl = pickHelcimPaymentPortalUrlForServer()
  res.status(200).json({ portalUrl: portalUrl || null, source: "vercel" })
}
