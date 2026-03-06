import { theme } from "../styles/theme"
import logo from "../assets/logo.png"
import accountIcon from "../assets/MyT.png"

export default function Sidebar({ setPage, onOpenAccount }: any) {
  const itemStyle: React.CSSProperties = { cursor: "pointer", margin: "8px 0", color: theme.primary }

  const grainUrl =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/></filter><rect width="200" height="200" filter="url(#n)" opacity="0.07"/></svg>'
    )

  return (
    <div
      style={{
        width: "240px",
        background: theme.charcoalSmoke,
        backgroundImage: grainUrl,
        color: theme.primary,
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        height: "100vh"
      }}
    >
      <style>{`
        @keyframes logoGlowPulse {
          0%, 100% { opacity: 0.45; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.85; transform: translate(-50%, -50%) scale(1.12); }
        }
        .logo-glow-wrapper {
          position: relative;
          display: block;
          width: 100%;
        }
        .logo-glow-wrapper .logo-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 85%;
          height: 85%;
          transform: translate(-50%, -50%);
          background: ${theme.primary};
          border-radius: 8px;
          filter: blur(22px);
          z-index: 0;
          animation: logoGlowPulse 2.5s ease-in-out infinite;
          pointer-events: none;
        }
        .logo-glow-wrapper img {
          position: relative;
          z-index: 1;
        }
      `}</style>
      <div className="logo-glow-wrapper">
        <div className="logo-glow" aria-hidden />
        <img src={logo} alt="Tradesman" style={{ maxHeight: "128px", width: "100%", maxWidth: "240px", display: "block" }} />
      </div>

      <div style={{ marginTop: "30px", flex: 1 }}>
        <p onClick={() => setPage("dashboard")} style={itemStyle}>Dashboard</p>
        <p onClick={() => setPage("leads")} style={itemStyle}>Leads</p>
        <p onClick={() => setPage("conversations")} style={itemStyle}>Conversations</p>
        <p onClick={() => setPage("quotes")} style={itemStyle}>Quotes</p>
        <p onClick={() => setPage("calendar")} style={itemStyle}>Calendar</p>

        <div
          style={{
            margin: "16px 0",
            borderTop: `1px solid ${theme.primary}`
          }}
        />

        <p onClick={() => setPage("customers")} style={itemStyle}>Customers</p>
        <p onClick={() => setPage("web-support")} style={itemStyle}>Web Support</p>
        <p onClick={() => setPage("tech-support")} style={itemStyle}>Tech Support</p>
        <p onClick={() => setPage("settings")} style={itemStyle}>Settings</p>
      </div>

      {onOpenAccount && (
        <button
          type="button"
          onClick={onOpenAccount}
          style={{
            marginTop: "auto",
            marginBottom: "24px",
            padding: "4px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            alignSelf: "flex-start"
          }}
          title="Account & Profile"
        >
          <img src={accountIcon} alt="Account" style={{ width: "52px", height: "36px", display: "block", objectFit: "contain" }} />
        </button>
      )}
    </div>
  )
}
