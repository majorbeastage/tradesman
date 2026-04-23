// Rings the signed-in user's cell first; when they answer, connects the call to the customer.
// Caller ID on the customer leg: that user's Twilio **public number** from Admin → Communications (client_communication_channels),
// else optional platform fallback secret TWILIO_FROM_NUMBER (one per Supabase project, not per caller).
// Uses Twilio REST Calls API + inline TwiML — you do NOT configure a Voice webhook URL in Twilio for this flow.
// Deploy: supabase functions deploy twilio-bridge-call
// Secrets (Supabase Dashboard or CLI): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN; optional TWILIO_FROM_NUMBER as default when a user has no channel row.
// Auto on hosted projects: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Edge runtime).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getTwilioCredentials, getTwilioFromNumber, twilioAccountBasicAuth } from "../_shared/twilio-env.ts"
import { userCanAccessQuoteUser } from "../_shared/quote-access.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function toE164(input: string): string | null {
  const d = input.replace(/\D/g, "")
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith("1")) return `+${d}`
  if (d.length >= 11) return `+${d}`
  return null
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Prefer this business user's Twilio public line (same table as SMS routing); no per-user Supabase secrets. */
async function pickCallerIdFromCommunicationChannels(
  admin: SupabaseClient,
  businessUserId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("client_communication_channels")
    .select("public_address, voice_enabled, sms_enabled")
    .eq("user_id", businessUserId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(40)
  if (error) {
    console.error("[twilio-bridge-call] client_communication_channels:", error.message)
    return null
  }
  const rows = (data ?? []) as { public_address?: string | null; voice_enabled?: boolean | null; sms_enabled?: boolean | null }[]
  const usable = rows.filter((r) => r.voice_enabled === true || r.sms_enabled === true)
  const score = (r: { voice_enabled?: boolean | null; sms_enabled?: boolean | null }) =>
    (r.voice_enabled === true ? 2 : 0) + (r.sms_enabled === true ? 1 : 0)
  const sorted = [...usable].sort((a, b) => score(b) - score(a))
  for (const r of sorted) {
    const raw = typeof r.public_address === "string" ? r.public_address.trim() : ""
    const e164 = toE164(raw)
    if (e164) return e164
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let body: { customer_phone?: string; quote_owner_user_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const customer = toE164(typeof body?.customer_phone === "string" ? body.customer_phone : "")
  if (!customer) {
    return new Response(JSON.stringify({ error: "Invalid customer_phone (need 10+ digits)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  /** Whose business line appears on the customer leg (scoped quote owner, else the signed-in user). */
  const qOwnerTrim = typeof body.quote_owner_user_id === "string" ? body.quote_owner_user_id.trim() : ""
  let businessUserIdForCallerId = user.id
  if (qOwnerTrim) {
    if (qOwnerTrim !== user.id) {
      const ok = await userCanAccessQuoteUser(admin, user.id, qOwnerTrim)
      if (!ok) {
        return new Response(JSON.stringify({ error: "Not allowed for this account" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }
    businessUserIdForCallerId = qOwnerTrim
  }

  /** Staff phone: always the signed-in user's profile (the person tapping Call). */
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("primary_phone, best_contact_phone")
    .eq("id", user.id)
    .maybeSingle()

  if (profErr) {
    return new Response(JSON.stringify({ error: profErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const staffRaw = (profile?.best_contact_phone ?? profile?.primary_phone ?? "").trim()
  const staff = toE164(staffRaw)
  if (!staff) {
    return new Response(
      JSON.stringify({
        error: "Add your mobile number under Account → Best contact phone (or Primary phone). Twilio will ring that number first.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  let creds: { accountSid: string; authToken: string }
  try {
    creds = getTwilioCredentials()
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const fromChannel = await pickCallerIdFromCommunicationChannels(admin, businessUserIdForCallerId)
  const fromNum = fromChannel ?? getTwilioFromNumber()
  if (!fromNum) {
    return new Response(
      JSON.stringify({
        error: "No outbound business number for this account",
        hint:
          "Add the user's Twilio number in Admin → Communications (active channel with Public number — same as SMS). " +
          "Optional platform default for accounts without a channel: supabase secrets set TWILIO_FROM_NUMBER=+1…",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}/Calls.json`

  async function twilioCreateCall(fromNumber: string): Promise<{ ok: boolean; status: number; text: string }> {
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${xmlEscape(fromNumber)}">${xmlEscape(customer)}</Dial></Response>`
    const form = new URLSearchParams({ To: staff, From: fromNumber, Twiml: twiml })
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: twilioAccountBasicAuth(creds.accountSid, creds.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  }

  let usedFrom = fromNum
  let attempt = await twilioCreateCall(usedFrom)
  const envFallback = getTwilioFromNumber()
  if (
    !attempt.ok &&
    fromChannel &&
    envFallback &&
    envFallback.trim() !== usedFrom.trim() &&
    /21205|21210|21211|21606|invalid/i.test(attempt.text)
  ) {
    const retry = await twilioCreateCall(envFallback.trim())
    if (retry.ok) {
      usedFrom = envFallback.trim()
      attempt = retry
    }
  }

  if (!attempt.ok) {
    let detail = attempt.text.slice(0, 1500)
    try {
      const j = JSON.parse(attempt.text) as { message?: string; code?: number }
      if (typeof j?.message === "string" && j.message.trim()) detail = j.message.trim()
    } catch {
      /* keep raw slice */
    }
    const hint =
      "Twilio account: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN on Supabase; From number must be on that Twilio account. " +
      "If Communications shows a number that is not on this Twilio account (or is SMS-only), set TWILIO_FROM_NUMBER as a voice-capable fallback or fix the Public number. " +
      "Your profile: Best contact phone or Primary phone (Twilio rings you first). " +
      "Twilio trial: verify your cell and the customer number. See Twilio Console → Monitor → Errors."
    return new Response(JSON.stringify({ ok: false, error: `Twilio rejected the call (HTTP ${attempt.status})`, detail, hint }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Calling your phone first; answer to connect to the customer.",
      twilio: attempt.text.slice(0, 500),
      from_number: usedFrom,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
