import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  firstEnv,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"
import { recommendedResponseTimeoutSeconds, type VoiceScreeningStepKind } from "./_voiceAutoAttendant.js"

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

type TimingStep = {
  id: string
  kind: VoiceScreeningStepKind
  prompt: string
}

async function analyzeAutoAttendantTimings(steps: TimingStep[]): Promise<Array<TimingStep & { responseTimeoutSeconds: number }>> {
  const fallback = steps.map((step) => ({
    ...step,
    responseTimeoutSeconds: recommendedResponseTimeoutSeconds(step.kind, step.prompt),
  }))
  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey || steps.length === 0) return fallback

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: firstEnv("OPENAI_MODEL") || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Set a caller response timeout for each phone auto-attendant question. This timeout is only how long to wait for the caller to START speaking; speech recognition continues while they speak. Use 5-20 seconds. Allow more time for open-ended service descriptions, dates, and phone numbers; less for names and yes/no consent. Return JSON only: {\"timings\":[{\"id\":\"...\",\"responseTimeoutSeconds\":12}]}.",
          },
          { role: "user", content: JSON.stringify(steps) },
        ],
      }),
    })
    if (!response.ok) return fallback
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = payload.choices?.[0]?.message?.content
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { timings?: Array<{ id?: unknown; responseTimeoutSeconds?: unknown }> }
    const byId = new Map(
      (parsed.timings ?? []).map((row) => [String(row.id ?? ""), Number(row.responseTimeoutSeconds)]),
    )
    return fallback.map((step) => {
      const proposed = byId.get(step.id)
      return {
        ...step,
        responseTimeoutSeconds: Number.isFinite(proposed)
          ? Math.min(20, Math.max(5, Math.round(proposed!)))
          : step.responseTimeoutSeconds,
      }
    })
  } catch (error) {
    console.warn("[voice-studio] auto-attendant timing analysis fallback", error instanceof Error ? error.message : error)
    return fallback
  }
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
        .eq("category", "auto_attendant")
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

    if (action === "client-analyze-auto-attendant") {
      const user = await supabaseUser(req)
      if (!user) throw new Error("Unauthorized")
      const rawSteps = Array.isArray(body.steps) ? body.steps.slice(0, 12) : []
      const allowedKinds = new Set([
        "service_intent",
        "schedule_timing",
        "caller_name",
        "callback_number",
        "sms_opt_in",
        "custom",
      ])
      const steps = rawSteps
        .filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
        .map((row) => ({
          id: String(row.id ?? "").slice(0, 100),
          kind: (allowedKinds.has(String(row.kind)) ? String(row.kind) : "custom") as VoiceScreeningStepKind,
          prompt: String(row.prompt ?? "").trim().slice(0, 500),
        }))
        .filter((row) => row.id && row.prompt)
      return res.status(200).json({ steps: await analyzeAutoAttendantTimings(steps) })
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
