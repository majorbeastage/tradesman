/**
 * Ask the full Tradesman-US Android/iOS app to hand off the signed-in session
 * into this messaging app via tradesmanmsg://auth#access_token=...&refresh_token=...
 *
 * Opens the main app with tradesman://messaging-handoff (registered on the main app).
 * If the main app is not installed, falls back to the website / Play Store for Tradesman.
 */
export function requestTradesmanAppHandoff(): void {
  const playFallback = encodeURIComponent("https://play.google.com/store/apps/details?id=com.tradesmanus.com")
  const intent =
    `intent://messaging-handoff#Intent;scheme=tradesman;package=com.tradesmanus.com;` +
    `S.browser_fallback_url=${playFallback};end`
  try {
    window.location.href = intent
  } catch {
    try {
      window.open("tradesman://messaging-handoff", "_system")
    } catch {
      window.location.href = "https://www.tradesman-us.com"
    }
  }
}
