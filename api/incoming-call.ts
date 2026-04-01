import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  buildVoicemailTwiml,
  createLeadForInboundCall,
  createServiceSupabase,
  getOrCreateConversation,
  getOrCreateCustomerByPhone,
  getUserRoutingProfile,
  isWithinBusinessHours,
  logCommunicationEvent,
  lookupChannelByPublicAddress,
  normalizePhone,
  pickFirstString,
} from "./_communications.js"

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
  }

  const from = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
  const to = normalizePhone(pickFirstString(req.body?.To, req.query?.To))
  const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
  const supabase = createServiceSupabase()
  const channel = to ? await lookupChannelByPublicAddress(supabase, to) : null
  const routingProfile = channel?.user_id ? await getUserRoutingProfile(supabase, channel.user_id) : null
  const forwardingAllowed = isWithinBusinessHours(routingProfile)
  const forwardTo = channel?.voice_enabled && forwardingAllowed ? channel.forward_to_phone : null
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
      external_id: callSid || null,
      unread: true,
      previous_customer: customer?.previousCustomer ?? false,
      metadata: { from, to, provider: channel.provider },
    })
  }
  const query = new URLSearchParams()
  if (channel?.id) query.set("channelId", channel.id)
  if (to) query.set("to", to)
  if (from) query.set("from", from)
  const voicemailActionUrl = `/api/voicemail-complete${query.size ? `?${query.toString()}` : ""}`
  if (!forwardTo) {
    return sendTwiml(res, buildVoicemailTwiml({ recordAction: voicemailActionUrl, routingProfile }))
  }

  const dialActionUrl = `/api/dial-result${query.size ? `?${query.toString()}` : ""}`
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Dial timeout="20" action="${xmlEscape(dialActionUrl)}" method="POST">` +
    `${xmlEscape(forwardTo)}` +
    `</Dial>` +
    `</Response>`

  return sendTwiml(res, twiml)
}
