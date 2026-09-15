import { Capacitor } from "@capacitor/core"

/**
 * iPad / Android tablet — including iPadOS “desktop” UA (Macintosh + touch).
 * Real desktop browsers stay false so the in-app messenger widget can remain there.
 */
export function isTabletDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  if (/iPad/i.test(ua)) return true
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return true
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return true
  if (Capacitor.isNativePlatform()) {
    const minSide = Math.min(window.innerWidth, window.innerHeight)
    if (minSide >= 600) return true
  }
  return false
}
