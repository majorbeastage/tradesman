import { useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import { supabase } from "../../lib/supabase"
import { hintForSupportTicketsError } from "../../lib/supabaseTicketErrors"
import { notifyAdminSupportTicket } from "../../lib/notifyAdminSupportTicket"

const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonEnv = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

async function provisionDemoAccount(params: {
  email: string
  name: string
  businessName: string
  ticketId: string | null
}): Promise<{ ok: boolean; error?: string; alreadyGranted?: boolean; emailed?: boolean }> {
  if (!supabaseUrlEnv?.trim() || !supabaseAnonEnv?.trim()) {
    return { ok: false, error: "Demo service is not configured." }
  }
  const base = supabaseUrlEnv.replace(/\/$/, "")
  const res = await fetch(`${base}/functions/v1/provision-demo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonEnv}`,
      apikey: supabaseAnonEnv,
    },
    body: JSON.stringify({
      email: params.email.trim(),
      name: params.name.trim(),
      business_name: params.businessName.trim() || null,
      ticket_id: params.ticketId,
    }),
  })
  let json: { error?: string; alreadyGranted?: boolean; emailed?: boolean } = {}
  try {
    json = (await res.json()) as typeof json
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { ok: false, error: json.error ?? `Demo service error (${res.status})`, alreadyGranted: json.alreadyGranted }
  }
  return { ok: true, emailed: json.emailed === true }
}

type DemoPageProps = {
  onBack: () => void
}

export default function DemoPage({ onBack }: DemoPageProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [preferredContact, setPreferredContact] = useState("email")
  const [description, setDescription] = useState("")
  const [summaryTitle, setSummaryTitle] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demoLoginSent, setDemoLoginSent] = useState(false)
  const [demoProvisionError, setDemoProvisionError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError("Name is required.")
      return
    }
    if (!email.trim() && !phone.trim()) {
      setError("Please provide an email or a phone number so we can reach you.")
      return
    }
    if (!supabase) {
      setError("Database not configured. Run supabase-support-tickets.sql and support-tickets-trouble-system.sql.")
      return
    }
    setSubmitting(true)
    const resolvedTitle =
      summaryTitle.trim() ||
      (description.trim() ? description.trim().slice(0, 120) + (description.trim().length > 120 ? "…" : "") : "Demo request")

    const { data, error: insertError } = await supabase
      .from("support_tickets")
      .insert({
        type: "demo",
        name: name.trim(),
        business_name: businessName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        title: resolvedTitle,
        preferred_contact: preferredContact,
        message: description.trim() || null,
      })
      .select("id, ticket_number")
      .single()

    if (!insertError && data?.id) {
      const noteBody = [
        "Request a demo submission",
        "",
        `Preferred contact: ${preferredContact}`,
        "",
        description.trim() || "(No details provided)",
      ].join("\n")
      await supabase.from("support_ticket_notes").insert({
        ticket_id: data.id,
        body: noteBody,
        author_label: "public:demo",
      })
    }

    setSubmitting(false)
    if (insertError) {
      setError(hintForSupportTicketsError(insertError.message))
      return
    }
    setTicketNumber(data?.ticket_number ?? null)
    setSubmitted(true)
    if (data?.id) void notifyAdminSupportTicket(data.id)

    if (email.trim()) {
      const demo = await provisionDemoAccount({
        email: email.trim(),
        name: name.trim(),
        businessName: businessName.trim(),
        ticketId: data?.id ?? null,
      })
      if (demo.ok && demo.emailed) {
        setDemoLoginSent(true)
      } else if (demo.ok && !demo.emailed) {
        setDemoProvisionError(
          "Your demo account was created but we could not email the login details. Contact support or try again later.",
        )
      } else if (demo.alreadyGranted) {
        setDemoProvisionError(demo.error ?? "Demo already granted for this email.")
      } else {
        setDemoProvisionError(demo.error ?? "Could not send demo login email.")
      }
    }
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
    <div style={{ minHeight: "100vh", background: theme.background, display: "flex", flexDirection: "column" }}>
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

      <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, flex: 1 }}>
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
            onSubmit={(e) => void handleSubmit(e)}
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
              Name <span style={{ color: theme.primary }}>*</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="Your name"
                required
              />
            </label>
            <label style={labelStyle}>
              Business name (optional)
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                style={inputStyle}
                placeholder="Company name"
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
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: -8, marginBottom: 16 }}>
              Provide at least one of email or phone.
            </p>
            <label style={labelStyle}>
              Short title / summary (optional)
              <input
                type="text"
                value={summaryTitle}
                onChange={(e) => setSummaryTitle(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Demo for roofing office"
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
            {error && (
              <p style={{ color: "#b91c1c", fontSize: 14, marginBottom: 8, whiteSpace: "pre-line", lineHeight: 1.5 }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: "12px 20px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: submitting ? "wait" : "pointer",
                }}
              >
                {submitting ? "Submitting…" : "Submit request"}
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
            {ticketNumber && (
              <p style={{ margin: "8px 0 0" }}>
                Your request is ticket <strong>{ticketNumber}</strong>. Our team will see it in the admin Trouble tickets tab.
              </p>
            )}
            {!ticketNumber && (
              <p style={{ margin: "8px 0 0" }}>We received your request.</p>
            )}
            {demoLoginSent ? (
              <p style={{ margin: "12px 0 0", lineHeight: 1.55 }}>
                We emailed a <strong>24-hour Office Manager demo login</strong> to {email.trim()}. On the home page,
                choose <strong>Office Manager Login</strong>, then sign in with the email and temporary password we sent.
                Demo accounts cannot send or receive live texts, emails, or phone calls.
              </p>
            ) : null}
            {demoProvisionError ? (
              <p style={{ margin: "12px 0 0", color: "#92400e", lineHeight: 1.55 }}>{demoProvisionError}</p>
            ) : null}
          </div>
        )}
      </div>
      <CopyrightVersionFooter variant="default" align="center" style={{ paddingBottom: 20 }} />
    </div>
  )
}
