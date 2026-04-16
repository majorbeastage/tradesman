import { useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { useAuth } from "../contexts/AuthContext"

type Props = {
  customerPhone: string
  /** Quote / record owner (scoped user). When OM acts for another user, pass their profile id for access checks. */
  quoteOwnerUserId?: string
  compact?: boolean
  /** Button label; default explains Twilio. Use short "Call" on native when this is the primary CTA. */
  label?: string
  /** `primary` = main app-style CTA (e.g. Capacitor shell). */
  variant?: "default" | "primary"
}

/**
 * Twilio two-leg call: rings your Account cell first; on answer, connects to the customer with TWILIO_FROM_NUMBER as caller ID.
 * Requires Edge Function twilio-bridge-call + Twilio secrets on Supabase.
 */
export default function TwilioBridgeCallButton({
  customerPhone,
  quoteOwnerUserId,
  compact,
  label,
  variant = "default",
}: Props) {
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)

  const trimmed = customerPhone.trim()
  if (!trimmed) return null

  return (
    <button
      type="button"
      disabled={busy || !session}
      onClick={async () => {
        if (!supabase || !session?.access_token) {
          alert("Sign in to use Twilio calling.")
          return
        }
        setBusy(true)
        try {
          const { data, error } = await supabase.functions.invoke("twilio-bridge-call", {
            body: {
              customer_phone: trimmed,
              ...(quoteOwnerUserId ? { quote_owner_user_id: quoteOwnerUserId } : {}),
            },
          })
          if (error) {
            alert(error.message || "Twilio call failed")
            return
          }
          const d = data as { ok?: boolean; message?: string; error?: string; detail?: string }
          if (d?.ok) alert(d.message ?? "Calling your phone — answer to reach the customer.")
          else alert(d?.error || d?.detail || "Twilio call failed")
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
      {busy ? "Calling…" : (label ?? "Call via Twilio")}
    </button>
  )
}
