// Rings the signed-in user's cell first; when they answer, connects the call to the customer.
// Caller ID on the customer leg uses TWILIO_FROM_NUMBER (your Twilio / business number).
// Deploy: supabase functions deploy twilio-bridge-call
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
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

  /** Optional: when office manager calls for a scoped quote, ensure they manage that user. */
  if (typeof body.quote_owner_user_id === "string" && body.quote_owner_user_id !== user.id) {
    const ok = await userCanAccessQuoteUser(admin, user.id, body.quote_owner_user_id)
    if (!ok) {
      return new Response(JSON.stringify({ error: "Not allowed for this account" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
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

  const fromNum = getTwilioFromNumber()
  if (!fromNum) {
    return new Response(
      JSON.stringify({
        error: "TWILIO_FROM_NUMBER is not set",
        hint: "supabase secrets set TWILIO_FROM_NUMBER=+1yourVerifiedTwilioNumber",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${xmlEscape(fromNum)}">${xmlEscape(customer)}</Dial></Response>`

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}/Calls.json`
  const form = new URLSearchParams({
    To: staff,
    From: fromNum,
    Twiml: twiml,
  })

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: twilioAccountBasicAuth(creds.accountSid, creds.authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: `Twilio HTTP ${res.status}`, detail: text.slice(0, 1500) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Calling your phone first; answer to connect to the customer.",
      twilio: text.slice(0, 500),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
