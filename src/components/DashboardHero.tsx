import type { CSSProperties, ReactNode } from "react"

type Copy = {
  welcomeTitle: string
  welcomeBody1: string
  welcomeBody2: string
  pipelineKicker: string
  pipelineTitle: string
  pipelineSub: string
  commKicker: string
  commTitle: string
  commSub: string
  scheduleKicker: string
  scheduleTitle: string
  scheduleSub: string
}

type Props = {
  isMobile: boolean
  copy: Copy
  /** Single spotlight card (Estimate Tools–only subscription); omits comm & scheduling cards. */
  layout?: "three_cards" | "estimate_tools_only"
}

function IconPipeline({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 18h4v-5H4v5zm6 0h4V9h-4v9zm6 0h4V5h-4v13z"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 7h6M9 12h3" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
    </svg>
  )
}

function IconChat({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 10h8M8 14h5"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M6 18l-2 3V7a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H6z"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconCalendar({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke={color} strokeWidth="1.75" />
      <path d="M8 3v4M16 3v4M4 11h16" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="9" cy="15" r="1.25" fill={color} />
      <circle cx="15" cy="15" r="1.25" fill={color} opacity="0.45" />
    </svg>
  )
}

function FeatureCard({
  kicker,
  title,
  sub,
  icon,
  accent,
}: {
  kicker: string
  title: string
  sub: string
  icon: ReactNode
  accent: string
}) {
  const wrap: CSSProperties = {
    position: "relative",
    borderRadius: 14,
    padding: "18px 18px 20px",
    background: "linear-gradient(155deg, rgba(51, 65, 85, 0.55) 0%, rgba(30, 41, 59, 0.72) 100%)",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 26px rgba(15,23,42,0.2)",
    overflow: "hidden",
  }
  return (
    <article style={wrap}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          borderRadius: "14px 0 0 14px",
          background: `linear-gradient(180deg, ${accent}, ${accent}99)`,
          opacity: 0.95,
        }}
      />
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", paddingLeft: 6 }}>
        <div
          style={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(145deg, ${accent}22, rgba(15,23,42,0.5))`,
            border: `1px solid ${accent}44`,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {kicker}
          </p>
          <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#f8fafc", letterSpacing: -0.02, lineHeight: 1.25 }}>
            {title}
          </h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#cbd5e1" }}>{sub}</p>
        </div>
      </div>
    </article>
  )
}

export default function DashboardHero({ isMobile, copy, layout = "three_cards" }: Props) {
  const outer: CSSProperties = {
    maxWidth: 1100,
    margin: "0 auto 20px",
    borderRadius: 18,
    overflow: "hidden",
    border: "1px solid rgba(249, 115, 22, 0.28)",
    background: "linear-gradient(135deg, rgba(71, 85, 105, 0.5) 0%, rgba(51, 65, 85, 0.8) 56%, rgba(30, 41, 59, 0.9) 100%)",
    boxShadow: "0 14px 34px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
  }

  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: isMobile ? 12 : 14,
    padding: isMobile ? "14px 14px 18px" : "16px 18px 22px",
    borderTop: "1px solid rgba(148, 163, 184, 0.12)",
    background: "linear-gradient(180deg, rgba(51,65,85,0.18) 0%, rgba(30,41,59,0.4) 100%)",
  }

  const orange = "#fb923c"
  const sky = "#38bdf8"
  const violet = "#a78bfa"

  return (
    <section style={outer} aria-labelledby="dashboard-welcome-heading">
      <div style={{ padding: isMobile ? "20px 18px 16px" : "24px 22px 18px" }}>
        <h2 id="dashboard-welcome-heading" style={{ margin: "0 0 10px", fontSize: isMobile ? 22 : 26, fontWeight: 800, color: "#fff" }}>
          {copy.welcomeTitle}
        </h2>
        <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "#e2e8f0", maxWidth: 720 }}>
          {copy.welcomeBody1}
        </p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "#94a3b8", maxWidth: 720 }}>{copy.welcomeBody2}</p>
      </div>
      <div style={grid}>
        <FeatureCard
          kicker={copy.pipelineKicker}
          title={copy.pipelineTitle}
          sub={copy.pipelineSub}
          accent={orange}
          icon={<IconPipeline color={orange} />}
        />
        {layout === "three_cards" ? (
          <>
            <FeatureCard
              kicker={copy.commKicker}
              title={copy.commTitle}
              sub={copy.commSub}
              accent={sky}
              icon={<IconChat color={sky} />}
            />
            <FeatureCard
              kicker={copy.scheduleKicker}
              title={copy.scheduleTitle}
              sub={copy.scheduleSub}
              accent={violet}
              icon={<IconCalendar color={violet} />}
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
