import { supabase } from "./supabase"
import {
  blobToTwilioWav,
  isTwilioPlaySafeAudioUrl,
  prepareTwilioPlayableAudio,
  storagePathFromPublicUrl,
} from "./audioToTwilioWav"

export const VOICEMAIL_GREETING_BUCKET = "voicemail-greetings"

export async function uploadAttendantAudio(userId: string, blob: Blob, mimeType: string): Promise<string> {
  if (!supabase) throw new Error("Sign in again to save your recording.")
  const prepared = await prepareTwilioPlayableAudio(blob, mimeType)
  const filePath = `${userId}/auto-attendant/${Date.now()}.${prepared.ext}`
  const { error } = await supabase.storage
    .from(VOICEMAIL_GREETING_BUCKET)
    .upload(filePath, prepared.blob, { upsert: true, contentType: prepared.contentType })
  if (error) throw error
  return supabase.storage.from(VOICEMAIL_GREETING_BUCKET).getPublicUrl(filePath).data.publicUrl
}

/** Convert an existing browser recording (webm/m4a) to WAV so Twilio can play it. */
export async function reencodeAttendantRecordingUrl(userId: string, url: string): Promise<string> {
  if (!supabase || !url.trim() || isTwilioPlaySafeAudioUrl(url)) return url
  const path = storagePathFromPublicUrl(url, VOICEMAIL_GREETING_BUCKET)
  if (!path) return url
  const { data, error } = await supabase.storage.from(VOICEMAIL_GREETING_BUCKET).download(path)
  if (error || !data) return url
  try {
    const wav = await blobToTwilioWav(data)
    return await uploadAttendantAudio(userId, wav, "audio/wav")
  } catch {
    return url
  }
}
