import { theme } from "../../styles/theme"
import logo from "../../assets/logo.png"

type HomePageProps = {
  onLogin: () => void
  onOfficeManagerLogin: () => void
  onAdminLogin: () => void
  onRequestDemo: () => void
}

export default function HomePage({ onLogin, onOfficeManagerLogin, onAdminLogin, onRequestDemo }: HomePageProps) {
  const year = new Date().getFullYear()

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
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src={logo}
              alt="Tradesman"
              style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 8 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 800, letterSpacing: -0.2, fontSize: 18, color: theme.text }}>Tradesman</span>
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
            <h1
              style={{
                margin: 0,
                fontSize: 40,
                lineHeight: 1.05,
                letterSpacing: -0.6,
                color: theme.charcoal,
              }}
            >
              Run your pipeline.
              <br />
              Schedule with confidence.
            </h1>
            <p
              style={{
                margin: "12px 0 18px",
                color: theme.text,
                opacity: 0.85,
                fontSize: 15,
                lineHeight: 1.6,
              }}
            >
              Tradesman helps contractors manage leads, conversations, quotes, and calendar scheduling in one clean workspace.
              Configure recurring events, keep histories together, and move faster from first contact to booked job.
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
                onClick={onRequestDemo}
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
                Request a demo
              </button>
            </div>

            <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[
                { k: "Recurring jobs", v: "Materialized series with instance vs series removal." },
                { k: "Centralized history", v: "Conversations stay attached to the right customer." },
                { k: "Cleaner workflow", v: "A single place to go from lead to booked calendar." },
              ].map((x) => (
                <div
                  key={x.k}
                  style={{
                    flex: "1 1 240px",
                    minWidth: 220,
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: "rgba(255,255,255,0.7)",
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, color: theme.charcoal, fontSize: 13, marginBottom: 6 }}>
                    {x.k}
                  </div>
                  <div style={{ color: theme.text, opacity: 0.8, fontSize: 12, lineHeight: 1.5 }}>
                    {x.v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "white",
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <span style={{ fontWeight: 900, color: theme.charcoal, fontSize: 14 }}>Built for speed</span>
              <span style={{ fontSize: 12, color: theme.primary, fontWeight: 800 }}>Tradesman</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { t: "Leads", d: "Capture, track, and convert leads without jumping between tools." },
                { t: "Quotes", d: "Send quotes to calendar and keep customer communications connected." },
                { t: "Calendar", d: "Create one-time and recurring events with configurable durations." },
                { t: "Conversations", d: "Review messages and notes in a clean, searchable flow." },
              ].map((card) => (
                <div
                  key={card.t}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    padding: 12,
                    background: "rgba(249,115,22,0.03)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontWeight: 900, color: theme.charcoal, fontSize: 13 }}>{card.t}</span>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: theme.primary, flexShrink: 0 }} />
                  </div>
                  <p style={{ margin: "8px 0 0", color: theme.text, opacity: 0.85, fontSize: 12, lineHeight: 1.55 }}>
                    {card.d}
                  </p>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 14,
                border: `2px solid rgba(249,115,22,0.35)`,
                background: "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(249,115,22,0.03))",
              }}
            >
              <div style={{ fontWeight: 900, color: theme.charcoal, fontSize: 13, marginBottom: 6 }}>
                Want to see it in action?
              </div>
              <div style={{ color: theme.text, opacity: 0.85, fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                Request a short demo and we will walk through leads, quotes, scheduling, and recurring jobs.
              </div>
              <button
                type="button"
                onClick={onRequestDemo}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: theme.primary,
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Request a demo
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ color: theme.text, opacity: 0.7, fontSize: 12 }}>
              © {year} Tradesman. All rights reserved.
            </div>
            <div style={{ color: theme.text, opacity: 0.7, fontSize: 12 }}>
              Designed for desktop and mobile web.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
