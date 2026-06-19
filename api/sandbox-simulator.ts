import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createServiceSupabase, pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"
import { isSandboxUser } from "./_sandboxEnvironment.js"
import {
  ensureSandboxProfile,
  injectSandboxLead,
  sandboxTrafficTick,
  seedSandboxWorkspace,
} from "./_sandboxSeed.js"

type Json = Record<string, unknown>

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

function parseBody(req: VercelRequest): Json {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body as Json
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body) as Json
    } catch {
      return {}
    }
  }
  return {}
}

async function resolveAuth(req: VercelRequest, body: Json): Promise<{ sb: SupabaseClient; userId: string }> {
  const userId = String(body.userId ?? "").trim()
  if (!userId) throw new Error("userId required")

  try {
    const sb = createServiceSupabase()
    return { sb, userId }
  } catch {
    const authHeader = typeof req.headers?.authorization === "string" ? req.headers.authorization.trim() : ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
    const supabaseUrl = pickSupabaseUrlForServer() || String(body.supabaseUrl ?? "").trim()
    const anonKey = pickSupabaseAnonKeyForServer() || String(body.supabaseAnonKey ?? "").trim()
    if (!token || !supabaseUrl || !anonKey) throw new Error("Unauthorized")
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data.user?.id || data.user.id !== userId) throw new Error("Unauthorized")
    return { sb, userId }
  }
}

async function assertSandbox(sb: SupabaseClient, userId: string): Promise<void> {
  if (!(await isSandboxUser(sb, userId))) {
    throw new Error("Sandbox access only")
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const body = parseBody(req)
  const action = String(body.action ?? req.query?.__action ?? "tick").trim()

  try {
    const { sb, userId } = await resolveAuth(req, body)
    await assertSandbox(sb, userId)

    switch (action) {
      case "repair_profile": {
        const profileRepaired = await ensureSandboxProfile(sb, userId)
        return res.status(200).json({ ok: true, profileRepaired })
      }
      case "seed": {
        const force = body.force === true
        const companyName = typeof body.companyName === "string" ? body.companyName : undefined
        const result = await seedSandboxWorkspace(sb, userId, { force, companyName })
        return res.status(200).json(result)
      }
      case "inject_lead": {
        const scenarioIndex = typeof body.scenarioIndex === "number" ? body.scenarioIndex : undefined
        const result = await injectSandboxLead(sb, userId, scenarioIndex)
        return res.status(200).json(result)
      }
      case "tick": {
        const result = await sandboxTrafficTick(sb, userId)
        return res.status(200).json(result)
      }
      case "set_live_traffic": {
        const enabled = body.enabled === true
        const intervalMinutes =
          typeof body.intervalMinutes === "number" && body.intervalMinutes >= 1 && body.intervalMinutes <= 60
            ? body.intervalMinutes
            : 3
        const { data: prof } = await sb.from("profiles").select("metadata").eq("id", userId).maybeSingle()
        const meta =
          prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
            ? { ...(prof.metadata as Record<string, unknown>) }
            : {}
        const prev = meta.sandbox_workspace_v1
        const prevDoc =
          prev && typeof prev === "object" && !Array.isArray(prev) ? { ...(prev as Record<string, unknown>) } : {}
        meta.sandbox_workspace_v1 = {
          ...prevDoc,
          v: 1,
          liveTrafficEnabled: enabled,
          liveTrafficIntervalMinutes: intervalMinutes,
        }
        await sb.from("profiles").update({ metadata: meta }).eq("id", userId)
        return res.status(200).json({ ok: true, liveTrafficEnabled: enabled, intervalMinutes })
      }
      case "reset": {
        const result = await seedSandboxWorkspace(sb, userId, { force: true })
        return res.status(200).json(result)
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = /unauthorized/i.test(msg) ? 401 : /sandbox access/i.test(msg) ? 403 : 500
    return res.status(status).json({ error: msg })
  }
}
