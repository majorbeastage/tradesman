// Charge enrolled Autopay clients on/after their billing due date via Helcim Payment API (card token).
// Deploy: supabase functions deploy billing-autopay --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HELCIM_API_TOKEN,
//   BILLING_AUTOPAY_CRON_SECRET or NOTIFY_CRON_SECRET
// Schedule daily (see supabase/billing-autopay-cron.sql). Header: x-cron-secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

const MONTHLY_USD: Record<string, number> = {
  office_manager: 149.99,
  estimate_tools_only: 49.99,
  basic_package: 89.99,
  om_entry: 149.99,
  om_pro: 199.99,
  om_elite: 369.99,
  corporate: 599.99,
  additional_external_user: 49.99,
  additional_office_manager: 59.99,
  additional_internal_user: 29.99,
  managed_ads: 99,
}

const MAX_CHARGES_PER_RUN = 40

function todayYmdEastern(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

function addCalendarMonthsYmd(dueDate: string | undefined, months: number, preferDay?: number): string | undefined {
  const t = (dueDate ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined
  const y0 = Number(t.slice(0, 4))
  const m0 = Number(t.slice(5, 7))
  const d0 = Number(t.slice(8, 10))
  const day = typeof preferDay === "number" && preferDay >= 1 && preferDay <= 31 ? preferDay : d0
  const idx = y0 * 12 + (m0 - 1) + months
  const y = Math.floor(idx / 12)
  const m = ((idx % 12) + 12) % 12 + 1
  const d = Math.min(day, daysInMonth(y, m))
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function subscriptionAmountUsd(meta: Record<string, unknown>): number {
  const custom = meta.billing_custom_charge_usd
  if (typeof custom === "number" && Number.isFinite(custom) && custom > 0) return Math.round(custom * 100) / 100
  let sum = 0
  const primary = typeof meta.billing_product_type === "string" ? meta.billing_product_type.trim() : ""
  if (primary && MONTHLY_USD[primary] != null) sum += MONTHLY_USD[primary]!
  if (Array.isArray(meta.billing_additional_products)) {
    for (const raw of meta.billing_additional_products) {
      const id = typeof raw === "string" ? raw.trim() : ""
      if (id && MONTHLY_USD[id] != null) sum += MONTHLY_USD[id]!
    }
  }
  return Math.round(sum * 100) / 100
}

function historyRows(prev: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(prev.billing_payment_history_v1)) return []
  return prev.billing_payment_history_v1.filter((row): row is Record<string, unknown> =>
    Boolean(row) && typeof row === "object" && !Array.isArray(row),
  )
}

function applyReceived(
  prev: Record<string, unknown>,
  patch: { at: string; amountUsd?: number; transactionId?: string; orderNumber?: string },
): Record<string, unknown> {
  const hist = historyRows(prev)
  const tx = (patch.transactionId ?? "").trim()
  if (tx && hist.some((row) => String(row.transactionId ?? "").trim() === tx && !String(row.revertedAt ?? "").trim())) {
    return prev
  }
  const dueRaw = typeof prev.billing_payment_due_date === "string" ? prev.billing_payment_due_date.trim() : ""
  const storedDay = typeof prev.billing_payment_due_day === "number" ? prev.billing_payment_due_day : NaN
  const preferDay =
    Number.isInteger(storedDay) && storedDay >= 1 && storedDay <= 31
      ? storedDay
      : dueRaw
        ? Number(dueRaw.slice(8, 10))
        : undefined
  const nextDue = addCalendarMonthsYmd(dueRaw || undefined, 1, preferDay)
  const next: Record<string, unknown> = { ...prev, billing_last_success_at: patch.at }
  if (nextDue) next.billing_payment_due_date = nextDue
  if (typeof preferDay === "number") next.billing_payment_due_day = preferDay
  const entry: Record<string, unknown> = { at: patch.at, note: "Helcim Autopay" }
  if (typeof patch.amountUsd === "number") entry.amountUsd = patch.amountUsd
  if (tx) entry.transactionId = tx
  if (patch.orderNumber?.trim()) entry.orderNumber = patch.orderNumber.trim()
  if (dueRaw) entry.dueDateBefore = dueRaw
  next.billing_payment_history_v1 = [entry, ...hist].slice(0, 100)
  return next
}

function nextOrderNumber(profileId: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
  const owner = profileId.replace(/[^a-z0-9]/gi, "").slice(0, 12)
  return `TMAP-${owner}-${stamp}`
}

async function idempotencyKey(profileId: string, due: string): Promise<string> {
  const data = new TextEncoder().encode(`tradesman-autopay:${profileId}:${due}`)
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data))
  hash[6] = (hash[6]! & 0x0f) | 0x50
  hash[8] = (hash[8]! & 0x3f) | 0x80
  const hex = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

async function notifyAdmins(
  admin: ReturnType<typeof createClient>,
  opts: { profileId: string; title: string; body: string },
): Promise<void> {
  try {
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin")
    const rows = (admins ?? [])
      .map((row: { id?: unknown }) => (typeof row.id === "string" ? row.id : ""))
      .filter(Boolean)
      .map((userId: string) => ({
        user_id: userId,
        kind: "billing_payment_problem",
        title: opts.title,
        body: opts.body,
        metadata: { page: "admin", adminPanel: "billing", profileId: opts.profileId },
      }))
    if (rows.length) await admin.from("user_notifications").insert(rows)
  } catch {
    /* best-effort */
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

  const cronSecret =
    Deno.env.get("BILLING_AUTOPAY_CRON_SECRET")?.trim() || Deno.env.get("NOTIFY_CRON_SECRET")?.trim() || ""
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: "Set BILLING_AUTOPAY_CRON_SECRET or NOTIFY_CRON_SECRET." }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (req.headers.get("x-cron-secret")?.trim() !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const apiToken = Deno.env.get("HELCIM_API_TOKEN")?.trim()
  if (!apiToken) {
    return new Response(JSON.stringify({ error: "HELCIM_API_TOKEN is not set." }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const today = todayYmdEastern()
  const nowIso = new Date().toISOString()

  const { data: profiles, error } = await admin.from("profiles").select("id, role, metadata").limit(8000)
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const results: Array<Record<string, unknown>> = []
  let charged = 0

  for (const row of profiles ?? []) {
    if (charged >= MAX_CHARGES_PER_RUN) break
    const profileId = typeof row.id === "string" ? row.id : ""
    if (!profileId) continue
    const role = typeof row.role === "string" ? row.role.trim() : ""
    if (role === "demo_user") continue
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    if (meta.billing_autopay_enabled !== true) continue
    if (meta.billing_automation_paused === true) continue
    const token = typeof meta.billing_autopay_card_token === "string" ? meta.billing_autopay_card_token.trim() : ""
    if (!token) continue
    const due = typeof meta.billing_payment_due_date === "string" ? meta.billing_payment_due_date.trim() : ""
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due > today) continue
    if (typeof meta.billing_autopay_last_charged_due === "string" && meta.billing_autopay_last_charged_due.trim() === due) {
      continue
    }
    const lastPaid = typeof meta.billing_last_success_at === "string" ? meta.billing_last_success_at.trim().slice(0, 10) : ""
    if (lastPaid && lastPaid >= due) continue

    const amount = subscriptionAmountUsd(meta)
    if (!(amount > 0)) continue

    const customerCode = typeof meta.billing_helcim_customer_code === "string" ? meta.billing_helcim_customer_code.trim() : ""
    const invoiceNumber = nextOrderNumber(profileId)
    const idem = await idempotencyKey(profileId, due)

    charged += 1
    meta.billing_autopay_last_attempt_at = nowIso

    const body: Record<string, unknown> = {
      ipAddress: "127.0.0.1",
      ecommerce: true,
      currency: "USD",
      amount,
      invoiceNumber,
      cardData: { cardToken: token },
    }
    if (customerCode) body.customerCode = customerCode

    const r = await fetch("https://api.helcim.com/v2/payment/purchase", {
      method: "POST",
      headers: {
        "api-token": apiToken,
        Accept: "application/json",
        "Content-Type": "application/json",
        "idempotency-key": idem,
      },
      body: JSON.stringify(body),
    })
    const txJson = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const status = typeof txJson.status === "string" ? txJson.status.toUpperCase() : ""
    const approved = r.ok && (status === "APPROVED" || status === "APPROVED (TEST)")
    const txnId = txJson.transactionId != null ? String(txJson.transactionId).trim() : ""

    if (!approved) {
      const errText =
        (Array.isArray(txJson.errors) && txJson.errors.length ? String(txJson.errors[0]) : "") ||
        (typeof txJson.message === "string" ? txJson.message : "") ||
        `Helcim Autopay not approved (${r.status})`
      meta.billing_autopay_last_error = errText.slice(0, 240)
      await admin.from("profiles").update({ metadata: meta, updated_at: nowIso }).eq("id", profileId)
      await notifyAdmins(admin, {
        profileId,
        title: "Autopay charge failed",
        body: `Autopay did not go through for this client (${errText.slice(0, 160)}). They were not locked out. Open Billing & Helcim.`,
      })
      results.push({ profileId, ok: false, error: errText })
      continue
    }

    const next = applyReceived(meta, {
      at: nowIso,
      amountUsd: amount,
      transactionId: txnId || undefined,
      orderNumber: invoiceNumber,
    })
    next.billing_autopay_last_charged_due = due
    delete next.billing_autopay_last_error
    if (role !== "admin" && role !== "office_manager") {
      await admin.from("profiles").update({ metadata: next, account_disabled: false, updated_at: nowIso }).eq("id", profileId)
    } else {
      await admin.from("profiles").update({ metadata: next, updated_at: nowIso }).eq("id", profileId)
    }
    results.push({ profileId, ok: true, amount, invoiceNumber, transactionId: txnId || undefined })
  }

  console.info("[billing-autopay]", { today, charged, results: results.length })
  return new Response(JSON.stringify({ ok: true, today, charged, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
