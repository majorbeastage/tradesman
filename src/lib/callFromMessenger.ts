/**
 * Route outbound customer calls into Tradesman Messenger:
 * - Desktop / wide web: Instant Messaging widget dial panel (future Windows client can use the same deep link).
 * - Mobile viewport or native Capacitor: open Messaging app with session + dial prefill.
 */
import { isNativeApp } from "./capacitorMobile"
import { openMessengerDial } from "./messengerBus"
import { openMessagingAppWithSession } from "./messagingHandoff"

export type CallFromMessengerOpts = {
  phone: string
  label?: string | null
  /** When true (narrow viewport), prefer Messaging app deep link even on web. */
  preferMessagingApp?: boolean
}

function shouldUseMessagingApp(preferMessagingApp?: boolean): boolean {
  if (isNativeApp()) return true
  if (preferMessagingApp) return true
  return false
}

/** Open Messenger dial (desktop widget) or Messaging app (mobile) with this number. */
export async function callFromTradesmanMessenger(
  opts: CallFromMessengerOpts,
): Promise<{ ok: boolean; error?: string }> {
  const phone = opts.phone.trim()
  if (!phone) return { ok: false, error: "Add a valid phone number to place a call." }
  const label = opts.label?.trim() || undefined

  if (shouldUseMessagingApp(opts.preferMessagingApp)) {
    return openMessagingAppWithSession({ phone, label })
  }

  openMessengerDial({ phone, label: label ?? null })
  return { ok: true }
}
