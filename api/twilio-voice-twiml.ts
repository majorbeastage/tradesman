import type { VercelRequest, VercelResponse } from "@vercel/node"
import crypto from "node:crypto"
import {
  createServiceSupabase,
  firstEnv,
  pickFirstString,
  toTwilioE164,
} from "./_communications.js"

/**
 * TwiML App Voice Request URL for the in-browser softphone.
 * The Twilio Voice JS SDK calls device.connect({ params: { To } }); Twilio POSTs here.
 *   From = "client:<userId>" (the authenticated SDK identity)
 *   To   = the number the user typed (custom param)
 * We dial that number from the user's Twilio business line (Admin -> Communications),
 * so audio flows through the computer mic/speaker over WebRTC.
 *
 * Configure this exact URL (no query string) as the TwiML App Voice Request URL.
 * Requires TWILIO_AUTH_TOKEN on Vercel for X-Twilio-Signature validation.
 */

function twiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>${body}`)
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function say(message: string): string {
  return `<Response><Say voice="alice">${xmlEscape(message)}</Say><Hangup/></Response>`
}

function publicUrl(req: VercelRequest): string {
  const proto = pickFirstString(req.headers["x-forwarded-proto"], "https")
  const host = pickFirstString(req.headers["x-forwarded-host"], req.headers.host)
  return `${proto}://${(host || "").split(",")[0].trim()}${req.url || ""}`
}

/** Twilio POST signature: base64(HMAC-SHA1(authToken, url + sorted(key+value...))). */
function validTwilioSignature(req: VercelRequest, authToken: string): boolean {
  const provided = pickFirstString(req.headers["x-twilio-signature"])
  if (!provided) return false
  const params = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>
  const url = publicUrl(req)
  let data = url
  for (const key of Object.keys(params).sort()) {
    const v = params[key]
    data += key + (v == null ? "" : String(v))
  }
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64")
  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

async function resolveCallerId(userId: string): Promise<string | null> {
  try {
    const admin = createServiceSupabase()
    const { data } = await admin
      .from("client_communication_channels")
      .select("public_address, voice_enabled, sms_enabled")
      .eq("user_id", userId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(40)
    const rows = (data ?? []) as { public_address?: string | null; voice_enabled?: boolean | null; sms_enabled?: boolean | null }[]
    const score = (r: { voice_enabled?: boolean | null; sms_enabled?: boolean | null }) =>
      (r.voice_enabled === true ? 2 : 0) + (r.sms_enabled === true ? 1 : 0)
    const sorted = rows
      .filter((r) => r.voice_enabled === true || r.sms_enabled === true)
      .sort((a, b) => score(b) - score(a))
    for (const r of sorted) {
      const e164 = toTwilioE164(typeof r.public_address === "string" ? r.public_address : "")
      if (e164) return e164
    }
  } catch {
    /* fall through to env fallback */
  }
  const fallback = toTwilioE164(firstEnv("TWILIO_FROM_NUMBER", "SMS_DEFAULT_FROM_NUMBER"))
  return fallback || null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return twiml(res, say("This endpoint accepts calls from the Tradesman app only."))
  }

  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  if (!authToken || !validTwilioSignature(req, authToken)) {
    return res.status(403).send("Forbidden")
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>
  const from = pickFirstString(body.From, body.Caller)
  const userId = from.startsWith("client:") ? from.slice("client:".length).trim() : ""
  const to = toTwilioE164(pickFirstString(body.To))

  if (!to) return twiml(res, say("No destination number was provided."))
  if (!userId) return twiml(res, say("Your calling session is invalid. Please reload and try again."))

  const callerId = await resolveCallerId(userId)
  if (!callerId) {
    return twiml(
      res,
      say("No outbound business number is set up for your account. Add your Twilio number under Admin, Communications."),
    )
  }

  return twiml(
    res,
    `<Response><Dial answerOnBridge="true" callerId="${xmlEscape(callerId)}" timeout="45"><Number>${xmlEscape(to)}</Number></Dial></Response>`,
  )
}
