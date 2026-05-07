import type { SupabaseClient } from "@supabase/supabase-js"
import type { CustomerPaymentProfileMetadata } from "./customerPaymentMetadata"

import { mergeQuoteWorkflowAfterSent, mergeQuoteWorkflowMarked } from "./quoteCustomerPayWorkflow"

export type CustomerPaymentEventType =
  | "payment_link_sent"
  | "payment_barcode_sent"
  | "payment_recorded"
  | "payment_receipt_reviewed"
  | "payment_marked_collected"

export function buildCustomerPaymentShareBody(input: {
  customerName?: string | null
  estimateLabel?: string | null
  amountLabel?: string | null
  payLink: string
  barcodeLink?: string | null
  includeBarcode: boolean
  instructions?: string | null
}): string {
  const who = input.customerName?.trim() ? `Hi ${input.customerName?.trim()},` : "Hello,"
  const lines = [who, ""]
  if (input.estimateLabel?.trim()) lines.push(`Estimate: ${input.estimateLabel.trim()}`)
  if (input.amountLabel?.trim()) lines.push(`Amount due: ${input.amountLabel.trim()}`)
  lines.push(`Secure payment link: ${input.payLink}`)
  if (input.includeBarcode && input.barcodeLink?.trim()) lines.push(`Barcode / QR option: ${input.barcodeLink.trim()}`)
  if (input.instructions?.trim()) {
    lines.push("")
    lines.push(`Notes: ${input.instructions.trim()}`)
  }
  return lines.join("\n")
}

