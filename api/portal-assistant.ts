/**
 * Vercel serverless proxy: browser → same-origin /api → Supabase Edge Function.
 * Avoids browser "Failed to fetch" when the Supabase gateway returns errors without CORS headers.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"

/** Prefer server env; Vite+Vercel often omits VITE_* from serverless process.env. */
function firstEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n]
    if (v != null && String(v).trim() !== "") return String(v).trim()
  }
  return ""
}

/** Same values as the client bundle (public anon key + project URL). */
function supabaseUrlFromBody(u: unknown): string {
  if (typeof u !== "string") return ""
  const t = u.trim().replace(/\/+$/, "")
  try {
    const x = new URL(t)
    if (x.protocol !== "https:") return ""
    if (!x.hostname.endsWith("supabase.co")) return ""
    return x.origin
  } catch {
    return ""
  }
}

function anonKeyFromBody(k: unknown): string {
  if (typeof k !== "string") return ""
  const t = k.trim()
  if (t.length < 32 || t.length > 8192) return ""
  if (t.startsWith("eyJ") || t.startsWith("sb_publishable_")) return t
  return ""
}

/** Edge function names in the URL must use ASCII; dashboard typos sometimes use en/em dash. */
function normalizeEdgeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
}

function isValidEdgeSlug(s: string): boolean {
  return s.length >= 1 && s.length <= 128 && /^[a-z0-9_-]+$/.test(s)
}

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

  const body = req.body && typeof req.body === "object" ? req.body : {}
  const messages = body.messages
  const pageContext = body.pageContext
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages required" })
  }

  const supabaseUrl =
    firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "") ||
    supabaseUrlFromBody(body.supabaseUrl)
  const anonKey =
    firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY") || anonKeyFromBody(body.supabaseAnonKey)

  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({
      error:
        "Missing Supabase URL/anon key. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY on Vercel (Production) and redeploy the app so the client can send them to this route, or set SUPABASE_URL + SUPABASE_ANON_KEY for the serverless function.",
    })
  }

  const token = authHeader.slice("Bearer ".length).trim()
  // RLS: profile reads must run as the signed-in user, not the anonymous client.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData.user) {
    return res.status(401).json({ error: "Invalid or expired session" })
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single()
  if (profileErr || !profile) {
    return res.status(403).json({
      error: "Could not load your profile (check RLS allows users to read their own profiles row).",
    })
  }
  if (profile.role !== "admin") {
    return res.status(403).json({ error: "Admin only" })
  }

  const slugRaw =
    firstEnv("SUPABASE_PORTAL_ASSISTANT_SLUG") ||
    (typeof body.edgeFunctionSlug === "string" ? body.edgeFunctionSlug : "") ||
    "portal-assistant"
  const functionSlug = normalizeEdgeSlug(slugRaw)
  if (!isValidEdgeSlug(functionSlug)) {
    return res.status(400).json({
      error: `Invalid edge function slug after normalization: "${functionSlug}". Use letters, numbers, hyphen, underscore only.`,
    })
  }

  const upstreamUrl = `${supabaseUrl}/functions/v1/${encodeURIComponent(functionSlug)}`
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

  if (up.status === 404) {
    res.status(404)
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    let merged: Record<string, unknown> = {
      attemptedUrl: upstreamUrl,
      usedSlug: functionSlug,
      hint:
        "Supabase says this function path does not exist. In Dashboard → Edge Functions, open your function and copy the Invoke URL path after /functions/v1/ — it must match usedSlug exactly (ASCII hyphen only). If Test in the dashboard also returns 404, redeploy once more or redeploy via CLI: supabase functions deploy " +
        functionSlug,
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      if (parsed && typeof parsed === "object") merged = { ...parsed, ...merged }
    } catch {
      merged.rawBody = text.slice(0, 400)
    }
    res.send(JSON.stringify(merged))
    return
  }

  const ct = up.headers.get("content-type") || "application/json; charset=utf-8"
  res.status(up.status)
  res.setHeader("Content-Type", ct)
  res.send(text)
}
