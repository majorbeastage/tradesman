// Self-serve 24-hour demo account provisioning.
// Deploy: supabase functions deploy provision-demo
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const DEMO_HOURS = 24

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$"
  let out = ""
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
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

  const admin = createClient(supabaseUrl, serviceRoleKey)

  let body: {
    email?: string
    name?: string
    business_name?: string | null
    ticket_id?: string | null
    admin_provision?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "Valid email is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let grantedBy: string | null = null
  let source = "self_serve"

  if (body.admin_provision === true) {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const token = authHeader.slice("Bearer ".length).trim()
    const { data: authUser, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !authUser.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const { data: prof } = await admin.from("profiles").select("role").eq("id", authUser.user.id).maybeSingle()
    if (prof?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    grantedBy = authUser.user.id
    source = "admin_manual"
  }

  const { data: prior } = await admin
    .from("demo_access_grants")
    .select("id, expires_at")
    .ilike("email", email)
    .maybeSingle()

  if (prior?.id && !body.admin_provision) {
    const exp = prior.expires_at ? new Date(String(prior.expires_at)).getTime() : 0
    if (exp > Date.now()) {
      return new Response(
        JSON.stringify({
          error: "This email already received a demo period. Contact us if you need extended access.",
          alreadyGranted: true,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
  }

  const password = randomPassword()
  const displayName = name || body.business_name?.trim() || email.split("@")[0] || "Demo user"
  const expiresAt = new Date(Date.now() + DEMO_HOURS * 3600000).toISOString()

  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, demo_account: true },
  })

  if (createErr || !newUser.user) {
    return new Response(JSON.stringify({ error: createErr?.message ?? "Could not create demo user" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const uid = newUser.user.id
  const portal_config = {
    tabs: {
      dashboard: true,
      leads: true,
      conversations: true,
      quotes: true,
      calendar: true,
      customers: true,
      payments: false,
      account: true,
      "web-support": true,
      "tech-support": true,
      settings: false,
    },
    demo_account: true,
  }

  await admin.from("profiles").upsert({
    id: uid,
    email,
    display_name: displayName,
    role: "demo_user",
    portal_config,
    metadata: { demo_expires_at: expiresAt, demo_communications_blocked: true },
    updated_at: new Date().toISOString(),
  })

  await admin.from("demo_access_grants").delete().ilike("email", email)
  await admin.from("demo_access_grants").insert({
    email,
    auth_user_id: uid,
    expires_at: expiresAt,
    granted_by: grantedBy,
    source,
    ticket_id: body.ticket_id ?? null,
    metadata: { business_name: body.business_name ?? null },
  })

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim()
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL")?.trim()
  let emailed = false
  if (resendKey && resendFrom) {
    const loginUrl = Deno.env.get("VITE_SITE_URL")?.trim() || "https://tradesman-us.vercel.app"
    const text = [
      `Hi ${displayName},`,
      "",
      "Your 24-hour Tradesman demo account is ready.",
      "",
      `Login: ${loginUrl}`,
      `Email: ${email}`,
      `Temporary password: ${password}`,
      "",
      `This demo expires: ${new Date(expiresAt).toLocaleString()}`,
      "",
      "Demo accounts cannot send or receive live texts, emails, or phone calls.",
      "",
      "— Tradesman Systems",
    ].join("\n")
    try {
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: resendFrom,
          to: [email],
          subject: "Your 24-hour Tradesman demo login",
          text,
        }),
      })
      emailed = sendRes.ok
    } catch {
      /* ignore */
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      userId: uid,
      expiresAt,
      emailed,
      password: body.admin_provision ? password : undefined,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
