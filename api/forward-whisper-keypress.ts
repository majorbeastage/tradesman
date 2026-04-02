import type { VercelRequest, VercelResponse } from "@vercel/node"
import { pickFirstString } from "./_communications.js"

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

function normalizeSpeech(raw: string): string {
  return raw.trim().toLowerCase()
}

function isDeclineInput(digits: string, speech: string): boolean {
  if (digits === "2") return true
  if (!speech) return false
  const s = normalizeSpeech(speech)
  return /\bdecline\b/.test(s) || /\breject\b/.test(s)
}

/** Digit 1, or speech that clearly accepts (avoids treating "don't answer" as accept). */
function isAcceptInput(digits: string, speech: string): boolean {
  if (digits === "1") return true
  if (!speech) return false
  const s = normalizeSpeech(speech)
  if (/\bdecline\b/.test(s) || /\breject\b/.test(s)) return false
  if (/\bdon'?t\s+answer\b/.test(s) || /\bdo\s+not\s+answer\b/.test(s) || /\bnever\s+answer\b/.test(s)) return false
  if (/\banswer\b/.test(s)) return true
  if (/^(yes|ok|okay|accept)\s*$/i.test(speech.trim())) return true
  return false
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
  }

  const digits = pickFirstString(req.body?.Digits)
  const speech = pickFirstString(req.body?.SpeechResult, req.body?.speechResult)

  if (isDeclineInput(digits, speech)) {
    return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`)
  }
  if (isAcceptInput(digits, speech)) {
    return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`)
  }

  // Timeout, wrong key, or unrecognized speech → decline (forwarded leg ends → voicemail path).
  return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`)
}
