/** Tiny event bus so the dashboard tile (and other places) can open the messenger widget. */

export const OPEN_MESSENGER_EVENT = "tradesman-open-messenger"

export type OpenMessengerDetail = {
  otherUserId?: string | null
  /** Open dial-out panel with this number prefilled (Call from Tradesman Messenger). */
  dialPhone?: string | null
  dialLabel?: string | null
}

/** Open the bottom-right messenger widget, optionally focused on a member. */
export function openMessenger(otherUserId?: string | null): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<OpenMessengerDetail>(OPEN_MESSENGER_EVENT, { detail: { otherUserId: otherUserId ?? null } }))
}

/** Open Instant Messaging dial-out with a customer number (desktop / future Windows client path). */
export function openMessengerDial(opts: { phone: string; label?: string | null }): void {
  if (typeof window === "undefined") return
  const phone = opts.phone.trim()
  if (!phone) return
  window.dispatchEvent(
    new CustomEvent<OpenMessengerDetail>(OPEN_MESSENGER_EVENT, {
      detail: { dialPhone: phone, dialLabel: opts.label?.trim() || null },
    }),
  )
}

export function onOpenMessenger(cb: (detail: OpenMessengerDetail) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = (e: Event) => cb((e as CustomEvent<OpenMessengerDetail>).detail ?? {})
  window.addEventListener(OPEN_MESSENGER_EVENT, handler)
  return () => window.removeEventListener(OPEN_MESSENGER_EVENT, handler)
}

/** Join a stable conference room (e.g. from a scheduled calendar video call). */
export const JOIN_CONFERENCE_EVENT = "tradesman-join-conference"

export type JoinConferenceDetail = { roomId: string; video: boolean }

export function joinConference(roomId: string, video: boolean): void {
  if (typeof window === "undefined" || !roomId) return
  window.dispatchEvent(new CustomEvent<JoinConferenceDetail>(JOIN_CONFERENCE_EVENT, { detail: { roomId, video } }))
}

export function onJoinConference(cb: (detail: JoinConferenceDetail) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = (e: Event) => {
    const d = (e as CustomEvent<JoinConferenceDetail>).detail
    if (d?.roomId) cb(d)
  }
  window.addEventListener(JOIN_CONFERENCE_EVENT, handler)
  return () => window.removeEventListener(JOIN_CONFERENCE_EVENT, handler)
}
