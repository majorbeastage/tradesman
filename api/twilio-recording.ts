import type { VercelRequest, VercelResponse } from "@vercel/node"
import { firstEnv, verifyAdminJwtAnonOrServiceSupabase } from "./_communications.js"

function isTwilioRecordingSid(value: string): boolean {
  return /^RE[0-9a-f]{32}$/i.test(value.trim())
}

function isTwilioAccountSid(value: string): boolean {
  return /^AC[0-9a-f]{32}$/i.test(value.trim())
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

    const authz = await verifyAdminJwtAnonOrServiceSupabase(token)
    if (!authz.ok) {
      return res.status(authz.status).json(authz.body)
    }

    const queryAccount =
      typeof req.query?.accountSid === "string" ? req.query.accountSid.trim() : ""
    const envAccountSid = firstEnv("TWILIO_ACCOUNT_SID")
    const twilioToken = firstEnv("TWILIO_AUTH_TOKEN")
    if (!twilioToken) {
      return res.status(500).json({ error: "TWILIO_AUTH_TOKEN must be set on the server." })
    }

    /** Account that owns the recording (REST path). Prefer SID from the stored Twilio URL. */
    const ownerSid =
      queryAccount && isTwilioAccountSid(queryAccount)
        ? queryAccount
        : envAccountSid && isTwilioAccountSid(envAccountSid)
          ? envAccountSid
          : ""
    /**
     * HTTP Basic username: Twilio accepts parent (master) Account SID + Auth Token even when the
     * resource path uses a subaccount SID. Using the subaccount SID as Basic username with a parent
     * token returns 401 — common misconfiguration.
     */
    const basicUserSids: string[] = []
    if (envAccountSid && isTwilioAccountSid(envAccountSid)) basicUserSids.push(envAccountSid)
    if (queryAccount && isTwilioAccountSid(queryAccount) && !basicUserSids.includes(queryAccount)) {
      basicUserSids.push(queryAccount)
    }
    if (!ownerSid || basicUserSids.length === 0) {
      return res.status(500).json({
        error: "TWILIO_ACCOUNT_SID must be set on the server (or pass accountSid query from the recording URL).",
      })
    }

    let body: Buffer | null = null
    let contentType = "audio/mpeg"
    let lastStatus = 0
    const pathUrls = [
      `https://api.twilio.com/2010-04-01/Accounts/${ownerSid}/Recordings/${recordingSid}.mp3`,
      `https://api.twilio.com/2010-04-01/Accounts/${ownerSid}/Recordings/${recordingSid}`,
    ]
    for (const basicUser of basicUserSids) {
      const basic = Buffer.from(`${basicUser}:${twilioToken}`).toString("base64")
      for (const url of pathUrls) {
        const r = await fetch(url, { headers: { Authorization: `Basic ${basic}` } })
        if (r.ok) {
          body = Buffer.from(await r.arrayBuffer())
          const ct = r.headers.get("content-type")
          if (ct) contentType = ct.split(";")[0].trim() || contentType
          break
        }
        lastStatus = r.status
      }
      if (body) break
    }

    if (!body) {
      return res.status(502).json({
        error: "Could not download recording from Twilio.",
        hint: `Last HTTP ${lastStatus}. Set TWILIO_ACCOUNT_SID to your Twilio console primary Account SID (and TWILIO_AUTH_TOKEN for that same account) even if recordings live under a subaccount. Confirm the recording exists.`,
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
