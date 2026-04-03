import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { LEGAL_LINKS } from "../../lib/legalLinks"
import { theme } from "../../styles/theme"
import { PublicLegalNav } from "./PublicLegalNav"

const consentStatement =
  "By providing your mobile phone number and opting in, you agree to receive text messages from Tradesman regarding customer support, appointment coordination, job updates, account notifications, and service-related follow-up. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help."

const sampleMessage =
  "Tradesman: Thanks for contacting us. This is a customer support update regarding your request. Message frequency varies. Reply STOP to opt out, HELP for help."

export default function SmsConsentPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        padding: "24px 16px 48px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          display: "grid",
          gap: 18,
        }}
      >
        <div
          style={{
            background: theme.charcoalSmoke,
            color: "#fff",
            borderRadius: 16,
            padding: 24,
            border: `1px solid ${theme.charcoal}`,
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.8 }}>Tradesman</div>
          <h1 style={{ margin: "8px 0 10px", fontSize: 34, lineHeight: 1.1 }}>SMS Consent and Messaging Terms</h1>
          <p style={{ margin: 0, opacity: 0.9, maxWidth: 760 }}>
            This page describes how Tradesman collects SMS opt-in consent for customer support, appointment coordination, and service-related messaging tied to our business phone numbers, including verified toll-free messaging.
          </p>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
          <h2 style={{ margin: "0 0 10px", color: theme.text }}>Opt-In Method</h2>
          <p style={{ margin: "0 0 10px", color: "#4b5563" }}>
            Customers opt in to receive SMS messages from Tradesman by providing their phone number directly through one of the following channels and expressly consenting to receive messages:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#4b5563" }}>
            <li>Website contact, estimate request, or service request forms</li>
            <li>Direct customer intake during scheduling or support interactions</li>
            <li>Customer service conversations where the customer requests text follow-up</li>
          </ul>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
          <h2 style={{ margin: "0 0 10px", color: theme.text }}>Consent Language</h2>
          <div
            style={{
              background: "#f9fafb",
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: 16,
              color: "#374151",
              lineHeight: 1.65,
            }}
          >
            {consentStatement}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
          <h2 style={{ margin: "0 0 10px", color: theme.text }}>Use Case</h2>
          <p style={{ margin: "0 0 8px", color: "#4b5563" }}>
            Tradesman sends conversational and service-related messages only. Messaging may include:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#4b5563" }}>
            <li>Customer support follow-up</li>
            <li>Appointment reminders and coordination</li>
            <li>Job updates and service status messages</li>
            <li>Estimate, scheduling, and account-related notifications</li>
          </ul>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
          <h2 style={{ margin: "0 0 10px", color: theme.text }}>Sample Message</h2>
          <div
            style={{
              background: "#f9fafb",
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: 16,
              color: "#374151",
              lineHeight: 1.65,
            }}
          >
            {sampleMessage}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
          <h2 style={{ margin: "0 0 10px", color: theme.text }}>Help and Opt-Out</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#4b5563" }}>
            <li>Customers can reply `STOP` at any time to opt out of SMS messages.</li>
            <li>Customers can reply `HELP` for assistance.</li>
            <li>Message frequency varies based on the customer’s support, scheduling, and service activity.</li>
            <li>Message and data rates may apply.</li>
          </ul>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22 }}>
          <h2 style={{ margin: "0 0 10px", color: theme.text }}>Contact for Messaging Notifications</h2>
          <p style={{ margin: "0 0 6px", color: "#4b5563" }}>
            Notification and compliance contact email: <a href="mailto:Admin@tradesman-us.com">Admin@tradesman-us.com</a>
          </p>
          <p style={{ margin: 0, color: "#4b5563" }}>
            For support related to messaging, customers can also reply `HELP` or contact Tradesman through the business support channels listed on the main site.
          </p>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18 }}>
          <PublicLegalNav />
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6b7280" }}>
            For general privacy practices see{" "}
            <a href={LEGAL_LINKS.privacy} style={{ color: theme.primary, fontWeight: 600 }}>
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href={LEGAL_LINKS.terms} style={{ color: theme.primary, fontWeight: 600 }}>
              Terms &amp; Conditions
            </a>
            .
          </p>
        </div>
        <CopyrightVersionFooter variant="default" align="center" style={{ borderTop: "none", paddingTop: 8 }} />
      </div>
    </div>
  )
}
