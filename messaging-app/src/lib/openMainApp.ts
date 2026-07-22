/**
 * Ask the full Tradesman-US Android/iOS app to hand off the signed-in session
 * into this messaging app via tradesmanmsg://auth#access_token=...&refresh_token=...
 *
 * Opens the main app with tradesman://messaging-handoff (registered on the main app).
 * If the main app is not installed, Intent browser_fallback goes to Play Store.
 */
import { Capacitor } from "@capacitor/core"

export function requestTradesmanAppHandoff(): void {
  const playFallback = encodeURIComponent("https://play.google.com/store/apps/details?id=com.tradesmanus.com")
  const intent =
    `intent://messaging-handoff#Intent;scheme=tradesman;package=com.tradesmanus.com;` +
    `S.browser_fallback_url=${playFallback};end`
  const plain = "tradesman://messaging-handoff"

  void (async () => {
    try {
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        const { MessagingNative } = await import("../plugins/messaging-native")
        await MessagingNative.openExternalUrl({ url: intent })
        return
      }
    } catch {
      /* fall through */
    }
    try {
      window.location.href = intent
    } catch {
      try {
        window.location.href = plain
      } catch {
        window.location.href = "https://www.tradesman-us.com"
      }
    }
  })()
}
