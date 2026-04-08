import { firstEnv } from "./_communications.js"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Twilio RecordingUrl paths include /Accounts/AC…/ — use that for REST URLs when it differs from env (subaccounts). */
export function extractAccountSidFromTwilioUrl(url: string): string | null {
  const m = /\/Accounts\/(AC[a-f0-9]{32})\//i.exec(url)
  return m ? m[1] : null
}

function maskSid(s: string): string {
  if (s.length <= 8) return "…"
  return `…${s.slice(-6)}`
}

export type TwilioRecordingFetchResult = {
  arrayBuffer: ArrayBuffer
  contentType: string
  sourceUrl: string
}

/**
 * Download a Twilio recording (retries, subaccount URL vs env SID).
 */
export async function fetchTwilioRecordingBuffer(
  recordingUrl: string,
  recordingSid?: string,
  logLabel = "twilio-recording-fetch",
): Promise<TwilioRecordingFetchResult> {
  const envAccountSid = firstEnv("TWILIO_ACCOUNT_SID")
  const authToken = firstEnv("TWILIO_AUTH_TOKEN")
  if (!authToken) {
    throw new Error("Missing TWILIO_AUTH_TOKEN (required to download the recording from Twilio)")
  }
  const urlAccountSid = recordingUrl ? extractAccountSidFromTwilioUrl(recordingUrl) : null
  const restAccountSid = urlAccountSid || envAccountSid
  if (!restAccountSid) {
    throw new Error("Missing TWILIO_ACCOUNT_SID and no Account SID could be parsed from the recording URL")
  }

  /** Basic-auth username: try primary env SID first (works for subaccount URLs with parent token), then URL owner. */
  const basicUserSids: string[] = []
  if (envAccountSid) basicUserSids.push(envAccountSid)
  if (urlAccountSid && !basicUserSids.includes(urlAccountSid)) basicUserSids.push(urlAccountSid)
  if (basicUserSids.length === 0) {
    throw new Error("Missing TWILIO_ACCOUNT_SID (required to download the recording from Twilio)")
  }

  const candidates: string[] = []
  if (recordingUrl) {
    candidates.push(
      ...(recordingUrl.endsWith(".mp3")
        ? [recordingUrl, recordingUrl.replace(/\.mp3$/i, "")]
        : [`${recordingUrl}.mp3`, recordingUrl]),
    )
  }
  if (recordingSid && restAccountSid) {
    const base = `https://api.twilio.com/2010-04-01/Accounts/${restAccountSid}/Recordings/${recordingSid}`
    candidates.push(`${base}.mp3`, base)
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
    for (const basicUser of basicUserSids) {
      const authHeader = {
        Authorization: `Basic ${Buffer.from(`${basicUser}:${authToken}`).toString("base64")}`,
      }
      for (const url of unique) {
        const response = await fetch(url, { headers: authHeader })
        if (response.ok) {
          if (round > 0) {
            console.log(`[${logLabel}] Twilio recording download succeeded after retries`, {
              round,
              recordingSid: recordingSid ? maskSid(recordingSid) : null,
            })
          }
          const ct = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
          const buf = await response.arrayBuffer()
          return { arrayBuffer: buf, contentType: ct, sourceUrl: url }
        }
        lastStatus = response.status
      }
    }
    if (round < maxRounds - 1) await sleep(700 + round * 350)
  }

  const hint =
    lastStatus === 401 || lastStatus === 403
      ? "HTTP 401/403: Use the primary Twilio Account SID + Auth Token in server env (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) even when RecordingUrl uses a subaccount path."
      : lastStatus === 404
        ? "HTTP 404: recording not found yet (retries exhausted) or wrong Account SID for this RecordingSid."
        : "Check Twilio credentials and that the call was recorded on the same Twilio project."

  console.error(`[${logLabel}] Twilio recording download failed`, {
    lastHttpStatus: lastStatus,
    retries: maxRounds,
    hasRecordingUrl: Boolean(recordingUrl),
    hasRecordingSid: Boolean(recordingSid),
    envAccount: envAccountSid ? maskSid(envAccountSid) : null,
    urlAccount: urlAccountSid ? maskSid(urlAccountSid) : null,
    candidateCount: unique.length,
    hint,
  })

  throw new Error(`Failed to fetch Twilio recording (last HTTP ${lastStatus}). ${hint}`)
}

export function pickUploadFormat(contentType: string, sourceUrl: string): { ext: string; contentType: string } {
  const u = sourceUrl.toLowerCase()
  if (contentType.includes("wav") || u.includes(".wav")) return { ext: "wav", contentType: "audio/wav" }
  if (contentType.includes("mpeg") || contentType.includes("mp3") || u.includes(".mp3")) return { ext: "mp3", contentType: "audio/mpeg" }
  return { ext: "mp3", contentType: "audio/mpeg" }
}
