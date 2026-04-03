// Public signup: create auth user + full profiles row (works when email confirmation leaves client without a session).
// Deploy: supabase functions deploy complete-signup
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto in hosted Supabase)
//
// Client calls with anon key in Authorization + apikey (same as other public edge patterns).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type Body = {
  email?: string
  password?: string
  display_name?: string
  website_url?: string | null
  primary_phone?: string | null
  best_contact_phone?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  business_address?: string | null
  timezone?: string | null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const display_name = typeof body.display_name === "string" ? body.display_name.trim() : ""

  if (!email || !password || password.length < 6) {
    return new Response(JSON.stringify({ error: "Valid email and password (6+ chars) required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (!display_name) {
    return new Response(JSON.stringify({ error: "display_name is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { display_name },
  })

  if (createErr || !created.user) {
    return new Response(JSON.stringify({ error: createErr?.message ?? "Could not create user" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const uid = created.user.id
  const now = new Date().toISOString()

  const { error: profileErr } = await adminClient.from("profiles").upsert(
    {
      id: uid,
      email,
      display_name,
      role: "new_user",
      website_url: body.website_url ?? null,
      primary_phone: body.primary_phone ?? null,
      best_contact_phone: body.best_contact_phone ?? null,
      address_line_1: body.address_line_1 ?? null,
      address_line_2: body.address_line_2 ?? null,
      address_city: body.address_city ?? null,
      address_state: body.address_state ?? null,
      address_zip: body.address_zip ?? null,
      business_address: body.business_address ?? null,
      timezone: body.timezone?.trim() || "America/New_York",
      updated_at: now,
    },
    { onConflict: "id" }
  )

  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message, userId: uid, profileSaved: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ ok: true, userId: uid, profileSaved: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
