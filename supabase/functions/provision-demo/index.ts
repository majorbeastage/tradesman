// Self-serve demo: temp Office Manager login emailed via Resend.
// 8h to first login; 24h active session after first login; comms blocked.
// Deploy: supabase functions deploy provision-demo
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { demoActivateByIso, isDemoProfileRow } from "../_shared/demo-lifecycle.ts"

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

async function recordOpsDemoProvisionedCustomerEvent(params: {
  email: string
  displayName: string
  userId: string
  ticketId?: string | null
  businessName?: string | null
}): Promise<void> {
  const site = Deno.env.get("VITE_SITE_URL")?.trim() || Deno.env.get("VERCEL_URL")?.trim()
  const secret =
    Deno.env.get("COMPLETE_SIGNUP_NOTIFY_SECRET")?.trim() || Deno.env.get("ADMIN_SIGNUP_NOTIFY_SECRET")?.trim()
  if (!site || !secret) return
  const base = site.startsWith("http") ? site.replace(/\/+$/, "") : `https://${site.replace(/\/+$/, "")}`
  const subject = `Demo provisioned: ${params.displayName} (${params.email})`
  const body = [
    "A Tradesman demo account was provisioned.",
    "",
    `Email: ${params.email}`,
    `Display name: ${params.displayName}`,
    `User id: ${params.userId}`,
    params.businessName ? `Business: ${params.businessName}` : "",
    params.ticketId ? `Ticket id: ${params.ticketId}` : "",
  ]
    .filter(Boolean)
    .join("\n")
  try {
    await fetch(`${base}/api/platform-tools?__route=record-ops-customer-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tradesman-signup-notify-secret": secret,
      },
      body: JSON.stringify({
        kind: "demo_provisioned",
        externalId: `demo-provisioned:${params.userId}`,
        email: params.email,
        displayName: params.displayName,
        signupUserId: params.userId,
        ticketId: params.ticketId ?? null,
        subject,
        body,
      }),
    })
  } catch (e) {
    console.warn("[provision-demo] ops customer event", e instanceof Error ? e.message : e)
  }
}

async function deleteDemoUser(admin: ReturnType<typeof createClient>, uid: string): Promise<void> {
  try {
    await admin.rpc("purge_trial_user_data", { p_user_id: uid })
  } catch {
    /* purge_trial_user_data may not be deployed yet */
  }
  await admin.auth.admin.deleteUser(uid)
  await admin.from("demo_access_grants").delete().eq("auth_user_id", uid)
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
    return new Response(JSON.stringify({ error: "Valid email is required for instant demo access." }), {
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

  const { data: priorGrant } = await admin
    .from("demo_access_grants")
    .select("id, auth_user_id, activate_by, activated_at, expires_at")
    .ilike("email", email)
    .maybeSingle()

  if (priorGrant?.id && !body.admin_provision) {
    const activatedAt = priorGrant.activated_at ? String(priorGrant.activated_at) : null
    const expiresAt = priorGrant.expires_at ? String(priorGrant.expires_at) : null
    const activateBy = priorGrant.activate_by ? String(priorGrant.activate_by) : null
    const now = Date.now()
    const stillValid =
      (activatedAt && expiresAt && new Date(expiresAt).getTime() > now) ||
      (!activatedAt && activateBy && new Date(activateBy).getTime() > now)

    if (stillValid) {
      return new Response(
        JSON.stringify({
          error: "This email already has an active demo. Check your inbox for login details or contact us for an extension.",
          alreadyGranted: true,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
  }

  const { data: existingProf } = await admin
    .from("profiles")
    .select("id, role, metadata, portal_config")
    .ilike("email", email)
    .maybeSingle()

  if (existingProf?.id) {
    if (isDemoProfileRow(existingProf as { role?: string; metadata?: Record<string, unknown>; portal_config?: { demo_account?: boolean } })) {
      await deleteDemoUser(admin, String(existingProf.id))
    } else if (!body.admin_provision) {
      return new Response(
        JSON.stringify({
          error: "This email already has a Tradesman account. Sign in or use a different email for a demo.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
  }

  const password = randomPassword()
  const displayName = name || body.business_name?.trim() || email.split("@")[0] || "Demo user"
  const activateBy = demoActivateByIso()

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
      leads: false,
      conversations: false,
      quotes: true,
      calendar: true,
      customers: true,
      payments: false,
      account: true,
      "web-support": false,
      "tech-support": true,
      settings: false,
    },
    demo_account: true,
  }

  const profileMeta = {
    demo_account: true,
    demo_communications_blocked: true,
    demo_activate_by: activateBy,
    demo_activated_at: null,
    demo_expires_at: null,
  }

  await admin.from("profiles").upsert({
    id: uid,
    email,
    display_name: displayName,
    role: "office_manager",
    portal_config,
    metadata: profileMeta,
    updated_at: new Date().toISOString(),
  })

  await admin.from("demo_access_grants").delete().ilike("email", email)
  await admin.from("demo_access_grants").insert({
    email,
    auth_user_id: uid,
    activate_by: activateBy,
    activated_at: null,
    expires_at: activateBy,
    granted_by: grantedBy,
    source,
    ticket_id: body.ticket_id ?? null,
    metadata: { business_name: body.business_name ?? null },
  })

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim()
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL")?.trim()
  let emailed = false
  let emailError = ""
  if (resendKey && resendFrom) {
    const loginUrl = Deno.env.get("VITE_SITE_URL")?.trim() || "https://tradesman-us.vercel.app"
    const activateByLabel = new Date(activateBy).toLocaleString()
    const text = [
      `Hi ${displayName},`,
      "",
      "Your Tradesman demo is ready.",
      "",
      `1. Open: ${loginUrl}`,
      "2. Choose Office Manager Login on the home page",
      "3. Sign in with:",
      `   Email: ${email}`,
      `   Temporary password: ${password}`,
      "",
      `Sign in within 8 hours (by ${activateByLabel}) or this login is removed.`,
      "After your first sign-in you have 24 hours to explore the demo.",
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
          subject: "Your Tradesman demo login",
          text,
        }),
      })
      emailed = sendRes.ok
      if (!sendRes.ok) {
        emailError = await sendRes.text()
        console.warn("[provision-demo] Resend", sendRes.status, emailError)
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e)
      console.warn("[provision-demo] Resend error", emailError)
    }
  } else {
    emailError = "RESEND_API_KEY or RESEND_FROM_EMAIL not set on Edge"
  }

  await recordOpsDemoProvisionedCustomerEvent({
    email,
    displayName,
    userId: uid,
    ticketId: body.ticket_id ?? null,
    businessName: body.business_name ?? null,
  })

  return new Response(
    JSON.stringify({
      ok: true,
      userId: uid,
      activateBy,
      emailed,
      emailError: emailed ? undefined : emailError || "Email not sent",
      password: body.admin_provision ? password : undefined,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
