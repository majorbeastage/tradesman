import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  buildVoicemailTwiml,
  createLeadForInboundCall,
  createServiceSupabase,
  customerHasOpenConversation,
  getOrCreateConversation,
  getOrCreateCustomerByPhone,
  getUserRoutingProfile,
  logCommunicationEvent,
  lookupChannelById,
  isInboundCallerOurBusinessNumber,
  normalizePhone,
  pickFirstString,
} from "./_communications.js"

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

function requestPublicOrigin(req: VercelRequest): string {
  const proto = pickFirstString(req.headers["x-forwarded-proto"], "https")
  const host = pickFirstString(req.headers["x-forwarded-host"], req.headers.host)
  if (!host) return "https://tradesman.vercel.app"
  return `${proto}://${host.split(",")[0].trim()}`
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
  const dialBridgedRaw = pickFirstString(req.body?.DialBridged, req.query?.DialBridged)
  const dialNotBridged = dialBridgedRaw.toLowerCase() === "false"
  const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
  const dialCallSid = pickFirstString(req.body?.DialCallSid, req.query?.DialCallSid)

  // Forward-whisper decline (or Gather timeout → Hangup) ends the callee leg before A–B bridge → DialCallStatus completed + DialBridged false. Send caller to voicemail.
  const screeningDeclinedOrNeverBridged = dialCallStatus === "completed" && dialNotBridged

  if (
    dialCallStatus === "no-answer" ||
    dialCallStatus === "busy" ||
    dialCallStatus === "failed" ||
    dialCallStatus === "canceled" ||
    screeningDeclinedOrNeverBridged
  ) {
    const origin = requestPublicOrigin(req)
    const params = new URLSearchParams()
    if (channelId) params.set("channelId", channelId)
    if (to) params.set("to", to)
    if (from) params.set("from", from)
    const recordAction = `${origin}/api/voicemail-result${params.size ? `?${params.toString()}` : ""}`
    const transcribeUrl = `${recordAction}${params.size ? "&" : "?"}phase=transcribe`

    try {
      const supabase = createServiceSupabase()
      const channel = channelId ? await lookupChannelById(supabase, channelId) : null
      const routingProfile = channel?.user_id ? await getUserRoutingProfile(supabase, channel.user_id) : null
      const skipCrm = Boolean(channel && from && isInboundCallerOurBusinessNumber(from, to, channel))
      if (channel?.user_id && !skipCrm) {
        const customer = from ? await getOrCreateCustomerByPhone(supabase, channel.user_id, from) : null
        const inConversations =
          customer ? await customerHasOpenConversation(supabase, channel.user_id, customer.customerId) : false
        const conversationId =
          customer && inConversations
            ? await getOrCreateConversation(supabase, channel.user_id, customer.customerId, "phone")
            : null
        const leadId =
          customer && !inConversations ? await createLeadForInboundCall(supabase, channel.user_id, customer.customerId, from) : null
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
      return sendTwiml(
        res,
        buildVoicemailTwiml({ recordAction, transcribeCallback: transcribeUrl, routingProfile }),
      )
    } catch {
      // Twilio still needs a TwiML response even if logging fails.
    }
    return sendTwiml(
      res,
      buildVoicemailTwiml({ recordAction, transcribeCallback: transcribeUrl, routingProfile: null }),
    )
  }

  // Normal hangup after callee and caller were connected (whisper accepted or no whisper).
  return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`)
}
