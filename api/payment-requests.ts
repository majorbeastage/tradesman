import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  createServiceSupabase,
  firstEnv,
  getPrimaryEmailChannelForUser,
  getPrimarySmsChannelForUser,
  logCommunicationEvent,
  pickSupabaseAnonKeyForServer,
  pickSupabaseUrlForServer,
  toTwilioE164,
} from "./_communications.js"
import {
  buildSecretPayloadForSave,
  getPaymentProvider,
  parseProviderCredentialsFromDb,
  type PaymentProviderId,
} from "./_paymentProviders.js"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { autoAdvanceCustomerWorkflowServer } from "./_workflowAutoComplete.js"

type Json = Record<string, unknown>

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

async function resolveSupabase(req: VercelRequest, body: Json): Promise<{ sb: SupabaseClient; userId: string }> {
  try {
    const sb = createServiceSupabase()
    const userId = String(body.userId ?? "").trim()
    if (!userId) throw new Error("userId required")
    return { sb, userId }
  } catch (serviceErr) {
    const authHeader = typeof req.headers?.authorization === "string" ? req.headers.authorization.trim() : ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
    const supabaseUrl = pickSupabaseUrlForServer() || String(body.supabaseUrl ?? "").trim()
    const anonKey = pickSupabaseAnonKeyForServer() || String(body.supabaseAnonKey ?? "").trim()
    const userId = String(body.userId ?? "").trim()
    if (!token || !supabaseUrl || !anonKey || !userId) {
      const msg = serviceErr instanceof Error ? serviceErr.message : String(serviceErr)
      if (/Missing server env/i.test(msg)) throw new Error(msg)
      throw new Error("Unauthorized")
    }
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data.user?.id || data.user.id !== userId) throw new Error("Unauthorized")
    return { sb, userId }
  }
}

function paymentApiErrorStatus(message: string): number {
  if (/unauthorized/i.test(message)) return 401
  if (/not found/i.test(message)) return 404
  if (/required|invalid/i.test(message)) return 400
  if (/not configured|run supabase/i.test(message)) return 503
  return 500
}

async function loadProviderCredentials(sb: SupabaseClient, userId: string, provider: PaymentProviderId) {
  const { data } = await sb
    .from("payment_provider_credentials")
    .select("account_label, secret_payload")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle()
  return parseProviderCredentialsFromDb(provider, data)
}

async function loadProfilePaymentContext(sb: SupabaseClient, userId: string) {
  const { data } = await sb.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  const meta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {}
  const customerPayLink = typeof meta.customer_pay_link_url === "string" ? meta.customer_pay_link_url.trim() : null
  const helcimCode = typeof meta.billing_helcim_customer_code === "string" ? meta.billing_helcim_customer_code.trim() : null
  const autoReceipt = meta.payment_auto_receipt_on_paid !== false
  const defaultProvider =
    typeof meta.payment_default_provider === "string" &&
    (meta.payment_default_provider === "helcim" || meta.payment_default_provider === "square" || meta.payment_default_provider === "manual")
      ? (meta.payment_default_provider as PaymentProviderId)
      : "helcim"
  return { customerPayLink, helcimCode, autoReceipt, defaultProvider, metadata: meta }
}

function buildShareMessage(input: {
  customerName?: string | null
  description: string
  amount: number
  paymentUrl: string
}): string {
  const who = input.customerName?.trim() ? `Hi ${input.customerName.trim()},` : "Hello,"
  return [
    who,
    "",
    input.description?.trim() ? `For: ${input.description.trim()}` : "",
    `Amount due: $${input.amount.toFixed(2)}`,
    `Secure payment link: ${input.paymentUrl}`,
    "",
    "Thank you!",
  ]
    .filter((l) => l !== "")
    .join("\n")
}

