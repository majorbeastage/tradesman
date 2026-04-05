import { useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { hintForSupportTicketsError } from "../lib/supabaseTicketErrors"
import { TRADESMAN_TECH_SUPPORT_EMAIL } from "../constants/supportLinks"

type TicketType = "web" | "tech"

const supportEmails: Record<TicketType, string> = {
  web: TRADESMAN_TECH_SUPPORT_EMAIL,
  tech: TRADESMAN_TECH_SUPPORT_EMAIL,
}

type Props = {
  type: TicketType
  title: string
}

export function SupportTicketForm({ type, title }: Props) {
  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [summaryTitle, setSummaryTitle] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)
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
      setError("Database not configured. Run supabase-support-tickets.sql and support-tickets-trouble-system.sql in Supabase.")
      return
    }
    setSubmitting(true)
    const resolvedTitle =
      summaryTitle.trim() ||
      (message.trim() ? message.trim().slice(0, 120) + (message.trim().length > 120 ? "…" : "") : `${type === "tech" ? "Tech" : "Web"} support request`)

    const { data, error: insertError } = await supabase
      .from("support_tickets")
      .insert({
        type,
        name: name.trim(),
        business_name: businessName.trim() || null,
        phone: phone.trim(),
        email: email.trim(),
        title: resolvedTitle,
        message: message.trim() || null,
      })
      .select("id, ticket_number")
      .single()

    if (!insertError && data?.id) {
      const bodyText = message.trim() || "(No additional message)"
      await supabase.from("support_ticket_notes").insert({
        ticket_id: data.id,
        body: bodyText,
        author_label: `portal:${type}`,
      })
    }

    setSubmitting(false)
    if (insertError) {
      setError(hintForSupportTicketsError(insertError.message))
      return
    }
    const num = data?.ticket_number ?? null
    setTicketNumber(num)
    setTicketId(data?.id ?? null)
  }

  function openMailto() {
    if (!ticketNumber || !recipient) return
    const subject = encodeURIComponent(`Support Ticket #${ticketNumber}`)
    const body = encodeURIComponent(
      [
        `Ticket: ${ticketNumber}`,
        `Name: ${name}`,
        `Business: ${businessName || "—"}`,
        `Phone: ${phone}`,
        `Email: ${email}`,
        `Title: ${summaryTitle || "—"}`,
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
          Ticket <strong>{ticketNumber}</strong> has been created and appears in the admin <strong>Trouble tickets</strong> tab.
        </p>
        {ticketId && (
          <p style={{ color: theme.text, opacity: 0.85, marginBottom: 12, fontSize: 13 }}>
            Your message is saved as the first note on this ticket.
          </p>
        )}
        <p style={{ color: theme.text, marginBottom: 12 }}>
          Optionally open your email client to send a copy to {recipient}:
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
      <form onSubmit={(e) => void handleSubmit(e)} style={formStyle}>
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
          Business name (optional)
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 4, display: "block" }}
            placeholder="Company or DBA"
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
          Short title / summary (optional)
          <input
            type="text"
            value={summaryTitle}
            onChange={(e) => setSummaryTitle(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 4, display: "block" }}
            placeholder="e.g. Cannot log in on mobile"
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
          <p style={{ color: "#B91C1C", fontSize: 14, whiteSpace: "pre-line", lineHeight: 1.5 }}>{error}</p>
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
