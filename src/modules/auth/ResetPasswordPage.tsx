import { useEffect, useState } from "react"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { revokeOtherAuthSessions } from "../../lib/authSingleSession"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { consumeAuthHashErrorMessage, getPasswordRecoveryRedirectTo } from "../../lib/authRedirectBase"

type Props = {
  onDone: () => void
}

export default function ResetPasswordPage({ onDone }: Props) {
  const [phase, setPhase] = useState<"loading" | "form" | "request" | "done">("loading")
  const [password, setPassword] = useState("")
  const [password2, setPassword2] = useState("")
  const [requestEmail, setRequestEmail] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const hashErr = consumeAuthHashErrorMessage()
    if (hashErr) {
      setError(hashErr)
      setPhase("request")
      return undefined
    }

    if (!supabase) {
      setPhase("request")
      setError("This app is not connected to Supabase.")
      return undefined
    }

    let cancelled = false

    const stripHashFromAddressBar = () => {
      if (typeof window === "undefined") return
      const path = window.location.pathname || "/reset-password"
      window.history.replaceState(null, document.title, path)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return
      if (event === "PASSWORD_RECOVERY" || (nextSession?.user && event === "SIGNED_IN")) {
        stripHashFromAddressBar()
        setPhase("form")
      }
    })

    void (async () => {
      await supabase.auth.getSession()
      await new Promise((r) => setTimeout(r, 280))
      if (cancelled) return
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        stripHashFromAddressBar()
        setPhase("form")
      } else {
        setPhase("request")
      }
    })()

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!supabase) return
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (password !== password2) {
      setError("Passwords do not match.")
      return
    }
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      await revokeOtherAuthSessions()
      setMessage("Your password is updated. You can continue signed in, or go back to sign in anytime.")
      setPhase("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRequestLink(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!supabase) return
    const email = requestEmail.trim().toLowerCase()
    if (!email) {
      setError("Enter the email for your account.")
      return
    }
    const redirectTo = getPasswordRecoveryRedirectTo()
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
      if (err) throw err
      setMessage("If that email is registered, you will receive a reset link shortly. Check spam folders too.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const card: React.CSSProperties = {
    maxWidth: 420,
    margin: "0 auto",
    padding: 28,
    background: "#ffffff",
    borderRadius: 12,
    boxShadow: "0 8px 32px rgba(31, 41, 51, 0.12)",
    border: `1px solid ${theme.border}`,
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    marginTop: 6,
    marginBottom: 14,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    fontSize: 15,
    boxSizing: "border-box",
    color: theme.text,
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.background }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              fontSize: "clamp(36px, 10vw, 52px)",
              fontWeight: 800,
              letterSpacing: "0.04em",
              color: theme.charcoal,
              lineHeight: 1.05,
            }}
          >
            TRADESMAN
          </div>
          <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600, color: theme.primary }}>Reset your password</div>
        </div>

        {phase === "loading" && (
          <div style={{ ...card, textAlign: "center", color: theme.text }}>
            <p style={{ margin: 0 }}>Checking your reset link…</p>
          </div>
        )}

        {phase === "form" && (
          <form onSubmit={handleSetPassword} style={card}>
            <p style={{ margin: "0 0 18px", fontSize: 14, color: "#4b5563", lineHeight: 1.55 }}>
              Choose a new password for your account.
            </p>
            <label style={{ fontWeight: 600, fontSize: 14, color: theme.text }}>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
                placeholder="At least 6 characters"
              />
            </label>
            <label style={{ fontWeight: 600, fontSize: 14, color: theme.text }}>
              Confirm password
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
                placeholder="Repeat password"
              />
            </label>
            {error && <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 12px" }}>{error}</p>}
            {message && <p style={{ color: "#059669", fontSize: 14, margin: "0 0 12px" }}>{message}</p>}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "14px",
                background: theme.primary,
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Update password
            </button>
          </form>
        )}

        {(phase === "request" || phase === "done") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: 420 }}>
            {phase === "request" && (
              <form onSubmit={handleRequestLink} style={card}>
                <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4b5563", lineHeight: 1.55 }}>
                  If your link expired or does not open, enter your email and we will send a new reset link.
                </p>
                <label style={{ fontWeight: 600, fontSize: 14, color: theme.text }}>
                  Email
                  <input
                    type="email"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    autoComplete="email"
                    style={inputStyle}
                    placeholder="you@example.com"
                  />
                </label>
                {error && <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 12px" }}>{error}</p>}
                {message && <p style={{ color: "#059669", fontSize: 14, margin: "0 0 12px" }}>{message}</p>}
                <button
                  type="submit"
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: theme.primary,
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  Send reset link
                </button>
              </form>
            )}

            {phase === "done" && (
              <div style={card}>
                <p style={{ margin: 0, fontSize: 15, color: "#374151", lineHeight: 1.55 }}>{message}</p>
                <button
                  type="button"
                  onClick={() => onDone()}
                  style={{
                    marginTop: 20,
                    width: "100%",
                    padding: "14px",
                    background: theme.charcoal,
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  Back to home
                </button>
              </div>
            )}

            {phase === "request" && (
              <button
                type="button"
                onClick={() => onDone()}
                style={{
                  alignSelf: "center",
                  background: "none",
                  border: "none",
                  color: theme.primary,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                ← Back to home
              </button>
            )}
          </div>
        )}
      </div>
      <CopyrightVersionFooter variant="default" align="center" style={{ paddingBottom: 20 }} />
    </div>
  )
}
