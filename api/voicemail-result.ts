import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  createLeadForInboundCall,
  createServiceSupabase,
  getOrCreateConversation,
  getOrCreateCustomerByPhone,
  logCommunicationEvent,
  lookupChannelById,
  normalizePhone,
  pickFirstString,
} from "./_communications.js"
import { mirrorTwilioRecordingToPublicUrl } from "./_mirrorTwilioToStorage.js"
import { voicemailStorageFields, type VoicemailStorageMode } from "./_voicemailTranscript.js"

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

async function handleTranscribePhase(req: VercelRequest, res: VercelResponse): Promise<void> {
  const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)
  const transcriptionText = pickFirstString(req.body?.TranscriptionText, req.query?.TranscriptionText)
  if (!recordingSid) {
    res.status(200).send("OK")
    return
  }
  try {
    const supabase = createServiceSupabase()
    const { data: events, error } = await supabase
      .from("communication_events")
      .select("id, metadata")
      .eq("external_id", recordingSid)
      .eq("event_type", "voicemail")
    if (error) {
      console.error("[voicemail-result] transcribe: list events", error.message)
      res.status(200).send("OK")
      return
    }
    for (const row of events ?? []) {
      const meta = (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {}) as Record<string, unknown>
      const channelMode = meta.voicemail_mode === "full_transcript" ? "full_transcript" : "summary"
      const mode: VoicemailStorageMode = meta.help_desk === true ? "summary" : channelMode
      const fields = voicemailStorageFields(transcriptionText, mode)
      const nextMeta = {
        ...meta,
        transcription_completed_at: new Date().toISOString(),
      }
      const { error: upErr } = await supabase
        .from("communication_events")
        .update({
          transcript_text: fields.transcript_text,
          summary_text: fields.summary_text,
          body: fields.body,
          metadata: nextMeta,
        })
        .eq("id", row.id)
      if (upErr) console.error("[voicemail-result] transcribe: update", row.id, upErr.message)
    }
  } catch (e) {
    console.error("[voicemail-result] transcribe", e instanceof Error ? e.message : e)
  }
  res.status(200).send("OK")
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
  }

  const phase = pickFirstString(req.query?.phase).toLowerCase()
  if (phase === "transcribe") {
    await handleTranscribePhase(req, res)
    return
  }

  const channelId = typeof req.query?.channelId === "string" ? req.query.channelId : ""
  const to = normalizePhone(pickFirstString(req.body?.To, req.query?.to, req.query?.To))
  const from = normalizePhone(pickFirstString(req.body?.From, req.query?.from, req.query?.From))
  const recordingUrl = pickFirstString(req.body?.RecordingUrl, req.query?.RecordingUrl)
  const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)
  const transcriptionText = pickFirstString(req.body?.TranscriptionText, req.query?.TranscriptionText)
  const completedAt = new Date().toISOString()

  const notifyRaw = typeof req.query?.notifyUserIds === "string" ? req.query.notifyUserIds : ""
  const notifyUserIds = notifyRaw
    .split(",")
    .map((s) => s.trim())
    .filter(isLikelyUuid)

  if (notifyUserIds.length > 0) {
    try {
      const supabase = createServiceSupabase()
      const modeHelpDesk: VoicemailStorageMode = "summary"
      const fieldsInitial = voicemailStorageFields(transcriptionText, modeHelpDesk)
      let playUrl: string | null = recordingUrl || null
      if (recordingUrl || recordingSid) {
        const mirrored = await mirrorTwilioRecordingToPublicUrl({
          storagePathWithoutExt: `recordings/help-desk-vm/${recordingSid || "unknown"}`,
          recordingUrl: recordingUrl || "",
          recordingSid: recordingSid || undefined,
          logTag: "voicemail-result-helpdesk",
        })
        if (mirrored) playUrl = mirrored
      }
      for (const userId of notifyUserIds) {
        let conversationId: string | null = null
        let customerId: string | null = null
        let previousCustomer = false
        if (from) {
          const customer = await getOrCreateCustomerByPhone(supabase, userId, from)
          customerId = customer.customerId
          previousCustomer = customer.previousCustomer
          conversationId = await getOrCreateConversation(supabase, userId, customer.customerId, "phone")
        }
        await logCommunicationEvent(supabase, {
          user_id: userId,
          customer_id: customerId,
          conversation_id: conversationId,
          channel_id: null,
          event_type: "voicemail",
          direction: "inbound",
          external_id: recordingSid || null,
          body: fieldsInitial.body,
          recording_url: playUrl,
          transcript_text: fieldsInitial.transcript_text,
          summary_text: fieldsInitial.summary_text,
          previous_customer: previousCustomer,
          unread: true,
          metadata: {
            from,
            to,
            help_desk: true,
            voicemail_mode: modeHelpDesk,
            voicemail_completed_at: completedAt,
            caller_number: from,
            recording_url: playUrl,
            twilio_recording_url: recordingUrl || null,
          },
        })
      }
    } catch {
      // Twilio still needs TwiML
    }
    return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`)
  }

  try {
    const supabase = createServiceSupabase()
    const channel = channelId ? await lookupChannelById(supabase, channelId) : null
    if (channel?.user_id && from) {
      const customer = await getOrCreateCustomerByPhone(supabase, channel.user_id, from)
      const conversationId = await getOrCreateConversation(supabase, channel.user_id, customer.customerId, "phone")
      const leadId = await createLeadForInboundCall(supabase, channel.user_id, customer.customerId, from)
      const mode: VoicemailStorageMode = channel.voicemail_mode === "full_transcript" ? "full_transcript" : "summary"
      const fieldsInitial = voicemailStorageFields(transcriptionText, mode)

      let playUrl: string | null = recordingUrl || null
      if (recordingUrl || recordingSid) {
        const mirrored = await mirrorTwilioRecordingToPublicUrl({
          storagePathWithoutExt: `recordings/inbound-vm/${channel.user_id}/${recordingSid || "unknown"}`,
          recordingUrl: recordingUrl || "",
          recordingSid: recordingSid || undefined,
          logTag: "voicemail-result-channel",
        })
        if (mirrored) playUrl = mirrored
      }

      await logCommunicationEvent(supabase, {
        user_id: channel.user_id,
        customer_id: customer.customerId,
        conversation_id: conversationId,
        lead_id: leadId,
        channel_id: channel.id,
        event_type: "voicemail",
        direction: "inbound",
        external_id: recordingSid || null,
        body: fieldsInitial.body,
        recording_url: playUrl,
        transcript_text: fieldsInitial.transcript_text,
        summary_text: fieldsInitial.summary_text,
        previous_customer: customer.previousCustomer,
        unread: true,
        metadata: {
          from,
          to,
          provider: channel.provider,
          voicemail_mode: channel.voicemail_mode,
          voicemail_completed_at: completedAt,
          caller_number: from,
          recording_url: playUrl,
          twilio_recording_url: recordingUrl || null,
        },
      })
    }
  } catch {
    // Always return valid TwiML back to Twilio.
  }

  return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`)
}
