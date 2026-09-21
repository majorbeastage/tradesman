import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createServiceSupabase, pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"

const SETTING_KEY = "admin_ops_site_logins_v1"
const PROFILE_EMAIL = "sole@tradesman-us.com"

export type SoleSiteLogin = {
  id: string
  siteKey: string
  siteLabel: string
  url: string
  username: string
  password: string
  notes: string
  updatedAt: string | null
}

type VaultPayload = { v: 1; logins: SoleSiteLogin[] }

function bodyRecord(req: VercelRequest): Record<string, unknown> {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8")) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}
}

function vaultKey(): Buffer {
  const raw = (process.env.ADMIN_OPS_VAULT_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!raw) {
    throw new Error("Set ADMIN_OPS_VAULT_KEY (or SUPABASE_SERVICE_ROLE_KEY) on the server to store site logins.")
  }
  return createHash("sha256").update(raw).digest()
}

function encryptVault(payload: VaultPayload): string {
  const key = vaultKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  })
}

function decryptVault(raw: unknown): VaultPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { v: 1, logins: [] }
  const rec = raw as { v?: number; iv?: string; tag?: string; data?: string }
  if (!rec.iv || !rec.tag || !rec.data) return { v: 1, logins: [] }
  const key = vaultKey()
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "base64"))
  decipher.setAuthTag(Buffer.from(rec.tag, "base64"))
  const plain = Buffer.concat([decipher.update(Buffer.from(rec.data, "base64")), decipher.final()]).toString("utf8")
  const parsed = JSON.parse(plain) as VaultPayload
  if (!parsed || !Array.isArray(parsed.logins)) return { v: 1, logins: [] }
  return { v: 1, logins: parsed.logins }
}

function jwtClient(req: VercelRequest): SupabaseClient | null {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) return null
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!url || !anon) return null
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function storeClient(req: VercelRequest): SupabaseClient {
  try {
    return createServiceSupabase()
  } catch {
    const jwt = jwtClient(req)
    if (!jwt) throw new Error("Supabase is not configured on the server.")
    return jwt
  }
}

async function assertAdmin(service: SupabaseClient, userId: string): Promise<void> {
  const { data } = await service.from("profiles").select("role").eq("id", userId).maybeSingle()
  if ((data as { role?: string } | null)?.role !== "admin") {
    throw Object.assign(new Error("Admin only."), { status: 403 })
  }
}

async function loadProfile(service: SupabaseClient): Promise<{
  id: string
  email: string
  displayName: string | null
  role: string
} | null> {
  const { data: listed } = await service
    .from("admin_users_list")
    .select("id, email, display_name, role")
    .ilike("email", PROFILE_EMAIL)
    .maybeSingle()
  if (listed?.id) {
    return {
      id: listed.id as string,
      email: String(listed.email ?? PROFILE_EMAIL),
      displayName: typeof listed.display_name === "string" ? listed.display_name : null,
      role: String(listed.role ?? "user"),
    }
  }
  const { data: prof } = await service
    .from("profiles")
    .select("id, role, display_name")
    .ilike("display_name", "SOLE")
    .maybeSingle()
  if (!prof?.id) return null
  return {
    id: prof.id as string,
    email: PROFILE_EMAIL,
    displayName: typeof prof.display_name === "string" ? prof.display_name : null,
    role: String(prof.role ?? "user"),
  }
}

async function readLogins(service: SupabaseClient): Promise<SoleSiteLogin[]> {
  const { data, error } = await service.from("platform_settings").select("value").eq("key", SETTING_KEY).maybeSingle()
  if (error) throw error
  return decryptVault(data?.value).logins
}

async function writeLogins(service: SupabaseClient, logins: SoleSiteLogin[]): Promise<void> {
  const value = JSON.parse(encryptVault({ v: 1, logins })) as Record<string, unknown>
  const { error } = await service.from("platform_settings").upsert({ key: SETTING_KEY, value }, { onConflict: "key" })
  if (error) throw error
}

function asLogin(raw: Record<string, unknown>, previous?: SoleSiteLogin): SoleSiteLogin {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : crypto.randomUUID()
  return {
    id,
    siteKey: (typeof raw.siteKey === "string" && raw.siteKey.trim()) || previous?.siteKey || "custom",
    siteLabel: (typeof raw.siteLabel === "string" && raw.siteLabel.trim()) || previous?.siteLabel || "Custom site",
    url: typeof raw.url === "string" ? raw.url.trim() : previous?.url || "",
    username: typeof raw.username === "string" ? raw.username : previous?.username || "",
    password: typeof raw.password === "string" ? raw.password : previous?.password || "",
    notes: typeof raw.notes === "string" ? raw.notes : previous?.notes || "",
    updatedAt: new Date().toISOString(),
  }
}

export async function handleAdminSoleWorkspace(req: VercelRequest, res: VercelResponse, actorUserId: string): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  try {
    const service = storeClient(req)
    await assertAdmin(service, actorUserId)
    const body = bodyRecord(req)
    const action = typeof body.action === "string" ? body.action : "load"
    const profile = await loadProfile(service)
    const logins = await readLogins(service)

    if (action === "load") {
      res.status(200).json({ profile, logins, profileEmail: PROFILE_EMAIL })
      return
    }

    if (action === "save") {
      const incoming = body.login && typeof body.login === "object" && !Array.isArray(body.login) ? (body.login as Record<string, unknown>) : null
      if (!incoming) {
        res.status(400).json({ error: "login is required." })
        return
      }
      const prev = typeof incoming.id === "string" ? logins.find((l) => l.id === incoming.id) : undefined
      const next = asLogin(incoming, prev)
      const merged = prev ? logins.map((l) => (l.id === next.id ? next : l)) : [...logins, next]
      await writeLogins(service, merged)
      res.status(200).json({ profile, logins: merged, profileEmail: PROFILE_EMAIL })
      return
    }

    if (action === "delete") {
      const id = typeof body.id === "string" ? body.id : ""
      if (!id) {
        res.status(400).json({ error: "id is required." })
        return
      }
      const merged = logins.filter((l) => l.id !== id)
      await writeLogins(service, merged)
      res.status(200).json({ profile, logins: merged, profileEmail: PROFILE_EMAIL })
      return
    }

    res.status(400).json({ error: "Unknown action." })
  } catch (e) {
    const status = typeof (e as { status?: number }).status === "number" ? (e as { status: number }).status : 500
    res.status(status).json({ error: e instanceof Error ? e.message : "SOLE workspace failed." })
  }
}
