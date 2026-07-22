/**
 * FCM HTTP v1 for Vercel Node (mirrors supabase/functions/_shared/fcm-v1.ts).
 * Env: FCM_SERVICE_ACCOUNT_JSON — full Firebase service account JSON.
 */
import crypto from "crypto"

export type FcmServiceAccount = {
  project_id: string
  private_key: string
  client_email: string
}

export function parseServiceAccountJson(raw: string): FcmServiceAccount {
  const sa = JSON.parse(raw) as FcmServiceAccount
  if (!sa?.private_key || !sa?.client_email || !sa?.project_id) {
    throw new Error("Invalid FCM service account JSON (need project_id, client_email, private_key)")
  }
  return sa
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString("base64url")
}

async function getGoogleAccessToken(sa: FcmServiceAccount): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  }
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const sign = crypto.createSign("RSA-SHA256")
  sign.update(unsigned)
  sign.end()
  const signature = sign.sign(sa.private_key.replace(/\\n/g, "\n"), "base64url")
  const jwt = `${unsigned}.${signature}`

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  })
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  const json = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google OAuth HTTP ${res.status}`)
  }
  return json.access_token
}

export async function sendFcmNotification(params: {
  serviceAccountJson: string
  fcmToken: string
  title: string
  body: string
  data?: Record<string, string>
  androidChannelId?: string
  androidTag?: string
  collapseKey?: string
  apnsThreadId?: string
}): Promise<{ ok: boolean; status: number; detail: string }> {
  const sa = parseServiceAccountJson(params.serviceAccountJson)
  const accessToken = await getGoogleAccessToken(sa)
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`
  const channelId = params.androidChannelId?.trim() || "tradesman_alerts"
  const androidNotification: Record<string, unknown> = {
    channel_id: channelId,
    notification_priority: "PRIORITY_HIGH",
    default_sound: true,
  }
  if (params.androidTag?.trim()) {
    androidNotification.tag = params.androidTag.trim()
  }

  const message: Record<string, unknown> = {
    token: params.fcmToken,
    notification: {
      title: params.title,
      body: params.body,
    },
    android: {
      priority: "HIGH",
      ...(params.collapseKey?.trim() ? { collapse_key: params.collapseKey.trim() } : {}),
      notification: androidNotification,
    },
  }

  if (params.data && Object.keys(params.data).length > 0) {
    const data: Record<string, string> = {}
    for (const [k, v] of Object.entries(params.data)) {
      if (v != null) data[k] = String(v)
    }
    message.data = data
  }

  const threadId = params.apnsThreadId?.trim() || params.collapseKey?.trim()
  if (threadId) {
    message.apns = {
      payload: {
        aps: {
          "thread-id": threadId,
          sound: "default",
        },
      },
    }
  }

  const payload = { message }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  return {
    ok: res.ok,
    status: res.status,
    detail: text.slice(0, 2000),
  }
}
