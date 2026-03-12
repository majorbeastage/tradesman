import { useState } from "react"
import { theme } from "../../styles/theme"

const DEMO_EMAILS = "joe@tradesman-us.com,justin@tradesman-us.com"

type DemoPageProps = {
  onBack: () => void
}

export default function DemoPage({ onBack }: DemoPageProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [preferredContact, setPreferredContact] = useState("email")
  const [description, setDescription] = useState("")
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const subject = encodeURIComponent(`Demo request from ${name || "Someone"}`)
    const body = encodeURIComponent(
      [
        "Demo / Contact request",
        "",
        "Name: " + (name || "—"),
        "Phone: " + (phone || "—"),
        "Email: " + (email || "—"),
        "Preferred contact method: " + preferredContact,
        "",
        "What they're looking for:",
        description || "(not provided)",
      ].join("\n")
    )
    window.location.href = `mailto:${DEMO_EMAILS}?subject=${subject}&body=${body}`
    setSubmitted(true)
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 400,
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
    <div style={{ minHeight: "100vh", background: theme.background }}>
      <header
        style={{
          padding: "16px 24px",
          background: "white",
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: theme.primary }}
        >
          ← Back to home
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
        <h1 style={{ color: theme.text, marginBottom: 8 }}>Dashboard preview</h1>
        <p style={{ color: theme.text, opacity: 0.8, marginBottom: 24 }}>
          Start a conversation to get in touch with our team.
        </p>

        {!showForm && !submitted && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              padding: "14px 24px",
              background: theme.primary,
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Start a conversation
          </button>
        )}

        {showForm && !submitted && (
          <form
            onSubmit={handleSubmit}
            style={{
              maxWidth: 440,
              padding: 24,
              background: "white",
              borderRadius: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ color: theme.text, fontSize: 18, marginBottom: 20 }}>Contact details</h2>
            <label style={labelStyle}>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="Your name"
              />
            </label>
            <label style={labelStyle}>
              Phone number
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
                placeholder="Phone number"
              />
            </label>
            <label style={labelStyle}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="you@example.com"
              />
            </label>
            <label style={labelStyle}>
              Preferred contact method
              <select
                value={preferredContact}
                onChange={(e) => setPreferredContact(e.target.value)}
                style={inputStyle}
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="either">Either</option>
              </select>
            </label>
            <label style={labelStyle}>
              What are you looking for?
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder="Describe what you're looking for..."
              />
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="submit"
                style={{
                  padding: "12px 20px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Submit and send email
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: "12px 20px",
                  background: "transparent",
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {submitted && (
          <div
            style={{
              maxWidth: 440,
              padding: 24,
              background: "#ecfdf5",
              border: "1px solid #10b981",
              borderRadius: 8,
              color: "#065f46",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>Thank you!</p>
            <p style={{ margin: "8px 0 0" }}>
              Your email client should open with a message addressed to our team. Please send that email to reach us. We'll be in touch ASAP.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
