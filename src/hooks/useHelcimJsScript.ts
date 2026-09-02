import { useCallback, useEffect, useState } from "react"

/** Legacy Helcim.js processor (Payments tab + signup). Not HelcimPay.js. */
export const HELCIM_JS_SCRIPT_SRC = "https://secure.myhelcim.com/js/version2.js"

const DEFAULT_TIMEOUT_MS = 12_000
const POLL_MS = 150
const POLL_MAX = 20

declare global {
  interface Window {
    helcimProcess?: () => void
  }
}

export function isHelcimProcessReady(): boolean {
  return typeof window.helcimProcess === "function"
}

/**
 * Loads Helcim.js and waits for `window.helcimProcess`.
 * The Payments "Loading Helcim…" button stays disabled until this is ready.
 * Failures are browser-side (blocked script, timeout) — they never hit Vercel.
 */
export function useHelcimJsScript(enabled: boolean, scriptMarker: string) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    const existing = document.querySelector(`script[${scriptMarker}]`)
    existing?.remove()
    setReady(false)
    setError(null)
    setAttempt((n) => n + 1)
  }, [scriptMarker])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timeoutId = 0
    let pollId = 0

    const finishReady = () => {
      if (cancelled) return
      setReady(true)
      setError(null)
    }

    const finishError = (message: string, detail?: string) => {
      if (cancelled) return
      setReady(false)
      setError(message)
      console.warn("[helcim-js]", message, detail ?? "")
    }

    if (isHelcimProcessReady()) {
      finishReady()
      return
    }

    const startPoll = (reason: string) => {
      let n = 0
      pollId = window.setInterval(() => {
        n += 1
        if (isHelcimProcessReady()) {
          window.clearInterval(pollId)
          finishReady()
          return
        }
        if (n >= POLL_MAX) {
          window.clearInterval(pollId)
          finishError(
            "Helcim checkout script loaded but did not initialize. Refresh or try again.",
            reason,
          )
        }
      }, POLL_MS)
    }

    const onLoad = () => {
      if (isHelcimProcessReady()) {
        finishReady()
        return
      }
      startPoll("onload")
    }

    const selector = `script[${scriptMarker}]`
    let script = document.querySelector(selector) as HTMLScriptElement | null

    if (!script) {
      script = document.createElement("script")
      script.src = HELCIM_JS_SCRIPT_SRC
      script.async = true
      script.setAttribute(scriptMarker, "1")
      script.onload = onLoad
      script.onerror = () => {
        finishError(
          "Could not load Helcim checkout. Check the connection, turn off ad blockers, and try another browser.",
          HELCIM_JS_SCRIPT_SRC,
        )
      }
      document.body.appendChild(script)
    } else {
      startPoll("existing-script")
    }

    timeoutId = window.setTimeout(() => {
      if (cancelled || isHelcimProcessReady()) return
      finishError(
        "Helcim checkout is taking too long to load. Refresh the page or try another browser.",
        "timeout",
      )
    }, DEFAULT_TIMEOUT_MS)

    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
      if (pollId) window.clearInterval(pollId)
    }
  }, [enabled, attempt, scriptMarker])

  return { ready, error, retry }
}
