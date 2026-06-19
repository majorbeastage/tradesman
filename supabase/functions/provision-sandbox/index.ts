// Training sandbox: full CRM with simulated comms and live lead injection.
// Deploy: supabase functions deploy provision-sandbox
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$"
  let out = ""
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function sandboxExpiresIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 90)
  return d.toISOString()
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

  let body: { email?: string; name?: string; business_name?: string | null }
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

  const { data: existingProf } = await admin
    .from("profiles")
    .select("id, role, metadata, portal_config")
    .ilike("email", email)
    .maybeSingle()

  if (existingProf?.id) {
    const meta = existingProf.metadata as Record<string, unknown> | null
    const pc = existingProf.portal_config as { sandbox_account?: boolean; demo_account?: boolean } | null
    const isSandbox =
      pc?.sandbox_account === true ||
      meta?.sandbox_account === true ||
      existingProf.role === "sandbox_user"
    if (!isSandbox && existingProf.role !== "demo_user" && !pc?.demo_account) {
      return new Response(
        JSON.stringify({
          error: "This email already has a Tradesman account. Sign in or use a different email for training.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
    if (existingProf.id) {
      try {
        await admin.rpc("purge_trial_user_data", { p_user_id: existingProf.id })
      } catch {
        /* ignore */
      }
      await admin.auth.admin.deleteUser(String(existingProf.id))
    }
  }

  const password = randomPassword()
  const companyName = body.business_name?.trim() || "Demo Plumbing Co."
  const displayName = name || companyName
  const expiresAt = sandboxExpiresIso()
  const embedSlug = `demo-plumbing-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`

  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, sandbox_account: true },
  })

  if (createErr || !newUser.user) {
    return new Response(JSON.stringify({ error: createErr?.message ?? "Could not create sandbox user" }), {
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
      payments: true,
      account: true,
      "web-support": true,
      "tech-support": true,
      settings: true,
      growth: true,
      reporting: true,
      "business-workflow": true,
      "organization-chart": true,
    },
    sandbox_account: true,
    demo_account: false,
  }

  const profileMeta = {
    sandbox_account: true,
    demo_account: false,
    demo_communications_blocked: false,
    sandbox_expires_at: expiresAt,
    sandbox_workspace_v1: {
      v: 1,
      companyName,
      liveTrafficEnabled: true,
      liveTrafficIntervalMinutes: 3,
      embedLeadSlug: embedSlug,
    },
    service_address_zip: "99901",
    service_address_city: "Tradesman Demo",
    service_address_state: "TX",
  }

  await admin.from("profiles").upsert({
    id: uid,
    email,
    display_name: displayName,
    role: "sandbox_user",
    portal_config,
    metadata: profileMeta,
    embed_lead_enabled: true,
    embed_lead_slug: embedSlug,
    updated_at: new Date().toISOString(),
  })

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim()
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL")?.trim()
  let emailed = false
  let emailError = ""
  if (resendKey && resendFrom) {
    const loginUrl = Deno.env.get("VITE_SITE_URL")?.trim() || "https://tradesman-us.vercel.app"
    const ctaUrl = `${loginUrl.replace(/\/+$/, "")}/cta/${embedSlug}`
    const text = [
      `Hi ${displayName},`,
      "",
      "Your Tradesman training sandbox is ready.",
      "",
      `1. Open: ${loginUrl}`,
      "2. Sign in with Office Manager Login",
      `   Email: ${email}`,
      `   Temporary password: ${password}`,
      "",
      "This is a full training environment with fictional customers and simulated texts/emails.",
      "New leads can appear automatically while you explore — watch them flow from Leads to Customers.",
      "",
      `Your public lead capture link (works in sandbox): ${ctaUrl}`,
      "",
      `Sandbox access expires: ${new Date(expiresAt).toLocaleString()}`,
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
          subject: "Your Tradesman training sandbox login",
          text,
        }),
      })
      emailed = sendRes.ok
      if (!sendRes.ok) emailError = await sendRes.text()
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e)
    }
  } else {
    emailError = "RESEND not configured on Edge"
  }

  return new Response(
    JSON.stringify({
      ok: true,
      userId: uid,
      expiresAt,
      embedSlug,
      emailed,
      emailError: emailed ? undefined : emailError || "Email not sent",
      password,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
