import { theme } from "../styles/theme"
import logo from "../assets/logo.png"
import accountIcon from "../assets/MyT.png"
import { TAB_ID_LABELS } from "../types/portal-builder"

type SidebarProps = {
  setPage: (page: string) => void
  onOpenAccount?: () => void
  onLogout?: () => void
  /** When set, sidebar items are driven by portal config (admin-customizable). */
  portalTabs?: Array<{ tab_id: string; label: string | null }>
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

const DEFAULT_TABS = [
  "dashboard", "leads", "conversations", "quotes", "calendar",
  "customers", "web-support", "tech-support", "settings",
]

export default function Sidebar({ setPage, onOpenAccount, onLogout, portalTabs, isMobile = false, isOpen = true, onClose }: SidebarProps) {
  const itemStyle: React.CSSProperties = { cursor: "pointer", margin: "8px 0", color: theme.primary }
  const tabs = portalTabs && portalTabs.length > 0
    ? portalTabs
    : DEFAULT_TABS.map((tab_id) => ({ tab_id, label: TAB_ID_LABELS[tab_id] ?? tab_id }))

  const grainUrl =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/></filter><rect width="200" height="200" filter="url(#n)" opacity="0.07"/></svg>'
    )

  const sidebarBody = (
    <div
      style={{
        width: isMobile ? "min(86vw, 320px)" : "240px",
        background: theme.charcoalSmoke,
        backgroundImage: grainUrl,
        color: theme.primary,
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxSizing: "border-box"
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
        {tabs.map((t) => (
          <p key={t.tab_id} onClick={() => { setPage(t.tab_id); onClose?.() }} style={itemStyle}>
            {t.label ?? TAB_ID_LABELS[t.tab_id] ?? t.tab_id}
          </p>
        ))}
      </div>

      {onLogout && (
        <button
          type="button"
          onClick={() => { onLogout?.(); onClose?.() }}
          style={{
            marginTop: "auto",
            marginBottom: 8,
            padding: "8px 0",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: theme.primary,
            fontSize: 14,
            fontWeight: 500,
            textAlign: "left",
          }}
        >
          Log out
        </button>
      )}
      {onOpenAccount && (
        <button
          type="button"
          onClick={() => { onOpenAccount?.(); onClose?.() }}
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

  if (!isMobile) return sidebarBody
  if (!isOpen) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 9999,
          boxShadow: "0 18px 36px rgba(0,0,0,0.25)",
        }}
      >
        {sidebarBody}
      </div>
    </>
  )
}
