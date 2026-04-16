// Admin-only: pull Helcim customers via API, match profiles by email (case-insensitive), set metadata.billing_helcim_customer_code.
// Does not overwrite an existing code unless overwriteExisting: true in JSON body.
// Deploy: supabase functions deploy helcim-match-customers
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HELCIM_API_TOKEN (same token family as billing-webhook card lookup)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type HelcimCustomer = Record<string, unknown>

function normEmail(s: unknown): string {
  return typeof s === "string" ? s.trim().toLowerCase() : ""
}

function emailFromHelcimCustomer(c: HelcimCustomer): string {
  const a = normEmail(c.contactEmail)
  if (a) return a
  const b = normEmail(c.email)
  if (b) return b
  const contact = c.contact as Record<string, unknown> | undefined
  if (contact && typeof contact === "object") {
    const d = normEmail(contact.email ?? contact.contactEmail)
    if (d) return d
  }
  return ""
}

function codeFromHelcimCustomer(c: HelcimCustomer): string {
  const raw = c.customerCode ?? c.customer_code
  return typeof raw === "string" ? raw.trim() : ""
}

async function fetchAllHelcimCustomers(apiToken: string): Promise<HelcimCustomer[]> {
  const out: HelcimCustomer[] = []
  let page = 1
  const limit = 100
  for (;;) {
    const url = `https://api.helcim.com/v2/customers/?page=${page}&limit=${limit}`
    const r = await fetch(url, {
      headers: { "api-token": apiToken, Accept: "application/json" },
    })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) {
      throw new Error(typeof j.message === "string" ? j.message : `Helcim HTTP ${r.status}`)
    }
    const batch = Array.isArray(j)
      ? (j as HelcimCustomer[])
      : Array.isArray(j.customers)
        ? (j.customers as HelcimCustomer[])
        : Array.isArray(j.customer)
          ? (j.customer as HelcimCustomer[])
          : Array.isArray(j.data)
            ? (j.data as HelcimCustomer[])
            : []
    if (batch.length === 0) break
    out.push(...batch)
    if (batch.length < limit) break
    page += 1
    if (page > 200) break // safety cap 20k customers
  }
  return out
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
  const helcimToken = Deno.env.get("HELCIM_API_TOKEN")?.trim() ?? ""
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (!helcimToken) {
    return new Response(JSON.stringify({ error: "HELCIM_API_TOKEN not set on this function" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let overwriteExisting = false
  try {
    const body = await req.json() as { overwriteExisting?: boolean }
    overwriteExisting = body?.overwriteExisting === true
  } catch {
    /* default */
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

  const { data: actor, error: actorErr } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (actorErr || (actor?.role as string | undefined) !== "admin") {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let helcimCustomers: HelcimCustomer[]
  try {
    helcimCustomers = await fetchAllHelcimCustomers(helcimToken)
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const byEmail = new Map<string, string>()
  for (const c of helcimCustomers) {
    const em = emailFromHelcimCustomer(c)
    const code = codeFromHelcimCustomer(c)
    if (!em || !code) continue
    if (!byEmail.has(em)) byEmail.set(em, code) // first wins on duplicates
  }

  const profiles: { id: string; email: string | null; metadata: unknown }[] = []
  const BATCH = 800
  let start = 0
  for (;;) {
    const { data: chunk, error: pErr } = await admin
      .from("profiles")
      .select("id, email, metadata")
      .order("id", { ascending: true })
      .range(start, start + BATCH - 1)
    if (pErr) {
      return new Response(JSON.stringify({ error: pErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const rows = (chunk ?? []) as { id: string; email: string | null; metadata: unknown }[]
    if (!rows.length) break
    profiles.push(...rows)
    if (rows.length < BATCH) break
    start += BATCH
    if (start > 500000) break
  }

  let updated = 0
  let skippedHasCode = 0
  let skippedNoEmail = 0
  let skippedNoMatch = 0
  const samples: Array<{ profileId: string; email: string; customerCode: string }> = []

  for (const row of profiles) {
    const em = normEmail(row.email)
    if (!em) {
      skippedNoEmail++
      continue
    }
    const code = byEmail.get(em)
    if (!code) {
      skippedNoMatch++
      continue
    }
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    const existing = typeof meta.billing_helcim_customer_code === "string" ? meta.billing_helcim_customer_code.trim() : ""
    if (existing && !overwriteExisting) {
      skippedHasCode++
      continue
    }
    if (existing === code) {
      skippedHasCode++
      continue
    }
    const nextMeta = { ...meta, billing_helcim_customer_code: code }
    const { error: upErr } = await admin.from("profiles").update({ metadata: nextMeta }).eq("id", row.id)
    if (upErr) continue
    updated++
    if (samples.length < 15) samples.push({ profileId: row.id, email: em, customerCode: code })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      helcimCustomerCount: helcimCustomers.length,
      uniqueEmailsWithCode: byEmail.size,
      updated,
      skippedHasCode,
      skippedNoEmail,
      skippedNoMatch,
      samples,
      note: overwriteExisting
        ? "Existing billing_helcim_customer_code values were replaced when email matched."
        : "Only profiles with empty billing_helcim_customer_code were updated.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
