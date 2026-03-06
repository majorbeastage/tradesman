import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { DEV_USER_ID } from "../../core/dev"
import { theme } from "../../styles/theme"

type CustomerIdentifier = { type: string; value: string; is_primary: boolean }
type CustomerRow = { display_name: string | null; customer_identifiers: CustomerIdentifier[] | null }
type LeadRow = {
  id: string
  title: string | null
  created_at?: string
  customers: CustomerRow | null
}

export default function LeadsPage() {
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])

  // New lead form state
  const [customerName, setCustomerName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [leadTitle, setLeadTitle] = useState("")
  const [leadDescription, setLeadDescription] = useState("")
  const [initialMessage, setInitialMessage] = useState("")

  async function loadLeads() {
    if (!supabase) {
      console.error("Supabase not configured. Add .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }
    const { data, error } = await supabase
      .from("leads")
      .select(`
        id,
        title,
        created_at,
        customers (
          display_name,
          customer_identifiers (
            type,
            value,
            is_primary
          )
        )
      `)
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setLeads((data as any[]) || [])
  }

  useEffect(() => {
    loadLeads()
  }, [])

  async function openLead(leadId: string) {
    setSelectedLeadId(leadId)
    if (!supabase) return

    const { data, error } = await supabase
      .from("leads")
      .select(`
        id,
        title,
        description,
        customer_id,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        )
      `)
      .eq("id", leadId)
      .single()

    if (error) {
      console.error(error)
      return
    }

    setSelectedLead(data)

    const { data: convo } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", data.customer_id)
      .single()

    if (convo) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: true })

      setMessages(msgs || [])
    } else {
      setMessages([])
    }
  }

  async function createLeadFlow() {
    if (!supabase) {
      alert("Supabase not configured. Add .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }
    setLoading(true)
    try {
      // 1) Create Customer
      const displayName =
        customerName.trim() ||
        (phone.trim() ? `Unknown (${phone.trim()})` : "Unknown")

      const { data: customer, error: customerErr } = await supabase
        .from("customers")
        .insert({
          user_id: DEV_USER_ID,
          display_name: displayName,
          notes: null,
        })
        .select("id")
        .single()

      if (customerErr) throw customerErr

      const customerId = customer.id as string

      // 2) Add identifiers (optional)
      const identifiers: Array<{ type: string; value: string; is_primary: boolean }> = []

      if (phone.trim()) identifiers.push({ type: "phone", value: phone.trim(), is_primary: true })
      if (email.trim()) identifiers.push({ type: "email", value: email.trim(), is_primary: identifiers.length === 0 })
      if (customerName.trim()) identifiers.push({ type: "name", value: customerName.trim(), is_primary: false })

      if (identifiers.length > 0) {
        const { error: identErr } = await supabase
          .from("customer_identifiers")
          .insert(
            identifiers.map((i) => ({
              user_id: DEV_USER_ID,
              customer_id: customerId,
              type: i.type,
              value: i.value,
              is_primary: i.is_primary,
              verified: false,
            }))
          )

        if (identErr) throw identErr
      }

      // 3) Create Conversation (required toolbox)
      const { data: convo, error: convoErr } = await supabase
        .from("conversations")
        .insert({
          user_id: DEV_USER_ID,
          customer_id: customerId,
          channel: "sms",
          status: "open",
        })
        .select("id")
        .single()

      if (convoErr) throw convoErr
      const conversationId = convo.id as string

      // 4) Add first message (optional but great for demo)
      const firstMsg = initialMessage.trim() || leadDescription.trim() || "New lead received."
      const { data: msg, error: msgErr } = await supabase
        .from("messages")
        .insert({
          user_id: DEV_USER_ID,
          conversation_id: conversationId,
          sender: "customer",
          content: firstMsg,
          metadata: {},
        })
        .select("id")
        .single()

      if (msgErr) throw msgErr

      const messageId = msg.id as string

      // 5) Create Lead
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          user_id: DEV_USER_ID,
          customer_id: customerId,
          status_id: null, // we'll set this once we seed lead_status per user in-app
          title: leadTitle.trim() || "New Lead",
          description: leadDescription.trim() || null,
          estimated_value: null,
        })
        .select("id")
        .single()

      if (leadErr) throw leadErr

      // 6) Log Activities (simple + useful)
      const { error: actErr } = await supabase.from("activities").insert([
        {
          user_id: DEV_USER_ID,
          customer_id: customerId,
          type: "lead_created",
          reference_table: "leads",
          reference_id: lead.id,
          summary: `Job description: ${leadTitle.trim() || "New"}`,
          metadata: {},
        },
        {
          user_id: DEV_USER_ID,
          customer_id: customerId,
          type: "conversation_created",
          reference_table: "conversations",
          reference_id: conversationId,
          summary: "Conversation created",
          metadata: { channel: "sms" },
        },
        {
          user_id: DEV_USER_ID,
          customer_id: customerId,
          type: "message_received",
          reference_table: "messages",
          reference_id: messageId,
          summary: "Initial message received",
          metadata: { preview: firstMsg.slice(0, 120) },
        },
      ])

      if (actErr) throw actErr

      // 7) Refresh list + clear form
      await loadLeads()
      setCustomerName("")
      setPhone("")
      setEmail("")
      setLeadTitle("")
      setLeadDescription("")
      setInitialMessage("")

      setShowForm(false)
      alert("✅ Lead created (and customer + conversation).")
    } catch (err: any) {
      console.error(err)
      const msg = err?.message ?? err?.error_description ?? String(err)
      alert(`❌ Failed to create lead:\n\n${msg}\n\nIf you see "row-level security" or "policy", enable RLS policies in Supabase that allow insert (e.g. for anon or your user_id).`)
    } finally {
      setLoading(false)
    }
  }

  const filteredLeads = leads.filter((lead: any) => {
    const name = (lead.customers?.display_name || "").toLowerCase()
    const phone = lead.customers?.customer_identifiers
      ?.find((i: any) => i.type === "phone")?.value || ""
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    const matchesName = !searchLower || name.includes(searchLower)
    const matchesPhone = !phoneFilter || phone.includes(phoneFilter)
    return matchesName && matchesPhone
  })

  const sortedLeads = [...filteredLeads].sort((a: any, b: any) => {
    let aVal = ""
    let bVal = ""

    if (sortField === "name") {
      aVal = a.customers?.display_name || ""
      bVal = b.customers?.display_name || ""
    }

    if (sortField === "title") {
      aVal = (a.title || "").toLowerCase()
      bVal = (b.title || "").toLowerCase()
    }

    if (sortField === "created_at") {
      aVal = a.created_at || ""
      bVal = b.created_at || ""
    }

    if (sortAsc) {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })

  return (
    <div style={{ display: "flex", position: "relative" }}>
      <div>

        <h1>Leads</h1>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "16px"
      }}>

        <div style={{ display: "flex", gap: "10px" }}>

          <button
            onClick={() => setShowForm(true)}
            style={{
              background: "#F97316",
              color: "white",
              padding: "8px 14px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer"
            }}
          >
            + Create Lead
          </button>

          <button>
            Settings
          </button>

        </div>

      </div>

      {showForm && (

        <div
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            height: "100%",
            width: "400px",
            background: "white",
            borderLeft: "1px solid #ddd",
            padding: "20px",
            boxShadow: "-4px 0 10px rgba(0,0,0,0.1)"
          }}
        >

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "20px"
          }}>
            <h3>Create Lead</h3>

            <button onClick={() => setShowForm(false)}>
              ✕
            </button>
          </div>

          {/* YOUR EXISTING FORM GOES HERE */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Job description</label>
            <input placeholder="e.g. Roof Leak" value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} />
            <textarea placeholder="Lead description (optional)" value={leadDescription} onChange={(e) => setLeadDescription(e.target.value)} rows={3} />
            <textarea placeholder='Initial message (optional)' value={initialMessage} onChange={(e) => setInitialMessage(e.target.value)} rows={3} />
            <button onClick={createLeadFlow} disabled={loading}>{loading ? "Creating..." : "Create Lead"}</button>
            <button onClick={() => setShowForm(false)}>Cancel</button>
          </div>

        </div>

      )}

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
        alignItems: "center",
        marginBottom: "16px",
        padding: "12px",
        background: theme.charcoalSmoke,
        borderRadius: "8px",
        border: `1px solid ${theme.border}`
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Filter</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="By name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: "6px 10px", width: "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
            />
            <input
              type="text"
              placeholder="By phone..."
              value={filterPhone}
              onChange={(e) => setFilterPhone(e.target.value)}
              style={{ padding: "6px 10px", width: "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Sort by</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text, cursor: "pointer" }}
            >
              <option value="name">Name</option>
              <option value="title">Job Description</option>
              <option value="created_at">Date</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text, cursor: "pointer" }}
            >
              {sortAsc ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>
      </div>

      <table style={{
        width: "100%",
        borderCollapse: "collapse"
      }}>

        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th
              onClick={() => {
                setSortField("name")
                setSortAsc(!sortAsc)
              }}
              style={{ padding: "8px", cursor: "pointer" }}
            >
              Name
            </th>
            <th style={{ padding: "8px" }}>Phone</th>
            <th
              onClick={() => {
                setSortField("title")
                setSortAsc(!sortAsc)
              }}
              style={{ padding: "8px", cursor: "pointer" }}
            >
              Job Description
            </th>
            <th style={{ padding: "8px" }}>Last Message</th>
            <th
              onClick={() => {
                setSortField("created_at")
                setSortAsc(!sortAsc)
              }}
              style={{ padding: "8px", cursor: "pointer" }}
            >
              Last Update
            </th>
          </tr>
        </thead>

        <tbody>

          {sortedLeads.map((lead) => {
            const phone = lead.customers?.customer_identifiers
              ?.find((i: any) => i.type === "phone")?.value || ""
            return (
              <tr
                key={lead.id}
                onClick={() => openLead(lead.id)}
                style={{
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                  background:
                    selectedLeadId === lead.id ? "#f3f4f6" : "transparent"
                }}
              >
                <td style={{ padding: "8px" }}>{lead.customers?.display_name}</td>
                <td style={{ padding: "8px" }}>{phone}</td>
                <td style={{ padding: "8px" }}>{lead.title ?? "—"}</td>
                <td style={{ padding: "8px" }}>
                  {(lead.last_message || "").slice(0, 15)}
                </td>
                <td style={{ padding: "8px" }}>
                  {new Date(lead.created_at).toLocaleDateString()}
                </td>
              </tr>
            )
          })}

        </tbody>

      </table>

      {selectedLead && (

        <div
          style={{
            marginTop: "20px",
            padding: "20px",
            border: "1px solid #ddd",
            borderRadius: "6px"
          }}
        >

          <button
            onClick={() => {
              setSelectedLead(null)
              setSelectedLeadId(null)
            }}
            style={{ marginBottom: "16px" }}
          >
            ← Back to Leads
          </button>

          <h3>Lead Details</h3>

          <p>
            <strong>Customer:</strong>{" "}
            {selectedLead.customers?.display_name}
          </p>

          <p>
            <strong>Phone:</strong>{" "}
            {selectedLead.customers?.customer_identifiers
              ?.find((i:any)=>i.type==="phone")?.value || "—"}
          </p>

          <p>
            <strong>Job Description:</strong> {selectedLead.title}
          </p>

          <p>
            <strong>Message:</strong>{" "}
            {selectedLead.description || "—"}
          </p>

          <h3 style={{ marginTop: "24px" }}>Conversation</h3>

          <div style={{
            border: "1px solid #ddd",
            padding: "12px",
            borderRadius: "6px"
          }}>

            {messages.map((msg) => (

              <div key={msg.id} style={{ marginBottom: "10px" }}>

                <strong>
                  {msg.sender === "customer" ? "Customer" : "Contractor"}
                </strong>

                <p style={{ margin: 0 }}>
                  {msg.content}
                </p>

              </div>

            ))}

          </div>

        </div>

      )}

      </div>
    </div>
  )
}
