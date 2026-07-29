import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"

type Json = Record<string, unknown>
const BUCKET = "voice-prompt-studio"

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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString("hex")
}

function validPin(value: unknown): string {
  const pin = String(value ?? "").replace(/\D/g, "")
  return pin.length >= 4 && pin.length <= 12 ? pin : ""
}

function safePinMatch(pin: string, salt: string, expectedHex: string): boolean {
  try {
    const actual = Buffer.from(hashPin(pin, salt), "hex")
    const expected = Buffer.from(expectedHex, "hex")
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

async function supabaseUser(req: VercelRequest): Promise<{ id: string } | null> {
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token || token.startsWith("vs_")) return null
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!url || !anon) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  return error || !data.user?.id ? null : { id: data.user.id }
}

async function requireAdmin(req: VercelRequest, service: SupabaseClient): Promise<string> {
  const user = await supabaseUser(req)
  if (!user) throw new Error("Unauthorized")
  const { data } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (data?.role !== "admin") throw new Error("Admin access required")
  return user.id
}

async function externalSession(req: VercelRequest, service: SupabaseClient) {
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token.startsWith("vs_")) return null
  const { data } = await service
    .from("voice_studio_sessions")
    .select("id, access_id, expires_at, voice_studio_access!inner(active, expires_at)")
    .eq("session_token_hash", sha256(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  if (!data) return null
  const access = data.voice_studio_access as unknown as { active?: boolean; expires_at?: string | null }
  if (!access?.active || (access.expires_at && Date.parse(access.expires_at) <= Date.now())) return null
  await service.from("voice_studio_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", data.id)
  return { accessId: String(data.access_id), sessionId: String(data.id) }
}

async function signedRecordingRows(service: SupabaseClient, rows: Json[]) {
  return Promise.all(
    rows.map(async (row) => {
      const path = String(row.storage_path ?? "")
      const { data } = path ? await service.storage.from(BUCKET).createSignedUrl(path, 60 * 60) : { data: null }
      return { ...row, signed_url: data?.signedUrl ?? null }
    }),
  )
}

function statusForError(message: string): number {
  if (/unauthorized/i.test(message)) return 401
  if (/admin access/i.test(message)) return 403
  if (/not found/i.test(message)) return 404
  if (/locked/i.test(message)) return 429
  if (/required|invalid|pin/i.test(message)) return 400
  return 500
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const body = bodyRecord(req)
  const action = String(body.action ?? "")
  const service = createServiceSupabase()

  try {
    if (action === "external-auth") {
      const publicToken = String(body.publicToken ?? "").trim()
      const pin = validPin(body.pin)
      if (!publicToken || !pin) throw new Error("A valid access link and PIN are required.")
      const { data: access } = await service
        .from("voice_studio_access")
        .select("*")
        .eq("public_token", publicToken)
        .maybeSingle()
      if (!access || !access.active) throw new Error("Access link not found.")
      if (access.expires_at && Date.parse(access.expires_at) <= Date.now()) throw new Error("This access link has expired.")
      if (access.locked_until && Date.parse(access.locked_until) > Date.now()) throw new Error("Too many attempts. This link is temporarily locked.")
      if (!safePinMatch(pin, String(access.pin_salt), String(access.pin_hash))) {
        const attempts = Number(access.failed_attempts || 0) + 1
        await service
          .from("voice_studio_access")
          .update({
            failed_attempts: attempts,
            locked_until: attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", access.id)
        throw new Error(attempts >= 5 ? "Too many attempts. This link is temporarily locked." : "Incorrect PIN.")
      }
      const sessionToken = `vs_${randomBytes(32).toString("base64url")}`
      const expiresAt = new Date(Date.now() + 12 * 60 * 60_000).toISOString()
      await service.from("voice_studio_sessions").insert({
        access_id: access.id,
        session_token_hash: sha256(sessionToken),
        expires_at: expiresAt,
      })
      await service
        .from("voice_studio_access")
        .update({ failed_attempts: 0, locked_until: null, last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", access.id)
      return res.status(200).json({ ok: true, sessionToken, expiresAt, label: access.label })
    }

    if (action === "external-list") {
      const session = await externalSession(req, service)
      if (!session) throw new Error("Unauthorized")
      const [{ data: prompts, error: promptError }, { data: recordings, error: recordingError }] = await Promise.all([
        service.from("voice_prompt_library").select("*").eq("active", true).order("sort_order").order("created_at"),
        service
          .from("voice_prompt_recordings")
          .select("*")
          .eq("access_id", session.accessId)
          .order("created_at", { ascending: false }),
      ])
      if (promptError) throw promptError
      if (recordingError) throw recordingError
      return res.status(200).json({
        prompts: prompts ?? [],
        recordings: await signedRecordingRows(service, (recordings ?? []) as Json[]),
      })
    }

    if (action === "client-library") {
      const user = await supabaseUser(req)
      if (!user) throw new Error("Unauthorized")
      const { data, error } = await service
        .from("voice_prompt_library")
        .select("id, prompt_key, title, category, script_text, usage_notes, active_recording_id")
        .eq("active", true)
        .eq("scope", "platform")
        .not("active_recording_id", "is", null)
        .order("sort_order")
      if (error) throw error
      return res.status(200).json({
        prompts: (data ?? []).map((prompt) => ({
          ...prompt,
          playback_url: `/api/voice-prompt-audio?key=${encodeURIComponent(prompt.prompt_key)}`,
        })),
      })
    }

    const adminId = await requireAdmin(req, service)

    if (action === "admin-list") {
      const [{ data: prompts }, { data: accesses }, { data: recordings }] = await Promise.all([
        service.from("voice_prompt_library").select("*").order("sort_order").order("created_at"),
        service
          .from("voice_studio_access")
          .select("id, created_at, updated_at, label, public_token, active, expires_at, last_used_at, locked_until")
          .order("created_at", { ascending: false }),
        service.from("voice_prompt_recordings").select("*").order("created_at", { ascending: false }).limit(500),
      ])
      return res.status(200).json({
        prompts: prompts ?? [],
        accesses: accesses ?? [],
        recordings: await signedRecordingRows(service, (recordings ?? []) as Json[]),
      })
    }

    if (action === "admin-create-access" || action === "admin-reset-pin") {
      const pin = validPin(body.pin)
      if (!pin) throw new Error("PIN must contain 4–12 digits.")
      const salt = randomBytes(16).toString("hex")
      const pinHash = hashPin(pin, salt)
      if (action === "admin-create-access") {
        const publicToken = randomBytes(24).toString("base64url")
        const { data, error } = await service
          .from("voice_studio_access")
          .insert({
            label: String(body.label ?? "Voice talent").trim().slice(0, 100) || "Voice talent",
            public_token: publicToken,
            pin_salt: salt,
            pin_hash: pinHash,
            active: true,
            expires_at: body.expiresAt ? String(body.expiresAt) : null,
            created_by: adminId,
          })
          .select("id, label, public_token, active, expires_at")
          .single()
        if (error) throw error
        return res.status(200).json({ ok: true, access: data })
      }
      const accessId = String(body.accessId ?? "")
      const { error } = await service
        .from("voice_studio_access")
        .update({
          pin_salt: salt,
          pin_hash: pinHash,
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accessId)
      if (error) throw error
      await service.from("voice_studio_sessions").delete().eq("access_id", accessId)
      return res.status(200).json({ ok: true })
    }

    if (action === "admin-set-access-active") {
      const accessId = String(body.accessId ?? "")
      const active = body.active === true
      const { error } = await service
        .from("voice_studio_access")
        .update({ active, updated_at: new Date().toISOString() })
        .eq("id", accessId)
      if (error) throw error
      if (!active) await service.from("voice_studio_sessions").delete().eq("access_id", accessId)
      return res.status(200).json({ ok: true })
    }

    if (action === "admin-save-prompt") {
      const id = String(body.id ?? "")
      const title = String(body.title ?? "").trim()
      const scriptText = String(body.scriptText ?? "").trim()
      if (!title || !scriptText) throw new Error("Prompt title and script are required.")
      const patch = {
        title,
        category: String(body.category ?? "general").trim().slice(0, 50),
        script_text: scriptText,
        usage_notes: String(body.usageNotes ?? "").trim(),
        scope: body.scope === "client_custom" ? "client_custom" : "platform",
        client_profile_id: body.clientProfileId ? String(body.clientProfileId) : null,
        sort_order: Number.isFinite(Number(body.sortOrder)) ? Math.round(Number(body.sortOrder)) : 100,
        active: body.active !== false,
        updated_at: new Date().toISOString(),
      }
      if (id) {
        const { error } = await service.from("voice_prompt_library").update(patch).eq("id", id)
        if (error) throw error
      } else {
        const promptKey =
          String(body.promptKey ?? "").trim() ||
          `custom.${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60)}.${Date.now().toString(36)}`
        const { error } = await service
          .from("voice_prompt_library")
          .insert({ ...patch, prompt_key: promptKey, created_by: adminId })
        if (error) throw error
      }
      return res.status(200).json({ ok: true })
    }

    if (action === "admin-review-recording") {
      const recordingId = String(body.recordingId ?? "")
      const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : ""
      if (!recordingId || !status) throw new Error("Recording and review status are required.")
      const { data: recording, error } = await service
        .from("voice_prompt_recordings")
        .update({
          status,
          reviewer_notes: String(body.notes ?? "").trim().slice(0, 1000),
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
        })
        .eq("id", recordingId)
        .select("id, prompt_id")
        .single()
      if (error) throw error
      if (status === "approved") {
        await service
          .from("voice_prompt_recordings")
          .update({ status: "archived" })
          .eq("prompt_id", recording.prompt_id)
          .eq("status", "approved")
          .neq("id", recording.id)
        await service
          .from("voice_prompt_library")
          .update({ active_recording_id: recording.id, updated_at: new Date().toISOString() })
          .eq("id", recording.prompt_id)
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: "Unknown action." })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice Studio request failed."
    console.error("[voice-studio]", action, message)
    return res.status(statusForError(message)).json({ error: message })
  }
}
