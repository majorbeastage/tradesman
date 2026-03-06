import { theme } from "../styles/theme"

export default function Sidebar({ setPage }: any) {
  const itemStyle: React.CSSProperties = { cursor: "pointer", margin: "8px 0", color: theme.primary }
  const headerStyle = { color: theme.primary }

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
      }}
    >
      <h2 style={headerStyle}>Tradesman</h2>

      <div style={{ marginTop: "30px" }}>
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
        <p onClick={() => setPage("toolboxes")} style={itemStyle}>Toolboxes</p>
        <p onClick={() => setPage("settings")} style={itemStyle}>Settings</p>
      </div>
    </div>
  )
}
