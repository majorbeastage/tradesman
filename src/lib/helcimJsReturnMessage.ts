/** Payload posted back via hidden iframe from `/api/helcim-js-return` (rewrites to `platform-tools?__route=helcim-js-return`). */
export type HelcimJsReturnMessage = {
  source: "tradesman-helcim-js"
  response: number | null
  responseMessage: string
  noticeMessage: string
  transactionId: string
  type: string
  amount: string
  currency: string
  cardType: string
  cardExpiry: string
  cardNumberMasked: string
  cardToken: string
  approvalCode: string
  orderNumber: string
  customerCode: string
  date: string
  time: string
}

export function isHelcimJsReturnMessage(data: unknown): data is HelcimJsReturnMessage {
  if (!data || typeof data !== "object") return false
  const o = data as Record<string, unknown>
  return o.source === "tradesman-helcim-js"
}
