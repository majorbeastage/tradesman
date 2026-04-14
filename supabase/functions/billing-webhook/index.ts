// Supabase Edge: card-processor webhooks (e.g. Helcim) → billing_events + profiles.account_disabled
// Profiles with role admin, office_manager, or demo_user are exempt: no account_disabled or billing metadata changes from Helcim.
// IMPORTANT: Deliver URL must NOT contain the substring "Helcim" (processor rule). This function is named billing-webhook.
// Deploy: supabase functions deploy billing-webhook --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   HELCIM_WEBHOOK_VERIFIER_TOKEN (base64, from processor webhook settings) — recommended
//   HELCIM_API_TOKEN — Helcim: All Tools → Integrations → API Access Configuration → New API Access.
//     Name is arbitrary (e.g. "Tradesman billing webhook"). Copy the generated api-token into this secret.
//     Access restrictions must allow GET https://api.helcim.com/v2/card-transactions/{id} (Helcim groups this under
//     Helcim API / Payment API). If you get "No access permission", raise Transaction Processing (e.g. Auth or
//     Positive Transaction per their hierarchy) and ensure General can read Customers (customerCode on the tx).
//     See: https://devdocs.helcim.com/v2.2/docs/creating-an-api-access-configuration
// Optional: HELCIM_INBOUND_WEBHOOK_SECRET — header x-tradesman-webhook-secret when verifier token is not set (dev only)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-signature, webhook-id, webhook-timestamp, x-tradesman-webhook-secret",
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.trim())
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSha256Base64(keyBytes: Uint8Array, message: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message))
  const bytes = new Uint8Array(sig)
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function parseV1Signature(sigHeader: string | null): string | null {
  if (!sigHeader) return null
  for (const seg of sigHeader.trim().split(/\s+/)) {
    const idx = seg.indexOf(",")
    if (idx === -1) continue
    const ver = seg.slice(0, idx).trim()
    const rest = seg.slice(idx + 1).trim()
    if (ver === "v1" && rest) return rest
  }
  return null
}

async function verifyProcessorWebhookSignature(rawBody: string, headers: Headers): Promise<boolean> {
  const verifierB64 = Deno.env.get("HELCIM_WEBHOOK_VERIFIER_TOKEN")?.trim()
  if (!verifierB64) return false
  const id = headers.get("webhook-id")
  const ts = headers.get("webhook-timestamp")
  const expectedB64 = parseV1Signature(headers.get("webhook-signature"))
  if (!id || !ts || !expectedB64) return false
  let keyBytes: Uint8Array
  try {
    keyBytes = fromBase64(verifierB64)
  } catch {
    return false
  }
  const signedContent = `${id}.${ts}.${rawBody}`
  let computed: string
  try {
    computed = await hmacSha256Base64(keyBytes, signedContent)
  } catch {
    return false
  }
  return computed === expectedB64
}

