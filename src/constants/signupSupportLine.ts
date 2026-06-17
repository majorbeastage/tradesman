/**
 * Signup / onboarding phone support — Justin Montgomery’s advertised Twilio line.
 * Prefer VITE_SIGNUP_SUPPORT_* (Justin’s public DID from Admin → Communications).
 * Falls back to VITE_HELP_DESK_* / toll-free when signup-specific env is not set.
 */
import { HELP_DESK_PHONE_DISPLAY, HELP_DESK_PHONE_E164 } from "./helpDesk"

const contactName = import.meta.env.VITE_SIGNUP_SUPPORT_CONTACT_NAME?.trim()
const displayOverride = import.meta.env.VITE_SIGNUP_SUPPORT_PHONE_DISPLAY?.trim()
const e164Override = import.meta.env.VITE_SIGNUP_SUPPORT_PHONE_E164?.trim()

export const SIGNUP_SUPPORT_CONTACT_NAME = contactName || "Justin Montgomery"

/** Human-readable number for UI (e.g. (555) 123-4567). */
export const SIGNUP_SUPPORT_PHONE_DISPLAY = displayOverride || HELP_DESK_PHONE_DISPLAY

/** E.164 for tel: links (e.g. +15551234567). */
export const SIGNUP_SUPPORT_PHONE_E164 = e164Override || HELP_DESK_PHONE_E164

export function signupSupportTelHref(): string {
  return `tel:${SIGNUP_SUPPORT_PHONE_E164}`
}

/** True when a dialable E.164 is available (always true with default help desk fallback). */
export function signupSupportLineConfigured(): boolean {
  return Boolean(SIGNUP_SUPPORT_PHONE_E164.replace(/\D/g, "").length >= 10)
}

/** Whether the number comes from signup-specific env (Justin’s Twilio DID) vs help-desk fallback. */
export function signupSupportUsesDedicatedLine(): boolean {
  return Boolean(e164Override && displayOverride)
}
