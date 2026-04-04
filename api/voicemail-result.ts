import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createLeadForInboundCall, createServiceSupabase, getOrCreateConversation, getOrCreateCustomerByPhone, logCommunicationEvent, lookupChannelById, normalizePhone, pickFirstString } from "./_communications.js"

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
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
      const summaryText =
        transcriptionText && transcriptionText.length > 280
          ? `${transcriptionText.slice(0, 277)}...`
          : transcriptionText || null
      for (const userId of notifyUserIds) {
        await logCommunicationEvent(supabase, {
          user_id: userId,
          customer_id: null,
          conversation_id: null,
          channel_id: null,
          event_type: "voicemail",
          direction: "inbound",
          external_id: recordingSid || null,
          body: transcriptionText || "Help desk voicemail",
          recording_url: recordingUrl || null,
          transcript_text: transcriptionText || null,
          summary_text: summaryText,
          previous_customer: false,
          unread: true,
          metadata: {
            from,
            to,
            help_desk: true,
            voicemail_completed_at: completedAt,
            caller_number: from,
            recording_url: recordingUrl || null,
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
      const summaryText =
        channel.voicemail_mode === "summary" && transcriptionText
          ? transcriptionText.length > 280
            ? `${transcriptionText.slice(0, 277)}...`
            : transcriptionText
          : null

      await logCommunicationEvent(supabase, {
        user_id: channel.user_id,
        customer_id: customer.customerId,
        conversation_id: conversationId,
        lead_id: leadId,
        channel_id: channel.id,
        event_type: "voicemail",
        direction: "inbound",
        external_id: recordingSid || null,
        body: transcriptionText || "Voicemail received",
        recording_url: recordingUrl || null,
        transcript_text: transcriptionText || null,
        summary_text: summaryText,
        previous_customer: customer.previousCustomer,
        unread: true,
        metadata: {
          from,
          to,
          provider: channel.provider,
          voicemail_mode: channel.voicemail_mode,
          voicemail_completed_at: completedAt,
          caller_number: from,
          recording_url: recordingUrl || null,
        },
      })
    }
  } catch {
    // Always return valid TwiML back to Twilio.
  }

  return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`)
}
