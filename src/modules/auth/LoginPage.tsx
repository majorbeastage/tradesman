import { useState, useEffect, useRef } from "react"
import { useAuth } from "../../contexts/AuthContext"
import type { UserRole } from "../../contexts/AuthContext"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"

type LoginType = "user" | "office_manager" | "admin"

type LoginPageProps = {
  /** Pre-selected login type (from home page). */
  loginType: LoginType
  onSuccess: (role: UserRole) => void
  onBack: () => void
}

export default function LoginPage({ loginType: initialLoginType, onSuccess, onBack }: LoginPageProps) {
  const { signIn, signUp, user, role } = useAuth()
  const [loginType, setLoginType] = useState<LoginType>(initialLoginType)
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const didRedirect = useRef(false)
  useEffect(() => {
    if (!user || !role || didRedirect.current) return
    didRedirect.current = true
    onSuccess(role)
  }, [user, role, onSuccess])

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
        else setMessage("Signing you in…")
      } else {
        const { error: err } = await signUp(email.trim(), password)
        if (err) setError(err.message)
        else setMessage("If your project requires email confirmation, check your inbox (and spam). Otherwise try signing in now.")
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

  const isAdminLogin = initialLoginType === "admin"

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.background }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: theme.primary, marginBottom: 16 }}
        >
          ← Back to home
        </button>
        <h1 style={{ margin: "0 0 8px", color: theme.text, fontSize: 22 }}>
          {isAdminLogin ? "Admin sign in" : mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p style={{ margin: "0 0 20px", color: theme.text, fontSize: 14, opacity: 0.8 }}>
          {isAdminLogin
            ? "Sign in with an admin account."
            : mode === "signin"
              ? "Use your email and password to access your data."
              : "Sign up to get your own workspace."}
        </p>

        {!isAdminLogin && mode === "signin" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ ...labelStyle, display: "block", marginBottom: 6 }}>Login as</label>
            <select
              value={loginType}
              onChange={(e) => setLoginType(e.target.value as LoginType)}
              style={{ ...inputStyle, marginTop: 0, marginBottom: 0 }}
            >
              <option value="user">User</option>
              <option value="office_manager">Office Manager</option>
            </select>
          </div>
        )}

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
        {mode === "signup" && !isAdminLogin && (
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
        {!isAdminLogin && (
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
        )}
      </form>
      </div>
      <CopyrightVersionFooter variant="default" align="center" style={{ paddingBottom: 20 }} />
    </div>
  )
}
