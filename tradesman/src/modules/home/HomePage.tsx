import { theme } from "../../styles/theme"
import logo from "../../assets/logo.png"

type HomePageProps = {
  onLogin: () => void
  onOfficeManagerLogin: () => void
  onAdminLogin: () => void
  onRequestDemo: () => void
}

export default function HomePage({ onLogin, onOfficeManagerLogin, onAdminLogin, onRequestDemo }: HomePageProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: theme.background,
        position: "relative",
      }}
    >
      {/* Admin Login - top right, discreet */}
      <button
        type="button"
        onClick={onAdminLogin}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          padding: "6px 12px",
          background: "transparent",
          border: `1px solid ${theme.border}`,
          borderRadius: 6,
          fontSize: 12,
          color: theme.text,
          opacity: 0.7,
          cursor: "pointer",
        }}
      >
        Admin Login
      </button>

      {/* Logo */}
      <img
        src={logo}
        alt="Tradesman"
        style={{ maxWidth: 280, width: "100%", marginBottom: 48 }}
      />

      {/* Two main buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", width: "100%", maxWidth: 280 }}>
        <button
          type="button"
          onClick={onLogin}
          style={{
            width: "100%",
            padding: "14px 24px",
            background: theme.primary,
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          User Login
        </button>
        <button
          type="button"
          onClick={onOfficeManagerLogin}
          style={{
            width: "100%",
            padding: "14px 24px",
            background: theme.charcoal,
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Office Manager Login
        </button>
        <button
          type="button"
          onClick={onRequestDemo}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: "transparent",
            color: theme.text,
            border: `2px solid ${theme.primary}`,
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            marginTop: 24,
          }}
        >
          Request a demo
        </button>
      </div>
    </div>
  )
}