export async function logCustomerPaymentEvent(
  supabase: SupabaseClient | null,
  event: {
    userId: string
    customerId?: string | null
    quoteId?: string | null
    calendarEventId?: string | null
    eventType: CustomerPaymentEventType
    amount?: number | null
    currency?: string | null
    status?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  if (!supabase) return
  const payload = {
    user_id: event.userId,
    customer_id: event.customerId ?? null,
    quote_id: event.quoteId ?? null,
    calendar_event_id: event.calendarEventId ?? null,
    event_type: event.eventType,
    amount: event.amount ?? null,
    currency: event.currency ?? "USD",
    status: event.status ?? "logged",
    metadata: event.metadata ?? {},
  }
  try {
    const { error } = await supabase.from("customer_payment_events").insert(payload)
    if (error) {
      // Table may not exist yet in some environments; fail soft for UX.
      if (/customer_payment_events|does not exist|relation/i.test(error.message ?? "")) return
      throw error
    }
  } catch {
    // Non-fatal. Sending / share action should continue even if logging backend is not ready.
  }
}

function parseAmountFromLabel(amountLabel: string | null | undefined): number | null {
  if (!amountLabel?.trim()) return null
  const n = Number.parseFloat(amountLabel.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

/** Copy payment request text to clipboard and log customer_payment_events (same behavior everywhere). */
export async function copyCustomerPaymentShareAndLog(input: {
  supabase: SupabaseClient | null
  userId: string
  customerId: string | null
  quoteId?: string | null
  calendarEventId?: string | null
  profile: CustomerPaymentProfileMetadata
  customerName: string | null
  estimateLabel: string | null
  amountLabel: string | null
  includeBarcodeInMessage: boolean
}): Promise<{ ok: boolean; error?: string; patchedQuoteMetadata?: Record<string, unknown> }> {
  const payLink = input.profile.customer_pay_link_url?.trim() ?? ""
  const barcodeLink = input.profile.customer_pay_barcode_url?.trim() ?? ""
  if (!payLink && !barcodeLink) {
    return {
      ok: false,
      error:
        "No payment URL on file. Open Payments → Send Payment Information to Customer and save your hosted pay link or barcode link.",
    }
  }
  const primaryPayUrl = payLink || barcodeLink
  const body = buildCustomerPaymentShareBody({
    customerName: input.customerName,
    estimateLabel: input.estimateLabel,
    amountLabel: input.amountLabel,
    payLink: primaryPayUrl,
    barcodeLink: barcodeLink || undefined,
    includeBarcode: input.includeBarcodeInMessage && Boolean(barcodeLink),
    instructions: input.profile.customer_pay_instructions ?? null,
  })
  try {
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(body)
    } else {
      return { ok: false, error: "Clipboard is not available in this browser." }
    }
  } catch {
    return { ok: false, error: "Could not copy to clipboard." }
  }
  const amt = parseAmountFromLabel(input.amountLabel)
  const eventType: CustomerPaymentEventType = payLink ? "payment_link_sent" : "payment_barcode_sent"
  await logCustomerPaymentEvent(input.supabase, {
    userId: input.userId,
    customerId: input.customerId,
    quoteId: input.quoteId ?? null,
    calendarEventId: input.calendarEventId ?? null,
    eventType,
    amount: amt,
    metadata: {
      delivery: "clipboard",
      include_barcode_line: input.includeBarcodeInMessage,
      provider: input.profile.customer_pay_provider ?? "helcim",
    },
  })
  const patched = await persistQuoteCustomerPayWorkflowAfterSent(input.supabase, {
    quoteId: input.quoteId ?? null,
    userId: input.userId,
    amountLabel: input.amountLabel,
  })
  return patched ? { ok: true, patchedQuoteMetadata: patched } : { ok: true }
}

async function persistQuoteCustomerPayWorkflowAfterSent(
  supabase: SupabaseClient | null,
  opts: { quoteId: string | null; userId: string; amountLabel: string | null },
): Promise<Record<string, unknown> | null> {
  const quoteId = opts.quoteId?.trim() ?? ""
  if (!supabase || !quoteId) return null
  const iso = new Date().toISOString()
  try {
    const { data: row, error: fe } = await supabase.from("quotes").select("metadata,user_id").eq("id", quoteId).maybeSingle()
    if (fe || !row || String((row as { user_id?: string }).user_id ?? "") !== opts.userId) return null
    const prevMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    const nextMeta = mergeQuoteWorkflowAfterSent(prevMeta, iso, opts.amountLabel)
    const { error: ue } = await supabase.from("quotes").update({ metadata: nextMeta, updated_at: iso }).eq("id", quoteId)
    if (ue) return null
    return nextMeta
  } catch {
    /* non-fatal */
  }
  return null
}

/** Manual deposit / waived — updates quote workflow and logs customer_payment_events. */
export async function markQuoteCustomerPaymentCollected(input: {
  supabase: SupabaseClient | null
  quoteId: string
  userId: string
  customerId: string | null
  calendarEventId?: string | null
  kind: "paid" | "waived"
  amountLabel?: string | null
  note?: string | null
}): Promise<{ ok: boolean; metadata?: Record<string, unknown>; error?: string }> {
  const quoteId = input.quoteId.trim()
  if (!input.supabase || !quoteId) return { ok: false, error: "Missing quote or database." }
  const iso = new Date().toISOString()
  try {
    const { data: row, error: fe } = await input.supabase.from("quotes").select("metadata,user_id").eq("id", quoteId).maybeSingle()
    if (fe) return { ok: false, error: fe.message }
    if (!row || String((row as { user_id?: string }).user_id ?? "") !== input.userId) {
      return { ok: false, error: "Quote not found or access denied." }
    }
    const prevMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    const nextMeta = mergeQuoteWorkflowMarked(prevMeta, input.kind, iso, input.note ?? null)
    const { error: ue } = await input.supabase.from("quotes").update({ metadata: nextMeta, updated_at: iso }).eq("id", quoteId)
    if (ue) return { ok: false, error: ue.message }
    const amt = parseAmountFromLabel(input.amountLabel)
    await logCustomerPaymentEvent(input.supabase, {
      userId: input.userId,
      customerId: input.customerId,
      quoteId,
      calendarEventId: input.calendarEventId ?? null,
      eventType: "payment_marked_collected",
      amount: amt,
      metadata: { manual_kind: input.kind },
    })
    return { ok: true, metadata: nextMeta }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." }
  }
}
