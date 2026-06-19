import { useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { provisionSandboxAccount } from "../../lib/sandboxApi"
import { queueSandboxLogin } from "../../lib/sandboxLogin"

type TrainingPageProps = {
  onBack: () => void
  onLogin: () => void
}

export default function TrainingPage({ onBack, onLogin }: TrainingPageProps) {
  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("Demo Plumbing Co.")
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [emailed, setEmailed] = useState(false)
  const [sandboxPassword, setSandboxPassword] = useState("")
  const [embedSlug, setEmbedSlug] = useState("")
  const [seededCustomers, setSeededCustomers] = useState<number | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError("Name is required.")
      return
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Valid email is required.")
      return
    }
    setSubmitting(true)
    const result = await provisionSandboxAccount({
      email: email.trim(),
      name: name.trim(),
      businessName: businessName.trim(),
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? "Could not create sandbox.")
      return
    }
    setEmailed(result.emailed === true)
    setSandboxPassword(result.password ?? "")
    setEmbedSlug(result.embedSlug ?? "")
    setSeededCustomers(result.customerCount ?? null)
    setDone(true)
  }

  async function goToSandboxLogin() {
    setLoginBusy(true)
    setError(null)
    try {
      if (supabase) await supabase.auth.signOut()
      queueSandboxLogin(email.trim())
      onLogin()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out of your current session.")
    } finally {
      setLoginBusy(false)
    }
  }

  const ctaUrl =
    typeof window !== "undefined" && embedSlug
      ? `${window.location.origin}/cta/${encodeURIComponent(embedSlug)}`
      : ""

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: theme.text }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 48px" }}>
        <button
          type="button"
          onClick={onBack}
          style={{ border: "none", background: "transparent", color: theme.primary, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}
        >
          ← Back
        </button>

        <h1 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 800 }}>Training sandbox</h1>
        <p style={{ margin: "0 0 24px", lineHeight: 1.65, color: "#475569", fontSize: 15 }}>
          A full practice environment for your team — fictional customers, simulated texts and emails, and{" "}
          <strong>live incoming leads</strong> while you explore. Watch traffic move from web form → lead → customer →
          estimate → calendar, end to end.
        </p>

        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            marginBottom: 24,
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <strong>Use a different email</strong> from your live Tradesman account if you have one. After creating the
          sandbox, we sign you out of any current session so you can log in as the practice business — not your regular
          account.
        </div>

        {done ? (
          <div
            style={{
              padding: 20,
              borderRadius: 12,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Sandbox ready</h2>
            <p style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
              {emailed
                ? "We also emailed these details (check spam). Save the password below — you need it to sign in."
                : "Save the login below. Email may not have sent; use these credentials on the next screen."}
              {seededCustomers != null && seededCustomers > 0
                ? ` Sample customers (${seededCustomers}) are already loaded — after sign-in, use the blue training banner at the top to add more or change how often new ones arrive.`
                : " After sign-in, use the blue training banner at the top of the dashboard to load sample customers and control live incoming traffic."}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <label style={labelStyle}>
                Sandbox email
                <input readOnly value={email} onFocus={(e) => e.target.select()} style={inputStyle} />
              </label>
              {sandboxPassword ? (
                <label style={labelStyle}>
                  Temporary password
                  <input readOnly value={sandboxPassword} onFocus={(e) => e.target.select()} style={inputStyle} />
                </label>
              ) : null}
              {ctaUrl ? (
                <label style={labelStyle}>
                  Lead capture link (live during sandbox)
                  <input readOnly value={ctaUrl} onFocus={(e) => e.target.select()} style={inputStyle} />
                </label>
              ) : null}
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#166534", lineHeight: 1.5 }}>
              Click below to <strong>sign out of your regular account</strong> (if logged in) and open the login screen
              with this email prefilled. Paste the temporary password and sign in.
            </p>
            {error ? <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{error}</div> : null}
            <button
              type="button"
              disabled={loginBusy}
              onClick={() => void goToSandboxLogin()}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: loginBusy ? "#94a3b8" : theme.primary,
                color: "#fff",
                fontWeight: 700,
                cursor: loginBusy ? "wait" : "pointer",
              }}
            >
              {loginBusy ? "Signing out…" : "Sign out & open sandbox login"}
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={labelStyle}>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Practice business name
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Email for this sandbox (not your live account email)
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
            </label>
            {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
            {submitting ? (
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                Creating your sandbox… usually <strong>5–15 seconds</strong>. We email your login and lead-capture link when
                ready.
              </div>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "12px 18px",
                borderRadius: 8,
                border: "none",
                background: submitting ? "#94a3b8" : theme.primary,
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                cursor: submitting ? "wait" : "pointer",
              }}
            >
              {submitting ? "Creating sandbox…" : "Create training sandbox"}
            </button>
          </form>
        )}

        <CopyrightVersionFooter style={{ marginTop: 40 }} />
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontWeight: 600,
  fontSize: 13,
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  fontSize: 14,
}
