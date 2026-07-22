/** Dial request handed off from the main Tradesman app via deep link hash params. */

export type PendingDial = { phone: string; label?: string }

export const PENDING_DIAL_EVENT = "tradesman-pending-dial"

let pending: PendingDial | null = null

export function setPendingDial(dial: PendingDial | null): void {
  pending = dial
  try {
    if (typeof sessionStorage === "undefined") return
    if (!dial) {
      sessionStorage.removeItem("tradesman_pending_dial")
      return
    }
    sessionStorage.setItem("tradesman_pending_dial", JSON.stringify(dial))
  } catch {
    /* ignore */
  }
  if (dial && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<PendingDial>(PENDING_DIAL_EVENT, { detail: dial }))
  }
}

export function takePendingDial(): PendingDial | null {
  if (pending) {
    const d = pending
    pending = null
    try {
      sessionStorage.removeItem("tradesman_pending_dial")
    } catch {
      /* ignore */
    }
    return d
  }
  try {
    const raw = sessionStorage.getItem("tradesman_pending_dial")
    if (!raw) return null
    sessionStorage.removeItem("tradesman_pending_dial")
    const parsed = JSON.parse(raw) as PendingDial
    if (parsed?.phone?.trim()) return { phone: parsed.phone.trim(), label: parsed.label?.trim() || undefined }
  } catch {
    /* ignore */
  }
  return null
}

export function parseDialFromUrl(url: string): PendingDial | null {
  try {
    const hashIndex = url.indexOf("#")
    const frag = hashIndex >= 0 ? url.slice(hashIndex + 1) : ""
    if (!frag) return null
    const params = new URLSearchParams(frag)
    const phone = params.get("phone")?.trim()
    if (!phone) return null
    const label = params.get("label")?.trim() || undefined
    return { phone, label }
  } catch {
    return null
  }
}
