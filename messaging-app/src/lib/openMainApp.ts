/**
 * Ask the full Tradesman-US Android/iOS app to hand off the signed-in session
 * into this messaging app via tradesmanmsg://auth#access_token=...&refresh_token=...
 *
 * Opens the main app with tradesman://messaging-handoff (registered on the main app).
 */
export function requestTradesmanAppHandoff(): void {
  // Android intent + custom scheme (works when the main app is installed).
  const intent =
    "intent://messaging-handoff#Intent;scheme=tradesman;package=com.tradesmanus.com;S.browser_fallback_url=https%3A%2F%2Fwww.tradesman-us.com;end"
  try {
    window.location.href = intent
  } catch {
    try {
      window.open("tradesman://messaging-handoff", "_system")
    } catch {
      /* ignore */
    }
  }
}
