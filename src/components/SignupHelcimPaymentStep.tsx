import { useEffect, useMemo, useState } from "react"
import { theme } from "../styles/theme"
import { isHelcimJsReturnMessage, type HelcimJsReturnMessage } from "../lib/helcimJsReturnMessage"

const HELCIM_SCRIPT_SRC = "https://secure.myhelcim.com/js/version2.js"
const HELCIM_RETURN_IFRAME_NAME = "tradesmanSignupHelcimReturn"
const ENV_JS_TOKEN = (import.meta.env.VITE_HELCIM_JS_TOKEN as string | undefined)?.trim() ?? ""

type Props = {
  dueTodayUsd: number
  monthlyUsd: number
  billDateLabel: string
  orderEmail: string
  onPaymentSuccess: (result: HelcimJsReturnMessage) => void
  onSkip?: () => void
  allowSkip?: boolean
}

export function SignupHelcimPaymentStep({
  dueTodayUsd,
  monthlyUsd,
  billDateLabel,
  orderEmail,
  onPaymentSuccess,
  onSkip,
  allowSkip,
}: Props) {
  const [scriptReady, setScriptReady] = useState(false)
  const [lastError, setLastError] = useState("")
  const formAction = useMemo(() => {
    const base = typeof window !== "undefined" ? window.location.origin : ""
    return base ? `${base}/api/helcim-js-return` : ""
  }, [])
  const helcimReturnOrigin = useMemo(() => {
    try {
      return formAction ? new URL(formAction).origin : ""
    } catch {
      return ""
    }
  }, [formAction])

  useEffect(() => {
    if (!ENV_JS_TOKEN) return
    const sel = "script[data-tradesman-signup-helcim-js]"
    if (document.querySelector(sel)) {
      setScriptReady(typeof window.helcimProcess === "function")
      return
    }
    const s = document.createElement("script")
    s.src = HELCIM_SCRIPT_SRC
    s.async = true
    s.dataset.tradesmanSignupHelcimJs = "1"
    s.onload = () => setScriptReady(typeof window.helcimProcess === "function")
    document.body.appendChild(s)
  }, [])

  useEffect(() => {
    if (!ENV_JS_TOKEN || !helcimReturnOrigin) return
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== helcimReturnOrigin) return
      if (!isHelcimJsReturnMessage(ev.data)) return
      if (ev.data.response === 1) {
        onPaymentSuccess(ev.data)
      } else {
        setLastError(ev.data.responseMessage || ev.data.noticeMessage || "Payment was not approved.")
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [helcimReturnOrigin, onPaymentSuccess])

  const inputStyle: React.CSSProperties = {
    ...theme.formInput,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 14,
  }

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
    fontWeight: 700,
    fontSize: 14,
    color: theme.text,
  }

  if (!ENV_JS_TOKEN) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          background: "#fffbeb",
          color: theme.text,
          colorScheme: "light",
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        <p style={{ margin: "0 0 10px", fontWeight: 800, color: theme.text }}>Payment setup</p>
        <p style={{ margin: "0 0 10px" }}>
          Due today (prorated through {billDateLabel}): <strong>${dueTodayUsd.toFixed(2)}</strong> · then $
          {monthlyUsd.toFixed(2)}/mo on your selected bill date.
        </p>
        <p style={{ margin: 0, color: "#92400e" }}>
          Helcim.js is not configured on this build (<code>VITE_HELCIM_JS_TOKEN</code>). Your account will be created and
          billing will be collected on first login via the Payments tab.
        </p>
        {allowSkip && onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            style={{
              marginTop: 14,
              padding: "10px 18px",
              background: theme.primary,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Continue without card on file
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div style={{ color: theme.text, colorScheme: "light" }}>
      <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.55, color: theme.text, fontWeight: 500 }}>
        Due today at signup (prorated through <strong>{billDateLabel}</strong>):{" "}
        <strong>${dueTodayUsd.toFixed(2)}</strong>. Recurring charge: <strong>${monthlyUsd.toFixed(2)}/month</strong> on
        day {billDateLabel.split(" ")[0] ? new Date(billDateLabel).getDate() : "your bill date"} each month.
      </p>
      <iframe
        name={HELCIM_RETURN_IFRAME_NAME}
        title="Helcim payment result"
        style={{ position: "absolute", width: 0, height: 0, border: "none", visibility: "hidden" }}
        aria-hidden
      />
      <form
        name="helcimSignupForm"
        method="POST"
        action={formAction}
        target={HELCIM_RETURN_IFRAME_NAME}
        style={{ padding: 16, borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff" }}
        onSubmit={() => {
          setLastError("")
          if (typeof window.helcimProcess === "function") {
            window.helcimProcess()
          }
        }}
      >
        <input type="hidden" id="token" value={ENV_JS_TOKEN} />
        <input type="hidden" id="orderNumber" value={`signup-${orderEmail.replace(/[^a-z0-9]/gi, "").slice(0, 40)}`} />
        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Amount due today
          <input type="text" id="amount" readOnly defaultValue={dueTodayUsd.toFixed(2)} style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Cardholder name
          <input type="text" id="cardHolderName" autoComplete="cc-name" style={inputStyle} required />
        </label>
        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Card number
          <input type="text" id="cardNumber" autoComplete="cc-number" style={inputStyle} required />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <label style={labelStyle}>
            Expiry (MMYY)
            <input type="text" id="expiryDate" autoComplete="cc-exp" style={inputStyle} required />
          </label>
          <label style={labelStyle}>
            CVV
            <input type="text" id="cvv" autoComplete="cc-csc" style={inputStyle} required />
          </label>
        </div>
        {lastError ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{lastError}</p> : null}
        <button
          type="submit"
          disabled={!scriptReady}
          style={{
            marginTop: 8,
            padding: "12px 20px",
            background: theme.primary,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: scriptReady ? "pointer" : "wait",
          }}
        >
          {scriptReady ? `Pay $${dueTodayUsd.toFixed(2)} and create account` : "Loading secure checkout…"}
        </button>
      </form>
    </div>
  )
}

declare global {
  interface Window {
    helcimProcess?: () => void
  }
}
