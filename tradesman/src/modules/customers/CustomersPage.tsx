import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([])

  async function loadCustomers() {
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
