import type { SupabaseClient } from "@supabase/supabase-js"
import type { CustomerPaymentProfileMetadata } from "./customerPaymentMetadata"

export type CustomerPaymentEventType =
  | "payment_link_sent"
  | "payment_barcode_sent"
  | "payment_recorded"
  | "payment_receipt_reviewed"

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
}): Promise<{ ok: boolean; error?: string }> {
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
  return { ok: true }
}