async function buildSimpleReceiptPdf(input: {
  businessName: string
  customerName: string
  amount: number
  description: string
  paidAt: string
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let y = 740
  const line = (text: string, size = 12, f = font) => {
    page.drawText(text, { x: 50, y, size, font: f })
    y -= size + 8
  }
  line("Payment Receipt", 18, bold)
  line(input.businessName, 12, bold)
  y -= 8
  line(`Customer: ${input.customerName}`)
  line(`Description: ${input.description}`)
  line(`Amount paid: $${input.amount.toFixed(2)}`)
  line(`Paid: ${new Date(input.paidAt).toLocaleString()}`)
  line("Processed via hosted payment provider. Card data handled by processor.")
  return doc.save()
}

async function sendOutboundEmail(sb: SupabaseClient, input: {
  userId: string
  to: string
  subject: string
  body: string
  customerId: string
  attachments?: { filename: string; content: string }[]
}) {
  const apiKey = firstEnv("RESEND_API_KEY")
  if (!apiKey) throw new Error("RESEND_API_KEY not configured on server.")
  const channel = await getPrimaryEmailChannelForUser(sb, input.userId)
  const from = channel?.public_address || firstEnv("RESEND_FROM_EMAIL")
  if (!from) throw new Error("No outbound email channel configured.")
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.body,
      attachments: input.attachments,
    }),
  })
  if (!res.ok) throw new Error(await res.text().catch(() => "Email send failed"))
  await logCommunicationEvent(sb, {
    user_id: input.userId,
    customer_id: input.customerId,
    event_type: "email",
    direction: "outbound",
    subject: input.subject,
    body: input.body,
    metadata: { source: "payment_request" },
  })
}

async function sendOutboundSms(sb: SupabaseClient, input: {
  userId: string
  to: string
  body: string
  customerId: string
}) {
  const sid = firstEnv("TWILIO_ACCOUNT_SID")
  const token = firstEnv("TWILIO_AUTH_TOKEN")
  const messagingSid = firstEnv("TWILIO_MESSAGING_SERVICE_SID")
  const fromFallback = firstEnv("TWILIO_FROM_NUMBER")
  if (!sid || !token) throw new Error("Twilio not configured on server.")
  const channel = await getPrimarySmsChannelForUser(sb, input.userId)
  const to = toTwilioE164(input.to)
  const params = new URLSearchParams()
  params.set("To", to)
  params.set("Body", input.body)
  if (messagingSid) params.set("MessagingServiceSid", messagingSid)
  else if (channel?.public_address) params.set("From", toTwilioE164(channel.public_address))
  else if (fromFallback) params.set("From", toTwilioE164(fromFallback))
  else throw new Error("No SMS from-number configured.")
  const auth = Buffer.from(`${sid}:${token}`).toString("base64")
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(await res.text().catch(() => "SMS send failed"))
  await logCommunicationEvent(sb, {
    user_id: input.userId,
    customer_id: input.customerId,
    event_type: "sms",
    direction: "outbound",
    subject: "Payment link",
    body: input.body,
    metadata: { source: "payment_request" },
  })
}

