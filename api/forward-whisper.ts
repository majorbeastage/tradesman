import type { VercelRequest, VercelResponse } from "@vercel/node"
import {
  createServiceSupabase,
  getUserRoutingProfile,
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

function requestPublicOrigin(req: VercelRequest): string {
  const proto = pickFirstString(req.headers["x-forwarded-proto"], "https")
  const host = pickFirstString(req.headers.host)
  if (!host) return "https://tradesman.vercel.app"
  return `${proto}://${host}`
}

function sanitizeName(value: string): string {
  return value.replace(/[^\w\s'.-]/g, "").replace(/\s+/g, " ").trim().slice(0, 48)
}

const MAX_WHISPER_CHARS = 500

function digitsForSpeech(fromNormalized: string): { spoken: string } {
  const digits = fromNormalized.replace(/\D/g, "")
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits
  return {
    spoken: last10 ? last10.split("").join(" ") : "",
  }
}

function defaultWhisperLine(callerName: string, spokenDigits: string): string {
  if (callerName && spokenDigits) {
    return `Incoming Tradesman call from ${callerName}. Caller number ${spokenDigits}.`
  }
  if (callerName) {
    return `Incoming Tradesman call from ${callerName}.`
  }
  if (spokenDigits) {
    return `Incoming Tradesman call. Caller number ${spokenDigits}.`
  }
  return "Incoming Tradesman forwarded call."
}

function applyWhisperTemplate(
  template: string,
  vars: { caller_name: string; caller_phone: string; caller_phone_spoken: string }
): string {
  return template
    .replace(/\{caller_name\}/gi, vars.caller_name)
    .replace(/\{caller_phone\}/gi, vars.caller_phone)
    .replace(/\{caller_phone_spoken\}/gi, vars.caller_phone_spoken)
    .slice(0, MAX_WHISPER_CHARS)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST")
    return res.status(405).send("Method not allowed")
  }

  const userId = pickFirstString(req.query?.userId, req.body?.userId)
  const fromRaw = pickFirstString(req.query?.from, req.body?.from, req.body?.From)
  const nameFromQuery = pickFirstString(req.query?.name, req.body?.name)
  const fromNormalized = normalizePhone(fromRaw)
  const { spoken } = digitsForSpeech(fromNormalized)
  const callerPhoneDisplay = fromNormalized || fromRaw.trim() || "unknown"
  const nameFromQuerySafe = nameFromQuery ? sanitizeName(nameFromQuery) : ""
  let requireKeypress = false
  let template: string | null = null

  if (userId) {
    try {
      const supabase = createServiceSupabase()
      const profile = await getUserRoutingProfile(supabase, userId)
      if (profile) {
        requireKeypress = profile.forward_whisper_require_keypress === true
        template = profile.forward_whisper_announcement_template
      }
    } catch {
      // Fall back to query-only announcement below
    }
  }

  const callerNameForVars = nameFromQuerySafe || "Unknown caller"
  const line =
    template && template.trim()
      ? applyWhisperTemplate(template.trim(), {
          caller_name: callerNameForVars,
          caller_phone: callerPhoneDisplay,
          caller_phone_spoken: spoken || "unknown",
        })
      : defaultWhisperLine(nameFromQuerySafe, spoken)

  const origin = requestPublicOrigin(req)
  const keypressUrl = `${origin}/api/forward-whisper-keypress`

  const say = `<Say voice="Polly.Joanna">${xmlEscape(line)}</Say>`

  let inner: string
  if (requireKeypress) {
    // Short timeout so carriers see a quick decision; no input → action with empty Digits/SpeechResult → Hangup → inbound Dial completes → voicemail.
    inner =
      say +
      `<Gather input="speech dtmf" numDigits="1" timeout="5" speechTimeout="auto" language="en-US" hints="answer, decline" action="${xmlEscape(keypressUrl)}" method="POST">` +
      `<Say voice="Polly.Joanna">Press 1 or say answer to accept. Press 2 or say decline to send the call to voicemail.</Say>` +
      `</Gather>` +
      `<Hangup/>`
  } else {
    inner = say
  }

  return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`)
}
