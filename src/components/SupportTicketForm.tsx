import { useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"

type TicketType = "web" | "tech"

const supportEmails: Record<TicketType, string> = {
  web: "Admin@tradesman-us.com",
  tech: "Admin@tradesman-us.com",
}

type Props = {
  type: TicketType
  title: string
}

export function SupportTicketForm({ type, title }: Props) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recipient = supportEmails[type]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setError("Name, number, and email are required.")
      return
    }
    if (!supabase) {
      setError("Database not configured. Run supabase-support-tickets.sql in Supabase.")
      return
    }
    setSubmitting(true)
    const { data, error: insertError } = await supabase
      .from("support_tickets")
      .insert({
        type,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        message: message.trim() || null,
      })
      .select("ticket_number")
      .single()

    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    const num = data?.ticket_number ?? null
    setTicketNumber(num)
  }

  function openMailto() {
    if (!ticketNumber || !recipient) return
    const subject = encodeURIComponent(`Support Ticket #${ticketNumber}`)
    const body = encodeURIComponent(
      [
        `Ticket: ${ticketNumber}`,
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Email: ${email}`,
        "",
        message.trim() || "(No message)",
      ].join("\n")
    )
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`
  }

  const formStyle: React.CSSProperties = {
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  }
  const labelStyle: React.CSSProperties = {
    color: theme.text,
    fontWeight: 600,
    fontSize: 14,
  }
  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    fontSize: 14,
    color: theme.text,
  }

  if (ticketNumber) {
    return (
      <div style={{ maxWidth: 420 }}>
        <p style={{ color: theme.text, marginBottom: 12 }}>
          Ticket <strong>{ticketNumber}</strong> has been created.
        </p>
        <p style={{ color: theme.text, marginBottom: 12 }}>
          Open your email client to send the details to {recipient}:
        </p>
        <button
          type="button"
          onClick={openMailto}
          style={{
            padding: "10px 16px",
            background: theme.primary,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Email support ({recipient})
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ color: theme.text, marginBottom: 16 }}>{title}</h2>
      <form onSubmit={handleSubmit} style={formStyle}>
        <label style={labelStyle}>
          Name <span style={{ color: theme.primary }}>*</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ ...inputStyle, width: "100%", marginTop: 4, display: "block" }}
            placeholder="Your name"
          />
        </label>
        <label style={labelStyle}>
          Number <span style={{ color: theme.primary }}>*</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            style={{ ...inputStyle, width: "100%", marginTop: 4, display: "block" }}
            placeholder="Phone number"
          />
        </label>
        <label style={labelStyle}>
          Email <span style={{ color: theme.primary }}>*</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ ...inputStyle, width: "100%", marginTop: 4, display: "block" }}
            placeholder="your@email.com"
          />
        </label>
        <label style={labelStyle}>
          Message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            style={{
              ...inputStyle,
              width: "100%",
              marginTop: 4,
              display: "block",
              resize: "vertical",
            }}
            placeholder="Describe your issue or question..."
          />
        </label>
        {error && (
          <p style={{ color: "#B91C1C", fontSize: 14 }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 16px",
            background: theme.primary,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Submitting…" : "Submit ticket"}
        </button>
      </form>
    </div>
  )
}
