import { theme } from "../../styles/theme"
import { SupportTicketForm } from "../../components/SupportTicketForm"
import { useGlobalAssistantOptional } from "../../contexts/GlobalAssistantContext"
import { useLocale } from "../../i18n/LocaleContext"

export default function TechSupportPage() {
  const { t } = useLocale()
  const globalAssistant = useGlobalAssistantOptional()

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: theme.text }}>Tradesman Help Desk</h1>
      <p style={{ color: "#475569", marginTop: 12, marginBottom: 24, lineHeight: 1.65 }}>
        Get instant answers with AI Chat, or submit a ticket and we&apos;ll get back to you.
      </p>

      <div
        style={{
          display: "grid",
          gap: 20,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          alignItems: "start",
        }}
      >
        {globalAssistant ? (
          <section
            style={{
              padding: 20,
              background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 55%)",
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: theme.text }}>{t("sidebar.aiChat")}</h2>
            <p style={{ margin: "0 0 16px", color: "#64748b", lineHeight: 1.6, fontSize: 14 }}>
              {t("helpDeskChat.subtitle")}. Ask where to go, how to change a setting, or what a feature does.
            </p>
            <button
              type="button"
              onClick={() => globalAssistant.openHelpDeskChat()}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {t("techSupport.openAiChat")}
            </button>
          </section>
        ) : null}

        <section
          style={{
            padding: 20,
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: theme.text }}>{t("techSupport.submitTicket")}</h2>
          <p style={{ margin: "0 0 16px", color: "#64748b", lineHeight: 1.6, fontSize: 14 }}>
            {t("techSupport.ticketHint")}
          </p>
          <SupportTicketForm type="tech" title="Submit a tech support ticket" />
        </section>
      </div>
    </div>
  )
}
