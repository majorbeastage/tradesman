import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createLeadForInboundCall, createServiceSupabase, getOrCreateConversation, getOrCreateCustomerByPhone, logCommunicationEvent, lookupChannelById, normalizePhone, pickFirstString } from "./_communications.js"

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
  }

  const channelId = typeof req.query?.channelId === "string" ? req.query.channelId : ""
  const to = normalizePhone(pickFirstString(req.body?.To, req.query?.to, req.query?.To))
  const from = normalizePhone(pickFirstString(req.body?.From, req.query?.from, req.query?.From))
  const dialCallStatus =
    typeof req.body?.DialCallStatus === "string"
      ? req.body.DialCallStatus
      : typeof req.query?.DialCallStatus === "string"
        ? req.query.DialCallStatus
        : ""
  const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
  const dialCallSid = pickFirstString(req.body?.DialCallSid, req.query?.DialCallSid)

  if (dialCallStatus === "no-answer" || dialCallStatus === "busy" || dialCallStatus === "failed") {
    let recordAction = "/api/voicemail-result"
    if (channelId || to || from) {
      const params = new URLSearchParams()
      if (channelId) params.set("channelId", channelId)
      if (to) params.set("to", to)
      if (from) params.set("from", from)
      recordAction += `?${params.toString()}`
    }

    try {
      const supabase = createServiceSupabase()
      const channel = channelId ? await lookupChannelById(supabase, channelId) : null
      if (channel?.user_id) {
        const customer = from ? await getOrCreateCustomerByPhone(supabase, channel.user_id, from) : null
        const conversationId = customer ? await getOrCreateConversation(supabase, channel.user_id, customer.customerId, "phone") : null
        const leadId = customer ? await createLeadForInboundCall(supabase, channel.user_id, customer.customerId, from) : null
        await logCommunicationEvent(supabase, {
          user_id: channel.user_id,
          customer_id: customer?.customerId ?? null,
          conversation_id: conversationId,
          lead_id: leadId,
          channel_id: channel.id,
          event_type: "call",
          direction: "inbound",
          external_id: dialCallSid || callSid || null,
          body: `Missed call (${dialCallStatus})`,
          previous_customer: customer?.previousCustomer ?? false,
          unread: true,
          metadata: { from, to, dial_call_status: dialCallStatus, provider: channel.provider },
        })
      }
    } catch {
      // Twilio still needs a TwiML response even if logging fails.
    }

    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Say>Sorry we missed your call. Please leave a message after the tone.</Say>` +
      `<Record action="${recordAction}" method="POST" transcribe="true" />` +
      `</Response>`

    return sendTwiml(res, twiml)
  }

  return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`)
}
