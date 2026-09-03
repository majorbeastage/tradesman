/**
 * Helcim.js `orderNumber` is the Helcim invoice number.
 * Reusing a number Helcim already marked PAID returns "Order Number Already Marked as Paid".
 */
export function nextHelcimJsOrderNumber(kind: "TM" | "TMAD" | "SU", ownerKey?: string | null): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
  const owner = (ownerKey ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 12)
  return owner ? `${kind}-${owner}-${stamp}` : `${kind}-${stamp}`
}
