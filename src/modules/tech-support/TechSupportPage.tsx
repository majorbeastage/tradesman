import { theme } from "../../styles/theme"
import { SupportTicketForm } from "../../components/SupportTicketForm"

export default function TechSupportPage() {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb" }}>Tech Support</h1>
      <p style={{ color: "#e5e7eb", marginTop: 12, marginBottom: 20, lineHeight: 1.65 }}>
        Submit a ticket and we’ll get back to you. Required: name, number, and email.
      </p>
      <div
        style={{
          padding: 20,
          background: "#fff",
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          maxWidth: 480,
        }}
      >
        <SupportTicketForm type="tech" title="Submit a tech support ticket" />
      </div>
    </div>
  )
}
