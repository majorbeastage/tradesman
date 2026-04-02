import type { VercelRequest, VercelResponse } from "@vercel/node"
import { pickFirstString } from "./_communications.js"

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

function sanitizeName(value: string): string {
  return value.replace(/[^\w\s'.-]/g, "").replace(/\s+/g, " ").trim().slice(0, 48)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST")
    return res.status(405).send("Method not allowed")
  }

  const from = pickFirstString(req.query?.from, req.body?.from, req.body?.From)
  const nameRaw = pickFirstString(req.query?.name, req.body?.name)
  const digits = from.replace(/\D/g, "").slice(-10)
  const sayDigits = digits ? digits.split("").join(" ") : ""
  const safeName = nameRaw ? sanitizeName(nameRaw) : ""

  let line: string
  if (safeName && sayDigits) {
    line = `Incoming Tradesman call from ${safeName}. Caller number ${sayDigits}.`
  } else if (safeName) {
    line = `Incoming Tradesman call from ${safeName}.`
  } else if (sayDigits) {
    line = `Incoming Tradesman call. Caller number ${sayDigits}.`
  } else {
    line = "Incoming Tradesman forwarded call."
  }

  return sendTwiml(
    res,
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Say voice="Polly.Joanna">${xmlEscape(line)}</Say>` +
      `</Response>`
  )
}
