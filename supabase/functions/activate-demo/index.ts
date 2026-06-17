// Record first login for a demo account and start the 24-hour session clock.
// Deploy: supabase functions deploy activate-demo

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  demoExpiresAfterActivationIso,
  isDemoProfileRow,
} from "../_shared/demo-lifecycle.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const token = authHeader.slice("Bearer ".length).trim()
  const { data: authUser, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authUser.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const uid = authUser.user.id
  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("metadata, portal_config, role")
    .eq("id", uid)
    .maybeSingle()

  if (profErr || !isDemoProfileRow(prof as { role?: string; metadata?: Record<string, unknown>; portal_config?: { demo_account?: boolean } })) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const meta = (prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata))
    ? { ...(prof.metadata as Record<string, unknown>) }
    : {}

  if (typeof meta.demo_activated_at === "string" && meta.demo_activated_at.trim()) {
    return new Response(JSON.stringify({ ok: true, already: true, expiresAt: meta.demo_expires_at ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const activateBy = typeof meta.demo_activate_by === "string" ? meta.demo_activate_by : null
  if (activateBy && new Date(activateBy).getTime() < Date.now()) {
    try {
      await admin.rpc("purge_trial_user_data", { p_user_id: uid })
    } catch {
      /* best-effort */
    }
    await admin.auth.admin.deleteUser(uid)
    return new Response(JSON.stringify({ error: "Demo login expired before first use (8-hour window)." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const nowIso = new Date().toISOString()
  const expiresAt = demoExpiresAfterActivationIso()

  const nextMeta: Record<string, unknown> = {
    ...meta,
    demo_activated_at: nowIso,
    demo_expires_at: expiresAt,
    demo_communications_blocked: true,
    demo_account: true,
  }

  await admin.from("profiles").update({ metadata: nextMeta, updated_at: nowIso }).eq("id", uid)
  await admin
    .from("demo_access_grants")
    .update({ activated_at: nowIso, expires_at: expiresAt })
    .eq("auth_user_id", uid)

  return new Response(JSON.stringify({ ok: true, activatedAt: nowIso, expiresAt }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
