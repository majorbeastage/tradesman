import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv, normalizePhone, pickFirstString } from "./_communications.js"

const VOICEMAIL_GREETING_BUCKET = "voicemail-greetings"

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

const SAY = `voice="Polly.Matthew" language="en-US"`

/** Last 10 digits for US-style caller / forward match. */
function phoneKey(value: string): string {
  const d = value.replace(/\D/g, "")
  if (d.length <= 10) return d
  return d.slice(-10)
}

/**
 * If the caller ID matches exactly one account (by profile.primary_phone or a unique
 * active channel forward_to_phone), skip PIN / phone re-entry and go straight to recording.
 */
async function resolveTrustedGreetingUserId(callerNorm: string): Promise<string | null> {
  const key = phoneKey(callerNorm)
  if (key.length < 10) return null
  try {
    const supabase = createServiceSupabase()
    const { data: profiles, error: pErr } = await supabase.from("profiles").select("id, primary_phone").not("primary_phone", "is", null)
    if (pErr) throw pErr
    const byPrimary: string[] = []
    for (const row of profiles ?? []) {
      const id = (row as { id?: string }).id
      const ph = normalizePhone((row as { primary_phone?: string }).primary_phone ?? "")
      if (!id || !ph) continue
      if (phoneKey(ph) === key) byPrimary.push(String(id))
    }
    if (byPrimary.length === 1) return byPrimary[0]

    const { data: channels, error: cErr } = await supabase
      .from("client_communication_channels")
      .select("user_id, forward_to_phone")
      .eq("active", true)
      .not("forward_to_phone", "is", null)
    if (cErr) throw cErr
    const byForward = new Set<string>()
    for (const row of channels ?? []) {
      const uid = (row as { user_id?: string }).user_id
      const fwd = normalizePhone((row as { forward_to_phone?: string }).forward_to_phone ?? "")
      if (!uid || !fwd) continue
      if (phoneKey(fwd) === key) byForward.add(String(uid))
    }
    if (byForward.size === 1) return [...byForward][0]
    return null
  } catch (e) {
    console.error("[voicemail-greeting] resolveTrustedGreetingUserId", e instanceof Error ? e.message : e)
    return null
  }
}

