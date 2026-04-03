/**
 * Tradesman toll-free: help desk + phone-based voicemail greeting updates.
 * This is NOT the client’s primary business phone — callers use this number to reach Tradesman / record a greeting with PIN + primary-phone verification.
 * Override with Vite env if the number changes.
 */
const display = import.meta.env.VITE_HELP_DESK_PHONE_DISPLAY?.trim()
const e164 = import.meta.env.VITE_HELP_DESK_PHONE_E164?.trim()

export const HELP_DESK_PHONE_DISPLAY = display || "(844) 844-1611"
export const HELP_DESK_PHONE_E164 = e164 || "+18448441611"
