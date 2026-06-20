import type { SupabaseClient } from "@supabase/supabase-js"
import { evaluateAndPersistCustomerFit, evaluateAndPersistLeadFit } from "./_leadFitClassification.js"

const SANDBOX_CITY = "Tradesman Demo"
const SANDBOX_STATE = "TX"
const SANDBOX_ZIP = "99901"

export type SandboxCustomerReplyContext = {
  outboundBody: string
  customerName?: string | null
  leadDescription?: string | null
  leadTitle?: string | null
  serviceAddress?: string | null
  captureChannel?: string | null
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

  if (cust) {
    const meta =
      cust.metadata && typeof cust.metadata === "object" && !Array.isArray(cust.metadata)
        ? { ...(cust.metadata as Record<string, unknown>) }
        : {}
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
    patch.notes = prevNotes ? `${prevNotes}\n\n${noteLine}` : noteLine
    await supabase.from("customers").update(patch).eq("id", customerId).eq("user_id", userId)
  }

  if (leadId) {
    const { data: lead } = await supabase.from("leads").select("description, title").eq("id", leadId).maybeSingle()
    const prevDesc = (lead?.description ?? "").trim()
    const mergedDesc = prevDesc && !prevDesc.includes(body.slice(0, 80)) ? `${prevDesc}\n\n${body}` : body || prevDesc
    await supabase
      .from("leads")
      .update({
        description: mergedDesc.slice(0, 8000),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", leadId)

    await evaluateAndPersistLeadFit(supabase, leadId, { supplementalText: body, force: true }).catch((e) =>
      console.warn("[sandbox-customer-sim] lead fit", e instanceof Error ? e.message : e),
    )
  }

  await evaluateAndPersistCustomerFit(supabase, customerId, { force: true }).catch((e) =>
    console.warn("[sandbox-customer-sim] customer fit", e instanceof Error ? e.message : e),
  )
}
