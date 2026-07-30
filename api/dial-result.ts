import { waitUntil } from "@vercel/functions"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  buildVoicemailTwiml,
  createLeadForInboundCall,
  createServiceSupabase,
  customerHasOpenConversation,
  getOrCreateConversation,
  getOrCreateCustomerByPhone,
  getUserRoutingProfile,
  isWithinBusinessHours,
  logCommunicationEvent,
  lookupChannelById,
  isInboundCallerOurBusinessNumber,
  normalizePhone,
  pickFirstString,
  toTwilioE164,
} from "./_communications.js"
import { recordSmsConsentFromInboundCall, runMissedCallAutoTextBack } from "./_conversationAutoReply.js"
import { loadCallHuntingForUser } from "./_callHunting.js"

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

  console.info("[dial-result] twilio callback", {
    dialCallStatus: dialCallStatus || null,
    dialBridged: dialBridgedRaw || null,
    channelId: channelId || null,
    to: to || null,
    from: from || null,
    callSid: callSid || null,
    dialCallSid: dialCallSid || null,
  })

  // Forward-whisper decline (or Gather timeout → Hangup) ends the callee leg before A–B bridge → DialCallStatus completed + DialBridged false. Send caller to voicemail.
  const screeningDeclinedOrNeverBridged = dialCallStatus === "completed" && dialNotBridged

  const missedForward =
    dialCallStatus === "no-answer" ||
    dialCallStatus === "busy" ||
    dialCallStatus === "failed" ||
    dialCallStatus === "canceled" ||
    screeningDeclinedOrNeverBridged

  if (missedForward) {
    const origin = requestPublicOrigin(req)
    const huntEnabled = pickFirstString(req.query?.hunt) === "1"
    const huntMode = pickFirstString(req.query?.huntMode)
    const huntIndex = Number(pickFirstString(req.query?.huntIndex) || "0")
    const huntPhones = pickFirstString(req.query?.huntPhones)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)

    // Sequential hunt: try the next number on no-answer/busy/failed — not when the callee declined whisper.
    if (
      huntEnabled &&
      huntMode === "sequential" &&
      !screeningDeclinedOrNeverBridged &&
      Number.isFinite(huntIndex) &&
      huntIndex + 1 < huntPhones.length
    ) {
      const nextIndex = huntIndex + 1
      const nextPhone = toTwilioE164(huntPhones[nextIndex]) || normalizePhone(huntPhones[nextIndex]) || huntPhones[nextIndex]
      console.info("[dial-result] sequential_hunt_next", {
        dialCallStatus: dialCallStatus || null,
        nextIndex,
        nextPhone,
      })
      try {
        const supabase = createServiceSupabase()
        const channel = channelId ? await lookupChannelById(supabase, channelId) : null
        const routingProfile = channel?.user_id ? await getUserRoutingProfile(supabase, channel.user_id) : null
        const hunting = channel?.user_id ? await loadCallHuntingForUser(supabase, channel.user_id) : null
        const ringSeconds = hunting?.ringSeconds ?? 22
        const twilioDid = to || normalizePhone(channel?.public_address ?? "") || ""
        const inboundFrom = from && !/^anonymous$/i.test(from) ? from : twilioDid
        const callerIdForDial =
          routingProfile?.forward_dial_caller_id_mode === "twilio_number" && twilioDid
            ? twilioDid
            : inboundFrom || twilioDid
        const withinBusinessHours = isWithinBusinessHours(routingProfile)
        const whisperEnabled = routingProfile?.forward_whisper_on_answer === true
        const whisperOnlyOutsideHours = routingProfile?.forward_whisper_only_outside_business_hours === true
        const useWhisper =
          whisperEnabled && channel?.user_id && (!whisperOnlyOutsideHours || !withinBusinessHours)
        const whisperParams = new URLSearchParams()
        if (channel?.user_id) whisperParams.set("userId", channel.user_id)
        if (from) whisperParams.set("from", from)
        const whisperUrl = `${origin}/api/forward-whisper${whisperParams.size ? `?${whisperParams.toString()}` : ""}`
        const nextQuery = new URLSearchParams()
        if (channelId) nextQuery.set("channelId", channelId)
        if (to) nextQuery.set("to", to)
        if (from) nextQuery.set("from", from)
        nextQuery.set("hunt", "1")
        nextQuery.set("huntMode", "sequential")
        nextQuery.set("huntIndex", String(nextIndex))
        nextQuery.set("huntPhones", huntPhones.join(","))
        const dialActionUrl = `${origin}/api/dial-result?${nextQuery.toString()}`
        const dialInner = useWhisper
          ? `<Number url="${xmlEscape(whisperUrl)}">${xmlEscape(nextPhone)}</Number>`
          : `<Number>${xmlEscape(nextPhone)}</Number>`
        const answerOnBridge = useWhisper ? "true" : "false"
        const dialTimeoutSec = Math.min(45, Math.max(8, ringSeconds))
        return sendTwiml(
          res,
          `<?xml version="1.0" encoding="UTF-8"?><Response>` +
            `<Dial answerOnBridge="${answerOnBridge}" timeout="${dialTimeoutSec}" action="${xmlEscape(dialActionUrl)}" method="POST" callerId="${xmlEscape(callerIdForDial)}">` +
            dialInner +
            `</Dial></Response>`,
        )
      } catch (e) {
        console.error("[dial-result] sequential hunt failed — voicemail", e instanceof Error ? e.message : e)
      }
    }

    console.info("[dial-result] route_to_voicemail", {
      dialCallStatus: dialCallStatus || null,
      screeningDeclinedOrNeverBridged,
    })
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
        if (customer?.customerId && from) {
          const sideEffects = (async () => {
            try {
              await recordSmsConsentFromInboundCall(supabase, channel!.user_id!, customer.customerId)
              await runMissedCallAutoTextBack(supabase, {
                userId: channel!.user_id!,
                customerId: customer.customerId,
                customerPhone: from,
                conversationId,
                leadId,
                dialCallStatus,
              })
            } catch (e) {
              console.warn("[dial-result] missed call auto text-back", e instanceof Error ? e.message : e)
            }
          })()
          try {
            waitUntil(sideEffects)
          } catch {
            void sideEffects
          }
        }
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
