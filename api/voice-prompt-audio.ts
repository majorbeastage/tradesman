import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase } from "./_communications.js"

const BUCKET = "voice-prompt-studio"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD")
    return res.status(405).send("Method not allowed")
  }
  try {
    const promptKey = String(req.query.key ?? "").trim()
    if (!promptKey || promptKey.length > 150) return res.status(400).send("Prompt key required")
    const service = createServiceSupabase()
    const { data: prompt } = await service
      .from("voice_prompt_library")
      .select("active_recording_id, scope")
      .eq("prompt_key", promptKey)
      .eq("active", true)
      .eq("scope", "platform")
      .maybeSingle()
    if (!prompt?.active_recording_id) return res.status(404).send("Approved prompt not found")
    const { data: recording } = await service
      .from("voice_prompt_recordings")
      .select("storage_path, mime_type")
      .eq("id", prompt.active_recording_id)
      .eq("status", "approved")
      .maybeSingle()
    if (!recording?.storage_path) return res.status(404).send("Approved recording not found")
    const { data: audio, error } = await service.storage.from(BUCKET).download(recording.storage_path)
    if (error || !audio) throw error ?? new Error("Audio download failed")
    res.setHeader("Content-Type", recording.mime_type || audio.type || "audio/mpeg")
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300")
    res.setHeader("X-Content-Type-Options", "nosniff")
    if (req.method === "HEAD") return res.status(200).end()
    return res.status(200).send(Buffer.from(await audio.arrayBuffer()))
  } catch (error) {
    console.error("[voice-prompt-audio]", error)
    return res.status(500).send("Audio unavailable")
  }
}
