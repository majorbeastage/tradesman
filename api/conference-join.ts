import type { VercelRequest, VercelResponse } from "@vercel/node"
import crypto from "node:crypto"
import { findConferenceSessionByPin } from "./_conferenceSession.js"
import { findScheduledConferenceByPin } from "./_scheduledConference.js"
import { firstEnv, pickFirstString } from "./_communications.js"

/**
 * Twilio Voice webhook for conference dial-in.
 * Point a Twilio number's Voice URL here (or set CONFERENCE_DIAL_IN_E164 to that number).
 * Caller hears a prompt, enters the 6-digit PIN, and joins the Twilio Conference room.
 */

function twiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>${body}`)
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function publicUrl(req: VercelRequest): string {
  const proto = pickFirstString(req.headers["x-forwarded-proto"], "https")
  const host = pickFirstString(req.headers["x-forwarded-host"], req.headers.host)
  return `${proto}://${(host || "").split(",")[0].trim()}`
}

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return twiml(res, `<Response><Say voice="alice">This line accepts phone calls only.</Say><Hangup/></Response>`)
  }

  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  if (!authToken || !validTwilioSignature(req, authToken)) {
    return res.status(403).send("Forbidden")
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>
  const step = pickFirstString(req.query?.step as string, body.step as string)
  const digits = pickFirstString(body.Digits, body.digits)

  const actionUrl = `${publicUrl(req).replace(/\/$/, "")}/api/conference-join?step=verify`

  if (step !== "verify" || !digits) {
    return twiml(
      res,
      `<Response>
  <Gather numDigits="8" finishOnKey="#" action="${xmlEscape(actionUrl)}" method="POST" timeout="12">
    <Say voice="alice">Welcome to the conference line. Please enter your conference pin, then press pound.</Say>
  </Gather>
  <Say voice="alice">We did not receive a pin. Goodbye.</Say>
  <Hangup/>
</Response>`,
    )
  }

  const scheduled = await findScheduledConferenceByPin(digits)
  if (scheduled) {
    if (scheduled.joinStatus === "canceled") {
      return twiml(res, `<Response><Say voice="alice">This conference was canceled. Goodbye.</Say><Hangup/></Response>`)
    }
    if (scheduled.joinStatus === "ended") {
      return twiml(res, `<Response><Say voice="alice">This conference has ended. Goodbye.</Say><Hangup/></Response>`)
    }
    if (scheduled.joinStatus === "too_early") {
      return twiml(
        res,
        `<Response>
  <Say voice="alice">This conference has not started yet. Please call back around ${xmlEscape(scheduled.speakableStart)} Eastern time. Goodbye.</Say>
  <Hangup/>
</Response>`,
      )
    }
    return twiml(
      res,
      `<Response>
  <Say voice="alice">Joining ${xmlEscape(scheduled.conference.title)}. One moment please.</Say>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="true">${xmlEscape(scheduled.conference.conferenceName)}</Conference>
  </Dial>
</Response>`,
    )
  }

  const session = await findConferenceSessionByPin(digits)
  if (!session) {
    return twiml(
      res,
      `<Response>
  <Say voice="alice">That pin is not valid or has expired. Please try again.</Say>
  <Gather numDigits="8" finishOnKey="#" action="${xmlEscape(actionUrl)}" method="POST" timeout="12">
    <Say voice="alice">Enter your conference pin, then press pound.</Say>
  </Gather>
  <Hangup/>
</Response>`,
    )
  }

  return twiml(
    res,
    `<Response>
  <Say voice="alice">Joining your conference. One moment please.</Say>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${xmlEscape(session.conferenceName)}</Conference>
  </Dial>
</Response>`,
  )
}