function requestPublicOrigin(req: VercelRequest): string {
  const proto = pickFirstString(req.headers["x-forwarded-proto"], "https")
  const host = pickFirstString(req.headers.host)
  if (!host) return "https://tradesman.vercel.app"
  return `${proto}://${host}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Twilio RecordingUrl paths include /Accounts/AC…/ — use that for REST URLs when it differs from env (subaccounts). */
function extractAccountSidFromTwilioUrl(url: string): string | null {
  const m = /\/Accounts\/(AC[a-f0-9]{32})\//i.exec(url)
  return m ? m[1] : null
}

function maskSid(s: string): string {
  if (s.length <= 8) return "…"
  return `…${s.slice(-6)}`
}

/**
 * Twilio often POSTs the Record action before the MP3 is downloadable; short retries fix most "save failed" cases.
 * RecordingUrl may be empty in edge cases; RecordingSid + Account credentials still work via REST.
 * If the number lives on a subaccount, RecordingUrl usually contains that subaccount’s AC… — we use it for REST paths
 * so TWILIO_ACCOUNT_SID on Vercel can be the parent while downloads still target the correct account.
 */
async function fetchTwilioRecordingBuffer(recordingUrl: string, recordingSid?: string): Promise<ArrayBuffer> {
  const accountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  if (!accountSid || !authToken) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN (required to download the recording from Twilio)")
  }
  const authHeader = { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` }
  const urlAccountSid = recordingUrl ? extractAccountSidFromTwilioUrl(recordingUrl) : null
  const restAccountSid = urlAccountSid || accountSid

  const candidates: string[] = []
  if (recordingUrl) {
    candidates.push(
      ...(recordingUrl.endsWith(".mp3")
        ? [recordingUrl, recordingUrl.replace(/\.mp3$/i, "")]
        : [`${recordingUrl}.mp3`, recordingUrl])
    )
  }
  if (recordingSid && restAccountSid) {
    const base = `https://api.twilio.com/2010-04-01/Accounts/${restAccountSid}/Recordings/${recordingSid}`
    candidates.push(`${base}.mp3`, base)
  }
  if (recordingSid && urlAccountSid && accountSid && urlAccountSid !== accountSid) {
    const baseParent = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}`
    candidates.push(`${baseParent}.mp3`, baseParent)
  }

  const seen = new Set<string>()
  const unique = candidates.filter((u) => {
    if (!u || seen.has(u)) return false
    seen.add(u)
    return true
  })
  if (unique.length === 0) {
    throw new Error("No Twilio recording URL or RecordingSid to download")
  }

  let lastStatus = 0
  const maxRounds = 6
  for (let round = 0; round < maxRounds; round++) {
    for (const url of unique) {
      const response = await fetch(url, { headers: authHeader })
      if (response.ok) {
        if (round > 0) {
          console.log("[voicemail-greeting] Twilio recording download succeeded after retries", { round, recordingSid: recordingSid ? maskSid(recordingSid) : null })
        }
        const ct = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
        const buf = await response.arrayBuffer()
        return { arrayBuffer: buf, contentType: ct, sourceUrl: url }
      }
      lastStatus = response.status
    }
    if (round < maxRounds - 1) await sleep(700 + round * 350)
  }

  const hint =
    lastStatus === 401 || lastStatus === 403
      ? "HTTP 401/403: TWILIO_AUTH_TOKEN (and usually TWILIO_ACCOUNT_SID) must be for the Twilio account that owns this phone number. If the number is on a subaccount, use that subaccount’s SID + Auth Token in Vercel, or use master credentials that can access subaccount API URLs."
      : lastStatus === 404
        ? "HTTP 404: recording not found yet (retries exhausted) or wrong Account SID for this RecordingSid."
        : "Check Twilio credentials and that the call was recorded on the same Twilio project."

  console.error("[voicemail-greeting] Twilio recording download failed", {
    lastHttpStatus: lastStatus,
    retries: maxRounds,
    hasRecordingUrl: Boolean(recordingUrl),
    hasRecordingSid: Boolean(recordingSid),
    envAccount: maskSid(accountSid),
    urlAccount: urlAccountSid ? maskSid(urlAccountSid) : null,
    candidateCount: unique.length,
    hint,
  })

  throw new Error(`Failed to fetch Twilio recording (last HTTP ${lastStatus}). ${hint}`)
}

function pickUploadFormat(contentType: string, sourceUrl: string): { ext: string; contentType: string } {
  const u = sourceUrl.toLowerCase()
  if (contentType.includes("wav") || u.includes(".wav")) return { ext: "wav", contentType: "audio/wav" }
  if (contentType.includes("mpeg") || contentType.includes("mp3") || u.includes(".mp3")) return { ext: "mp3", contentType: "audio/mpeg" }
  // Twilio often returns audio/mpeg for phone recordings; default MP3 filename is OK for playback
  return { ext: "mp3", contentType: "audio/mpeg" }
}

async function uploadTwilioRecordingToStorage(userId: string, recordingUrl: string, recordingSid?: string): Promise<string> {
  const { arrayBuffer, contentType, sourceUrl } = await fetchTwilioRecordingBuffer(recordingUrl, recordingSid)
  const { ext, contentType: uploadCt } = pickUploadFormat(contentType, sourceUrl)
  const supabase = createServiceSupabase()
  const filePath = `${userId}/greeting-callin-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(VOICEMAIL_GREETING_BUCKET)
    .upload(filePath, arrayBuffer, { upsert: true, contentType: uploadCt })
  if (error) throw error
  const { data } = supabase.storage.from(VOICEMAIL_GREETING_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

async function handleGreetingSave(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
  }

  const userId = pickFirstString(req.query?.userId, req.body?.userId)
  const recordingUrl = pickFirstString(req.body?.RecordingUrl, req.query?.RecordingUrl)
  const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)
  const callerNumber = normalizePhone(pickFirstString(req.body?.From, req.query?.From))

  if (!userId || (!recordingUrl && !recordingSid)) {
    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>Missing recording details. Goodbye.</Say><Hangup/></Response>`
    )
  }

  try {
    const publicUrl = await uploadTwilioRecordingToStorage(userId, recordingUrl || "", recordingSid || undefined)
    const supabase = createServiceSupabase()
    const { error } = await supabase
      .from("profiles")
      .update({
        voicemail_greeting_mode: "recorded",
        voicemail_greeting_recording_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
    if (error) throw error

    const { error: evtErr } = await supabase.from("communication_events").insert({
      user_id: userId,
      event_type: "voicemail",
      direction: "inbound",
      external_id: recordingSid || null,
      body: "Voicemail greeting updated by phone",
      recording_url: publicUrl,
      unread: false,
      metadata: {
        greeting_recording: true,
        caller_number: callerNumber || null,
        source_recording_url: recordingUrl,
        completed_at: new Date().toISOString(),
      },
    })
    if (evtErr) {
      console.error("[voicemail-greeting] communication_events insert failed (greeting still saved)", evtErr.message)
    }

    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>Your voicemail greeting has been saved and is now active.</Say><Hangup/></Response>`
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[voicemail-greeting] handleGreetingSave", msg)
    if (/Bucket not found|not found/i.test(msg) || /storage/i.test(msg)) {
      console.error("[voicemail-greeting] Hint: run supabase-voicemail-greetings-storage.sql in Supabase to create bucket voicemail-greetings")
    }
    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>We were not able to save your greeting right now. Please try again later.</Say><Hangup/></Response>`
    )
  }
}

function buildGatherTwiml(origin: string, message: string): string {
  const gatherAction = `${origin}/api/voicemail-greeting`
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Gather action="${xmlEscape(gatherAction)}" method="POST" numDigits="6" timeout="8">` +
    `<Say ${SAY}>${xmlEscape(message)}</Say>` +
    `</Gather>` +
    `<Say ${SAY}>We did not receive a pin. Goodbye.</Say>` +
    `<Hangup/>` +
    `</Response>`
  )
}

