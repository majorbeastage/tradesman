import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createHash, randomBytes } from "crypto"
import { createServiceSupabase } from "./_communications.js"

export const config = { api: { bodyParser: false } }

const BUCKET = "voice-prompt-studio"
const MAX_BYTES = 8 * 1024 * 1024
const MIME_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function readBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BYTES) throw new Error("Recording is larger than 8 MB.")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Recording-Duration")
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const auth = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
    const sessionToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
    if (!sessionToken.startsWith("vs_")) return res.status(401).json({ error: "Voice Studio session required." })
    const promptId = String(req.query.promptId ?? "")
    if (!/^[0-9a-f-]{36}$/i.test(promptId)) return res.status(400).json({ error: "Valid promptId required." })
    const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase()
    const ext = MIME_EXT[mime]
    if (!ext) return res.status(415).json({ error: "Use WebM, OGG, M4A, MP3, or WAV audio." })

    const service = createServiceSupabase()
    const { data: session } = await service
      .from("voice_studio_sessions")
      .select("id, access_id, expires_at, voice_studio_access!inner(active, expires_at)")
      .eq("session_token_hash", sha256(sessionToken))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()
    if (!session) return res.status(401).json({ error: "Voice Studio session expired." })
    const access = session.voice_studio_access as unknown as { active?: boolean; expires_at?: string | null }
    if (!access?.active || (access.expires_at && Date.parse(access.expires_at) <= Date.now())) {
      return res.status(401).json({ error: "Voice Studio access is no longer active." })
    }
    const { data: prompt } = await service
      .from("voice_prompt_library")
      .select("id")
      .eq("id", promptId)
      .eq("active", true)
      .maybeSingle()
    if (!prompt) return res.status(404).json({ error: "Prompt not found." })

    const audio = await readBody(req)
    if (audio.length < 1000) return res.status(400).json({ error: "Recording is empty or too short." })
    const { data: versions } = await service
      .from("voice_prompt_recordings")
      .select("version")
      .eq("prompt_id", promptId)
      .order("version", { ascending: false })
      .limit(1)
    const version = Math.max(1, Number(versions?.[0]?.version || 0) + 1)
    const path = `${promptId}/${session.access_id}/${Date.now()}-${randomBytes(5).toString("hex")}.${ext}`
    const { error: uploadError } = await service.storage.from(BUCKET).upload(path, audio, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    })
    if (uploadError) throw uploadError
    const durationRaw = Number(req.headers["x-recording-duration"] ?? 0)
    const { data: recording, error: insertError } = await service
      .from("voice_prompt_recordings")
      .insert({
        prompt_id: promptId,
        access_id: session.access_id,
        storage_path: path,
        mime_type: mime,
        size_bytes: audio.length,
        duration_seconds: Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null,
        version,
        status: "submitted",
      })
      .select("*")
      .single()
    if (insertError) {
      await service.storage.from(BUCKET).remove([path])
      throw insertError
    }
    await service.from("voice_studio_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", session.id)
    const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
    return res.status(200).json({ ok: true, recording: { ...recording, signed_url: signed?.signedUrl ?? null } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recording upload failed."
    console.error("[voice-studio-upload]", message)
    return res.status(/larger than/i.test(message) ? 413 : 500).json({ error: message })
  }
}
