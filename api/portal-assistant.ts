/**
 * Vercel serverless proxy: browser → same-origin /api → Supabase Edge Function.
 * Avoids browser "Failed to fetch" when the Supabase gateway returns errors without CORS headers.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type")

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization" })
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "")
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? "").trim()
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({
      error: "Server missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (set in Vercel env).",
    })
  }

  const token = authHeader.slice("Bearer ".length).trim()
  const supabase = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData.user) {
    return res.status(401).json({ error: "Invalid or expired session" })
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single()
  if (profile?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" })
  }

  const body = req.body && typeof req.body === "object" ? req.body : {}
  const messages = body.messages
  const pageContext = body.pageContext
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages required" })
  }

  const upstreamUrl = `${supabaseUrl}/functions/v1/portal-assistant`
  const up = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, pageContext }),
  })

  const text = await up.text()
  const ct = up.headers.get("content-type") || "application/json; charset=utf-8"
  res.status(up.status)
  res.setHeader("Content-Type", ct)
  res.send(text)
}
