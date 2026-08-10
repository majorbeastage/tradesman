/**
 * Payment provider abstraction — server-only. Never import from client bundles.
 */

import { firstEnv } from "./_communications.js"

export type PaymentProviderId = "helcim" | "square" | "clover" | "stripe" | "manual"

export const PAYMENT_PROVIDER_IDS: PaymentProviderId[] = ["helcim", "square", "clover", "stripe", "manual"]

export type CreatePaymentLinkInput = {
  userId: string
  customerId: string
  amount: number
  currency: string
  description: string
  customerName?: string | null
  quoteId?: string | null
  calendarEventId?: string | null
  hostedPayPortalUrl?: string | null
  helcimCustomerCode?: string | null
  credentials?: PaymentProviderCredentials | null
}

export type CreatePaymentLinkResult = {
  paymentUrl: string
  providerReferenceId: string | null
  provider: PaymentProviderId
  note?: string
}

export type PaymentProviderCredentials = {
  provider: PaymentProviderId
  accountLabel?: string | null
  helcimApiToken?: string | null
  helcimMerchantId?: string | null
  squareAccessToken?: string | null
  squareLocationId?: string | null
  cloverMerchantId?: string | null
  cloverPrivateKey?: string | null
  cloverPageConfigUuid?: string | null
  cloverSandbox?: boolean | null
  stripeSecretKey?: string | null
  stripeWebhookSecret?: string | null
  manualPaymentUrlTemplate?: string | null
}

export interface PaymentProvider {
  id: PaymentProviderId
  createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult>
}

function appendQueryParams(base: string, amount: number, description: string, customerName?: string | null): string {
  try {
    const url = new URL(base.includes("://") ? base : `https://${base}`)
    url.searchParams.set("amount", amount.toFixed(2))
    if (description.trim()) url.searchParams.set("description", description.trim().slice(0, 200))
    if (customerName?.trim()) url.searchParams.set("customer", customerName.trim().slice(0, 120))
    return url.toString()
  } catch {
    const sep = base.includes("?") ? "&" : "?"
    return `${base}${sep}amount=${encodeURIComponent(amount.toFixed(2))}`
  }
}

export class ManualPaymentProvider implements PaymentProvider {
  id: PaymentProviderId = "manual"

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
    const template =
      input.credentials?.manualPaymentUrlTemplate?.trim() ||
      input.hostedPayPortalUrl?.trim() ||
      firstEnv("HELCIM_PAYMENT_PORTAL_URL", "VITE_HELCIM_PAYMENT_PORTAL_URL")
    if (!template) {
      throw new Error(
        "No hosted payment URL configured. Save a manual pay link under Payments provider settings.",
      )
    }
    let paymentUrl = appendQueryParams(template, input.amount, input.description, input.customerName)
    if (input.helcimCustomerCode?.trim()) {
      try {
        const u = new URL(paymentUrl)
        u.searchParams.set("customerCode", input.helcimCustomerCode.trim())
        paymentUrl = u.toString()
      } catch {
        paymentUrl += `&customerCode=${encodeURIComponent(input.helcimCustomerCode.trim())}`
      }
    }
    return {
      paymentUrl,
      providerReferenceId: null,
      provider: "manual",
      note: "Manual hosted link with amount prefilled in the URL.",
    }
  }
}

export class HelcimPaymentProvider implements PaymentProvider {
  id: PaymentProviderId = "helcim"

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
    const token =
      input.credentials?.helcimApiToken?.trim() || firstEnv("HELCIM_API_TOKEN", "HELCIM_MERCHANT_API_TOKEN")
    if (token) {
      try {
        const result = await createHelcimHostedLink(token, input)
        if (result) return result
      } catch (e) {
        console.warn("[helcim-payment-link]", e instanceof Error ? e.message : e)
      }
    }
    const manual = new ManualPaymentProvider()
    const fallback = await manual.createPaymentLink(input)
    return {
      ...fallback,
      provider: "helcim",
      note: "Using hosted portal fallback. Add HELCIM_API_TOKEN on the server for native payment links.",
    }
  }
}

async function createHelcimHostedLink(
  apiToken: string,
  input: CreatePaymentLinkInput,
): Promise<CreatePaymentLinkResult | null> {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const body = {
    currency: (input.currency || "USD").toUpperCase(),
    invoiceNumber: `TM-${Date.now().toString(36).toUpperCase()}`,
    notes: input.description?.trim().slice(0, 500) || "Payment request",
    lineItems: [
      {
        description: input.description?.trim().slice(0, 200) || "Service payment",
        quantity: 1,
        price: amount,
      },
    ],
  }
  const res = await fetch("https://api.helcim.com/v2/invoices/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-token": apiToken,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text || `Helcim API ${res.status}`)
  }
  const data = (await res.json()) as Record<string, unknown>
  const invoiceId =
    typeof data.invoiceId === "string"
      ? data.invoiceId
      : typeof data.id === "number"
        ? String(data.id)
        : typeof data.id === "string"
          ? data.id
          : null
  const paymentUrl =
    typeof data.paymentUrl === "string"
      ? data.paymentUrl
      : typeof data.url === "string"
        ? data.url
        : typeof data.link === "string"
          ? data.link
          : null
  if (!paymentUrl) return null
  return {
    paymentUrl,
    providerReferenceId: invoiceId,
    provider: "helcim",
    note: "Helcim hosted invoice link.",
  }
}

