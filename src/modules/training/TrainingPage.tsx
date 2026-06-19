import { useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { provisionSandboxAccount } from "../../lib/sandboxApi"

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
    setDone(true)
  }

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
          <strong>Not the 24-hour demo.</strong> The short demo blocks all communications. The training sandbox uses fake
          phone numbers and emails only — nothing goes to real customers — but the CRM behaves like production, including
          your public lead capture link.
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
                ? "Check your email for login details and your lead capture link."
                : "Your account was created. If email did not arrive, contact support or sign in if you already have the password."}
            </p>
            <button
              type="button"
              onClick={onLogin}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Go to sign in
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
              Work email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
            </label>
            {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
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
