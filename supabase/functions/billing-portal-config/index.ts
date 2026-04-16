// Returns HELCIM_PAYMENT_PORTAL_URL from Edge secrets so the Payments tab works when the Vite bundle
// was built without VITE_HELCIM_PAYMENT_PORTAL_URL (e.g. mobile forgot env, or URL changed without rebuild).
// Deploy: supabase functions deploy billing-portal-config
// Secret: HELCIM_PAYMENT_PORTAL_URL (full https hosted pay URL — same value as VITE_HELCIM_PAYMENT_PORTAL_URL on Vercel)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  const portalUrl = Deno.env.get("HELCIM_PAYMENT_PORTAL_URL")?.trim() ?? ""
  return new Response(JSON.stringify({ portalUrl: portalUrl || null }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