function splitCustomerName(name?: string | null): { firstName: string; lastName: string } {
  const trimmed = name?.trim()
  if (!trimmed) return { firstName: "Customer", lastName: "Payment" }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "Customer" }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") }
}

function cloverCheckoutBaseUrl(sandbox?: boolean | null): string {
  const useSandbox =
    sandbox === true || (sandbox !== false && firstEnv("CLOVER_SANDBOX")?.toLowerCase() === "true")
  return useSandbox ? "https://apisandbox.dev.clover.com" : "https://api.clover.com"
}

export class CloverPaymentProvider implements PaymentProvider {
  id: PaymentProviderId = "clover"

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
    const merchantId =
      input.credentials?.cloverMerchantId?.trim() || firstEnv("CLOVER_MERCHANT_ID", "CLOVER_MID")
    const privateKey =
      input.credentials?.cloverPrivateKey?.trim() ||
      firstEnv("CLOVER_PRIVATE_KEY", "CLOVER_API_PRIVATE_KEY")
    if (!merchantId || !privateKey) {
      throw new Error(
        "Clover is not connected yet. Save Clover merchant ID and private key under Provider settings.",
      )
    }
    const amountCents = Math.round(input.amount * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("Invalid payment amount for Clover checkout.")
    }
    const customer = splitCustomerName(input.customerName)
    const body: Record<string, unknown> = {
      customer,
      shoppingCart: {
        lineItems: [
          {
            name: input.description?.trim().slice(0, 200) || "Payment",
            price: amountCents,
            unitQty: 1,
            note: input.description?.trim().slice(0, 500) || undefined,
          },
        ],
      },
    }
    const pageConfigUuid = input.credentials?.cloverPageConfigUuid?.trim()
    if (pageConfigUuid) body.pageConfigUuid = pageConfigUuid

