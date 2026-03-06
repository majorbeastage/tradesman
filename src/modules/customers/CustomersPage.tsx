import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([])

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

      <ul>
        {customers.map((c) => (
          <li key={c.id}>
            {c.display_name}
          </li>
        ))}
      </ul>

    </div>
  )
}