async function handleCreateLink(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Json
  const { sb, userId } = await resolveSupabase(req, body)
  const customerId = String(body.customerId ?? "").trim()
  const amount = Number(body.amount)
  const description = String(body.description ?? "").trim() || "Payment"
  const provider = (String(body.provider ?? "helcim").trim() as PaymentProviderId) || "helcim"
  const quoteId = String(body.quoteId ?? "").trim() || null
  const calendarEventId = String(body.calendarEventId ?? "").trim() || null
  const invoiceId = String(body.invoiceId ?? "").trim() || null
  const isPaymentPlan = body.paymentPlan === true || body.isPaymentPlan === true
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "customerId and positive amount are required." })
    return
  }
  const { data: cust } = await sb.from("customers").select("id, display_name").eq("id", customerId).eq("user_id", userId).maybeSingle()
  if (!cust) {
    res.status(404).json({ error: "Customer not found." })
    return
  }
  const profileCtx = await loadProfilePaymentContext(sb, userId)
  const credentials = await loadProviderCredentials(sb, userId, provider)
  const link = await getPaymentProvider(provider).createPaymentLink({
    userId,
    customerId,
    amount,
    currency: "USD",
    description,
    customerName: (cust as { display_name?: string }).display_name ?? null,
    quoteId,
    calendarEventId,
    hostedPayPortalUrl: profileCtx.customerPayLink,
    helcimCustomerCode: null,
    credentials,
  })
  const { data: row, error } = await sb
    .from("payment_requests")
    .insert({
      created_by: userId,
      user_id: userId,
      customer_id: customerId,
      quote_id: quoteId,
      invoice_id: invoiceId,
      calendar_event_id: calendarEventId,
      amount,
      currency: "USD",
      description,
      provider: link.provider,
      payment_url: link.paymentUrl,
      status: "draft",
      provider_reference_id: link.providerReferenceId,
      metadata: { provider_note: link.note ?? null, ...(isPaymentPlan ? { payment_plan: true } : {}) },
    })
    .select("*")
    .single()
  if (error) {
    if (/payment_requests|does not exist|relation/i.test(error.message ?? "")) {
      res.status(503).json({ error: "Run supabase/payment-requests.sql in Supabase, then retry." })
      return
    }
    res.status(500).json({ error: error.message })
    return
  }
  res.status(200).json({ ok: true, paymentRequest: row, paymentUrl: link.paymentUrl })
}

async function handleSend(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Json
  const { sb, userId } = await resolveSupabase(req, body)
  const paymentRequestId = String(body.paymentRequestId ?? "").trim()
  const channel = String(body.channel ?? "email").trim() as "sms" | "email" | "both"
  if (!paymentRequestId) {
    res.status(400).json({ error: "paymentRequestId required." })
    return
  }
  const { data: pr, error } = await sb
    .from("payment_requests")
    .select("*, customers(display_name)")
    .eq("id", paymentRequestId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !pr) {
    res.status(404).json({ error: "Payment request not found." })
    return
  }
  const paymentUrl = String((pr as { payment_url?: string }).payment_url ?? "").trim()
  if (!paymentUrl) {
    res.status(400).json({ error: "Generate a payment link first." })
    return
  }
  const customerId = String((pr as { customer_id: string }).customer_id)
  const { data: idents } = await sb
    .from("customer_identifiers")
    .select("type, value")
    .eq("customer_id", customerId)
    .eq("user_id", userId)
  const phone = (idents ?? []).find((i: { type: string }) => i.type === "phone")?.value?.trim() ?? ""
  const email = (idents ?? []).find((i: { type: string }) => i.type === "email")?.value?.trim() ?? ""
  const customerName = (pr as { customers?: { display_name?: string } }).customers?.display_name ?? null
  const amount = Number((pr as { amount: number }).amount)
  const description = String((pr as { description?: string }).description ?? "")
  const message = buildShareMessage({ customerName, description, amount, paymentUrl })
  if ((channel === "email" || channel === "both") && email) {
    await sendOutboundEmail(sb, {
      userId,
      to: email,
      subject: "Payment request",
      body: message,
      customerId,
    })
  }
  if ((channel === "sms" || channel === "both") && phone) {
    await sendOutboundSms(sb, { userId, to: phone, body: message, customerId })
  }
  const sentVia = channel
  const { data: updated } = await sb
    .from("payment_requests")
    .update({ status: "sent", sent_via: sentVia })
    .eq("id", paymentRequestId)
    .select("*")
    .single()
  try {
    await sb.from("customer_payment_events").insert({
      user_id: userId,
      customer_id: customerId,
      quote_id: (pr as { quote_id?: string }).quote_id ?? null,
      calendar_event_id: (pr as { calendar_event_id?: string }).calendar_event_id ?? null,
      event_type: "payment_link_sent",
      amount,
      currency: "USD",
      status: "sent",
      metadata: { payment_request_id: paymentRequestId, sent_via: sentVia, delivery: "outbound_api" },
    })
  } catch {
    /* optional table */
  }
  res.status(200).json({ ok: true, paymentRequest: updated })
}