function buildPhoneVerificationTwiml(origin: string, userId: string): string {
  const params = new URLSearchParams({ userId })
  const gatherAction = `${origin}/api/voicemail-greeting?${params.toString()}`
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Gather action="${xmlEscape(gatherAction)}" method="POST" numDigits="10" timeout="10">` +
    `<Say ${SAY}>Your caller number was not recognized. Please enter the ten digit phone number saved on your account.</Say>` +
    `</Gather>` +
    `<Say ${SAY}>We did not receive a phone number. Goodbye.</Say>` +
    `<Hangup/>` +
    `</Response>`
  )
}

function buildRecordGreetingTwiml(origin: string, userId: string): string {
  const params = new URLSearchParams({ userId, phase: "save" })
  const action = `${origin}/api/voicemail-greeting?${params.toString()}`
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say ${SAY}>After the tone, record your new voicemail greeting. Press pound when you are done.</Say>` +
    `<Record action="${xmlEscape(action)}" method="POST" finishOnKey="#" playBeep="true" maxLength="120" />` +
    `<Say ${SAY}>No recording was received. Goodbye.</Say>` +
    `<Hangup/>` +
    `</Response>`
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (pickFirstString(req.query?.phase) === "save") {
    return handleGreetingSave(req, res)
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST")
    return res.status(405).send("Method not allowed")
  }

  const origin = requestPublicOrigin(req)
  const verifiedUserId = pickFirstString(req.query?.userId, req.body?.userId)
  const callerNumber = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
  const digits = pickFirstString(req.body?.Digits, req.query?.Digits).replace(/\D/g, "")
  if (!digits) {
    const trustedId = await resolveTrustedGreetingUserId(callerNumber)
    if (trustedId) {
      return sendTwiml(res, buildRecordGreetingTwiml(origin, trustedId))
    }
    return sendTwiml(res, buildGatherTwiml(origin, "Please enter your six digit greeting pin."))
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
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>That phone number did not match the account on file.</Say><Hangup/></Response>`
        )
      }
      return sendTwiml(res, buildRecordGreetingTwiml(origin, String(data.id)))
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, primary_phone")
      .eq("voicemail_greeting_pin", digits)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data?.id) {
      return sendTwiml(res, buildGatherTwiml(origin, "That pin was not recognized. Please try again."))
    }
    const accountPhone = normalizePhone((data as { primary_phone?: string } | null)?.primary_phone ?? "")
    if (callerNumber && accountPhone && callerNumber === accountPhone) {
      return sendTwiml(res, buildRecordGreetingTwiml(origin, String(data.id)))
    }
    return sendTwiml(res, buildPhoneVerificationTwiml(origin, String(data.id)))
  } catch {
    return sendTwiml(res, `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>We are unable to update your greeting right now.</Say><Hangup/></Response>`)
  }
}
