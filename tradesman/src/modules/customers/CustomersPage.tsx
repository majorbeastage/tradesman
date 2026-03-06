import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")

  async function loadCustomers() {
    if (!supabase) {
      console.error("Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env")
      return
    }
    const { data, error } = await supabase
      .from("customers")
      .select("*")

    if (error) {
      console.error(error)
      return
    }

    setCustomers(data || [])
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  return (
    <div>

      <h1>Customers</h1>

      {!supabase && (
        <p style={{ color: "#b91c1c" }}>Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to tradesman/.env and restart the dev server.</p>
      )}

      <button onClick={loadCustomers}>
        Refresh
      </button>

      <div style={{ display: "flex", gap: "24px", marginTop: "16px" }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, minWidth: "200px" }}>
          {customers.map((c) => (
            <li
              key={c.id}
              onClick={() => setSelectedCustomer(c)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderBottom: "1px solid #eee",
                background: selectedCustomer?.id === c.id ? "#f3f4f6" : "transparent"
              }}
            >
              {c.display_name || "Unnamed"}
            </li>
          ))}
        </ul>

        {selectedCustomer && (
          <div style={{ flex: 1, padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
            <h3 style={{ marginTop: 0 }}>Customer</h3>
            <p><strong>Name:</strong> {selectedCustomer.display_name || "—"}</p>
            <button
              type="button"
              onClick={() => {
                setNotesCustomerId(selectedCustomer.id)
                setNotesCustomerName(selectedCustomer.display_name ?? "")
              }}
              style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
            >
              Notes
            </button>
          </div>
        )}
      </div>

      {notesCustomerId && (
        <CustomerNotesPanel
          customerId={notesCustomerId}
          customerName={notesCustomerName}
          onClose={() => { setNotesCustomerId(null); setNotesCustomerName("") }}
        />
      )}
    </div>
  )
}
