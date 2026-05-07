/** Tracks customer payment outreach on a quote via `quotes.metadata.customer_pay_workflow`. */

export type QuoteCustomerPayWorkflowStatus = "none" | "sent" | "paid" | "waived"

export type QuoteCustomerPayWorkflow = {
  status: QuoteCustomerPayWorkflowStatus
  last_sent_at?: string
  last_sent_amount_label?: string | null
  marked_at?: string
  marked_note?: string | null
}

const KEY = "customer_pay_workflow"

export function parseQuoteCustomerPayWorkflow(meta: unknown): QuoteCustomerPayWorkflow {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { status: "none" }
  }
  const raw = (meta as Record<string, unknown>)[KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "none" }
  }
  const o = raw as Record<string, unknown>
  const st = o.status
  const status: QuoteCustomerPayWorkflowStatus =
    st === "sent" || st === "paid" || st === "waived" || st === "none" ? st : "none"
  return {
    status,
    last_sent_at: typeof o.last_sent_at === "string" ? o.last_sent_at : undefined,
    last_sent_amount_label: typeof o.last_sent_amount_label === "string" ? o.last_sent_amount_label : null,
    marked_at: typeof o.marked_at === "string" ? o.marked_at : undefined,
    marked_note: typeof o.marked_note === "string" ? o.marked_note : null,
  }
}

function cloneMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return { ...meta }
}

/** After clipboard send: move to `sent` unless already terminal (paid/waived). */
export function mergeQuoteWorkflowAfterSent(
  meta: Record<string, unknown>,
  iso: string,
  amountLabel: string | null,
): Record<string, unknown> {
  const next = cloneMeta(meta)
  const prev = parseQuoteCustomerPayWorkflow(next)
  if (prev.status === "paid" || prev.status === "waived") {
    return next
  }
  const block: QuoteCustomerPayWorkflow = {
    status: "sent",
    last_sent_at: iso,
    last_sent_amount_label: (amountLabel?.trim() || prev.last_sent_amount_label) ?? null,
    marked_at: prev.marked_at,
    marked_note: prev.marked_note ?? null,
  }
  next[KEY] = { ...block }
  return next
}

/** Manual bookkeeping: deposit collected elsewhere or waived. */
export function mergeQuoteWorkflowMarked(
  meta: Record<string, unknown>,
  kind: "paid" | "waived",
  iso: string,
  note?: string | null,
): Record<string, unknown> {
  const next = cloneMeta(meta)
  const prev = parseQuoteCustomerPayWorkflow(next)
  next[KEY] = {
    status: kind,
    last_sent_at: prev.last_sent_at,
    last_sent_amount_label: prev.last_sent_amount_label ?? null,
    marked_at: iso,
    marked_note: note?.trim() || prev.marked_note || null,
  }
  return next
}

export function customerPayWorkflowLabel(w: QuoteCustomerPayWorkflow): string {
  switch (w.status) {
    case "paid":
      return "Paid (manual)"
    case "waived":
      return "Waived / offline"
    case "sent":
      return "Payment link sent"
    default:
      return "Payment not logged"
  }
}

export function customerPayWorkflowAgingBadge(w: QuoteCustomerPayWorkflow): string | null {
  if (w.status !== "sent" || !w.last_sent_at) return null
  const t = Date.parse(w.last_sent_at)
  if (!Number.isFinite(t)) return null
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days >= 30) return `${days} days open`
  return null
}
