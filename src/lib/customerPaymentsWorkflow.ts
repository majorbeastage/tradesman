import type { SupabaseClient } from "@supabase/supabase-js"

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
