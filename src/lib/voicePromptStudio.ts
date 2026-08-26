import { supabase } from "./supabase"
import { forceRefreshAccessToken, getFreshAccessToken } from "./authPlatformApi"

export type VoicePrompt = {
  id: string
  created_at: string
  updated_at: string
  prompt_key: string
  title: string
  category: string
  script_text: string
  usage_notes: string
  scope: "platform" | "client_custom"
  client_profile_id: string | null
  sort_order: number
  active: boolean
  active_recording_id: string | null
}

export type VoiceStudioAccess = {
  id: string
  created_at: string
  updated_at: string
  label: string
  public_token: string
  active: boolean
  expires_at: string | null
  last_used_at: string | null
  locked_until: string | null
}

export type VoicePromptRecording = {
  id: string
  created_at: string
  prompt_id: string
  access_id: string | null
  storage_path: string
  mime_type: string
  size_bytes: number
  duration_seconds: number | null
  version: number
  status: "submitted" | "approved" | "rejected" | "archived"
  reviewer_notes: string
  reviewed_at: string | null
  signed_url: string | null
}

export type VoiceStudioSnapshot = {
  prompts: VoicePrompt[]
  accesses?: VoiceStudioAccess[]
  recordings: VoicePromptRecording[]
}

export async function voiceStudioAdminRequest(action: string, body: Record<string, unknown> = {}) {
  if (!supabase) throw new Error("Supabase is not configured.")
  const token = await getFreshAccessToken(supabase, null)
  if (!token) throw new Error("Sign in again to manage Voice Studio.")
  const requestBody = JSON.stringify({ action, ...body })
  const request = (accessToken: string) =>
    fetch("/api/voice-studio", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: requestBody,
    })
  let response = await request(token)
  if (response.status === 401) {
    const refreshedToken = await forceRefreshAccessToken(supabase)
    if (refreshedToken) response = await request(refreshedToken)
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const fallback =
      response.status === 401
        ? "Your session expired. Sign out and sign in again to manage Voice Studio."
        : `Voice Studio failed (${response.status}).`
    throw new Error(typeof payload.error === "string" && payload.error !== "Unauthorized" ? payload.error : fallback)
  }
  return payload
}

export const voiceStudioUserRequest = voiceStudioAdminRequest

export async function transcribeAttendantAudio(audioUrl: string): Promise<string> {
  const payload = await voiceStudioUserRequest("client-transcribe-attendant", { audioUrl })
  return typeof payload.text === "string" ? payload.text.trim() : ""
}

export async function voiceStudioExternalRequest(
  action: string,
  body: Record<string, unknown>,
  sessionToken?: string,
) {
  const response = await fetch("/api/voice-studio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `Voice Studio failed (${response.status}).`)
  return payload
}
