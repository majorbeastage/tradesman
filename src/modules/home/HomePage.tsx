import { useEffect, useState } from "react"
import { CopyrightVersionFooter } from "../../components/CopyrightVersionFooter"
import { theme } from "../../styles/theme"
import logo from "../../assets/logo.png"

type HomePageProps = {
  onLogin: () => void
  onOfficeManagerLogin: () => void
  onAdminLogin: () => void
  onSignup: () => void
  onAboutUs: () => void
  onRequestDemo: () => void
}

const FEATURES: { id: string; title: string; body: string }[] = [
  {
    id: "clean",
    title: "Clean Workflow",
    body: "A single tool to manage all new and existing clients, for the lifespan of a job or working relationship.",
  },
  {
    id: "automation",
    title: "Automation tools",
    body: "We utilize multiple AI services and/or pre-determined options, to generate as many automation options as possible for your office requirements.",
  },
  {
    id: "leads",
    title: "Create and Manage Leads",
    body: "Manage existing and new organic customer acquisitions, as well as AI powered new lead capturing. Fully customizable opportunities to meet your needs and expectations.",
  },
  {
    id: "comms",
    title: "Organized Communications",
    body: "Client communications from Phone Calls, Missed Calls, Voicemails, Text Messages and Emails are all neatly catalogued in your Conversations Tab.",
  },
  {
    id: "quotes",
    title: "Quotes/Estimates/Scheduling",
    body: "Seamlessly progress Leads and client Conversations to receive pre-established or patterned quotes and estimates, potentially using AI to determine customer intent and automatically schedule based off your preferences, or manually schedule using our customized Calendar.",
  },
  {
    id: "history",
    title: "Centralized History",
    body: "Don't lose a Client. We keep your past jobs archived in your inventory. Anytime you receive repeat business, simply review the readily available notes from your previous job with that client.",
  },
  {
    id: "custom",
    title: "Fully Customizable",
    body: "We are very confident that Tradesman will meet all of your office management needs. We believe this because we focus on offering as many options and customizations as possible, to fit into your business's specific needs.",
  },
]

export default function HomePage({ onLogin, onOfficeManagerLogin, onAdminLogin, onSignup, onAboutUs, onRequestDemo }: HomePageProps) {
  const [supportsHover, setSupportsHover] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)")
    const update = () => setSupportsHover(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        position: "relative",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(700px 340px at 20% 0%, rgba(249,115,22,0.18), rgba(249,115,22,0) 60%), radial-gradient(640px 280px at 90% 20%, rgba(31,41,51,0.10), rgba(31,41,51,0) 60%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 1100,
          margin: "0 auto",
          padding: "18px 18px 44px",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 800, letterSpacing: -0.2, fontSize: 20, color: theme.text }}>Tradesman</span>
              <span style={{ fontSize: 12, color: theme.text, opacity: 0.7 }}>Leads • Quotes • Scheduling</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onAdminLogin}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: theme.text,
              opacity: 0.85,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Admin Login
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 18,
            alignItems: "start",
          }}
        >
          <div>
            <img
              src={logo}
              alt="Tradesman"
              style={{
                display: "block",
                width: "100%",
                maxWidth: 420,
                height: "auto",
                objectFit: "contain",
                marginBottom: 16,
              }}
            />
            <p
              style={{
                margin: "0 0 18px",
                color: theme.text,
                opacity: 0.9,
                fontSize: 15,
                lineHeight: 1.65,
              }}
            >
              Tradesman is a powerful, automated and fully customizable Office Management tool. We are 2 proud United States Veterans, who developed this platform to help contractors like you take back your time, focus on your customers, and grow your business without the headache of juggling an office. We are very excited to offer you the opportunity to join our platform, and we look forward to being able to assist you Focus, Manage and Grow your business into further success.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                type="button"
                onClick={onLogin}
                style={{
                  padding: "14px 22px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                User Login
              </button>
              <button
                type="button"
                onClick={onOfficeManagerLogin}
                style={{
                  padding: "14px 22px",
                  background: theme.charcoal,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                Office Manager Login
              </button>
              <button
                type="button"
                onClick={onSignup}
                style={{
                  padding: "12px 20px",
                  background: "transparent",
                  color: theme.text,
                  border: `2px solid ${theme.primary}`,
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Sign up
              </button>
            </div>
          </div>

          <div
            style={{
              background: "white",
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              padding: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 8,
                padding: "0 4px",
              }}
            >
              <span style={{ fontWeight: 900, color: theme.charcoal, fontSize: 13 }}>Platform highlights</span>
              <span style={{ fontSize: 11, color: theme.primary, fontWeight: 800 }}>Hover or tap</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FEATURES.map((f) => {
                const expanded =
                  (supportsHover && hoverId === f.id) ||
                  (supportsHover && hoverId === null && pinnedId === f.id) ||
                  (!supportsHover && pinnedId === f.id)
                return (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setPinnedId((p) => (p === f.id ? null : f.id))
                      }
                    }}
                    onMouseEnter={() => supportsHover && setHoverId(f.id)}
                    onMouseLeave={() => supportsHover && setHoverId(null)}
                    onClick={() => setPinnedId((p) => (p === f.id ? null : f.id))}
                    style={{
                      padding: "7px 9px",
                      borderRadius: 8,
                      border: `1px solid ${expanded ? theme.primary : theme.border}`,
                      cursor: "pointer",
                      background: expanded ? "rgba(249,115,22,0.09)" : "rgba(249,115,22,0.03)",
                      transform: expanded ? "scale(1.02)" : "scale(1)",
                      transition: "transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                      boxShadow: expanded ? "0 10px 28px rgba(31,41,51,0.12)" : "none",
                      position: "relative",
                      zIndex: expanded ? 2 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 800, color: theme.charcoal, fontSize: 12, lineHeight: 1.35 }}>{f.title}</span>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: theme.primary,
                          flexShrink: 0,
                          marginTop: 4,
                          opacity: expanded ? 1 : 0.65,
                          transition: "opacity 0.2s ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        marginTop: expanded ? 6 : 0,
                        fontSize: 11,
                        lineHeight: 1.5,
                        color: theme.text,
                        maxHeight: expanded ? 560 : 0,
                        opacity: expanded ? 1 : 0,
                        overflow: "hidden",
                        transition: "max-height 0.35s ease, opacity 0.28s ease, margin-top 0.2s ease",
                      }}
                    >
                      {f.body}
                    </div>
                  </div>
                )
              })}
            </div>

            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                border: `2px solid rgba(249,115,22,0.35)`,
                background: "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(249,115,22,0.03))",
              }}
            >
              <div style={{ fontWeight: 900, color: theme.charcoal, fontSize: 12, marginBottom: 4 }}>
                Want to see it in action?
              </div>
              <div style={{ color: theme.text, opacity: 0.85, fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
                Request a demo and we will walk you through how Tradesman can fit your office.
              </div>
              <button
                type="button"
                onClick={onRequestDemo}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Request a demo
              </button>
              <button
                type="button"
                onClick={onAboutUs}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "10px 12px",
                  background: "transparent",
                  color: theme.charcoal,
                  border: `2px solid ${theme.border}`,
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                About Us
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <CopyrightVersionFooter variant="default" style={{ borderTop: "none", paddingTop: 0, paddingBottom: 0, marginTop: 0 }} />
            <div style={{ color: theme.text, opacity: 0.7, fontSize: 12, paddingBottom: 2 }}>
              Designed for desktop and mobile web.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
