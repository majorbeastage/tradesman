/**
 * Twilio credentials for Supabase Edge Functions (and any future Supabase → Twilio calls).
 *
 * Set secrets on your Supabase project (same names as Vercel serverless for consistency):
 *
 *   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxx TWILIO_AUTH_TOKEN=xxxxxxxx
 *
 * Or: Dashboard → Project Settings → Edge Functions → Manage secrets
 *
 * Use the same LIVE Account SID + Auth Token as production Vercel unless you intentionally
 * use a separate Twilio subaccount for Edge-only traffic.
 */

export function getTwilioAccountSid(): string {
  return (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim()
}

export function getTwilioAuthToken(): string {
  return (Deno.env.get("TWILIO_AUTH_TOKEN") ?? "").trim()
}

/** Optional default From for SMS/voice initiated from Edge (E.164). */
export function getTwilioFromNumber(): string {
  return (Deno.env.get("TWILIO_FROM_NUMBER") ?? "").trim()
}

export type TwilioCredentials = { accountSid: string; authToken: string }

export function getTwilioCredentials(): TwilioCredentials {
  const accountSid = getTwilioAccountSid()
  const authToken = getTwilioAuthToken()
  if (!accountSid || !authToken) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN. " +
        "Set Supabase Edge secrets: supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=...",
    )
  }
  return { accountSid, authToken }
}

/** Authorization header value for Twilio REST (Account SID + Auth Token). */
export function twilioAccountBasicAuth(accountSid: string, authToken: string): string {
  const token = btoa(`${accountSid}:${authToken}`)
  return `Basic ${token}`
}