    const baseUrl = cloverCheckoutBaseUrl(input.credentials?.cloverSandbox)
    const res = await fetch(`${baseUrl}/invoicingcheckoutservice/v1/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${privateKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Tradesman/1.0 (payment-links)",
        "X-Clover-Merchant-Id": merchantId,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(text || `Clover API ${res.status}`)
    }
    const data = (await res.json()) as { href?: string; checkoutSessionId?: string }
    const paymentUrl = typeof data.href === "string" ? data.href.trim() : ""
    if (!paymentUrl) throw new Error("Clover did not return a checkout URL.")
    return {
      paymentUrl,
      providerReferenceId: data.checkoutSessionId ?? null,
      provider: "clover",
      note: "Clover hosted checkout link (expires in ~15 minutes).",
    }
  }
}

export class SquarePaymentProvider implements PaymentProvider {
  id: PaymentProviderId = "square"

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
    const accessToken = input.credentials?.squareAccessToken?.trim()
    const locationId = input.credentials?.squareLocationId?.trim()
    if (!accessToken || !locationId) {
      throw new Error(
        "Square is not connected yet. Save Square credentials under Provider settings, or choose Helcim / manual link.",
      )
    }
    const amountCents = Math.round(input.amount * 100)
    const res = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-01-18",
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        quick_pay: {
          name: input.description?.trim().slice(0, 200) || "Payment",
          price_money: { amount: amountCents, currency: (input.currency || "USD").toUpperCase() },
          location_id: locationId,
        },
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(text || `Square API ${res.status}`)
    }
    const data = (await res.json()) as { payment_link?: { url?: string; id?: string } }
    const url = data.payment_link?.url
    if (!url) throw new Error("Square did not return a payment link URL.")
    return {
      paymentUrl: url,
      providerReferenceId: data.payment_link?.id ?? null,
      provider: "square",
      note: "Square hosted checkout link.",
    }
  }
}

function stripeCheckoutReturnBaseUrl(): string {
  const raw = firstEnv("PUBLIC_APP_URL", "VITE_SITE_URL", "SITE_URL", "VITE_PUBLIC_APP_ORIGIN", "PUBLIC_APP_ORIGIN")
  return raw?.replace(/\/+$/, "") || "https://www.tradesman-us.com"
}

function encodeStripeForm(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString()
}

export class StripePaymentProvider implements PaymentProvider {
  id: PaymentProviderId = "stripe"

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
    const secretKey =
      input.credentials?.stripeSecretKey?.trim() || firstEnv("STRIPE_SECRET_KEY", "STRIPE_API_SECRET_KEY")
    if (!secretKey) {
      throw new Error(
        "Stripe is not connected yet. Save your Stripe secret key under Provider settings.",
      )
    }
    const amountCents = Math.round(input.amount * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("Invalid payment amount for Stripe checkout.")
    }
    const currency = (input.currency || "USD").toLowerCase()
    const productName = input.description?.trim().slice(0, 200) || "Payment"
    const returnBase = stripeCheckoutReturnBaseUrl()
    const body = encodeStripeForm({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(amountCents),
      "line_items[0][price_data][product_data][name]": productName,
      success_url: `${returnBase}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}/?payment=canceled`,
      "metadata[source]": "tradesman_payment_request",
      "metadata[customer_id]": input.customerId.slice(0, 500),
    })
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(text || `Stripe API ${res.status}`)
    }
    const data = (await res.json()) as { id?: string; url?: string }
    const paymentUrl = typeof data.url === "string" ? data.url.trim() : ""
    if (!paymentUrl) throw new Error("Stripe did not return a checkout URL.")
    return {
      paymentUrl,
      providerReferenceId: typeof data.id === "string" ? data.id : null,
      provider: "stripe",
      note: "Stripe Checkout link (card, Apple Pay, and other methods enabled on the Stripe account).",
    }
  }
}

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider {
  switch (id) {
    case "helcim":
      return new HelcimPaymentProvider()
    case "square":
      return new SquarePaymentProvider()
    case "clover":
      return new CloverPaymentProvider()
    case "stripe":
      return new StripePaymentProvider()
    case "manual":
    default:
      return new ManualPaymentProvider()
  }
}

export function parseProviderCredentialsFromDb(
  provider: PaymentProviderId,
  row: { account_label?: string | null; secret_payload?: unknown } | null,
): PaymentProviderCredentials | null {
  if (!row?.secret_payload || typeof row.secret_payload !== "object" || Array.isArray(row.secret_payload)) {
    return provider === "manual" ? { provider: "manual" } : null
  }
  const p = row.secret_payload as Record<string, unknown>
  return {
    provider,
    accountLabel: row.account_label ?? null,
    helcimApiToken: typeof p.helcim_api_token === "string" ? p.helcim_api_token : null,
    helcimMerchantId: typeof p.helcim_merchant_id === "string" ? p.helcim_merchant_id : null,
    squareAccessToken: typeof p.square_access_token === "string" ? p.square_access_token : null,
    squareLocationId: typeof p.square_location_id === "string" ? p.square_location_id : null,
    cloverMerchantId: typeof p.clover_merchant_id === "string" ? p.clover_merchant_id : null,
    cloverPrivateKey: typeof p.clover_private_key === "string" ? p.clover_private_key : null,
    cloverPageConfigUuid: typeof p.clover_page_config_uuid === "string" ? p.clover_page_config_uuid : null,
    cloverSandbox: p.clover_sandbox === true || p.clover_sandbox === "true",
    stripeSecretKey: typeof p.stripe_secret_key === "string" ? p.stripe_secret_key : null,
    stripeWebhookSecret: typeof p.stripe_webhook_secret === "string" ? p.stripe_webhook_secret : null,
    manualPaymentUrlTemplate: typeof p.manual_payment_url === "string" ? p.manual_payment_url : null,
  }
}

export function buildSecretPayloadForSave(
  provider: PaymentProviderId,
  fields: Record<string, string>,
): Record<string, string> {
  if (provider === "helcim") {
    const out: Record<string, string> = {}
    if (fields.helcim_api_token?.trim()) out.helcim_api_token = fields.helcim_api_token.trim()
    if (fields.helcim_merchant_id?.trim()) out.helcim_merchant_id = fields.helcim_merchant_id.trim()
    return out
  }
  if (provider === "square") {
    const out: Record<string, string> = {}
    if (fields.square_access_token?.trim()) out.square_access_token = fields.square_access_token.trim()
    if (fields.square_location_id?.trim()) out.square_location_id = fields.square_location_id.trim()
    return out
  }
  if (provider === "clover") {
    const out: Record<string, string> = {}
    if (fields.clover_merchant_id?.trim()) out.clover_merchant_id = fields.clover_merchant_id.trim()
    if (fields.clover_private_key?.trim()) out.clover_private_key = fields.clover_private_key.trim()
    if (fields.clover_page_config_uuid?.trim()) out.clover_page_config_uuid = fields.clover_page_config_uuid.trim()
    if (fields.clover_sandbox === "true" || fields.clover_sandbox === "false") {
      out.clover_sandbox = fields.clover_sandbox
    }
    return out
  }
  if (provider === "stripe") {
    const out: Record<string, string> = {}
    if (fields.stripe_secret_key?.trim()) out.stripe_secret_key = fields.stripe_secret_key.trim()
    if (fields.stripe_webhook_secret?.trim()) out.stripe_webhook_secret = fields.stripe_webhook_secret.trim()
    return out
  }
  const out: Record<string, string> = {}
  if (fields.manual_payment_url?.trim()) out.manual_payment_url = fields.manual_payment_url.trim()
  return out
}
