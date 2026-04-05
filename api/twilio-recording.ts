import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv } from "./_communications.js"

function isTwilioRecordingSid(value: string): boolean {
  return /^RE[0-9a-f]{32}$/i.test(value.trim())
}

/**
 * Stream a Twilio recording with server-side Basic auth so browsers never see api.twilio.com credentials.
 * Requires an admin Supabase JWT (same session as Admin portal).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization")

  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })

  try {
    const auth = typeof req.headers.authorization === "string" ? req.headers.authorization : ""
    const token = auth.replace(/^Bearer\s+/i, "").trim()
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" })

    const recordingSid =
      typeof req.query?.recordingSid === "string"
        ? req.query.recordingSid.trim()
        : typeof req.query?.sid === "string"
          ? req.query.sid.trim()
          : ""
    if (!recordingSid || !isTwilioRecordingSid(recordingSid)) {
      return res.status(400).json({ error: "Query recordingSid must be a Twilio Recording SID (RE + 32 hex chars)." })
    }

    const supabase = createServiceSupabase()
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: "Invalid or expired session" })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle()
    if ((profile as { role?: string } | null)?.role !== "admin") {
      return res.status(403).json({ error: "Admin only" })
    }

    const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
    const authToken = firstEnv("TWILIO_AUTH_TOKEN")
    if (!accountSid || !authToken) {
      return res.status(500).json({ error: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set on the server." })
    }

    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64")
    const candidates = [
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`,
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}`,
    ]

    let body: Buffer | null = null
    let contentType = "audio/mpeg"
    let lastStatus = 0
    for (const url of candidates) {
      const r = await fetch(url, { headers: { Authorization: `Basic ${basic}` } })
      if (r.ok) {
        body = Buffer.from(await r.arrayBuffer())
        const ct = r.headers.get("content-type")
        if (ct) contentType = ct.split(";")[0].trim() || contentType
        break
      }
      lastStatus = r.status
    }

    if (!body) {
      return res.status(502).json({
        error: "Could not download recording from Twilio.",
        hint: `Last HTTP ${lastStatus}. Confirm the recording exists and Twilio credentials match the account that created it.`,
      })
    }

    res.setHeader("Content-Type", contentType)
    res.setHeader("Cache-Control", "private, max-age=300")
    return res.status(200).send(body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[twilio-recording]", msg)
    return res.status(500).json({ error: "twilio-recording failed", message: msg })
  }
}
