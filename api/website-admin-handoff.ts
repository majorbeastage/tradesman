import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createHash, randomBytes } from "crypto"
import { createClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"

type Json = Record<string, unknown>
const CODE_TTL_MS = 60_000

function bodyRecord(req: VercelRequest): Json {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8")) as Json
    } catch {
      return {}
    }
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Json
    } catch {
      return {}
    }
  }
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Json) : {}
}

function bearerToken(req: VercelRequest): string {
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}

async function authenticatedUser(req: VercelRequest): Promise<{ id: string; email: string } | null> {
  const token = bearerToken(req)
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!token || !url || !anon) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  const email = data.user?.email?.trim()
  return error || !data.user?.id || !email ? null : { id: data.user.id, email }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const body = bodyRecord(req)
    const action = String(body.action ?? "")
    const service = createServiceSupabase()

    if (action === "issue") {
      const user = await authenticatedUser(req)
      if (!user) return res.status(401).json({ error: "Unauthorized" })

      const code = `wh_${randomBytes(32).toString("base64url")}`
      const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()
      const { error } = await service.from("website_admin_handoff_codes").insert({
        user_id: user.id,
        code_hash: hashCode(code),
        expires_at: expiresAt,
      })
      if (error) throw error
      return res.status(200).json({ ok: true, code, expiresAt })
    }

    if (action === "redeem") {
      const code = String(body.code ?? "").trim()
      if (!/^wh_[A-Za-z0-9_-]{40,}$/.test(code)) {
        return res.status(400).json({ error: "Invalid handoff code" })
      }

      const now = new Date().toISOString()
      const { data: row, error: lookupError } = await service
        .from("website_admin_handoff_codes")
        .select("id, user_id")
        .eq("code_hash", hashCode(code))
        .is("used_at", null)
        .gt("expires_at", now)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (!row) return res.status(401).json({ error: "Handoff code expired or already used" })

      const { data: authUser, error: userError } = await service.auth.admin.getUserById(String(row.user_id))
      const email = authUser.user?.email?.trim()
      if (userError || !email) return res.status(401).json({ error: "Account is unavailable" })

      const { data: claimed, error: claimError } = await service
        .from("website_admin_handoff_codes")
        .update({ used_at: now })
        .eq("id", row.id)
        .is("used_at", null)
        .select("id")
        .maybeSingle()
      if (claimError) throw claimError
      if (!claimed) return res.status(401).json({ error: "Handoff code already used" })

      const { data: link, error: linkError } = await service.auth.admin.generateLink({
        type: "magiclink",
        email,
      })
      const tokenHash = link.properties?.hashed_token
      if (linkError || !tokenHash) throw linkError ?? new Error("Could not create website admin session")

      return res.status(200).json({ ok: true, tokenHash, userId: row.user_id })
    }

    return res.status(400).json({ error: "Invalid action" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website admin handoff failed"
    return res.status(500).json({ error: message })
  }
}
