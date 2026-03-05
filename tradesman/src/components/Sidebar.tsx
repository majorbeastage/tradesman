export default function Sidebar({ setPage }: any) {
  return (
    <div style={{
      width: "240px",
      background: "#111827",
      color: "white",
      padding: "20px"
    }}>

      <h2>Tradesman</h2>

      <div style={{ marginTop: "30px" }}>

        <p onClick={() => setPage("dashboard")} style={{ cursor: "pointer" }}>
          Dashboard
        </p>

        <p onClick={() => setPage("customers")} style={{ cursor: "pointer" }}>
          Customers
        </p>

        <p>Conversations</p>
        <p>Leads</p>
        <p>Quotes</p>
        <p>Calendar</p>

      </div>

    </div>
  )
}
