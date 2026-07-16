/** Tiny event bus so the dashboard tile (and other places) can open the messenger widget. */

export const OPEN_MESSENGER_EVENT = "tradesman-open-messenger"

export type OpenMessengerDetail = { otherUserId?: string | null }

/** Open the bottom-right messenger widget, optionally focused on a member. */
export function openMessenger(otherUserId?: string | null): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<OpenMessengerDetail>(OPEN_MESSENGER_EVENT, { detail: { otherUserId: otherUserId ?? null } }))
}

export function onOpenMessenger(cb: (detail: OpenMessengerDetail) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = (e: Event) => cb((e as CustomEvent<OpenMessengerDetail>).detail ?? {})
  window.addEventListener(OPEN_MESSENGER_EVENT, handler)
  return () => window.removeEventListener(OPEN_MESSENGER_EVENT, handler)
}
