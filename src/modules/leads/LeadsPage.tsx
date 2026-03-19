import { useEffect, useState, useMemo } from "react"
import { supabase } from "../../lib/supabase"
import { usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import { getLeadsSettingsItemsForUser, getCustomActionButtonsForUser } from "../../types/portal-builder"
import type { PortalSettingItem } from "../../types/portal-builder"

type CustomerIdentifier = { type: string; value: string; is_primary: boolean }
type CustomerRow = { display_name: string | null; customer_identifiers: CustomerIdentifier[] | null }
type LeadRow = {
  id: string
  title: string | null
  created_at?: string
  description?: string | null
  last_message?: string | null
  customers: CustomerRow | null
}

type LeadsPageProps = { setPage?: (page: string) => void }

export default function LeadsPage({ setPage }: LeadsPageProps) {
  const userId = useScopedUserId()
  const portalConfig = usePortalConfigForPage()
  const [showForm, setShowForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")

  const leadsSettingsItems = useMemo(() => getLeadsSettingsItemsForUser(portalConfig), [portalConfig])
  const customActionButtons = useMemo(() => getCustomActionButtonsForUser(portalConfig, "leads"), [portalConfig])

  useEffect(() => {
    if (!showSettings || leadsSettingsItems.length === 0) return
    const next: Record<string, string> = {}
    leadsSettingsItems.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setSettingsFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [showSettings, leadsSettingsItems])

  function setSettingValue(itemId: string, value: string) {
    setSettingsFormValues((prev) => ({ ...prev, [itemId]: value }))
  }

  function isSettingItemVisible(item: PortalSettingItem, items: PortalSettingItem[], formValues: Record<string, string>): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = items.find((i) => i.id === depId)
    let depValue = formValues[depId] ?? ""
    if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
    return depValue === item.dependency.showWhenValue
  }

  useEffect(() => {
    if (!openCustomButtonId) return
    const btn = customActionButtons.find((b) => b.id === openCustomButtonId)
    if (!btn?.items?.length) return
    const next: Record<string, string> = {}
    btn.items.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setCustomButtonFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [openCustomButtonId, customActionButtons])

  // New lead form state
  const [customerName, setCustomerName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [leadTitle, setLeadTitle] = useState("")
  const [leadDescription, setLeadDescription] = useState("")
  const [initialMessage, setInitialMessage] = useState("")

  async function loadLeads() {
    if (!userId || !supabase) {
      if (!supabase) console.error("Supabase not configured. Add .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }
    const selectFull = "id, title, description, created_at, customer_id, user_id, converted_at, removed_at"
    const selectMinimal = "id, title, description, created_at, customer_id"
    const resFull = await supabase.from("leads").select(selectFull).order("created_at", { ascending: false })
    let rawData: any[] = []
    if (resFull.error) {
      const resMin = await supabase.from("leads").select(selectMinimal).order("created_at", { ascending: false })
      if (resMin.error) {
        console.error("loadLeads error:", resMin.error.message)
        setLeads([])
        return
      }
      rawData = resMin.data || []
    } else {
      rawData = resFull.data || []
    }

    const raw = rawData as any[]
    const rows = raw
      .filter((r) => {
        if (r.user_id != null && r.user_id !== userId) return false
        if (r.converted_at != null) return false
        if (r.removed_at != null) return false
        return true
      })
      .map((r) => ({
        ...r,
        user_id: r.user_id ?? null,
        converted_at: r.converted_at ?? null,
        removed_at: r.removed_at ?? null,
        customers: r.customers ?? { display_name: null, customer_identifiers: null },
      }))

    const customerIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))]
    if (customerIds.length > 0) {
      const { data: custData } = await supabase
        .from("customers")
        .select("id, display_name, customer_identifiers(type, value, is_primary)")
        .in("id", customerIds)
      const custMap = new Map((custData || []).map((c: any) => [c.id, c]))
      rows.forEach((r: any) => {
        if (r.customer_id && custMap.has(r.customer_id)) r.customers = custMap.get(r.customer_id)
      })
    }

    setLeads(rows)
  }

  useEffect(() => {
    loadLeads()
  }, [userId])

  async function moveLeadToConversations() {
    if (!supabase || !selectedLead?.id) return
    const customerId = selectedLead.customer_id ?? selectedLead.customers?.id
    if (!customerId) {
      alert("No customer linked to this lead.")
      return
    }
    const { error: convoErr } = await supabase
      .from("conversations")
      .insert({
        user_id: userId,
        customer_id: customerId,
        channel: "sms",
        status: "open",
      })
    if (convoErr) {
      alert("Could not create conversation: " + convoErr.message)
      return
    }
    const { error } = await supabase
      .from("leads")
      .update({ converted_at: new Date().toISOString() })
      .eq("id", selectedLead.id)
      .eq("user_id", userId)
    if (error) {
      alert("Lead moved to Conversations but could not mark as converted: " + error.message)
    }
    setLeads((prev) => prev.filter((l: any) => l.id !== selectedLead.id))
    setSelectedLead(null)
    setSelectedLeadId(null)
    setMessages([])
    if (setPage) setPage("conversations")
  }

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
      let customerId: string | null = null

      // If phone or email provided, reuse existing customer with that identifier (avoids unique_identifier_per_user violation)
      if (phone.trim() || email.trim()) {
        if (phone.trim()) {
          const { data: byPhone } = await supabase.from("customer_identifiers").select("customer_id").eq("user_id", userId).eq("type", "phone").eq("value", phone.trim()).limit(1).maybeSingle()
          if (byPhone?.customer_id) customerId = byPhone.customer_id as string
        }
        if (!customerId && email.trim()) {
          const { data: byEmail } = await supabase.from("customer_identifiers").select("customer_id").eq("user_id", userId).eq("type", "email").eq("value", email.trim()).limit(1).maybeSingle()
          if (byEmail?.customer_id) customerId = byEmail.customer_id as string
        }
      }

      if (!customerId) {
        // 1) Create new customer
        const displayName =
          customerName.trim() ||
          (phone.trim() ? `Unknown (${phone.trim()})` : "Unknown")

        const { data: customer, error: customerErr } = await supabase
          .from("customers")
          .insert({
            user_id: userId,
            display_name: displayName,
            notes: null,
          })
          .select("id")
          .single()

        if (customerErr) throw customerErr
        customerId = customer.id as string

        // 2) Add identifiers only for new customer (avoids duplicate key on same phone/email per user)
        const identifiers: Array<{ type: string; value: string; is_primary: boolean }> = []

        if (phone.trim()) identifiers.push({ type: "phone", value: phone.trim(), is_primary: true })
        if (email.trim()) identifiers.push({ type: "email", value: email.trim(), is_primary: identifiers.length === 0 })
        if (customerName.trim()) identifiers.push({ type: "name", value: customerName.trim(), is_primary: false })

        if (identifiers.length > 0) {
          const { error: identErr } = await supabase
            .from("customer_identifiers")
            .insert(
              identifiers.map((i) => ({
                user_id: userId,
                customer_id: customerId,
                type: i.type,
                value: i.value,
                is_primary: i.is_primary,
                verified: false,
              }))
            )

          if (identErr) throw identErr
        }
      }

      if (!customerId) throw new Error("Could not resolve or create customer.")

      // 3) Create Lead (sends to Leads box only; no conversation)
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          user_id: userId,
          customer_id: customerId,
          status_id: null, // we'll set this once we seed lead_status per user in-app
          title: leadTitle.trim() || "New Lead",
          description: leadDescription.trim() || null,
          estimated_value: null,
        })
        .select("id")
        .single()

      if (leadErr) throw leadErr

      // 4) Log activity (non-blocking)
      void supabase.from("activities").insert({
        user_id: userId,
        customer_id: customerId,
        type: "lead_created",
        reference_table: "leads",
        reference_id: lead.id,
        summary: `Job description: ${leadTitle.trim() || "New"}`,
        metadata: {},
      })

      const displayName = customerName.trim() || (phone.trim() ? `Unknown (${phone.trim()})` : "Unknown")
      const newLeadRow = {
        id: lead.id,
        title: leadTitle.trim() || "New Lead",
        description: leadDescription.trim() || null,
        created_at: new Date().toISOString(),
        customer_id: customerId,
        converted_at: null,
        removed_at: null,
        customers: { display_name: displayName, customer_identifiers: [{ type: "phone", value: phone.trim(), is_primary: true }].filter((x) => x.value) },
      }

      setLeads((prev) => [newLeadRow as any, ...prev])
      setCustomerName("")
      setPhone("")
      setEmail("")
      setLeadTitle("")
      setLeadDescription("")
      setInitialMessage("")
      setShowForm(false)
      if (setPage) setPage("leads")
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

          <button
            onClick={() => setShowSettings(true)}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
              color: theme.text
            }}
          >
            Settings
          </button>
          {customActionButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setOpenCustomButtonId(btn.id)}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                background: "white",
                cursor: "pointer",
                color: theme.text
              }}
            >
              {btn.label}
            </button>
          ))}

        </div>

      </div>

      {showForm && (
        <>
          <div
            onClick={() => setShowForm(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 9998
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: "480px",
              maxHeight: "90vh",
              overflow: "auto",
              background: "white",
              borderRadius: "8px",
              padding: "24px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              zIndex: 9999
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0 }}>Create Lead</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ ...theme.formInput }} />
              <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...theme.formInput }} />
              <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...theme.formInput }} />
              <label style={{ fontSize: "12px", fontWeight: 600, color: theme.text }}>Job description</label>
              <input placeholder="e.g. Roof Leak" value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} style={{ ...theme.formInput }} />
              <textarea placeholder="Lead description (optional)" value={leadDescription} onChange={(e) => setLeadDescription(e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} />
              <textarea placeholder='Initial message (optional)' value={initialMessage} onChange={(e) => setInitialMessage(e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} />
              <button onClick={createLeadFlow} disabled={loading} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                {loading ? "Creating..." : "Create Lead"}
              </button>
              <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {showSettings && (
        <>
          <div
            onClick={() => setShowSettings(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 9998
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: "480px",
              background: "white",
              borderRadius: "8px",
              padding: "24px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              zIndex: 9999
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>Leads Settings</h3>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: theme.text }}>
              {leadsSettingsItems.length === 0 && (
                <p style={{ fontSize: "14px", color: theme.text, opacity: 0.8 }}>No settings configured. Your admin can add items in the portal config.</p>
              )}
              {leadsSettingsItems.map((item) => {
                if (!isSettingItemVisible(item, leadsSettingsItems, settingsFormValues)) return null
                if (item.type === "checkbox") {
                  const checked = settingsFormValues[item.id] === "checked"
                  return (
                    <div key={item.id}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: theme.text, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setSettingValue(item.id, e.target.checked ? "checked" : "unchecked")}
                        />
                        <span>{item.label}</span>
                      </label>
                    </div>
                  )
                }
                if (item.type === "dropdown" && item.options?.length) {
                  const value = settingsFormValues[item.id] ?? item.options[0]
                  return (
                    <div key={item.id}>
                      <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "6px" }}>{item.label}</label>
                      <select
                        value={value}
                        onChange={(e) => setSettingValue(item.id, e.target.value)}
                        style={{ ...theme.formInput }}
                      >
                        {item.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )
                }
                if (item.type === "custom_field") {
                  const value = settingsFormValues[item.id] ?? ""
                  const isTextarea = item.customFieldSubtype === "textarea"
                  return (
                    <div key={item.id}>
                      <label style={{ fontSize: "14px", fontWeight: 600, color: theme.text, display: "block", marginBottom: "6px" }}>{item.label}</label>
                      {isTextarea ? (
                        <textarea
                          value={value}
                          onChange={(e) => setSettingValue(item.id, e.target.value)}
                          rows={3}
                          style={{ ...theme.formInput, resize: "vertical" }}
                        />
                      ) : (
                        <input
                          value={value}
                          onChange={(e) => setSettingValue(item.id, e.target.value)}
                          style={{ ...theme.formInput }}
                        />
                      )}
                    </div>
                  )
                }
                return null
              })}
            </div>
            <button
              onClick={() => setShowSettings(false)}
              style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer", fontWeight: 600 }}
            >
              Done
            </button>
          </div>
        </>
      )}

      {openCustomButtonId && (() => {
        const btn = customActionButtons.find((b) => b.id === openCustomButtonId)
        if (!btn) return null
        const items = btn.items ?? []
        const formValues = customButtonFormValues
        const setFormValue = (itemId: string, value: string) =>
          setCustomButtonFormValues((prev) => ({ ...prev, [itemId]: value }))
        return (
          <>
            <div onClick={() => setOpenCustomButtonId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "90%",
                maxWidth: "480px",
                maxHeight: "90vh",
                overflow: "auto",
                background: "white",
                borderRadius: "8px",
                padding: "24px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                zIndex: 9999
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>{btn.label}</h3>
                <button onClick={() => setOpenCustomButtonId(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: theme.text }}>
                {items.length === 0 && <p style={{ fontSize: "14px", opacity: 0.8 }}>No options configured.</p>}
                {items.map((item) => {
                  if (!isSettingItemVisible(item, items, formValues)) return null
                  if (item.type === "checkbox") {
                    const checked = formValues[item.id] === "checked"
                    return (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={(e) => setFormValue(item.id, e.target.checked ? "checked" : "unchecked")} />
                        <span>{item.label}</span>
                      </label>
                    )
                  }
                  if (item.type === "dropdown" && item.options?.length) {
                    const value = formValues[item.id] ?? item.options[0]
                    return (
                      <div key={item.id}>
                        <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                        <select value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }}>
                          {item.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    )
                  }
                  if (item.type === "custom_field") {
                    const value = formValues[item.id] ?? ""
                    const isTextarea = item.customFieldSubtype === "textarea"
                    return (
                      <div key={item.id}>
                        <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                        {isTextarea ? (
                          <textarea value={value} onChange={(e) => setFormValue(item.id, e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} />
                        ) : (
                          <input value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }} />
                        )}
                      </div>
                    )
                  }
                  return null
                })}
              </div>
              <button onClick={() => setOpenCustomButtonId(null)} style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer", fontWeight: 600 }}>Done</button>
            </div>
          </>
        )
      })()}

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
              style={{ ...theme.formInput, padding: "6px 10px", width: "160px" }}
            />
            <input
              type="text"
              placeholder="By phone..."
              value={filterPhone}
              onChange={(e) => setFilterPhone(e.target.value)}
              style={{ ...theme.formInput, padding: "6px 10px", width: "160px" }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Sort by</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{ ...theme.formInput, padding: "6px 10px", cursor: "pointer" }}
            >
              <option value="name">Name</option>
              <option value="title">Job Description</option>
              <option value="created_at">Date</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              style={{ ...theme.formInput, padding: "6px 10px", cursor: "pointer" }}
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
                  {(lead.last_message ?? lead.description ?? "").slice(0, 15) || "—"}
                </td>
                <td style={{ padding: "8px" }}>
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "—"}
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
            {" "}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setNotesCustomerId(selectedLead.customer_id ?? null)
                setNotesCustomerName(selectedLead.customers?.display_name ?? "")
              }}
              style={{ marginLeft: "8px", padding: "4px 10px", fontSize: "12px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
            >
              Notes
            </button>
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

          <button
            onClick={moveLeadToConversations}
            style={{
              marginTop: "24px",
              padding: "10px 16px",
              background: theme.primary,
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Add Lead to my Conversations
          </button>

          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={async () => {
                if (!supabase || !selectedLead?.id) return
                if (!confirm("Remove this lead? It can be recalled from Customers later.")) return
                const { error } = await supabase.from("leads").update({ removed_at: new Date().toISOString() }).eq("id", selectedLead.id)
                if (error) { alert(error.message); return }
                setSelectedLead(null)
                setSelectedLeadId(null)
                loadLeads()
              }}
              style={{ padding: "8px 14px", borderRadius: "6px", background: "#b91c1c", color: "white", border: "none", cursor: "pointer", fontSize: "14px" }}
            >
              Remove
            </button>
          </div>

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
    </div>
  )
}
