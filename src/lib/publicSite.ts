import { Capacitor } from "@capacitor/core"

/** Production website — used when the iOS app must open Safari (App Store billing / account flows). */
export const PUBLIC_SITE_ORIGIN = "https://www.tradesman-us.com"

export function getPublicSiteOrigin(): string {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_ORIGIN ?? "").trim().replace(/\/+$/, "")
  return configured || PUBLIC_SITE_ORIGIN
}

export function publicSiteUrl(path = "/"): string {
  const origin = getPublicSiteOrigin()
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${origin}${suffix}`
}

export function isIosNativeApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios"
}

/** Open a URL in Safari (iOS) or a new tab (web/Android). */
export async function openInSystemBrowser(url: string): Promise<void> {
  if (isIosNativeApp()) {
    try {
      const { TradesmanNative } = await import("../plugins/tradesman-native")
      await TradesmanNative.openExternalUrl({ url })
      return
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}
