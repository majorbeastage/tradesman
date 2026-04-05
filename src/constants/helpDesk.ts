/**
 * Tradesman toll-free: help desk menu (POST /api/help-desk-voice) + press 9 for PIN-based greeting updates (/api/voicemail-greeting).
 * Not the client’s primary business line. Override with Vite env if the number changes.
 */
const display = import.meta.env.VITE_HELP_DESK_PHONE_DISPLAY?.trim()
const e164 = import.meta.env.VITE_HELP_DESK_PHONE_E164?.trim()

export const HELP_DESK_PHONE_DISPLAY = display || "(844) 844-1611"
export const HELP_DESK_PHONE_E164 = e164 || "+18448441611"
