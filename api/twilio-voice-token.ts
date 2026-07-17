import type { VercelRequest, VercelResponse } from "@vercel/node"
import crypto from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { firstEnv, pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"

/**
 * Mints a short-lived Twilio Voice access token for the signed-in user so the
 * browser (Twilio Voice JS SDK) can place calls using the computer mic/speaker.
 *
 * Auth: Authorization: Bearer <Supabase JWT>. Identity = the user's id.
 * Env (Vercel): TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID.
 * The outgoing call is handled by the TwiML App whose Voice URL points to /api/twilio-voice-twiml.
 */

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function buildVoiceAccessToken(opts: {
  accountSid: string
  apiKeySid: string
  apiKeySecret: string
  twimlAppSid: string
  identity: string
  ttlSeconds: number
}): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" }
  const payload = {
    jti: `${opts.apiKeySid}-${now}`,
    grants: {
      identity: opts.identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: opts.twimlAppSid },
      },
    },
    iat: now,
    nbf: now,
    exp: now + opts.ttlSeconds,
    iss: opts.apiKeySid,
    sub: opts.accountSid,
  }
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = crypto.createHmac("sha256", opts.apiKeySecret).update(data).digest()
  return `${data}.${b64url(sig)}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Capacitor (Android/iOS) WebViews call this from a non-site origin.
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type")
  if (req.method === "OPTIONS") return res.status(204).end()

  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET, OPTIONS")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const authHeader = req.headers.authorization || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : ""
  if (!token) return res.status(401).json({ error: "Missing Authorization: Bearer <token>" })

  const supabaseUrl = pickSupabaseUrlForServer()
  const anonKey = pickSupabaseAnonKeyForServer()
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: "Server missing SUPABASE_URL / SUPABASE_ANON_KEY" })
  }

  let userId: string
  try {
    const sb = createClient(supabaseUrl, anonKey)
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data?.user) return res.status(401).json({ error: "Invalid session" })
    userId = data.user.id
  } catch (e) {
    return res.status(401).json({ error: e instanceof Error ? e.message : "Auth failed" })
  }

  const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const apiKeySid = firstEnv("TWILIO_API_KEY_SID", "TWILIO_API_KEY")
  const apiKeySecret = firstEnv("TWILIO_API_KEY_SECRET", "TWILIO_API_SECRET")
  const twimlAppSid = firstEnv("TWILIO_TWIML_APP_SID", "TWILIO_VOICE_APP_SID")
  const missing = [
    !accountSid ? "TWILIO_ACCOUNT_SID" : "",
    !apiKeySid ? "TWILIO_API_KEY_SID" : "",
    !apiKeySecret ? "TWILIO_API_KEY_SECRET" : "",
    !twimlAppSid ? "TWILIO_TWIML_APP_SID" : "",
  ].filter(Boolean)
  if (missing.length) {
    return res.status(500).json({
      error: `Twilio Voice is not configured on the server. Missing env: ${missing.join(", ")}.`,
      hint: "In Twilio Console create an API Key (SID + Secret) and a TwiML App whose Voice Request URL is /api/twilio-voice-twiml, then add these env vars on Vercel and redeploy.",
    })
  }

  const jwt = buildVoiceAccessToken({
    accountSid,
    apiKeySid,
    apiKeySecret,
    twimlAppSid,
    identity: userId,
    ttlSeconds: 3600,
  })

  res.setHeader("Cache-Control", "no-store")
  return res.status(200).json({ token: jwt, identity: userId })
}