function mergeBillingMeta(
  prev: Record<string, unknown>,
  patch: { billing_last_success_at?: string },
): Record<string, unknown> {
  const next = { ...prev }
  if (patch.billing_last_success_at) next.billing_last_success_at = patch.billing_last_success_at
  return next
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const rawBody = await req.text()
  const verifierConfigured = Boolean(Deno.env.get("HELCIM_WEBHOOK_VERIFIER_TOKEN")?.trim())
  const sharedSecret = Deno.env.get("HELCIM_INBOUND_WEBHOOK_SECRET")?.trim()

  if (!verifierConfigured && !sharedSecret) {
    return new Response(
      JSON.stringify({
        error: "Set HELCIM_WEBHOOK_VERIFIER_TOKEN (recommended) or HELCIM_INBOUND_WEBHOOK_SECRET on this function.",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  let authOk = false
  if (verifierConfigured) {
    authOk = await verifyProcessorWebhookSignature(rawBody, req.headers)
  }
  if (!authOk && sharedSecret) {
    const h = req.headers.get("x-tradesman-webhook-secret")
    authOk = Boolean(h && h === sharedSecret)
  }
  if (!authOk) {
    return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const type = typeof body.type === "string" ? body.type : ""
  const rawId = body.id
  const txId = rawId === undefined || rawId === null ? "" : String(rawId)

  /** Manual / middleware shape for testing */
  const manualProfile = typeof body.profileId === "string" ? body.profileId : ""
  const manualStatus = typeof body.paymentStatus === "string" ? body.paymentStatus.toLowerCase() : ""

  let customerCode = ""
  let approved: boolean | null = null
  let amountCents: number | null = null

  if (manualProfile && (manualStatus === "approved" || manualStatus === "declined")) {
    customerCode = typeof body.helcimCustomerCode === "string" ? body.helcimCustomerCode : ""
    approved = manualStatus === "approved"
  } else if (type === "cardTransaction" && txId) {
    const apiToken = Deno.env.get("HELCIM_API_TOKEN")?.trim()
    if (!apiToken) {
      try {
        await admin.from("billing_events").insert({
          event_type: "cardTransaction_pending",
          external_id: txId,
          source: "helcim",
          payload: body,
        })
      } catch {
        /* table may not exist yet */
      }
      return new Response(JSON.stringify({ ok: true, note: "HELCIM_API_TOKEN not set; event stored if billing_events exists." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const r = await fetch(`https://api.helcim.com/v2/card-transactions/${encodeURIComponent(txId)}`, {
      headers: { "api-token": apiToken, Accept: "application/json" },
    })
    const txJson = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Processor API error", detail: txJson }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    customerCode = typeof txJson.customerCode === "string" ? txJson.customerCode.trim() : ""
    const st = typeof txJson.status === "string" ? txJson.status.toUpperCase() : ""
    approved = st === "APPROVED" || st === "APPROVED (TEST)"
    const amt = txJson.transactionAmount
    if (typeof amt === "number" && Number.isFinite(amt)) amountCents = Math.round(amt * 100)
    else if (typeof amt === "string") {
      const n = Number.parseFloat(amt)
      if (Number.isFinite(n)) amountCents = Math.round(n * 100)
    }
  } else if (type === "terminalCancel") {
    const data = body.data as Record<string, unknown> | undefined
    customerCode = typeof data?.customerCode === "string" ? data.customerCode.trim() : ""
    approved = false
  } else {
    return new Response(JSON.stringify({ ok: true, ignored: true, type }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let profileId: string | null = manualProfile || null
  if (!profileId && customerCode) {
    const { data: profiles } = await admin.from("profiles").select("id, metadata").limit(8000)
    const match = (profiles ?? []).find((p: { id: string; metadata?: unknown }) => {
      const m = p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? (p.metadata as Record<string, unknown>) : {}
      return String(m.billing_helcim_customer_code ?? "").trim() === customerCode
    })
    profileId = match?.id ?? null
  }

  try {
    await admin.from("billing_events").insert({
      profile_id: profileId,
      event_type: type || (manualProfile ? "manual" : "unknown"),
      amount_cents: amountCents,
      external_id: txId || null,
      source: "helcim",
      payload: body,
    })
  } catch {
    /* billing_events optional until SQL applied */
  }

  if (!profileId) {
    return new Response(JSON.stringify({ ok: true, note: "No profile matched customer code" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("metadata, account_disabled, role")
    .eq("id", profileId)
    .maybeSingle()
  const role = typeof prof?.role === "string" ? prof.role.trim() : ""
  /** Staff and demo logins must never lose access because of a processor decline on a mapped customer code. */
  const exemptFromHelcimProfileUpdates =
    role === "admin" || role === "office_manager" || role === "demo_user"
  const meta =
    prof?.metadata && typeof prof.metadata === "object" && !Array.isArray(prof.metadata)
      ? { ...(prof.metadata as Record<string, unknown>) }
      : {}
  const paused = meta.billing_automation_paused === true

  const nowIso = new Date().toISOString()
  let accountAutomationApplied = false
  if (!exemptFromHelcimProfileUpdates) {
    if (approved === true) {
      const nextMeta = mergeBillingMeta(meta, { billing_last_success_at: nowIso })
      await admin
        .from("profiles")
        .update({
          account_disabled: false,
          metadata: nextMeta,
          updated_at: nowIso,
        })
        .eq("id", profileId)
      accountAutomationApplied = true
    } else if (approved === false && !paused) {
      await admin
        .from("profiles")
        .update({
          account_disabled: true,
          updated_at: nowIso,
        })
        .eq("id", profileId)
      accountAutomationApplied = true
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      profileId,
      applied: approved,
      exemptFromHelcimAutomation: exemptFromHelcimProfileUpdates,
      accountAutomationApplied,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  )
})
