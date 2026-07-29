import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  firstEnv,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
} from "./_communications.js"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {}
}

function parseBody(req: VercelRequest): Json {
  if (Buffer.isBuffer(req.body)) {
    try {
      return asRecord(JSON.parse(req.body.toString("utf8")))
    } catch {
      return {}
    }
  }
  if (typeof req.body === "string") {
    try {
      return asRecord(JSON.parse(req.body))
    } catch {
      return {}
    }
  }
  return asRecord(req.body)
}

function centsFromAmount(value: unknown): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0
}

function campaignTotalChargeCents(spendCents: number): number {
  const spend = Math.max(0, Math.round(spendCents || 0))
  if (spend <= 0) return 0
  const fee = spend <= 10_000 ? 395 : 395 + Math.round((spend - 10_000) * 0.02)
  return spend + fee
}

function dateOnly(value: unknown): string {
  const raw = String(value ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function authenticatedUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  const url = pickSupabaseUrlForServer()
  const anon = pickSupabaseAnonKeyForServer()
  if (!token || !url || !anon) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  return error ? null : data.user?.id ?? null
}

function transactionRows(payload: unknown): Json[] {
  if (Array.isArray(payload)) return payload.map(asRecord)
  const record = asRecord(payload)
  for (const key of ["data", "transactions", "items"]) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).map(asRecord)
  }
  return []
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const userId = await authenticatedUserId(req)
    if (!userId) return res.status(401).json({ error: "Unauthorized" })

    const body = parseBody(req)
    const amountCents = centsFromAmount(body.amount)
    const cardToken = String(body.cardToken ?? "").trim()
    const approvalCode = String(body.approvalCode ?? "").trim()
    const customerCode = String(body.customerCode ?? "").trim()
    const legacyTransactionId = String(body.transactionId ?? "").trim()
    const requestedCampaignIds = Array.isArray(body.campaignIds)
      ? body.campaignIds.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      : []
    if (!amountCents || !cardToken || !approvalCode) {
      return res.status(400).json({ error: "Helcim amount, card token, and approval code are required." })
    }

    const apiToken = firstEnv("HELCIM_API_TOKEN", "HELCIM_MERCHANT_API_TOKEN")
    if (!apiToken) {
      return res.status(503).json({
        error: "Payment was approved, but automatic campaign reconciliation requires HELCIM_API_TOKEN on Vercel.",
      })
    }

    const paidOn = dateOnly(body.date)
    const query = new URLSearchParams({
      dateFrom: addDays(paidOn, -1),
      dateTo: addDays(paidOn, 1),
      cardToken,
      search: (amountCents / 100).toFixed(2),
      limit: "100",
    })
    if (customerCode) query.set("customerCode", customerCode)
    const verifyResponse = await fetch(`https://api.helcim.com/v2/card-transactions?${query.toString()}`, {
      headers: { "api-token": apiToken, Accept: "application/json" },
    })
    if (!verifyResponse.ok) {
      const detail = await verifyResponse.text().catch(() => "")
      throw new Error(detail || `Helcim verification failed (${verifyResponse.status}).`)
    }
    const candidates = transactionRows(await verifyResponse.json())
    const verified = candidates.find((row) => {
      const status = String(row.status ?? "").toUpperCase()
      const candidateCents = centsFromAmount(row.amount)
      return (
        (status === "APPROVED" || status === "APPROVAL") &&
        candidateCents === amountCents &&
        String(row.cardToken ?? "") === cardToken &&
        String(row.approvalCode ?? "") === approvalCode &&
        (!customerCode || String(row.customerCode ?? "") === customerCode)
      )
    })
    if (!verified) {
      return res.status(409).json({ error: "Approved payment could not yet be verified with Helcim. Try Refresh shortly." })
    }

    const providerTransactionId = String(verified.transactionId ?? "").trim()
    if (!providerTransactionId) throw new Error("Verified Helcim transaction is missing its transaction ID.")

    const service = createServiceSupabase()
    let campaignsQuery = service
      .from("ad_campaigns")
      .select("id, spent_cents, billed_cents")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true })
    if (requestedCampaignIds.length) campaignsQuery = campaignsQuery.in("id", requestedCampaignIds)
    const { data: campaigns, error: campaignsError } = await campaignsQuery
    if (campaignsError) throw campaignsError

    let remaining = amountCents
    const allocatedIds: string[] = []
    for (const campaign of campaigns ?? []) {
      const due = Math.max(
        0,
        campaignTotalChargeCents(Number(campaign.spent_cents || 0)) - Number(campaign.billed_cents || 0),
      )
      const allocation = Math.min(due, remaining)
      if (allocation <= 0) continue
      const { error } = await service
        .from("ad_campaigns")
        .update({
          billed_cents: Number(campaign.billed_cents || 0) + allocation,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id)
        .eq("profile_id", userId)
      if (error) throw error
      allocatedIds.push(String(campaign.id))
      remaining -= allocation
      if (remaining <= 0) break
    }

    const { error: paymentError } = await service.from("ad_campaign_payments").insert({
      profile_id: userId,
      amount_cents: amountCents,
      currency: String(verified.currency ?? body.currency ?? "USD").toUpperCase(),
      provider: "helcim",
      provider_transaction_id: providerTransactionId,
      approval_code: approvalCode,
      campaign_ids: allocatedIds,
      status: "verified",
      metadata: {
        legacy_transaction_id: legacyTransactionId || null,
        card_type: String(body.cardType ?? ""),
        card_number_masked: String(body.cardNumberMasked ?? ""),
        helcim_date: String(verified.dateCreated ?? body.date ?? ""),
        unallocated_cents: remaining,
      },
    })
    if (paymentError && paymentError.code !== "23505") throw paymentError

    const { data: allCampaigns } = await service
      .from("ad_campaigns")
      .select("id, spent_cents, billed_cents")
      .eq("profile_id", userId)
    const balance = (allCampaigns ?? []).reduce(
      (sum, campaign) =>
        sum +
        Math.max(
          0,
          campaignTotalChargeCents(Number(campaign.spent_cents || 0)) - Number(campaign.billed_cents || 0),
        ),
      0,
    )
    const { data: profile } = await service.from("profiles").select("metadata").eq("id", userId).maybeSingle()
    const metadata = asRecord(profile?.metadata)
    metadata.ad_campaigns_billing_v1 = {
      v: 1,
      balance_due_cents: balance,
      updated_at: new Date().toISOString(),
      campaign_ids: (allCampaigns ?? []).map((campaign) => campaign.id),
      notes: balance > 0 ? "Advertising payment received; balance remains." : "Advertising payment received; balance paid.",
    }
    await service.from("profiles").update({ metadata }).eq("id", userId)

    return res.status(200).json({
      ok: true,
      providerTransactionId,
      amountCents,
      allocatedCampaignIds: allocatedIds,
      unallocatedCents: remaining,
      balanceDueCents: balance,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign payment reconciliation failed."
    console.error("[ad-campaign-payments]", message)
    return res.status(500).json({ error: message })
  }
}
