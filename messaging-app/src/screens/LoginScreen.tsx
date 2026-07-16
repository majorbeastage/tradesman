import { useState, type CSSProperties, type FormEvent } from "react"
import { supabase } from "../lib/supabaseClient"
import icon from "../assets/icon.png"

export default function LoginScreen() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 18 }}>
      <img src={icon} alt="Tradesman Messaging" width={96} height={96} style={{ borderRadius: 20, boxShadow: "0 10px 30px rgba(15,23,42,0.2)" }} />
      <h1 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>Tradesman Messaging</h1>
      <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 340, display: "grid", gap: 10 }}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
        {error ? <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div> : null}
        <button type="submit" disabled={busy} style={{ border: "none", background: "var(--orange)", color: "#fff", padding: "12px", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", maxWidth: 320 }}>
        If you opened this from the Tradesman app you&apos;ll be signed in automatically.
      </p>
    </div>
  )
}

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  fontSize: 15,
  color: "var(--text)",
}