async function handleProviderStatus(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Json
  const { sb, userId } = await resolveSupabase(req, body)
  const providers: PaymentProviderId[] = ["helcim", "square", "manual"]
  const status: Record<string, { connected: boolean; accountLabel?: string | null }> = {}
  for (const p of providers) {
    const { data } = await sb
      .from("payment_provider_credentials")
      .select("account_label, secret_payload")
      .eq("user_id", userId)
      .eq("provider", p)
      .maybeSingle()
    const creds = parseProviderCredentialsFromDb(p, data)
    const connected =
      p === "manual"
        ? Boolean(creds?.manualPaymentUrlTemplate)
        : p === "helcim"
          ? Boolean(creds?.helcimApiToken || firstEnv("HELCIM_API_TOKEN"))
          : Boolean(creds?.squareAccessToken && creds?.squareLocationId)
    status[p] = { connected, accountLabel: data?.account_label ?? null }
  }
  const profileCtx = await loadProfilePaymentContext(sb, userId)
  res.status(200).json({
    ok: true,
    providers: status,
    defaultProvider: profileCtx.defaultProvider,
    autoReceiptOnPaid: profileCtx.autoReceipt,
    hostedPayPortalConfigured: Boolean(profileCtx.customerPayLink),
  })
}

async function handleSaveCredentials(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Json
  const { sb, userId } = await resolveSupabase(req, body)
  const provider = String(body.provider ?? "").trim() as PaymentProviderId
  if (!provider || !["helcim", "square", "manual"].includes(provider)) {
    res.status(400).json({ error: "Invalid provider." })
    return
  }
  const fields = (body.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, string>
  const accountLabel = String(body.accountLabel ?? "").trim() || null
  const secret_payload = buildSecretPayloadForSave(provider, fields)
  const { error } = await sb.from("payment_provider_credentials").upsert(
    {
      user_id: userId,
      provider,
      account_label: accountLabel,
      secret_payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  )
  if (error) {
    if (/payment_provider_credentials|does not exist/i.test(error.message ?? "")) {
      res.status(503).json({ error: "Run supabase/payment-requests.sql in Supabase." })
      return
    }
    res.status(500).json({ error: error.message })
    return
  }
  const defaultProvider = String(body.defaultProvider ?? "").trim()
  const profileCtx = await loadProfilePaymentContext(sb, userId)
  const nextMeta = { ...profileCtx.metadata }
  let metaDirty = false
  if (defaultProvider === "helcim" || defaultProvider === "square" || defaultProvider === "manual") {
    nextMeta.payment_default_provider = defaultProvider
    metaDirty = true
  }
  if (body.autoReceiptOnPaid === true) {
    nextMeta.payment_auto_receipt_on_paid = true
    metaDirty = true
  }
  if (body.autoReceiptOnPaid === false) {
    nextMeta.payment_auto_receipt_on_paid = false
    metaDirty = true
  }
  const customerPayLinkUrl = typeof body.customerPayLinkUrl === "string" ? body.customerPayLinkUrl.trim() : ""
  if (body.customerPayLinkUrl !== undefined) {
    if (customerPayLinkUrl) nextMeta.customer_pay_link_url = customerPayLinkUrl
    else delete nextMeta.customer_pay_link_url
    metaDirty = true
  }
  if (metaDirty) {
    await sb.from("profiles").update({ metadata: nextMeta }).eq("id", userId)
  }
  res.status(200).json({ ok: true })
}

async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  const sb = createServiceSupabase()
  const body = (req.body ?? {}) as Json
  const providerRef =
    String(body.invoiceId ?? body.invoice_id ?? body.transactionId ?? body.id ?? body.reference ?? "").trim() ||
    String((body.data as Json | undefined)?.id ?? "").trim()
  const statusRaw = String(body.status ?? body.paymentStatus ?? (body.data as Json | undefined)?.status ?? "").toLowerCase()
  const paid = /paid|approved|captured|success|completed/.test(statusRaw)
  if (!providerRef) {
    res.status(200).json({ ok: true, ignored: true })
    return
  }
  const { data: pr } = await sb
    .from("payment_requests")
    .select("*, customers(display_name)")
    .eq("provider_reference_id", providerRef)
    .maybeSingle()
  if (!pr) {
    res.status(200).json({ ok: true, unmatched: true })
    return
  }
  if (!paid) {
    await sb.from("payment_requests").update({ status: "failed" }).eq("id", (pr as { id: string }).id)
    res.status(200).json({ ok: true })
    return
  }
  const paidAt = new Date().toISOString()
  await sb
    .from("payment_requests")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", (pr as { id: string }).id)
  const userId = String((pr as { user_id: string }).user_id)
  const profileCtx = await loadProfilePaymentContext(sb, userId)
  const customerId = String((pr as { customer_id: string }).customer_id)
  const customerName = (pr as { customers?: { display_name?: string } }).customers?.display_name ?? "Customer"
  const amount = Number((pr as { amount: number }).amount)
  const description = String((pr as { description?: string }).description ?? "Payment")
  try {
    await sb.from("customer_payment_events").insert({
      user_id: userId,
      customer_id: customerId,
      quote_id: (pr as { quote_id?: string }).quote_id ?? null,
      calendar_event_id: (pr as { calendar_event_id?: string }).calendar_event_id ?? null,
      event_type: "payment_recorded",
      amount,
      currency: "USD",
      status: "paid",
      metadata: { payment_request_id: (pr as { id: string }).id, source: "provider_webhook" },
    })
  } catch {
    /* optional */
  }
  // A completed one-time payment closes the "customer payment" workflow step and
  // advances the customer. Payment-plan / installment links opt out (partial payments).
  const prMeta = (pr as { metadata?: Record<string, unknown> | null }).metadata ?? {}
  const isPaymentPlan = prMeta?.payment_plan === true || prMeta?.is_installment === true
  if (!isPaymentPlan) {
    await autoAdvanceCustomerWorkflowServer(sb, userId, customerId, "payment_received")
  }
  if (profileCtx.autoReceipt) {
    const { data: prof } = await sb.from("profiles").select("display_name, metadata").eq("id", userId).maybeSingle()
    const businessName =
      typeof prof?.display_name === "string" && prof.display_name.trim() ? prof.display_name.trim() : "Your contractor"
    const pdfBytes = await buildSimpleReceiptPdf({
      businessName,
      customerName,
      amount,
      description,
      paidAt,
    })
    const { data: idents } = await sb
      .from("customer_identifiers")
      .select("type, value")
      .eq("customer_id", customerId)
      .eq("user_id", userId)
    const email = (idents ?? []).find((i: { type: string }) => i.type === "email")?.value?.trim() ?? ""
    if (email) {
      await sendOutboundEmail(sb, {
        userId,
        to: email,
        subject: `Receipt — $${amount.toFixed(2)}`,
        body: `Thank you for your payment of $${amount.toFixed(2)}.\n\n${description}\n\nReceipt attached.`,
        customerId,
        attachments: [
          {
            filename: "payment-receipt.pdf",
            content: Buffer.from(pdfBytes).toString("base64"),
          },
        ],
      })
    }
  }
  res.status(200).json({ ok: true, paid: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }
  const action = String(req.query.__action ?? req.query.action ?? "create-link").trim()
  try {
    if (action === "create-link") {
      await handleCreateLink(req, res)
      return
    }
    if (action === "send") {
      await handleSend(req, res)
      return
    }
    if (action === "provider-status") {
      await handleProviderStatus(req, res)
      return
    }
    if (action === "save-credentials") {
      await handleSaveCredentials(req, res)
      return
    }
    if (action === "webhook") {
      await handleWebhook(req, res)
      return
    }
    res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    res.status(paymentApiErrorStatus(message)).json({ error: message })
  }
}