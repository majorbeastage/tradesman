import { useEffect, useState } from "react"
import { FunctionsHttpError } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"

type BridgeFnBody = {
  ok?: boolean
  message?: string
  error?: string
  detail?: string
  hint?: string
  twilio_call_sid?: string | null
  rings_first?: string | null
  from_number?: string | null
}

function parseInvokeData(data: unknown): BridgeFnBody | null {
  if (data == null) return null
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as BridgeFnBody
    } catch {
      return null
    }
  }
  if (typeof data === "object") return data as BridgeFnBody
  return null
}

type Props = {
  customerPhone: string
  /** Quote / record owner (scoped user). When OM acts for another user, pass their profile id for access checks. */
  quoteOwnerUserId?: string
  compact?: boolean
  /** Button label; default is business-line wording. Use short "Call" on native when this is the primary CTA. */
  label?: string
  /** `primary` = main app-style CTA (e.g. Capacitor shell). */
  variant?: "default" | "primary"
}

/**
 * Business-line bridge call: rings your profile phone first; on answer, connects to the customer with your Twilio number as caller ID.
 * Requires Edge Function `twilio-bridge-call` and Twilio secrets on Supabase (see function header comments).
 */
export default function TwilioBridgeCallButton({
  customerPhone,
  quoteOwnerUserId,
  compact,
  label,
  variant = "default",
}: Props) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; lines: string[] } | null>(null)

  useEffect(() => {
    if (!feedback) return
    const t = window.setTimeout(() => setFeedback(null), 45000)
    return () => window.clearTimeout(t)
  }, [feedback])

  const trimmed = customerPhone.trim()
  if (!trimmed) return null

  return (
    <>
      <button
        type="button"
        disabled={busy || !supabase}
        onClick={async () => {
          if (!supabase) return
          /** Context `session` can lag storage; Edge needs a fresh user JWT on the wire. */
          let { data: authData, error: authErr } = await supabase.auth.getSession()
          let accessToken: string | undefined = authData.session?.access_token
          if (!accessToken) {
            const refreshed = await supabase.auth.refreshSession()
            authErr = refreshed.error
            accessToken = refreshed.data.session?.access_token ?? undefined
          }
          if (!accessToken) {
            alert(
              authErr?.message?.includes("session")
                ? "Your sign-in session expired. Sign out and sign in again, then try Call."
                : "Sign in to use the business-line call.",
            )
            return
          }
          setBusy(true)
          setFeedback(null)
          try {
            const { data, error } = await supabase.functions.invoke("twilio-bridge-call", {
              headers: { Authorization: `Bearer ${accessToken}` },
              body: {
                customer_phone: trimmed,
                ...(quoteOwnerUserId ? { quote_owner_user_id: quoteOwnerUserId } : {}),
              },
            })
            let body = parseInvokeData(data)
            if (error instanceof FunctionsHttpError) {
              try {
                const parsed = parseInvokeData(await error.context.json())
                if (parsed) body = { ...body, ...parsed }
              } catch {
                /* ignore */
              }
            }
            if (error) {
              const parts = [body?.error, body?.hint, body?.detail, error.message || "Call failed"].filter(Boolean) as string[]
              const deduped = [...new Set(parts)]
              const text =
                deduped.join("\n\n") +
                (deduped.length && !body?.error
                  ? "\n\nIf this is unclear, open Supabase → Edge Functions → twilio-bridge-call → Logs for the request."
                  : "")
              setFeedback({ kind: "err", lines: text.split("\n").filter(Boolean) })
              alert(text)
              return
            }
            const d = body ?? {}
            if (d?.ok) {
              const lines = [
                d.message ??
                  "Twilio accepted the call — answer your phone to reach the customer.",
                typeof d.twilio_call_sid === "string" && d.twilio_call_sid
                  ? `Twilio Call SID: ${d.twilio_call_sid} (Monitor → Logs → Calls to see if your cell leg rang, failed, or was declined.)`
                  : "",
                typeof d.rings_first === "string" && d.rings_first
                  ? `Ringing first: ${d.rings_first} (Account → Best contact / Primary — must be your personal cell.)`
                  : "",
              ].filter(Boolean)
              setFeedback({ kind: "ok", lines })
              alert(lines.join("\n\n"))
            } else {
              const fail = [d?.error, d?.hint, d?.detail].filter(Boolean).join("\n\n") || "Call failed"
              setFeedback({ kind: "err", lines: fail.split("\n").filter(Boolean) })
              alert(fail)
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setFeedback({ kind: "err", lines: [msg] })
            alert(msg)
          } finally {
            setBusy(false)
          }
        }}
        style={{
          padding: compact ? "6px 12px" : "8px 14px",
          borderRadius: 8,
          border: variant === "primary" ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
          background: variant === "primary" ? theme.primary : "#fff",
          color: variant === "primary" ? "#fff" : theme.text,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          fontSize: compact ? 12 : 14,
        }}
      >
        {busy ? "Calling…" : (label ?? "Call from Business number")}
      </button>
      {feedback && (
        <div
          role="status"
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.45,
            maxWidth: 420,
            border: `1px solid ${feedback.kind === "ok" ? "#86efac" : "#fecaca"}`,
            background: feedback.kind === "ok" ? "#f0fdf4" : "#fef2f2",
            color: feedback.kind === "ok" ? "#14532d" : "#991b1b",
          }}
        >
          {feedback.lines.map((line, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0" }}>
              {line}
            </p>
          ))}
        </div>
      )}
    </>
  )
}
