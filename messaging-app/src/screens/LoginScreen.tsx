import { useEffect, useState, type CSSProperties, type FormEvent } from "react"
import { supabase } from "../lib/supabaseClient"
import { requestTradesmanAppHandoff } from "../lib/openMainApp"
import {
  getMessagingStaySignedIn,
  MESSAGING_STAY_SIGNED_IN_DAYS,
  registerAppSession,
  setMessagingStaySignedIn,
} from "../lib/appSessions"
import icon from "../assets/icon.png"

export default function LoginScreen() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [staySignedIn, setStaySignedIn] = useState(true)

  useEffect(() => {
    void getMessagingStaySignedIn().then(setStaySignedIn)
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    await setMessagingStaySignedIn(staySignedIn)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (!error) {
      await registerAppSession(supabase, "messaging")
    }
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 24px calc(24px + env(safe-area-inset-bottom))", gap: 16 }}>
      <img src={icon} alt="Tradesman Messaging" width={96} height={96} style={{ borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.2)" }} />
      <h1 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>Tradesman Messaging</h1>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", textAlign: "center", maxWidth: 300, lineHeight: 1.45 }}>
        Up to 3 devices at once. Stay signed in on this phone like Teams — no daily password re-entry.
      </p>

      <button
        type="button"
        onClick={() => requestTradesmanAppHandoff()}
        style={{
          width: "100%",
          maxWidth: 340,
          border: "none",
          background: "#0f172a",
          color: "#fff",
          padding: "14px 16px",
          borderRadius: 12,
          fontWeight: 800,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        Sign in through your Tradesman-US app
      </button>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", textAlign: "center", maxWidth: 320 }}>
        Opens the main Tradesman app (if installed and signed in) and brings you back here already logged in.
      </p>

      <button
        type="button"
        onClick={() => setShowPassword((v) => !v)}
        style={{ border: "none", background: "transparent", color: "var(--orange)", fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
      >
        {showPassword ? "Hide email sign-in" : "Or sign in with email"}
      </button>

      {showPassword ? (
        <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 340, display: "grid", gap: 10 }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} autoComplete="username" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} autoComplete="current-password" />
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "var(--text)", fontWeight: 600, lineHeight: 1.4 }}>
            <input
              type="checkbox"
              checked={staySignedIn}
              onChange={(e) => setStaySignedIn(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>Stay signed in on this device for {MESSAGING_STAY_SIGNED_IN_DAYS} days</span>
          </label>
          {error ? <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div> : null}
          <button type="submit" disabled={busy} style={{ border: "none", background: "var(--orange)", color: "#fff", padding: "12px", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : error ? (
        <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>
      ) : null}
    </div>
  )
}

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  fontSize: 15,
  color: "var(--text)",
  background: "#fff",
}
