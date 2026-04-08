import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, pickFirstString } from "./_communications.js"
import { fetchTwilioRecordingBuffer, pickUploadFormat } from "./_twilioRecordingFetch.js"

const BUCKET = "voicemail-greetings"

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

const SAY = `voice="Polly.Matthew" language="en-US"`

/**
 * Twilio Record callback: download greeting, upload to voicemail-greetings/global/…, merge into platform_settings.tradesman_help_desk.
 * Reached only after caller passed HELP_DESK_GREETING_RECORD_PIN in help-desk-voice.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
  }

  const recordingUrl = pickFirstString(req.body?.RecordingUrl, req.query?.RecordingUrl)
  const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)

  if (!recordingUrl && !recordingSid) {
    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>No recording was received. Goodbye.</Say><Hangup/></Response>`,
    )
  }

  try {
    const { arrayBuffer, contentType, sourceUrl } = await fetchTwilioRecordingBuffer(
      recordingUrl || "",
      recordingSid || undefined,
      "help-desk-greeting-save",
    )
    const { ext, contentType: uploadCt } = pickUploadFormat(contentType, sourceUrl)
    const supabase = createServiceSupabase()
    const filePath = `global/help-desk-greeting-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, arrayBuffer, { upsert: true, contentType: uploadCt })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
    const publicUrl = pub.publicUrl

    const { data: row, error: selErr } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "tradesman_help_desk")
      .maybeSingle()
    if (selErr) throw selErr

    const prev =
      row?.value && typeof row.value === "object" && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {}
    const next = {
      ...prev,
      greeting_mode: "recorded",
      greeting_recording_url: publicUrl,
    }

    const { error: upRowErr } = await supabase.from("platform_settings").upsert(
      {
        key: "tradesman_help_desk",
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    )
    if (upRowErr) throw upRowErr

    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>Your help desk greeting has been saved. Thank you. Goodbye.</Say><Hangup/></Response>`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[help-desk-greeting-save]", msg)
    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>We could not save the greeting. Check server logs and Supabase storage. Goodbye.</Say><Hangup/></Response>`,
    )
  }
}
