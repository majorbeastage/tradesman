import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase } from "./_communications.js"
import { appOriginFromRequest, authenticatedUserId, stripeFormPost, stripeSecretKey } from "./_stripeBilling.js"
import { clampBillingCoverMonths } from "../src/lib/billingProfileMetadata.js"

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const userId = await authenticatedUserId(req)
    if (!userId) return res.status(401).json({ error: "Sign in again to pay." })
    const secret = stripeSecretKey()
    if (!secret) {
      return res.status(503).json({
        error: "Stripe is not connected yet. Add STRIPE_SECRET_KEY on the server, then try again.",
      })
    }
    const body = asRecord(req.body)
    const amountUsd = Number(body.amountUsd)
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return res.status(400).json({ error: "Enter a payment amount greater than zero." })
    }
    const amountCents = Math.round(amountUsd * 100)
    const coverMonths = clampBillingCoverMonths(body.coverMonths)
    const autopay = body.autopay === true
    const billSubscription = body.billSubscription !== false
    const campaignIds = Array.isArray(body.campaignIds)
      ? body.campaignIds.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 12)
      : []
    const origin = appOriginFromRequest(req)
    const service = createServiceSupabase()
    const { data: profile } = await service.from("profiles").select("metadata, email").eq("id", userId).maybeSingle()
    const meta =
      profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
        ? (profile.metadata as Record<string, unknown>)
        : {}
    const existingCustomer = typeof meta.billing_stripe_customer_id === "string" ? meta.billing_stripe_customer_id.trim() : ""
    const fields: Record<string, string> = {
      mode: "payment",
      client_reference_id: userId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(amountCents),
      "line_items[0][price_data][product_data][name]":
        coverMonths > 1 ? `Tradesman subscription (${coverMonths} months)` : "Tradesman subscription",
      success_url: `${origin}/#/app/payments?stripe=success`,
      cancel_url: `${origin}/#/app/payments?stripe=cancel`,
      "metadata[purpose]": "tradesman_billing",
      "metadata[profile_id]": userId,
      "metadata[cover_months]": String(billSubscription ? coverMonths : 1),
      "metadata[bill_subscription]": billSubscription ? "true" : "false",
      "metadata[autopay]": autopay ? "true" : "false",
      "metadata[campaign_ids]": campaignIds.join(","),
      "payment_intent_data[metadata][purpose]": "tradesman_billing",
      "payment_intent_data[metadata][profile_id]": userId,
    }
    if (existingCustomer) fields.customer = existingCustomer
    else {
      fields.customer_creation = "always"
      const email = typeof profile?.email === "string" ? profile.email.trim() : ""
      if (email) fields.customer_email = email
    }
    if (autopay) fields["payment_intent_data[setup_future_usage]"] = "off_session"
    const session = await stripeFormPost("/v1/checkout/sessions", fields, secret)
    const url = typeof session.url === "string" ? session.url : ""
    if (!url) return res.status(502).json({ error: "Stripe did not return a checkout link." })
    return res.status(200).json({ url })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Stripe checkout."
    console.error("[stripe-billing-checkout]", message)
    return res.status(500).json({ error: message })
  }
}
