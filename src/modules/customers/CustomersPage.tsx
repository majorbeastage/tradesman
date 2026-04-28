import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import CustomerCallButton from "../../components/CustomerCallButton"
import { useIsMobile } from "../../hooks/useIsMobile"
import { consumeQueuedCustomerFocus } from "../../lib/customerNavigation"

type CustomerRow = {
  id: string
  display_name: string | null
  customer_identifiers?: { type: string; value: string }[] | null
}

export default function CustomersPage() {
  const userId = useScopedUserId()
  const isMobile = useIsMobile()
  const [activeCustomers, setActiveCustomers] = useState<CustomerRow[]>([])
  const [archivedCustomers, setArchivedCustomers] = useState<CustomerRow[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [section, setSection] = useState<"active" | "archived">("active")
  const [loadError, setLoadError] = useState<string>("")
  const [pendingFocusCustomerId, setPendingFocusCustomerId] = useState<string | null>(() => consumeQueuedCustomerFocus())

  async function loadCustomers() {
    if (!userId || !supabase) {
      if (!supabase) setLoadError("Supabase not configured.")
      return
    }
    setLoadError("")

    // 1) Active = has at least one non-removed, non-completed item (else customer shows in Archived)
    const activeIds = new Set<string>()

    const base = { user_id: userId }
    const addActive = (r: { data?: { customer_id?: string }[] | null; error?: { message?: string } | null }) => {
      if (!r.error && r.data) r.data.forEach((row) => row.customer_id && activeIds.add(row.customer_id))
    }

    let eventsRes = await supabase.from("calendar_events").select("customer_id").eq("user_id", base.user_id).is("removed_at", null).is("completed_at", null)
    if (eventsRes.error) {
      eventsRes = await supabase.from("calendar_events").select("customer_id").eq("user_id", base.user_id).is("removed_at", null)
    }
    addActive(eventsRes)

    const leadsRes = await supabase.from("leads").select("customer_id").eq("user_id", base.user_id).is("removed_at", null).is("converted_at", null)
    const leadsResFallback = leadsRes.error
      ? await supabase.from("leads").select("customer_id").eq("user_id", base.user_id).is("removed_at", null)
      : leadsRes
    addActive(leadsResFallback)

    const convosRes = await supabase.from("conversations").select("customer_id").eq("user_id", base.user_id).is("removed_at", null)
    addActive(convosRes)

    const quotesRes = await supabase.from("quotes").select("customer_id").eq("user_id", base.user_id).is("removed_at", null).is("scheduled_at", null)
    addActive(quotesRes)

    // 2) All customer IDs that appear in any of the four tabs (so we only show app customers)
    const allIds = new Set<string>()
    const [allLeads, allConvos, allQuotes, allEvents] = await Promise.all([
      supabase.from("leads").select("customer_id").eq("user_id", userId),
      supabase.from("conversations").select("customer_id").eq("user_id", userId),
      supabase.from("quotes").select("customer_id").eq("user_id", userId),
      supabase.from("calendar_events").select("customer_id").eq("user_id", userId),
    ])
    ;[allLeads.data, allConvos.data, allQuotes.data, allEvents.data].forEach((data) => {
      if (data) data.forEach((row: { customer_id?: string }) => row.customer_id && allIds.add(row.customer_id))
    })

    const idList = Array.from(allIds)
    if (idList.length === 0) {
      setActiveCustomers([])
      setArchivedCustomers([])
      return
    }

    const { data: customers, error } = await supabase
      .from("customers")
      .select(`
        id,
        display_name,
        customer_identifiers (
          type,
          value
        )
      `)
      .in("id", idList)

    if (error) {
      setLoadError(error.message)
      setActiveCustomers([])
      setArchivedCustomers([])
      return
    }

    const list = (customers || []) as CustomerRow[]
    const active = list.filter((c) => activeIds.has(c.id))
    const archived = list.filter((c) => !activeIds.has(c.id))
    setActiveCustomers(active)
    setArchivedCustomers(archived)
  }

  useEffect(() => {
    loadCustomers()
  }, [userId])

  useEffect(() => {
    if (!pendingFocusCustomerId) return
    const activeMatch = activeCustomers.find((c) => c.id === pendingFocusCustomerId)
    if (activeMatch) {
      setSection("active")
      setSelectedCustomer(activeMatch)
      setPendingFocusCustomerId(null)
      return
    }
    const archivedMatch = archivedCustomers.find((c) => c.id === pendingFocusCustomerId)
    if (archivedMatch) {
      setSection("archived")
      setSelectedCustomer(archivedMatch)
      setPendingFocusCustomerId(null)
    }
  }, [pendingFocusCustomerId, activeCustomers, archivedCustomers])

  const currentList = section === "active" ? activeCustomers : archivedCustomers
  const filtered = currentList.filter((c) => {
    const name = (c.display_name || "").toLowerCase()
    const phone = c.customer_identifiers?.find((i) => i.type === "phone")?.value || ""
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    return (!searchLower || name.includes(searchLower)) && (!phoneFilter || phone.includes(phoneFilter))
  })
  const sorted = [...filtered].sort((a, b) => {
    const aVal = sortField === "name" ? (a.display_name || "").toLowerCase() : (a.customer_identifiers?.find((i) => i.type === "phone")?.value || "")
    const bVal = sortField === "name" ? (b.display_name || "").toLowerCase() : (b.customer_identifiers?.find((i) => i.type === "phone")?.value || "")
    const cmp = aVal.localeCompare(bVal)
    return sortAsc ? cmp : -cmp
  })

  return (
    <div>
      <h1>Customers</h1>
      <p style={{ fontSize: "14px", color: "#cbd5e1", marginTop: "4px" }}>
        All customers from Leads, Conversations, Quotes, and Calendar. Active = has open work; Archived = everything removed or completed.
      </p>

      {!supabase && (
        <p style={{ color: "#b91c1c" }}>Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to tradesman/.env and restart the dev server.</p>
      )}

      {loadError && <p style={{ color: "#b91c1c", marginBottom: "12px" }}>{loadError}</p>}

      <button onClick={loadCustomers} style={{ marginTop: "8px", padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
        Refresh
      </button>

      <div style={{ display: "flex", gap: "16px", marginTop: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0" }}>Section</label>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button
              onClick={() => { setSection("active"); setSelectedCustomer(null) }}
              style={{ padding: "6px 12px", borderRadius: "6px", border: section === "active" ? `2px solid ${theme.primary}` : "1px solid #d1d5db", background: section === "active" ? "#eff6ff" : "white", cursor: "pointer", color: theme.text }}
            >
              Active
            </button>
            <button
              onClick={() => { setSection("archived"); setSelectedCustomer(null) }}
              style={{ padding: "6px 12px", borderRadius: "6px", border: section === "archived" ? `2px solid ${theme.primary}` : "1px solid #d1d5db", background: section === "archived" ? "#eff6ff" : "white", cursor: "pointer", color: theme.text }}
            >
              Archived
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0" }}>Filter</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="By name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", color: theme.text }}
            />
            <input
              type="text"
              placeholder="By phone..."
              value={filterPhone}
              onChange={(e) => setFilterPhone(e.target.value)}
              style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", color: theme.text }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0" }}>Sort by</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{ padding: "6px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", color: theme.text }}
            >
              <option value="name">Name</option>
              <option value="phone">Phone</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              style={{ padding: "6px 10px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}
            >
              {sortAsc ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ width: "100%", overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: isMobile ? "420px" : "100%", borderCollapse: "collapse", marginTop: "16px", border: "1px solid #ddd", borderRadius: "6px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd", background: "#f9fafb" }}>
            <th onClick={() => { setSortField("name"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>Name</th>
            <th onClick={() => { setSortField("phone"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>Phone</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={2} style={{ padding: "16px", color: "#6b7280" }}>
                {section === "active" ? "No active customers." : "No archived customers."}
              </td>
            </tr>
          ) : (
            sorted.map((c) => {
              const phone = c.customer_identifiers?.find((i) => i.type === "phone")?.value || "—"
              return (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  style={{
                    cursor: "pointer",
                    borderBottom: "1px solid #eee",
                    background: selectedCustomer?.id === c.id ? "#f3f4f6" : "transparent"
                  }}
                >
                  <td style={{ padding: "8px" }}>{c.display_name || "—"}</td>
                  <td style={{ padding: "8px" }}>{phone}</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
      </div>

      {selectedCustomer && (
        <div style={{ marginTop: "20px", padding: isMobile ? "16px" : "20px", border: "1px solid #ddd", borderRadius: "6px" }}>
          <button
            onClick={() => setSelectedCustomer(null)}
            style={{ marginBottom: "16px" }}
          >
            ← Back to list
          </button>
          <h3 style={{ marginTop: 0 }}>Customer</h3>
          <p><strong>Name:</strong> {selectedCustomer.display_name || "—"}</p>
          <div style={{ margin: "8px 0" }}>
            <strong>Phone:</strong>{" "}
            {(() => {
              const ph = selectedCustomer.customer_identifiers?.find((i) => i.type === "phone")?.value ?? ""
              return ph.trim() ? (
                <CustomerCallButton phone={ph} bridgeOwnerUserId={userId} compact />
              ) : (
                "—"
              )
            })()}
          </div>
          <p><strong>Email:</strong> {selectedCustomer.customer_identifiers?.find((i) => i.type === "email")?.value ?? "—"}</p>
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
