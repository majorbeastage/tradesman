import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv, normalizePhone, pickFirstString } from "./_communications.js"

const VOICEMAIL_GREETING_BUCKET = "voicemail-greetings"

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

async function uploadTwilioRecordingToStorage(userId: string, recordingUrl: string): Promise<string> {
  const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  const sourceUrl = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`
  const response = await fetch(sourceUrl, {
    headers: accountSid && authToken ? { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` } : undefined,
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch Twilio recording (${response.status})`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const supabase = createServiceSupabase()
  const filePath = `${userId}/greeting-callin-${Date.now()}.mp3`
  const { error } = await supabase.storage
    .from(VOICEMAIL_GREETING_BUCKET)
    .upload(filePath, arrayBuffer, { upsert: true, contentType: "audio/mpeg" })
  if (error) throw error
  const { data } = supabase.storage.from(VOICEMAIL_GREETING_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
  }

  const userId = pickFirstString(req.query?.userId, req.body?.userId)
  const recordingUrl = pickFirstString(req.body?.RecordingUrl, req.query?.RecordingUrl)
  const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)
  const callerNumber = normalizePhone(pickFirstString(req.body?.From, req.query?.From))

  if (!userId || !recordingUrl) {
    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew" language="en-US">Missing recording details. Goodbye.</Say><Hangup/></Response>`
    )
  }

  try {
    const publicUrl = await uploadTwilioRecordingToStorage(userId, recordingUrl)
    const supabase = createServiceSupabase()
    const { error } = await supabase
      .from("profiles")
      .update({
        voicemail_greeting_mode: "recorded",
        voicemail_greeting_recording_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
    if (error) throw error

    await supabase.from("communication_events").insert({
      user_id: userId,
      event_type: "voicemail",
      direction: "inbound",
      external_id: recordingSid || null,
      body: "Voicemail greeting updated by phone",
      recording_url: publicUrl,
      unread: false,
      metadata: {
        greeting_recording: true,
        caller_number: callerNumber || null,
        source_recording_url: recordingUrl,
        completed_at: new Date().toISOString(),
      },
    })

    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew" language="en-US">Your voicemail greeting has been saved and is now active.</Say><Hangup/></Response>`
    )
  } catch {
    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew" language="en-US">We were not able to save your greeting right now. Please try again later.</Say><Hangup/></Response>`
    )
  }
}
