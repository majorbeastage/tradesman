import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, normalizePhone, pickFirstString } from "./_communications.js"

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

function buildGatherTwiml(message: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Gather action="/api/voicemail-greeting" method="POST" numDigits="6" timeout="8">` +
    `<Say>${xmlEscape(message)}</Say>` +
    `</Gather>` +
    `<Say>We did not receive a pin. Goodbye.</Say>` +
    `<Hangup/>` +
    `</Response>`
  )
}

function buildPhoneVerificationTwiml(userId: string): string {
  const params = new URLSearchParams({ userId })
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Gather action="/api/voicemail-greeting?${xmlEscape(params.toString())}" method="POST" numDigits="10" timeout="10">` +
    `<Say>Your caller number was not recognized. Please enter the ten digit phone number saved on your account.</Say>` +
    `</Gather>` +
    `<Say>We did not receive a phone number. Goodbye.</Say>` +
    `<Hangup/>` +
    `</Response>`
  )
}

function buildRecordGreetingTwiml(userId: string): string {
  const params = new URLSearchParams({ userId })
  const action = `/api/voicemail-greeting-save?${params.toString()}`
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say>After the tone, record your new voicemail greeting. Press pound when you are done.</Say>` +
    `<Record action="${xmlEscape(action)}" method="POST" finishOnKey="#" playBeep="true" maxLength="120" />` +
    `<Say>No recording was received. Goodbye.</Say>` +
    `<Hangup/>` +
    `</Response>`
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST")
    return res.status(405).send("Method not allowed")
  }

  const verifiedUserId = pickFirstString(req.query?.userId, req.body?.userId)
  const callerNumber = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
  const digits = pickFirstString(req.body?.Digits, req.query?.Digits).replace(/\D/g, "")
  if (!digits) {
    return sendTwiml(res, buildGatherTwiml("Please enter your six digit greeting pin."))
  }

  try {
    const supabase = createServiceSupabase()
    if (verifiedUserId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, primary_phone")
        .eq("id", verifiedUserId)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      const accountPhone = normalizePhone((data as { primary_phone?: string } | null)?.primary_phone ?? "")
      if (!data?.id || !accountPhone || digits !== accountPhone.replace(/\D/g, "").slice(-10)) {
        return sendTwiml(
          res,
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say>That phone number did not match the account on file.</Say><Hangup/></Response>`
        )
      }
      return sendTwiml(res, buildRecordGreetingTwiml(String(data.id)))
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, primary_phone")
      .eq("voicemail_greeting_pin", digits)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data?.id) {
      return sendTwiml(res, buildGatherTwiml("That pin was not recognized. Please try again."))
    }
    const accountPhone = normalizePhone((data as { primary_phone?: string } | null)?.primary_phone ?? "")
    if (callerNumber && accountPhone && callerNumber === accountPhone) {
      return sendTwiml(res, buildRecordGreetingTwiml(String(data.id)))
    }
    return sendTwiml(res, buildPhoneVerificationTwiml(String(data.id)))
  } catch {
    return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are unable to update your greeting right now.</Say><Hangup/></Response>`)
  }
}
