import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, logCommunicationEvent, lookupChannelByPublicAddress, normalizePhone, pickFirstString } from "./_communications.js"

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

  console.log("[incoming-call] raw", {
    bodyTo: req.body?.To ?? null,
    bodyFrom: req.body?.From ?? null,
    queryTo: req.query?.To ?? null,
    queryFrom: req.query?.From ?? null,
  })
  const from = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
  const to = normalizePhone(pickFirstString(req.body?.To, req.query?.To))
  const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
  const supabase = createServiceSupabase()
  const channel = to ? await lookupChannelByPublicAddress(supabase, to) : null
  const forwardTo = channel?.voice_enabled ? channel.forward_to_phone : null
  console.log("[incoming-call] resolved", {
    from,
    to,
    callSid,
    channelFound: !!channel,
    channelId: channel?.id ?? null,
    channelPublicAddress: channel?.public_address ?? null,
    voiceEnabled: channel?.voice_enabled ?? null,
    active: channel?.active ?? null,
    forwardTo,
  })
  if (channel?.user_id) {
    await logCommunicationEvent(supabase, {
      user_id: channel.user_id,
      channel_id: channel.id,
      event_type: "call",
      direction: "inbound",
      external_id: callSid || null,
      unread: true,
      metadata: { from, to, provider: channel.provider },
    })
  }
  if (!forwardTo) {
    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are unable to forward your call right now.</Say><Hangup/></Response>`
    )
  }

  const query = new URLSearchParams()
  if (channel?.id) query.set("channelId", channel.id)
  if (to) query.set("to", to)
  if (from) query.set("from", from)
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
