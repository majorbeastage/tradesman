import { createServiceSupabase } from "./_communications.js"
import { fetchTwilioRecordingBuffer, pickUploadFormat } from "./_twilioRecordingFetch.js"

const DEFAULT_BUCKET = "voicemail-greetings"

/**
 * Download a Twilio recording and upload to Supabase Storage (public URL).
 * Use for trouble tickets and conversation voicemails so the portal can play audio without Twilio Basic auth in the browser.
 */
export async function mirrorTwilioRecordingToPublicUrl(params: {
  storagePathWithoutExt: string
  recordingUrl: string
  recordingSid?: string
  bucket?: string
  logTag?: string
}): Promise<string | null> {
  const tag = params.logTag ?? "mirror-twilio"
  if (!params.recordingUrl?.trim() && !params.recordingSid?.trim()) return null
  try {
    const { arrayBuffer, contentType, sourceUrl } = await fetchTwilioRecordingBuffer(
      params.recordingUrl || "",
      params.recordingSid,
      tag,
    )
    const { ext, contentType: uploadCt } = pickUploadFormat(contentType, sourceUrl)
    const safeBase = params.storagePathWithoutExt.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/\/+/g, "/")
    const filePath = `${safeBase}.${ext}`
    const supabase = createServiceSupabase()
    const bucket = params.bucket ?? DEFAULT_BUCKET
    const { error } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, { upsert: true, contentType: uploadCt })
    if (error) {
      console.error(`[${tag}] storage upload`, error.message)
      return null
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
    return data.publicUrl
  } catch (e) {
    console.error(`[${tag}]`, e instanceof Error ? e.message : e)
    return null
  }
}
