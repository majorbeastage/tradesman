import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import { pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"

type SoleClient = {
  id: string
  displayName: string
  contactEmail: string
  token: string
  status: string
  connections?: { networkSlug: string; status: string; accountDisplayName?: string }[]
}

function soleApiOrigin() {
  return String(process.env.SOLE_API_ORIGIN || process.env.SOLE_PUBLIC_ORIGIN || "https://sole.systems").replace(/\/+$/, "")
}

function solePublicOrigin() {
  return String(process.env.SOLE_PUBLIC_ORIGIN || process.env.SOLE_API_ORIGIN || "https://sole.systems").replace(/\/+$/, "")
}

function soleUserApiKey() {
  return String(process.env.SOLE_USER_API_KEY || "").trim()
}

async function soleReq<T>(path: string, init?: RequestInit): Promise<T> {
  const key = soleUserApiKey()
  if (!key) throw new Error("SOLE_USER_API_KEY is not set. Add the User-zero API key on Vercel.")
  const res = await fetch(`${soleApiOrigin()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `SOLE ${path} failed (${res.status})`)
  return data
}

function readStoredToken(metadata: unknown): { token?: string; clientId?: string } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const root = metadata as Record<string, unknown>
  const nested = root.sole_applet
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const row = nested as Record<string, unknown>
    return {
      token: typeof row.token === "string" ? row.token : undefined,
      clientId: typeof row.clientId === "string" ? row.clientId : undefined,
    }
  }
  return {}
}

export async function handleGrowthSoleApplet(req: VercelRequest, res: VercelResponse, userId: string): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const supabaseUrl = pickSupabaseUrlForServer()
  const anonKey = pickSupabaseAnonKeyForServer()
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({ error: "Supabase is not configured on this server." })
    return
  }

  const authHeader = String(req.headers.authorization || "")
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const [{ data: profile }, auth] = await Promise.all([
    userClient.from("profiles").select("email, display_name, metadata").eq("id", userId).maybeSingle(),
    userClient.auth.getUser(),
  ])

  const email = String(profile?.email || auth.data.user?.email || "").trim().toLowerCase()
  const displayName = String(profile?.display_name || email || "Tradesman shop").trim()
  if (!email) {
    res.status(400).json({ error: "This Tradesman profile needs an email before SOLE can issue an applet." })
    return
  }

  const stored = readStoredToken(profile?.metadata)
  const listed = await soleReq<{ clients: SoleClient[] }>("/api/user/clients")
  let client =
    listed.clients.find((c) => stored.token && c.token === stored.token) ||
    listed.clients.find((c) => stored.clientId && c.id === stored.clientId) ||
    listed.clients.find((c) => (c.contactEmail || "").toLowerCase() === email) ||
    null

  if (!client) {
    const created = await soleReq<{ client: SoleClient }>("/api/user/clients", {
      method: "POST",
      body: JSON.stringify({ displayName, contactEmail: email }),
    })
    client = created.client
  }

  const previous = profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
    ? (profile.metadata as Record<string, unknown>)
    : {}
  const nextMeta = {
    ...previous,
    sole_applet: {
      clientId: client.id,
      token: client.token,
      issuedAt: new Date().toISOString(),
    },
  }
  const { error: saveErr } = await userClient.from("profiles").update({ metadata: nextMeta }).eq("id", userId)
  if (saveErr) {
    res.status(400).json({ error: saveErr.message })
    return
  }

  res.status(200).json({
    appletUrl: `${solePublicOrigin()}/c/${encodeURIComponent(client.token)}`,
    opsUrl: `${solePublicOrigin()}/ops`,
    client: {
      id: client.id,
      displayName: client.displayName,
      contactEmail: client.contactEmail,
      status: client.status,
      connections: client.connections || [],
    },
  })
}
