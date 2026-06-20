import type { SupabaseClient } from "@supabase/supabase-js"
import { evaluateAndPersistCustomerFit, evaluateAndPersistLeadFit } from "./_leadFitClassification.js"

const SANDBOX_CITY = "Tradesman Demo"
const SANDBOX_STATE = "TX"
const SANDBOX_ZIP = "99901"

/** Minimum gap between simulated customer SMS replies for the same customer. */
const SANDBOX_SIM_COOLDOWN_MS = 120_000
/** Max simulated customer replies per customer per rolling hour. */
const SANDBOX_SIM_MAX_PER_WINDOW = 4
const SANDBOX_SIM_WINDOW_MS = 60 * 60 * 1000

const SANDBOX_SIM_META_KEY = "sandbox_customer_sim_v1"

type SandboxSimState = {
  last_at?: string
  window_start?: string
  count_in_window?: number
}

function parseCustomerMetadata(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
}

function parseSandboxSimState(meta: Record<string, unknown>): SandboxSimState {
  const raw = meta[SANDBOX_SIM_META_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as SandboxSimState
}

/** Prevent ping-pong: auto-reply → simulated customer → another outbound → same reply again. */
export async function shouldAllowSandboxCustomerReply(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  opts?: { isAutoReplyOutbound?: boolean },
): Promise<boolean> {
  const { data: cust } = await supabase
    .from("customers")
    .select("metadata")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  const meta = parseCustomerMetadata(cust?.metadata)
  const state = parseSandboxSimState(meta)
  const now = Date.now()
  const lastAt = state.last_at ? Date.parse(state.last_at) : 0

  if (opts?.isAutoReplyOutbound && typeof meta.sandbox_last_inbound_sms === "string" && meta.sandbox_last_inbound_sms.trim()) {
    if (lastAt && now - lastAt < SANDBOX_SIM_COOLDOWN_MS) return false
  }
  if (lastAt && now - lastAt < SANDBOX_SIM_COOLDOWN_MS) return false

  let windowStart = state.window_start ? Date.parse(state.window_start) : 0
  let count = state.count_in_window ?? 0
  if (!windowStart || now - windowStart > SANDBOX_SIM_WINDOW_MS) {
    windowStart = now
    count = 0
  }
  return count < SANDBOX_SIM_MAX_PER_WINDOW
}

export async function recordSandboxCustomerReply(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<void> {
  const { data: cust } = await supabase
    .from("customers")
    .select("metadata")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  const meta = parseCustomerMetadata(cust?.metadata)
  const state = parseSandboxSimState(meta)
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  let windowStart = state.window_start ? Date.parse(state.window_start) : 0
  let count = state.count_in_window ?? 0
  if (!windowStart || now - windowStart > SANDBOX_SIM_WINDOW_MS) {
    windowStart = now
    count = 0
  }
  await supabase
    .from("customers")
    .update({
      metadata: {
        ...meta,
        [SANDBOX_SIM_META_KEY]: {
          last_at: nowIso,
          window_start: new Date(windowStart).toISOString(),
          count_in_window: count + 1,
        },
      },
    })
    .eq("id", customerId)
    .eq("user_id", userId)
}

export type SandboxCustomerReplyContext = {
  outboundBody: string
  customerName?: string | null
  leadDescription?: string | null
  leadTitle?: string | null
  serviceAddress?: string | null
  captureChannel?: string | null
  /** When true, avoid repeating the full address block (training loop guard). */
  recentInboundHadAddress?: boolean
}

/** Realistic training reply — job details + service address so lead qualification can proceed. */
export function buildSandboxCustomerSmsReply(ctx: SandboxCustomerReplyContext): string {
  const first = (ctx.customerName ?? "Customer").trim().split(/\s+/)[0] || "Customer"
  const job =
    (ctx.leadDescription ?? ctx.leadTitle ?? "").trim() ||
    "help with a plumbing issue at our home"
  const addr =
    (ctx.serviceAddress ?? "").trim() ||
    `124 Oak Lane, ${SANDBOX_CITY}, ${SANDBOX_STATE} ${SANDBOX_ZIP}`

  const asksForDetails = /summary|service area|what work|how we can help|few words|describe|details/i.test(
    ctx.outboundBody,
  )
  const missedCall = /missed your call|sorry we missed|call you back/i.test(ctx.outboundBody)

  if (missedCall || asksForDetails) {
    return (
      `Hi! This is ${first}. Sorry we missed each other — ${job.replace(/\.$/, "")}. ` +
      `The property is at ${addr}. We're flexible on timing and would like an estimate when you can.`
    ).slice(0, 480)
  }

  if (/estimate|schedule|appointment|opening/i.test(ctx.outboundBody)) {
    return (
      `${first} here — yes, an estimate works for us. ${job.replace(/\.$/, "")}. Address: ${addr}. ` +
      `Mornings are best but we can do afternoons too.`
    ).slice(0, 480)
  }

  if (ctx.recentInboundHadAddress) {
    return `${first} here — got it, thanks. We already sent the address and job details. Let us know if you need anything else.`.slice(
      0,
      480,
    )
  }

  return (
    `${first} here — thanks for the quick reply. ${job.replace(/\.$/, "")} at ${addr}. ` +
    `Let me know what you need from us to move forward.`
  ).slice(0, 480)
}

function extractAddressFromText(text: string): string | null {
  const m = text.match(
    /\b(\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4},\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)\b/,
  )
  return m?.[1]?.trim() ?? null
}

/** After a simulated inbound SMS, enrich lead/customer records and run lead-fit AI. */
export async function enrichSandboxFromSimulatedInbound(
  supabase: SupabaseClient,
  opts: {
    userId: string
    customerId: string
    leadId?: string | null
    inboundBody: string
  },
): Promise<void> {
  const { userId, customerId, leadId, inboundBody } = opts
  const body = inboundBody.trim()
  if (!body) return

  const parsedAddr = extractAddressFromText(body)

  const { data: cust } = await supabase
    .from("customers")
    .select("display_name, service_address, metadata, notes")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()

  const meta = parseCustomerMetadata(cust?.metadata)
  const hadAddressBefore = Boolean(
    (cust?.service_address as string | null | undefined)?.trim() ||
      (typeof meta.service_address === "string" && meta.service_address.trim()),
  )

  if (cust) {
    const patch: Record<string, unknown> = {
      last_activity_at: new Date().toISOString(),
      metadata: {
        ...meta,
        sandbox_last_inbound_sms: body.slice(0, 2000),
        sandbox_inbound_at: new Date().toISOString(),
      },
    }
    if (parsedAddr) patch.service_address = parsedAddr
    else if (!cust.service_address?.trim() && typeof meta.service_address === "string") {
      patch.service_address = meta.service_address
    }
    const noteLine = `[Sandbox SMS ${new Date().toLocaleDateString()}] ${body.slice(0, 500)}`
    const prevNotes = typeof cust.notes === "string" ? cust.notes.trim() : ""
    if (!prevNotes.includes(body.slice(0, 80))) {
      patch.notes = prevNotes ? `${prevNotes}\n\n${noteLine}` : noteLine
    }
    await supabase.from("customers").update(patch).eq("id", customerId).eq("user_id", userId)
  }

  const addressNewlyCaptured = Boolean(parsedAddr && !hadAddressBefore)

  if (leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("description, title, fit_evaluated_at")
      .eq("id", leadId)
      .maybeSingle()
    const prevDesc = (lead?.description ?? "").trim()
    const mergedDesc = prevDesc && !prevDesc.includes(body.slice(0, 80)) ? `${prevDesc}\n\n${body}` : body || prevDesc
    await supabase
      .from("leads")
      .update({
        description: mergedDesc.slice(0, 8000),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", leadId)

    const leadNeedsFit = !lead?.fit_evaluated_at || addressNewlyCaptured
    if (leadNeedsFit) {
      await evaluateAndPersistLeadFit(supabase, leadId, {
        supplementalText: addressNewlyCaptured ? body : undefined,
      }).catch((e) => console.warn("[sandbox-customer-sim] lead fit", e instanceof Error ? e.message : e))
    }
  }

  const { data: custFitRow } = await supabase
    .from("customers")
    .select("fit_evaluated_at")
    .eq("id", customerId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!(custFitRow as { fit_evaluated_at?: string | null } | null)?.fit_evaluated_at) {
    await evaluateAndPersistCustomerFit(supabase, customerId).catch((e) =>
      console.warn("[sandbox-customer-sim] customer fit", e instanceof Error ? e.message : e),
    )
  }
}
