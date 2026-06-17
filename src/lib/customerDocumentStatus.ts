/** User-facing estimate status labels for customer profile. */
export type EstimateDisplayStatus = "Created" | "Sent to customer" | "Approved by customer" | "Rejected"

export type ReceiptDisplayStatus = "Created" | "Sent"

export function estimateDisplayStatus(status: string | null | undefined, metadata?: unknown): EstimateDisplayStatus {
  const s = String(status ?? "").trim().toLowerCase()
  if (s === "accepted" || s === "approved") return "Approved by customer"
  if (s === "declined" || s === "rejected") return "Rejected"
  if (s === "sent" || s === "viewed") return "Sent to customer"

  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const o = metadata as Record<string, unknown>
    const cpw = o.customer_pay_workflow
    if (cpw && typeof cpw === "object" && !Array.isArray(cpw)) {
      const sent = (cpw as Record<string, unknown>).last_sent_at
      if (typeof sent === "string" && sent.trim()) return "Sent to customer"
    }
    const sentAt = o.estimate_sent_at ?? o.last_sent_at
    if (typeof sentAt === "string" && sentAt.trim()) return "Sent to customer"
    const approval = o.customer_approval ?? o.estimate_approval
    if (approval === "approved" || approval === "accepted") return "Approved by customer"
    if (approval === "rejected" || approval === "declined") return "Rejected"
  }

  return "Created"
}

export function receiptDisplayStatus(draft: { sent_at?: string | null; status?: string | null }): ReceiptDisplayStatus {
  const st = String(draft.status ?? "").trim().toLowerCase()
  if (st === "sent") return "Sent"
  if (typeof draft.sent_at === "string" && draft.sent_at.trim()) return "Sent"
  return "Created"
}

export function formatUsdAmount(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null
  return `$${amount.toFixed(2)}`
}
