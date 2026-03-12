import { useState } from "react"
import AppLayout from "../../layout/AppLayout"
import CustomersPage from "../customers/CustomersPage"
import LeadsPage from "../leads/LeadsPage"
import ConversationsPage from "../conversations/ConversationsPage"
import QuotesPage from "../quotes/QuotesPage"
import CalendarPage from "../calendar/CalendarPage"
import WebSupportPage from "../web-support/WebSupportPage"
import TechSupportPage from "../tech-support/TechSupportPage"
import { theme } from "../../styles/theme"

/**
 * Office Manager portal: same dashboard options as main app,
 * plus (to be built) control over other users' settings and calendars.
 */
export default function OfficeManagerApp() {
  const [page, setPage] = useState("dashboard")

  return (
    <AppLayout setPage={setPage}>
      {page === "dashboard" && (
        <>
          <h1 style={{ color: theme.text }}>Office Manager</h1>
          <p style={{ color: theme.text, marginTop: 12 }}>
            Full dashboard access. User and calendar management for your clients will appear here.
          </p>
          <div style={{ maxWidth: "720px", marginTop: "24px", padding: "24px", background: "var(--charcoal-smoke, #1f2937)", border: "1px solid var(--border, #374151)", borderRadius: "8px", lineHeight: 1.6, color: "var(--text, #e5e7eb)" }}>
            <p style={{ margin: "0 0 1em" }}>
              Thank you for visiting our company. We are committed to assisting contractors and small businesses in their day to day operations.
            </p>
          </div>
        </>
      )}
      {page === "customers" && <CustomersPage />}
      {page === "leads" && <LeadsPage setPage={setPage} />}
      {page === "conversations" && <ConversationsPage setPage={setPage} />}
      {page === "quotes" && <QuotesPage setPage={setPage} />}
      {page === "calendar" && <CalendarPage />}
      {page === "web-support" && <WebSupportPage />}
      {page === "tech-support" && <TechSupportPage />}
    </AppLayout>
  )
}
