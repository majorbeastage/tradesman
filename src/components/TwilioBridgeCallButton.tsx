import { useState } from "react"
import { FunctionsHttpError } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
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

  const trimmed = customerPhone.trim()
  if (!trimmed) return null

  return (
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
        try {
          const { data, error } = await supabase.functions.invoke("twilio-bridge-call", {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: {
              customer_phone: trimmed,
              ...(quoteOwnerUserId ? { quote_owner_user_id: quoteOwnerUserId } : {}),
            },
          })
          let body = data as { ok?: boolean; message?: string; error?: string; detail?: string; hint?: string } | null
          if (error instanceof FunctionsHttpError) {
            try {
              const parsed = (await error.context.json()) as typeof body
              if (parsed && typeof parsed === "object") body = { ...body, ...parsed }
            } catch {
              /* ignore */
            }
          }
          if (error) {
            const parts = [body?.error, body?.hint, body?.detail, error.message || "Call failed"].filter(Boolean) as string[]
            const deduped = [...new Set(parts)]
            alert(
              deduped.join("\n\n") +
                (deduped.length && !body?.error
                  ? "\n\nIf this is unclear, open Supabase → Edge Functions → twilio-bridge-call → Logs for the request."
                  : ""),
            )
            return
          }
          const d = body ?? {}
          if (d?.ok) alert(d.message ?? "Calling your phone — answer to reach the customer.")
          else alert([d?.error, d?.hint, d?.detail].filter(Boolean).join("\n\n") || "Call failed")
        } catch (e) {
          alert(e instanceof Error ? e.message : String(e))
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
  )
}
