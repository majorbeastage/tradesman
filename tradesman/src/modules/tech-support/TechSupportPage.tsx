import { theme } from "../../styles/theme"
import { SupportTicketForm } from "../../components/SupportTicketForm"

export default function TechSupportPage() {
  return (
    <div>
      <h1 style={{ color: theme.text }}>Tech Support</h1>
      <p style={{ color: theme.text, marginTop: "12px", marginBottom: 24 }}>
        Submit a ticket and we’ll get back to you. Required: name, number, and email.
      </p>
      <SupportTicketForm type="tech" title="Submit a tech support ticket" />
    </div>
  )
}
