import { useEffect, useState, useMemo } from "react"
import { supabase } from "../../lib/supabase"
import { usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import PortalSettingsModal from "../../components/PortalSettingsModal"
import { getControlItemsForUser, getCustomActionButtonsForUser } from "../../types/portal-builder"
import type { PortalSettingItem } from "../../types/portal-builder"

type CustomerIdentifier = { type: string; value: string; is_primary?: boolean }
type CustomerRow = { display_name: string | null; customer_identifiers: CustomerIdentifier[] | null }
type MessageRow = { content: string | null; created_at: string | null }
type ConversationRow = {
  id: string
  channel: string | null
  status: string | null
  created_at?: string
  customers: CustomerRow | null
  messages?: MessageRow[] | null
}

type ConversationsPageProps = { setPage?: (page: string) => void }

export default function ConversationsPage({ setPage }: ConversationsPageProps) {
  const userId = useScopedUserId()
  const portalConfig = usePortalConfigForPage()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")
  const [showAddConversation, setShowAddConversation] = useState(false)
  const [customerList, setCustomerList] = useState<any[]>([])
  const [addConvoExistingId, setAddConvoExistingId] = useState<string>("")
  const [addConvoNewName, setAddConvoNewName] = useState("")
  const [addConvoNewPhone, setAddConvoNewPhone] = useState("")
  const [addConvoNewEmail, setAddConvoNewEmail] = useState("")
  const [addConvoUseNew, setAddConvoUseNew] = useState(false)
  const [addConvoLoading, setAddConvoLoading] = useState(false)
  const conversationSettingsItems = useMemo(() => getControlItemsForUser(portalConfig, "conversations", "conversation_settings"), [portalConfig])
  const customActionButtons = useMemo(() => getCustomActionButtonsForUser(portalConfig, "conversations"), [portalConfig])

  useEffect(() => {
    if (!showSettings || conversationSettingsItems.length === 0) return
    const next: Record<string, string> = {}
    conversationSettingsItems.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setSettingsFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [showSettings, conversationSettingsItems])

  function isSettingItemVisible(item: PortalSettingItem): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = conversationSettingsItems.find((i) => i.id === depId)
    let depValue = settingsFormValues[depId] ?? ""
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

  function isCustomButtonItemVisible(item: PortalSettingItem, items: PortalSettingItem[], formValues: Record<string, string>): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = items.find((i) => i.id === depId)
    let depValue = formValues[depId] ?? ""
    if (depItem?.type === "custom_field") depValue = (depValue || "").trim() ? "filled" : "empty"
    return depValue === item.dependency.showWhenValue
  }

  // Conversations settings (persist in localStorage for now)
  const [showInternalConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("convo_showInternalConversations") ?? "true") } catch { return true }
  })
  // Internal conversations (in-memory for now; can wire to Supabase later)
  const [internalConversations, setInternalConversations] = useState<{ id: string; title: string; created_at: string }[]>([])
  const [showAddInternalConvo, setShowAddInternalConvo] = useState(false)
  const [newInternalConvoTitle, setNewInternalConvoTitle] = useState("")
  const [addInternalConvoLoading, setAddInternalConvoLoading] = useState(false)

  async function loadConversations() {
    if (!userId || !supabase) {
      if (!supabase) console.error("Supabase not configured.")
      return
    }
    const selectWithRemoved = `
      id,
      channel,
      status,
      created_at,
      removed_at,
      customers (
        display_name,
        customer_identifiers (
          type,
          value
        )
      ),
      messages (
        content,
        created_at
      )
    `
    const selectWithoutRemoved = `
      id,
      channel,
      status,
      created_at,
      customers (
        display_name,
        customer_identifiers (
          type,
          value
        )
      ),
      messages (
        content,
        created_at
      )
    `
    let { data, error } = await supabase
      .from("conversations")
      .select(selectWithRemoved)
      .eq("user_id", userId)
      .is("removed_at", null)
      .order("created_at", { ascending: false })

    if (error && error.message?.includes("removed_at")) {
      const res = await supabase
        .from("conversations")
        .select(selectWithoutRemoved)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
      if (res.error) {
        console.error(res.error)
        return
      }
      data = (res.data || []).map((c: any) => ({ ...c, removed_at: c.removed_at ?? null }))
    } else if (error) {
      console.error(error)
      return
    }

    setConversations((data as any[]) || [])
  }

  useEffect(() => {
    loadConversations()
  }, [userId])

  async function loadCustomerList() {
    if (!supabase) return
    const { data } = await supabase.from("customers").select("id, display_name").order("display_name")
    setCustomerList(data || [])
  }

  async function createConversationFlow() {
    if (!supabase) return
    setAddConvoLoading(true)
    try {
      let customerId: string
      if (addConvoUseNew) {
        if (!addConvoNewName?.trim() && !addConvoNewPhone?.trim()) {
          alert("Enter at least a name or phone for the new customer.")
          setAddConvoLoading(false)
          return
        }
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({ display_name: addConvoNewName.trim() || null, notes: null })
          .select("id")
          .single()
        if (custErr) throw custErr
        customerId = newCustomer.id
        if (addConvoNewPhone.trim()) {
          await supabase.from("customer_identifiers").insert({
            customer_id: customerId,
            type: "phone",
            value: addConvoNewPhone.trim(),
            is_primary: true
          })
        }
        if (addConvoNewEmail.trim()) {
          await supabase.from("customer_identifiers").insert({
            customer_id: customerId,
            type: "email",
            value: addConvoNewEmail.trim(),
            is_primary: false
          })
        }
      } else {
        if (!addConvoExistingId) {
          alert("Select an existing customer.")
          setAddConvoLoading(false)
          return
        }
        customerId = addConvoExistingId
      }
      const { error: convoErr } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          customer_id: customerId,
          channel: "manual",
          status: "active"
        })
      if (convoErr) throw convoErr
      setShowAddConversation(false)
      setAddConvoExistingId("")
      setAddConvoNewName("")
      setAddConvoNewPhone("")
      setAddConvoNewEmail("")
      setAddConvoUseNew(false)
      await loadConversations()
    } catch (err: any) {
      console.error(err)
      alert(err?.message ?? "Failed to create conversation.")
    } finally {
      setAddConvoLoading(false)
    }
  }

  async function openConversation(convoId: string) {
    setSelectedConversationId(convoId)
    if (!supabase) return

    const { data, error } = await supabase
      .from("conversations")
      .select(`
        id,
        channel,
        status,
        created_at,
        customer_id,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        )
      `)
      .eq("id", convoId)
      .single()

    if (error) {
      console.error(error)
      return
    }

    setSelectedConversation(data)

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convoId)
      .order("created_at", { ascending: true })

    setMessages(msgs || [])
  }

  const filteredConversations = conversations.filter((convo: any) => {
    const name = (convo.customers?.display_name || "").toLowerCase()
    const phone = convo.customers?.customer_identifiers
      ?.find((i: any) => i.type === "phone")?.value || ""
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    const matchesName = !searchLower || name.includes(searchLower)
    const matchesPhone = !phoneFilter || phone.includes(phoneFilter)
    return matchesName && matchesPhone
  })

  const sortedConversations = [...filteredConversations].sort((a: any, b: any) => {
    let aVal = ""
    let bVal = ""

    if (sortField === "name") {
      aVal = (a.customers?.display_name || "").toLowerCase()
      bVal = (b.customers?.display_name || "").toLowerCase()
    }
    if (sortField === "created_at") {
      aVal = a.created_at || ""
      bVal = b.created_at || ""
    }
    if (sortAsc) return aVal > bVal ? 1 : -1
    return aVal < bVal ? 1 : -1
  })

  return (
    <div style={{ display: "flex", position: "relative" }}>
      <div>

        <h1>Conversations</h1>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "16px"
        }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => { setShowAddConversation(true); loadCustomerList() }}
              style={{
                background: theme.primary,
                color: "white",
                padding: "8px 14px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer"
              }}
            >
              Add Conversation
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
                style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {showSettings && (
          <PortalSettingsModal
            title="Conversations Settings"
            items={conversationSettingsItems}
            formValues={settingsFormValues}
            setFormValue={(id, value) => setSettingsFormValues((prev) => ({ ...prev, [id]: value }))}
            isItemVisible={isSettingItemVisible}
            onClose={() => setShowSettings(false)}
          />
        )}

        {openCustomButtonId && (() => {
          const btn = customActionButtons.find((b) => b.id === openCustomButtonId)
          if (!btn) return null
          const items = btn.items ?? []
          const formValues = customButtonFormValues
          const setFormValue = (itemId: string, value: string) => setCustomButtonFormValues((prev) => ({ ...prev, [itemId]: value }))
          return (
            <>
              <div onClick={() => setOpenCustomButtonId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
              <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>{btn.label}</h3>
                  <button onClick={() => setOpenCustomButtonId(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: theme.text }}>
                  {items.length === 0 && <p style={{ fontSize: "14px", opacity: 0.8 }}>No options configured.</p>}
                  {items.map((item) => {
                    if (!isCustomButtonItemVisible(item, items, formValues)) return null
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
                          <select value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }}>{item.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select>
                        </div>
                      )
                    }
                    if (item.type === "custom_field") {
                      const value = formValues[item.id] ?? ""
                      const isTextarea = item.customFieldSubtype === "textarea"
                      return (
                        <div key={item.id}>
                          <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                          {isTextarea ? <textarea value={value} onChange={(e) => setFormValue(item.id, e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} /> : <input value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }} />}
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

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th
                onClick={() => { setSortField("name"); setSortAsc(!sortAsc) }}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Name
              </th>
              <th style={{ padding: "8px" }}>Phone</th>
              <th style={{ padding: "8px" }}>Channel</th>
              <th style={{ padding: "8px" }}>Status</th>
              <th
                onClick={() => { setSortField("created_at"); setSortAsc(!sortAsc) }}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Last Update
              </th>
              <th style={{ padding: "8px" }}>Last message</th>
            </tr>
          </thead>
          <tbody>
            {sortedConversations.map((convo) => {
              const phone = convo.customers?.customer_identifiers
                ?.find((i: any) => i.type === "phone")?.value || ""
              const lastMsg = (convo.messages as MessageRow[] | undefined)?.length
                ? [...(convo.messages as MessageRow[])].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0]
                : null
              const lastMsgText = lastMsg?.content?.trim() ? (lastMsg.content!.length > 50 ? lastMsg.content!.slice(0, 50) + "…" : lastMsg.content) : "—"
              return (
                <tr
                  key={convo.id}
                  onClick={() => openConversation(convo.id)}
                  style={{
                    cursor: "pointer",
                    borderBottom: "1px solid #eee",
                    background: selectedConversationId === convo.id ? "#f3f4f6" : "transparent"
                  }}
                >
                  <td style={{ padding: "8px" }}>{convo.customers?.display_name ?? "—"}</td>
                  <td style={{ padding: "8px" }}>{phone || "—"}</td>
                  <td style={{ padding: "8px" }}>{convo.channel ?? "—"}</td>
                  <td style={{ padding: "8px" }}>{convo.status ?? "—"}</td>
                  <td style={{ padding: "8px" }}>
                    {convo.created_at ? new Date(convo.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "8px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={lastMsg?.content ?? undefined}>{lastMsgText}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {showInternalConversations && (
          <div style={{ marginTop: "32px" }}>
            <h3 style={{ marginBottom: "12px", color: theme.text }}>Internal Conversations</h3>
            <p style={{ fontSize: "14px", color: theme.text, marginBottom: "12px" }}>
              Team conversations (same organization). Other users can talk to each other here.
            </p>
            <button
              type="button"
              onClick={() => { setShowAddInternalConvo(true); setNewInternalConvoTitle("") }}
              style={{
                padding: "8px 14px",
                background: theme.primary,
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                marginBottom: "12px"
              }}
            >
              Add Internal Conversation
            </button>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #ddd", borderRadius: "6px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd", background: "#f9fafb" }}>
                  <th style={{ padding: "8px" }}>Title</th>
                  <th style={{ padding: "8px" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {internalConversations.length === 0 ? (
                  <tr><td colSpan={2} style={{ padding: "12px", color: "#6b7280" }}>No internal conversations yet. Add one above.</td></tr>
                ) : (
                  internalConversations.map((ic) => (
                    <tr key={ic.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px" }}>{ic.title || "Untitled"}</td>
                      <td style={{ padding: "8px" }}>{new Date(ic.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {showAddInternalConvo && (
          <>
            <div onClick={() => setShowAddInternalConvo(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "400px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, color: theme.text }}>Add Internal Conversation</h3>
                <button onClick={() => setShowAddInternalConvo(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <input
                placeholder="Conversation title (e.g. Project Alpha)"
                value={newInternalConvoTitle}
                onChange={(e) => setNewInternalConvoTitle(e.target.value)}
                style={{ ...theme.formInput, marginBottom: "12px" }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  disabled={addInternalConvoLoading}
                  onClick={() => {
                    setAddInternalConvoLoading(true)
                    const id = crypto.randomUUID()
                    const created_at = new Date().toISOString()
                    setInternalConversations((prev) => [...prev, { id, title: newInternalConvoTitle.trim() || "Untitled", created_at }])
                    setShowAddInternalConvo(false)
                    setNewInternalConvoTitle("")
                    setAddInternalConvoLoading(false)
                  }}
                  style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {addInternalConvoLoading ? "Adding..." : "Create"}
                </button>
                <button onClick={() => setShowAddInternalConvo(false)} style={{ padding: "8px 14px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
              </div>
            </div>
          </>
        )}

        {selectedConversation && (
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
                setSelectedConversation(null)
                setSelectedConversationId(null)
                setMessages([])
              }}
              style={{ marginBottom: "16px" }}
            >
              ← Back to Conversations
            </button>

            <h3>Conversation Details</h3>

            <p>
              <strong>Customer:</strong>{" "}
              {selectedConversation.customers?.display_name ?? "—"}
              {" "}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setNotesCustomerId(selectedConversation.customer_id ?? null)
                  setNotesCustomerName(selectedConversation.customers?.display_name ?? "")
                }}
                style={{ marginLeft: "8px", padding: "4px 10px", fontSize: "12px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
              >
                Notes
              </button>
            </p>

            <p>
              <strong>Phone:</strong>{" "}
              {selectedConversation.customers?.customer_identifiers
                ?.find((i: any) => i.type === "phone")?.value ?? "—"}
            </p>

            <p>
              <strong>Channel:</strong> {selectedConversation.channel ?? "—"}
            </p>

            <p>
              <strong>Status:</strong> {selectedConversation.status ?? "—"}
            </p>

            <h3 style={{ marginTop: "24px" }}>Messages</h3>

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
                  <p style={{ margin: 0 }}>{msg.content}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={async () => {
                if (!supabase || !selectedConversation?.customer_id) return
                const { error } = await supabase.from("quotes").insert({
                  user_id: userId,
                  customer_id: selectedConversation.customer_id,
                  status: "draft"
                })
                if (error) {
                  console.error(error)
                  alert(error.message + (error.message.includes("row-level security") || error.message.includes("policy") ? " Run supabase-quotes-table.sql in Supabase." : ""))
                  return
                }
                const idToRemove = selectedConversation.id
                setSelectedConversation(null)
                setSelectedConversationId(null)
                setMessages([])
                setConversations((prev) => prev.filter((c) => c.id !== idToRemove))
                const { error: updateErr } = await supabase.from("conversations").update({ removed_at: new Date().toISOString() }).eq("id", idToRemove).eq("user_id", userId)
                if (updateErr) alert("Conversation left the list but could not save to database: " + updateErr.message + "\n\nRun the full supabase-run-this.sql in Supabase (including the RLS policy at the end).")
                if (setPage) setPage("quotes")
              }}
              style={{
                marginTop: "16px",
                padding: "10px 16px",
                background: theme.primary,
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              Send to Quotes
            </button>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={async () => {
                  if (!supabase || !selectedConversation?.id) return
                  if (!confirm("Remove this conversation? It can be recalled from Customers later.")) return
                  const idToRemove = selectedConversation.id
                  setSelectedConversation(null)
                  setSelectedConversationId(null)
                  setMessages([])
                  setConversations((prev) => prev.filter((c) => c.id !== idToRemove))
                  const { error: updateErr } = await supabase.from("conversations").update({ removed_at: new Date().toISOString() }).eq("id", idToRemove).eq("user_id", userId)
                  if (updateErr) alert("Conversation left the list but could not save to database: " + updateErr.message + "\n\nRun the full supabase-run-this.sql in Supabase (including the RLS policy at the end).")
                }}
                style={{ padding: "8px 14px", borderRadius: "6px", background: "#b91c1c", color: "white", border: "none", cursor: "pointer", fontSize: "14px" }}
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {showAddConversation && (
          <>
            <div onClick={() => setShowAddConversation(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "480px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text }}>Add Conversation</h3>
                <button onClick={() => setShowAddConversation(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: theme.text }}>
                  <input type="radio" checked={!addConvoUseNew} onChange={() => { setAddConvoUseNew(false); setAddConvoExistingId(customerList[0]?.id ?? ""); loadCustomerList() }} />
                  Select existing customer
                </label>
                {!addConvoUseNew && (
                  <select
                    value={addConvoExistingId}
                    onFocus={loadCustomerList}
                    onChange={(e) => setAddConvoExistingId(e.target.value)}
                    style={{ ...theme.formInput }}
                  >
                    <option value="">— Select customer —</option>
                    {customerList.map((c) => (
                      <option key={c.id} value={c.id}>{c.display_name || "Unnamed"}</option>
                    ))}
                  </select>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: theme.text }}>
                  <input type="radio" checked={addConvoUseNew} onChange={() => setAddConvoUseNew(true)} />
                  Create new customer
                </label>
                {addConvoUseNew && (
                  <>
                    <input placeholder="Customer name" value={addConvoNewName} onChange={(e) => setAddConvoNewName(e.target.value)} style={{ ...theme.formInput }} />
                    <input placeholder="Phone" value={addConvoNewPhone} onChange={(e) => setAddConvoNewPhone(e.target.value)} style={{ ...theme.formInput }} />
                    <input placeholder="Email" value={addConvoNewEmail} onChange={(e) => setAddConvoNewEmail(e.target.value)} style={{ ...theme.formInput }} />
                  </>
                )}
                <button onClick={createConversationFlow} disabled={addConvoLoading} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                  {addConvoLoading ? "Creating..." : "Create Conversation"}
                </button>
                <button onClick={() => setShowAddConversation(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
              </div>
            </div>
          </>
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
