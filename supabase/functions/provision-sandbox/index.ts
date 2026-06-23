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

async function notifyAdminTrialProvisioned(params: {
  email: string
  displayName: string
  userId: string
  businessName?: string | null
  embedSlug?: string | null
  expiresAt?: string | null
  customerCount?: number | null
  leadCount?: number | null
}): Promise<void> {
  const site = Deno.env.get("VITE_SITE_URL")?.trim() || Deno.env.get("SITE_URL")?.trim() || Deno.env.get("VERCEL_URL")?.trim()
  const loginUrl = (site?.startsWith("http") ? site : site ? `https://${site}` : "https://tradesman-us.vercel.app").replace(/\/+$/, "")
  const ctaUrl = params.embedSlug ? `${loginUrl}/cta/${params.embedSlug}` : null
  const subject = `New free trial: ${params.displayName} (${params.email})`
  const text = [
    "A new Tradesman free trial workspace was created.",
    "",
    `Email: ${params.email}`,
    `Display name: ${params.displayName}`,
    `Business: ${params.businessName?.trim() || "(none)"}`,
    `User id: ${params.userId}`,
    params.customerCount != null ? `Sample customers seeded: ${params.customerCount}` : "",
    params.leadCount != null ? `Sample leads seeded: ${params.leadCount}` : "",
    params.expiresAt ? `Trial expires: ${new Date(params.expiresAt).toLocaleString()}` : "",
    ctaUrl ? `Lead capture link: ${ctaUrl}` : "",
    "",
    "The prospect was emailed their temporary login. Check the admin Customers tab for this thread.",
  ]
    .filter(Boolean)
    .join("\n")

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim()
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL")?.trim()
  if (resendKey && resendFrom) {
    const configured = (Deno.env.get("ADMIN_SIGNUP_NOTIFY_EMAIL")?.trim() || "")
      .split(/[,;]+/g)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@"))
    const to = [...new Set(["admin@tradesman-us.com", "admin@mail.tradesman-us.com", ...configured])]
    try {
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: resendFrom, to, subject, text }),
      })
      if (!sendRes.ok) {
        console.warn("[provision-sandbox] admin trial alert email", sendRes.status, await sendRes.text())
      }
    } catch (e) {
      console.warn("[provision-sandbox] admin trial alert email", e instanceof Error ? e.message : e)
    }
  } else {
    console.warn("[provision-sandbox] RESEND not configured — admin trial alert email skipped on Edge")
  }

  const secret =
    Deno.env.get("COMPLETE_SIGNUP_NOTIFY_SECRET")?.trim() || Deno.env.get("ADMIN_SIGNUP_NOTIFY_SECRET")?.trim()
  if (!site || !secret) {
    console.warn("[provision-sandbox] trial portal notify skipped — set SITE_URL + COMPLETE_SIGNUP_NOTIFY_SECRET on Edge")
    return
  }
  const base = site.startsWith("http") ? site.replace(/\/+$/, "") : `https://${site.replace(/\/+$/, "")}`
  try {
    const res = await fetch(`${base}/api/notify-admin-trial-signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tradesman-signup-notify-secret": secret,
      },
      body: JSON.stringify({
        user_id: params.userId,
        email: params.email,
        display_name: params.displayName,
        business_name: params.businessName ?? null,
        embed_slug: params.embedSlug ?? null,
        expires_at: params.expiresAt ?? null,
        customer_count: params.customerCount ?? null,
        lead_count: params.leadCount ?? null,
      }),
    })
    if (!res.ok) {
      console.warn("[provision-sandbox] trial admin portal notify", res.status, await res.text())
    }
  } catch (e) {
    console.warn("[provision-sandbox] trial admin portal notify", e instanceof Error ? e.message : e)
  }
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
      customers: true,
      quotes: true,
      calendar: true,
      payments: true,
      account: true,
      "tech-support": true,
      settings: true,
      growth: true,
      operations: true,
      reporting: true,
      "business-workflow": true,
      "organization-chart": true,
      leads: false,
      conversations: false,
      "web-support": false,
      work_orders: true,
      purchase_orders: true,
      parts_inventory: true,
    },
    sandbox_account: true,
    demo_account: false,
    corporate_package: true,
    enable_growth_tab: true,
    enable_operations_tab: true,
    enable_work_orders_tab: true,
    enable_purchase_orders_tab: true,
    enable_parts_inventory_tab: true,
    operations_modules: {
      work_orders: true,
      purchase_orders: true,
      invoicing: true,
      inventory: true,
      team_management: true,
    },
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
      liveTrafficIntervalMinutes: 2,
      embedLeadSlug: embedSlug,
    },
    service_address_zip: "99901",
    service_address_city: "Tradesman Demo",
    service_address_state: "TX",
    dashboard_quick_links: {
      v: 4,
      tile_scheme: "ocean",
      tile_grid: [
        "customers",
        "estimates",
        "calendar",
        "team_management",
        "operations",
        "operations_work_orders",
        "operations_purchase_orders",
        "operations_invoicing",
        "operations_inventory",
        "growth",
        "payments",
        "settings",
        "setup_guide",
        "insurance",
        "reporting",
        "business_workflow",
        "organization_chart",
        "job_types",
        "today_todo",
        "time_clock",
        "custom_receipt",
        "customer_payments_soon",
        "scheduling_tools",
        null,
        null,
      ],
    },
  }

  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: uid,
      email,
      display_name: displayName,
      role: "corporate_management",
      portal_config,
      metadata: profileMeta,
      embed_lead_enabled: true,
      embed_lead_slug: embedSlug,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  )

  if (profileErr) {
    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        email,
        display_name: displayName,
        role: "corporate_management",
        portal_config,
        metadata: profileMeta,
        embed_lead_enabled: true,
        embed_lead_slug: embedSlug,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uid)
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message || profileErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  let seedSummary: { customerCount?: number; leadCount?: number } = {}
  const siteUrl = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://tradesman-us.vercel.app").replace(
    /\/+$/,
    "",
  )
  try {
    const seedRes = await fetch(`${siteUrl}/api/sandbox-simulator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed", userId: uid }),
    })
    if (seedRes.ok) {
      const seedJson = (await seedRes.json()) as { customerCount?: number; leadCount?: number }
      seedSummary = { customerCount: seedJson.customerCount, leadCount: seedJson.leadCount }
    } else {
      console.warn("[provision-sandbox] seed failed", await seedRes.text())
    }
  } catch (e) {
    console.warn("[provision-sandbox] seed error", e)
  }

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
      "Your Tradesman free trial workspace is ready.",
      "",
      `1. Open: ${loginUrl}`,
      "2. Sign in with Corporate Manager Login",
      `   Email: ${email}`,
      `   Temporary password: ${password}`,
      "",
      "Sample customers, leads, and jobs are loaded automatically. New leads can appear every few minutes while you explore.",
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
          subject: "Your Tradesman free trial login",
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

  await notifyAdminTrialProvisioned({
    email,
    displayName,
    userId: uid,
    businessName: companyName,
    embedSlug,
    expiresAt,
    customerCount: seedSummary.customerCount ?? null,
    leadCount: seedSummary.leadCount ?? null,
  })

  return new Response(
    JSON.stringify({
      ok: true,
      userId: uid,
      expiresAt,
      embedSlug,
      emailed,
      emailError: emailed ? undefined : emailError || "Email not sent",
      password,
      seeded: seedSummary.customerCount != null,
      customerCount: seedSummary.customerCount,
      leadCount: seedSummary.leadCount,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
