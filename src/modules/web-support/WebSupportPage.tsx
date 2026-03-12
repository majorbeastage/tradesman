import { theme } from "../../styles/theme"
import { SupportTicketForm } from "../../components/SupportTicketForm"

export default function WebSupportPage() {
  return (
    <div>
      <h1 style={{ color: theme.text }}>Web Support</h1>
      <p style={{ color: theme.text, marginTop: "12px", marginBottom: 24 }}>
        Submit a ticket and we’ll get back to you. Required: name, number, and email.
      </p>
      <SupportTicketForm type="web" title="Submit a web support ticket" />
    </div>
  )
}
