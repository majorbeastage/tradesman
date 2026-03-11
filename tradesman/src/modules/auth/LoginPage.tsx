import { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!email.trim()) {
      setError("Email is required.")
      return
    }
    if (!password) {
      setError("Password is required.")
      return
    }
    if (mode === "signup") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.")
        return
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.")
        return
      }
    }
    setSubmitting(true)
    try {
      if (mode === "signin") {
        const { error: err } = await signIn(email.trim(), password)
        if (err) setError(err.message)
      } else {
        const { error: err } = await signUp(email.trim(), password)
        if (err) setError(err.message)
        else setMessage("Check your email to confirm your account, then sign in.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const formStyle: React.CSSProperties = {
    maxWidth: 360,
    margin: "0 auto",
    padding: 24,
    background: "white",
    borderRadius: 8,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  }
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    marginTop: 4,
    marginBottom: 16,
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    fontSize: 14,
    boxSizing: "border-box",
  }
  const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: 14, color: theme.text }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme.background }}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <h1 style={{ margin: "0 0 8px", color: theme.text, fontSize: 22 }}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p style={{ margin: "0 0 20px", color: theme.text, fontSize: 14, opacity: 0.8 }}>
          {mode === "signin" ? "Use your email and password to access your data." : "Sign up to get your own workspace."}
        </p>
        <label style={labelStyle}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={inputStyle}
            placeholder="you@example.com"
          />
        </label>
        <label style={labelStyle}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            style={inputStyle}
            placeholder="••••••••"
          />
        </label>
        {mode === "signup" && (
          <label style={labelStyle}>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
              placeholder="••••••••"
            />
          </label>
        )}
        {error && <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 12px" }}>{error}</p>}
        {message && <p style={{ color: "#059669", fontSize: 14, margin: "0 0 12px" }}>{message}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "12px",
            background: theme.primary,
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 14,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <p style={{ marginTop: 16, fontSize: 14, color: theme.text }}>
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button type="button" onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontWeight: 600 }}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => setMode("signin")} style={{ background: "none", border: "none", color: theme.primary, cursor: "pointer", fontWeight: 600 }}>
                Sign in
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  )
}
