/**
 * FCM HTTP v1 (Firebase Cloud Messaging) using a Google service account JSON.
 * Secret: FCM_SERVICE_ACCOUNT_JSON — paste the full JSON from Firebase → Project settings → Service accounts.
 */
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.9.6"

export type FcmServiceAccount = {
  type?: string
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

async function getGoogleAccessToken(sa: FcmServiceAccount): Promise<string> {
  const privateKey = await importPKCS8(sa.private_key, "RS256")
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setSubject(sa.client_email)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)

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

export type SendFcmNotificationParams = {
  serviceAccountJson: string
  fcmToken: string
  title: string
  body: string
  /** All values must be strings (FCM requirement). */
  data?: Record<string, string>
  androidChannelId?: string
  /** Same tag replaces the previous tray item (collapse per thread/sender). */
  androidTag?: string
  collapseKey?: string
  /** iOS notification grouping. */
  apnsThreadId?: string
  /**
   * Android: send data-only (no system auto-notification). Messaging app posts one
   * stable notification per thread so the shade never expands into multiples.
   * iOS still gets an APS alert via `apns`.
   */
  androidDataOnly?: boolean
}

export async function sendFcmNotification(
  params: SendFcmNotificationParams,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const sa = parseServiceAccountJson(params.serviceAccountJson)
  const accessToken = await getGoogleAccessToken(sa)
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`
  const channelId = params.androidChannelId?.trim() || "tradesman_alerts"

  const data: Record<string, string> = {}
  if (params.data) {
    for (const [k, v] of Object.entries(params.data)) {
      if (v != null) data[k] = String(v)
    }
  }
  // Always include title/body in data so a data-only Android handler can render the tray item.
  data.title = params.title
  data.body = params.body
  if (params.androidTag?.trim()) data.notificationTag = params.androidTag.trim()

  const android: Record<string, unknown> = {
    priority: "HIGH",
  }
  if (params.collapseKey?.trim()) {
    android.collapse_key = params.collapseKey.trim()
  }

  const message: Record<string, unknown> = {
    token: params.fcmToken,
    data,
    android,
  }

  if (!params.androidDataOnly) {
    const androidNotification: Record<string, unknown> = {
      channel_id: channelId,
      notification_priority: "PRIORITY_HIGH",
      default_sound: true,
      title: params.title,
      body: params.body,
    }
    if (params.androidTag?.trim()) {
      androidNotification.tag = params.androidTag.trim()
    }
    android.notification = androidNotification
    message.notification = {
      title: params.title,
      body: params.body,
    }
  }

  const threadId = params.apnsThreadId?.trim() || params.collapseKey?.trim()
  if (threadId || params.androidDataOnly) {
    message.apns = {
      payload: {
        aps: {
          alert: {
            title: params.title,
            body: params.body,
          },
          ...(threadId ? { "thread-id": threadId } : {}),
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
