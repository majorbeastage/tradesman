/** Customer-facing collections (their clients paying them) stored on `profiles.metadata`. */

import { normalizeHelcimPayPortalUrl } from "./billingProfileMetadata"

export type CustomerPaymentProfileMetadata = {
  /** Processor currently configured by contractor (Helcim first; more coming). */
  customer_pay_provider?: "helcim" | "stripe" | "square" | "other"
  /** Free text account label from contractor (merchant/account nickname). */
  customer_pay_provider_account_label?: string
  /** Setup state for customer-facing collections. */
  customer_pay_setup_status?: "not_started" | "onboarding" | "ready"
  /** Hosted pay page / invoice link the business shares with homeowners or GCs (Helcim, Stripe, Square, etc.). */
  customer_pay_link_url?: string
  /** Optional barcode / QR destination (if provider generates one). */
  customer_pay_barcode_url?: string
  /** Which share methods are enabled in the workflow tools. */
  customer_pay_send_link_enabled?: boolean
  customer_pay_send_barcode_enabled?: boolean
  /** Prevent accidental sends before estimate/receipt review. */
  customer_pay_require_review_before_send?: boolean
  /** Short note pasted into estimates, texts, or emails (deposit terms, ACH instructions pointer, etc.). */
  customer_pay_instructions?: string
}

export function parseCustomerPaymentMetadata(meta: Record<string, unknown>): CustomerPaymentProfileMetadata {
  const out: CustomerPaymentProfileMetadata = {}
  if (typeof meta.customer_pay_link_url === "string" && meta.customer_pay_link_url.trim()) {
    out.customer_pay_link_url = meta.customer_pay_link_url.trim()
  }
  if (typeof meta.customer_pay_barcode_url === "string" && meta.customer_pay_barcode_url.trim()) {
    out.customer_pay_barcode_url = meta.customer_pay_barcode_url.trim()
  }
  if (meta.customer_pay_send_link_enabled === true) out.customer_pay_send_link_enabled = true
  if (meta.customer_pay_send_barcode_enabled === true) out.customer_pay_send_barcode_enabled = true
  if (meta.customer_pay_require_review_before_send === false) out.customer_pay_require_review_before_send = false
  else out.customer_pay_require_review_before_send = true
  if (typeof meta.customer_pay_provider === "string" && meta.customer_pay_provider.trim()) {
    const p = meta.customer_pay_provider.trim().toLowerCase()
    if (p === "helcim" || p === "stripe" || p === "square" || p === "other") out.customer_pay_provider = p
  }
  if (typeof meta.customer_pay_provider_account_label === "string" && meta.customer_pay_provider_account_label.trim()) {
    out.customer_pay_provider_account_label = meta.customer_pay_provider_account_label.trim()
  }
  if (typeof meta.customer_pay_setup_status === "string") {
    const s = meta.customer_pay_setup_status.trim().toLowerCase()
    if (s === "not_started" || s === "onboarding" || s === "ready") out.customer_pay_setup_status = s
  }
  if (typeof meta.customer_pay_instructions === "string" && meta.customer_pay_instructions.trim()) {
    out.customer_pay_instructions = meta.customer_pay_instructions.trim()
  }
  return out
}

/**
 * Persist customer-collection fields into profile JSON. Empty strings remove keys.
 * Returns validation error message when link is non-empty but not URL-normalizable.
 */
export function applyCustomerPaymentFieldsToProfileMetadata(
  prev: Record<string, unknown>,
  linkUrlRaw: string,
  instructionsRaw: string,
): { metadata: Record<string, unknown>; error?: string } {
  const next: Record<string, unknown> = { ...prev }
  const trimmedLink = linkUrlRaw.trim()
  const trimmedInst = instructionsRaw.trim()
  if (trimmedLink) {
    const normalized = normalizeHelcimPayPortalUrl(trimmedLink)
    if (!normalized) {
      return {
        metadata: prev,
        error:
          "That link doesn't look valid. Paste a full address starting with https:// (we will add https:// when the domain is pasted alone).",
      }
    }
    next.customer_pay_link_url = normalized
  } else {
    delete next.customer_pay_link_url
  }
  if (trimmedInst) next.customer_pay_instructions = trimmedInst
  else delete next.customer_pay_instructions
  return { metadata: next }
}

export function applyCustomerPaymentSettingsToProfileMetadata(
  prev: Record<string, unknown>,
  input: {
    provider: "helcim" | "stripe" | "square" | "other"
    providerAccountLabel: string
    setupStatus: "not_started" | "onboarding" | "ready"
    linkUrlRaw: string
    barcodeUrlRaw: string
    sendLinkEnabled: boolean
    sendBarcodeEnabled: boolean
    requireReviewBeforeSend: boolean
    instructionsRaw: string
  },
): { metadata: Record<string, unknown>; error?: string } {
  const base = applyCustomerPaymentFieldsToProfileMetadata(prev, input.linkUrlRaw, input.instructionsRaw)
  if (base.error) return base
  const next: Record<string, unknown> = { ...base.metadata }
  next.customer_pay_provider = input.provider
  next.customer_pay_setup_status = input.setupStatus
  const account = input.providerAccountLabel.trim()
  if (account) next.customer_pay_provider_account_label = account
  else delete next.customer_pay_provider_account_label
  const barcode = input.barcodeUrlRaw.trim()
  if (barcode) {
    const normalized = normalizeHelcimPayPortalUrl(barcode)
    if (!normalized) {
      return {
        metadata: prev,
        error:
          "Barcode link doesn't look valid. Paste a full address starting with https:// (we can add https:// when only a domain is provided).",
      }
    }
    next.customer_pay_barcode_url = normalized
  } else {
    delete next.customer_pay_barcode_url
  }
  if (input.sendLinkEnabled) next.customer_pay_send_link_enabled = true
  else delete next.customer_pay_send_link_enabled
  if (input.sendBarcodeEnabled) next.customer_pay_send_barcode_enabled = true
  else delete next.customer_pay_send_barcode_enabled
  if (!input.requireReviewBeforeSend) next.customer_pay_require_review_before_send = false
  else delete next.customer_pay_require_review_before_send
  return { metadata: next }
}
