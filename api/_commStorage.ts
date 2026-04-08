import { createServiceSupabase, firstEnv } from "./_communications.js"

export const COMM_ATTACHMENTS_BUCKET = "comm-attachments"

/**
 * Upload bytes to comm-attachments (public URL). Used by inbound MMS/email mirroring (service role).
 */
export async function uploadBytesToCommAttachments(params: {
  storagePath: string
  body: ArrayBuffer | Buffer
  contentType: string
  logTag?: string
}): Promise<string | null> {
  const tag = params.logTag ?? "comm-storage"
  const safePath = params.storagePath.replace(/[^a-zA-Z0-9/_\-.]/g, "").replace(/\/+/g, "/")
  if (!safePath) {
    console.error(`[${tag}] empty storage path`)
    return null
  }
  try {
    const supabase = createServiceSupabase()
    const buf = Buffer.isBuffer(params.body) ? params.body : Buffer.from(params.body)
    const { error } = await supabase.storage.from(COMM_ATTACHMENTS_BUCKET).upload(safePath, buf, {
      upsert: true,
      contentType: params.contentType || "application/octet-stream",
    })
    if (error) {
      console.error(`[${tag}] upload`, error.message)
      return null
    }
    const { data } = supabase.storage.from(COMM_ATTACHMENTS_BUCKET).getPublicUrl(safePath)
    return data.publicUrl
  } catch (e) {
    console.error(`[${tag}]`, e instanceof Error ? e.message : e)
    return null
  }
}

/** Download Twilio-hosted media (MMS) with HTTP Basic auth. */
export async function fetchTwilioMediaBuffer(
  mediaUrl: string,
  logLabel = "twilio-media",
): Promise<{ arrayBuffer: ArrayBuffer; contentType: string }> {
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  const envAccountSid = firstEnv("TWILIO_ACCOUNT_SID")
  if (!authToken) throw new Error("Missing TWILIO_AUTH_TOKEN for MMS download")
  const urlAccountMatch = /\/Accounts\/(AC[a-f0-9]{32})\//i.exec(mediaUrl)
  const urlAccountSid = urlAccountMatch ? urlAccountMatch[1] : null
  const basicUser = envAccountSid || urlAccountSid
  if (!basicUser) throw new Error("Missing TWILIO_ACCOUNT_SID for MMS download")
  const authHeader = `Basic ${Buffer.from(`${basicUser}:${authToken}`).toString("base64")}`
  const res = await fetch(mediaUrl, { headers: { Authorization: authHeader } })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`Twilio media HTTP ${res.status}: ${t.slice(0, 200)}`)
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream"
  const arrayBuffer = await res.arrayBuffer()
  return { arrayBuffer, contentType }
}
