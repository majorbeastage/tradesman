import crypto from "crypto"
import type { VercelRequest } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { firstEnv, pickSupabaseUrlForServer, pickSupabaseAnonKeyForServer, createServiceSupabase } from "./_communications.js"
import { appendBillingPaymentHistory, applyReceivedBillingPayment, clampBillingCoverMonths } from "../src/lib/billingProfileMetadata.js"

export function stripeSecretKey(): string {
  return firstEnv("STRIPE_SECRET_KEY", "STRIPE_API_SECRET_KEY")
}

export function appOriginFromRequest(req: VercelRequest): string {
  const fromEnv = firstEnv("PUBLIC_APP_URL", "VITE_PUBLIC_APP_ORIGIN", "PUBLIC_APP_ORIGIN", "VITE_SITE_URL", "SITE_URL")
  if (fromEnv) return fromEnv.replace(/\/+$/, "")
  const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0]?.trim() || "https"
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0]?.trim()
  return host ? `${proto}://${host}` : "https://www.tradesman-us.com"
}

export async function authenticatedUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!token || !url || !anon) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  return error ? null : data.user?.id ?? null
}

function encodeStripeForm(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString()
}

export async function stripeFormPost(path: string, fields: Record<string, string>, secret: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeStripeForm(fields),
  })
  const text = await res.text()
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!res.ok) {
    const err = data.error && typeof data.error === "object" ? (data.error as { message?: string }).message : ""
    throw new Error(err || text || `Stripe ${res.status}`)
  }
  return data
}

export async function stripeGet(path: string, secret: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const text = await res.text()
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!res.ok) {
    const err = data.error && typeof data.error === "object" ? (data.error as { message?: string }).message : ""
    throw new Error(err || text || `Stripe ${res.status}`)
  }
  return data
}

export function verifyStripeWebhook(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(",").map((p) => p.trim())
  let timestamp = ""
  const signatures: string[] = []
  for (const part of parts) {
    const eq = part.indexOf("=")
    if (eq < 0) continue
    const key = part.slice(0, eq)
    const value = part.slice(eq + 1)
    if (key === "t") timestamp = value
    if (key === "v1" && value) signatures.push(value)
  }
  const ts = Number(timestamp)
  if (!timestamp || !signatures.length || !Number.isFinite(ts)) return false
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
  const expectedBuf = Buffer.from(expected)
  return signatures.some((sig) => {
    try {
      const got = Buffer.from(sig)
      return got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf)
    } catch {
      return false
    }
  })
}

function campaignChargeCents(spendCents: number): number {
  const spend = Math.max(0, Math.round(spendCents || 0))
  if (spend <= 0) return 0
  const fee = spend <= 10_000 ? 395 : 395 + Math.round((spend - 10_000) * 0.02)
  return spend + fee
}

async function allocateAdvertisingPayment(
  service: SupabaseClient,
  profileId: string,
  amountCents: number,
  transactionId: string,
  campaignIds: string[],
): Promise<void> {
  let query = service.from("ad_campaigns").select("id, spent_cents, billed_cents").eq("profile_id", profileId).order("created_at", { ascending: true })
  if (campaignIds.length) query = query.in("id", campaignIds)
  const { data: campaigns, error } = await query
  if (error) throw error
  let remaining = amountCents
  const allocatedIds: string[] = []
  for (const campaign of campaigns ?? []) {
    const due = Math.max(0, campaignChargeCents(Number(campaign.spent_cents || 0)) - Number(campaign.billed_cents || 0))
    const allocation = Math.min(due, remaining)
    if (allocation <= 0) continue
    const { error: upErr } = await service
      .from("ad_campaigns")
      .update({ billed_cents: Number(campaign.billed_cents || 0) + allocation, updated_at: new Date().toISOString() })
      .eq("id", campaign.id)
      .eq("profile_id", profileId)
    if (upErr) throw upErr
    allocatedIds.push(String(campaign.id))
    remaining -= allocation
    if (remaining <= 0) break
  }
  if (!allocatedIds.length) return
  const { error: payErr } = await service.from("ad_campaign_payments").insert({
    profile_id: profileId,
    amount_cents: amountCents,
    currency: "USD",
    provider: "stripe",
    provider_transaction_id: transactionId,
    campaign_ids: allocatedIds,
    status: "verified",
    metadata: { source: "stripe_billing_checkout", unallocated_cents: remaining },
  })
  if (payErr && payErr.code !== "23505") throw payErr
}

export async function applyStripeCheckoutSession(session: Record<string, unknown>): Promise<void> {
  const metadata = session.metadata && typeof session.metadata === "object" ? (session.metadata as Record<string, unknown>) : {}
  const purpose = String(metadata.purpose ?? "")
  if (purpose !== "tradesman_billing") return
  if (String(session.payment_status ?? "") !== "paid") return
  const profileId = String(metadata.profile_id ?? session.client_reference_id ?? "").trim()
  if (!profileId) return
  const service = createServiceSupabase()
  const { data: row, error } = await service.from("profiles").select("metadata, role").eq("id", profileId).maybeSingle()
  if (error) throw error
  if (!row) return
  const prev =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {}
  const amountCents = typeof session.amount_total === "number" ? session.amount_total : 0
  const amountUsd = amountCents > 0 ? Math.round(amountCents) / 100 : undefined
  const billSubscription = String(metadata.bill_subscription ?? "true") !== "false"
  const coverMonths = clampBillingCoverMonths(metadata.cover_months)
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : ""
  const sessionId = typeof session.id === "string" ? session.id : ""
  const paidAt = new Date().toISOString()
  let next = billSubscription
    ? applyReceivedBillingPayment(prev, {
        at: paidAt,
        amountUsd,
        transactionId: paymentIntentId || sessionId || undefined,
        orderNumber: sessionId || undefined,
        note: "Stripe checkout",
        coverMonths,
      })
    : appendBillingPaymentHistory(prev, {
        at: paidAt,
        amountUsd,
        transactionId: paymentIntentId || sessionId || undefined,
        orderNumber: sessionId || undefined,
        note: "Stripe advertising",
      })
  const customerId = typeof session.customer === "string" ? session.customer : ""
  if (customerId) next.billing_stripe_customer_id = customerId
  if (String(metadata.autopay ?? "") === "true") {
    next.billing_autopay_enabled = true
    if (!next.billing_autopay_enrolled_at) next.billing_autopay_enrolled_at = new Date().toISOString()
    next.billing_autopay_last_error = ""
  }
  const secret = stripeSecretKey()
  if (secret && paymentIntentId) {
    try {
      const pi = await stripeGet(`/v1/payment_intents/${paymentIntentId}`, secret)
      const pm = typeof pi.payment_method === "string" ? pi.payment_method : ""
      if (pm) next.billing_stripe_payment_method_id = pm
    } catch (e) {
      console.warn("[stripe-billing] payment method", e instanceof Error ? e.message : e)
    }
  }
  const role = typeof row.role === "string" ? row.role : ""
  const patch: Record<string, unknown> = { metadata: next, updated_at: new Date().toISOString() }
  if (role !== "admin" && role !== "office_manager" && role !== "demo_user") patch.account_disabled = false
  const { error: upErr } = await service.from("profiles").update(patch).eq("id", profileId)
  if (upErr) throw upErr

  const campaignIds = String(metadata.campaign_ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (campaignIds.length && amountCents > 0 && paymentIntentId) {
    try {
      await allocateAdvertisingPayment(service, profileId, amountCents, paymentIntentId, campaignIds)
    } catch (e) {
      console.warn("[stripe-billing] ads", e instanceof Error ? e.message : e)
    }
  }
}
