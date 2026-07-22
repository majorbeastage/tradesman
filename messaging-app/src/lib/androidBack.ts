/**
 * Android hardware back — navigate within Messaging instead of exiting immediately.
 */
import { Capacitor } from "@capacitor/core"

export type AndroidBackHandler = () => boolean

let handler: AndroidBackHandler | null = null

/** Register the active screen's back handler. Return true if the event was consumed. */
export function setAndroidBackHandler(fn: AndroidBackHandler | null): void {
  handler = fn
}

export async function initAndroidBackListener(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}
  try {
    const { App } = await import("@capacitor/app")
    const sub = await App.addListener("backButton", ({ canGoBack }) => {
      if (handler?.()) return
      // At root: minimize instead of killing the WebView abruptly when possible.
      void (async () => {
        try {
          if (typeof App.minimizeApp === "function") {
            await App.minimizeApp()
            return
          }
        } catch {
          /* ignore */
        }
        if (canGoBack && typeof window !== "undefined") window.history.back()
      })()
    })
    return () => {
      void sub.remove()
    }
  } catch {
    return () => {}
  }
}
