import { useEffect, useState, useMemo } from "react"
import { supabase } from "../../lib/supabase"
import { parseLocalDateTime } from "../../lib/parseLocalDateTime"
import { useOfficeManagerScopeOptional, usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useAuth } from "../../contexts/AuthContext"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import PortalSettingsModal from "../../components/PortalSettingsModal"
import { getControlItemsForUser, getCustomActionButtonsForUser } from "../../types/portal-builder"
import type { PortalSettingItem } from "../../types/portal-builder"

type CustomerIdentifier = { type: string; value: string; is_primary?: boolean }
type CustomerRow = { display_name: string | null; customer_identifiers: CustomerIdentifier[] | null }
type MessageRow = { content: string | null; created_at: string | null }
type QuoteRow = {
  id: string
  status: string | null
  created_at?: string
  updated_at?: string
  customer_id: string
  conversation_id: string | null
  customers: CustomerRow | null
  conversations?: { messages?: MessageRow[] | null } | null
}

type QuotesPageProps = { setPage?: (page: string) => void }
export default function QuotesPage({ setPage }: QuotesPageProps) {
  const { userId: authUserId } = useAuth()
  const scopeCtx = useOfficeManagerScopeOptional()
  const userId = useScopedUserId()
  const portalConfig = usePortalConfigForPage()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsFormValues, setSettingsFormValues] = useState<Record<string, string>>({})
  const [openCustomButtonId, setOpenCustomButtonId] = useState<string | null>(null)
  const [customButtonFormValues, setCustomButtonFormValues] = useState<Record<string, string>>({})
  const [showAutoResponseOptions, setShowAutoResponseOptions] = useState(false)
  const [search, setSearch] = useState("")
  const [filterPhone, setFilterPhone] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [quotesError, setQuotesError] = useState<string>("")
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
  const [selectedQuote, setSelectedQuote] = useState<any>(null)
  const [selectedQuoteItems, setSelectedQuoteItems] = useState<any[]>([])
  const [notesCustomerId, setNotesCustomerId] = useState<string | null>(null)
  const [notesCustomerName, setNotesCustomerName] = useState<string>("")
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [customerList, setCustomerList] = useState<any[]>([])
  const [addExistingId, setAddExistingId] = useState<string>("")
  const [addNewName, setAddNewName] = useState("")
  const [addNewPhone, setAddNewPhone] = useState("")
  const [addNewEmail, setAddNewEmail] = useState("")
  const [addUseNew, setAddUseNew] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  // Add line item (quote_items)
  const [newItemDescription, setNewItemDescription] = useState("")
  const [newItemQuantity, setNewItemQuantity] = useState("1")
  const [newItemUnitPrice, setNewItemUnitPrice] = useState("")
  const [addItemLoading, setAddItemLoading] = useState(false)
  // Add to Calendar (from quote detail)
  const [showAddToCalendar, setShowAddToCalendar] = useState(false)
  const [calTitle, setCalTitle] = useState("")
  const [calDate, setCalDate] = useState("")
  const [calTime, setCalTime] = useState("09:00")
  const [calDuration, setCalDuration] = useState(60)
  const [calJobTypeId, setCalJobTypeId] = useState("")
  const [calNotes, setCalNotes] = useState("")
  const [jobTypes, setJobTypes] = useState<{ id: string; name: string; duration_minutes: number }[]>([])
  const [addToCalendarLoading, setAddToCalendarLoading] = useState(false)
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true)
  const [assignToScopedUser, setAssignToScopedUser] = useState(true)
  const [calendarTargetUserId, setCalendarTargetUserId] = useState("")

  const selectableUsers = useMemo(() => {
    if (scopeCtx?.clients?.length) return scopeCtx.clients
    return [{ userId, label: "My calendar", email: null, clientId: null, isSelf: true }]
  }, [scopeCtx?.clients, userId])

  const quoteSettingsItems = useMemo(() => getControlItemsForUser(portalConfig, "quotes", "quote_settings"), [portalConfig])
  const customActionButtons = useMemo(() => getCustomActionButtonsForUser(portalConfig, "quotes"), [portalConfig])

  useEffect(() => {
    if (!showSettings || quoteSettingsItems.length === 0) return
    const next: Record<string, string> = {}
    quoteSettingsItems.forEach((item) => {
      if (item.type === "checkbox") next[item.id] = item.defaultChecked ? "checked" : "unchecked"
      else if (item.type === "dropdown" && item.options?.length) next[item.id] = item.options[0]
      else next[item.id] = ""
    })
    setSettingsFormValues((prev) => (Object.keys(next).length ? next : prev))
  }, [showSettings, quoteSettingsItems])

  function isQuoteSettingItemVisible(item: PortalSettingItem): boolean {
    if (!item.dependency) return true
    const depId = item.dependency.dependsOnItemId
    const depItem = quoteSettingsItems.find((i) => i.id === depId)
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

  // Settings (localStorage)
  const [defaultQuoteStatus] = useState(() => {
    try { return localStorage.getItem("quotes_defaultStatus") ?? "draft" } catch { return "draft" }
  })

  // Auto Response Options (in-depth) - localStorage
  const [arOnQuoteCreated, setArOnQuoteCreated] = useState(() => {
    try { return JSON.parse(localStorage.getItem("quotes_arOnQuoteCreated") ?? "true") } catch { return true }
  })
  const [arOnQuoteCreatedMessage, setArOnQuoteCreatedMessage] = useState(() => {
    try { return localStorage.getItem("quotes_arOnQuoteCreatedMessage") ?? "" } catch { return "" }
  })
  const [arOnQuoteSent, setArOnQuoteSent] = useState(() => {
    try { return JSON.parse(localStorage.getItem("quotes_arOnQuoteSent") ?? "false") } catch { return false }
  })
  const [arOnQuoteSentMessage, setArOnQuoteSentMessage] = useState(() => {
    try { return localStorage.getItem("quotes_arOnQuoteSentMessage") ?? "" } catch { return "" }
  })
  const [arOnQuoteViewed, setArOnQuoteViewed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("quotes_arOnQuoteViewed") ?? "false") } catch { return false }
  })
  const [arOnQuoteViewedMessage, setArOnQuoteViewedMessage] = useState(() => {
    try { return localStorage.getItem("quotes_arOnQuoteViewedMessage") ?? "" } catch { return "" }
  })
  const [arDelayMinutes, setArDelayMinutes] = useState(() => {
    try { return localStorage.getItem("quotes_arDelayMinutes") ?? "0" } catch { return "0" }
  })

  useEffect(() => {
    if (!calendarTargetUserId || !supabase) return
    void supabase
      .from("user_calendar_preferences")
      .select("auto_assign_enabled")
      .eq("owner_user_id", calendarTargetUserId)
      .maybeSingle()
      .then(({ data }) => {
        const enabled = ((data as { auto_assign_enabled?: boolean | null } | null)?.auto_assign_enabled) !== false
        setAutoAssignEnabled(enabled)
        setAssignToScopedUser(enabled)
      })
  }, [calendarTargetUserId])

  useEffect(() => {
    if (!showAddToCalendar || !supabase || !calendarTargetUserId) return
    void supabase
      .from("job_types")
      .select("id, name, duration_minutes")
      .eq("user_id", calendarTargetUserId)
      .order("name")
      .then(({ data }) => setJobTypes(data || []))
  }, [showAddToCalendar, calendarTargetUserId])

  async function loadQuotes() {
    if (!userId || !supabase) return
    setQuotesError("")
    const selectWith = `
        id,
        status,
        created_at,
        updated_at,
        customer_id,
        conversation_id,
        scheduled_at,
        removed_at,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        ),
        conversations (
          messages (
            content,
            created_at
          )
        )
      `
    const selectWithout = `
        id,
        status,
        created_at,
        updated_at,
        customer_id,
        conversation_id,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        ),
        conversations (
          messages (
            content,
            created_at
          )
        )
      `
    let { data, error } = await supabase
      .from("quotes")
      .select(selectWith)
      .eq("user_id", userId)
      .is("scheduled_at", null)
      .is("removed_at", null)
      .order("updated_at", { ascending: false })

    if (error && (error.message?.includes("scheduled_at") || error.message?.includes("removed_at"))) {
      const res = await supabase
        .from("quotes")
        .select(selectWithout)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
      if (res.error) {
        setQuotesError(res.error.message)
        setQuotes([])
        return
      }
      data = (res.data || []).map((q: any) => ({ ...q, scheduled_at: q.scheduled_at ?? null, removed_at: q.removed_at ?? null }))
    } else if (error) {
      setQuotesError(error.message)
      setQuotes([])
      return
    }
    setQuotes((data as any[]) || [])
  }

  useEffect(() => {
    loadQuotes()
  }, [userId])

  async function loadCustomerList() {
    if (!supabase) return
    const { data } = await supabase.from("customers").select("id, display_name").order("display_name")
    setCustomerList(data || [])
  }

  async function addCustomerToQuotesFlow() {
    if (!supabase) return
    setAddLoading(true)
    try {
      let customerId: string
      if (addUseNew) {
        if (!addNewName?.trim() && !addNewPhone?.trim()) {
          alert("Enter at least a name or phone for the new customer.")
          setAddLoading(false)
          return
        }
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({ display_name: addNewName.trim() || null, notes: null })
          .select("id")
          .single()
        if (custErr) throw custErr
        customerId = newCustomer.id
        if (addNewPhone.trim()) {
          await supabase.from("customer_identifiers").insert({
            customer_id: customerId,
            type: "phone",
            value: addNewPhone.trim(),
            is_primary: true
          })
        }
        if (addNewEmail.trim()) {
          await supabase.from("customer_identifiers").insert({
            customer_id: customerId,
            type: "email",
            value: addNewEmail.trim(),
            is_primary: false
          })
        }
      } else {
        if (!addExistingId) {
          alert("Select an existing customer.")
          setAddLoading(false)
          return
        }
        customerId = addExistingId
      }
      const { error: quoteErr } = await supabase
        .from("quotes")
        .insert({
          user_id: userId,
          customer_id: customerId,
          status: defaultQuoteStatus,
          conversation_id: null
        })
      if (quoteErr) throw quoteErr
      setShowAddCustomer(false)
      setAddExistingId("")
      setAddNewName("")
      setAddNewPhone("")
      setAddNewEmail("")
      setAddUseNew(false)
      await loadQuotes()
    } catch (err: any) {
      console.error(err)
      alert(err?.message ?? "Failed to add customer to quotes. Ensure the quotes table exists (see supabase-quotes-table.sql).")
    } finally {
      setAddLoading(false)
    }
  }

  async function openQuote(quoteId: string) {
    setSelectedQuoteId(quoteId)
    setSelectedQuoteItems([])
    if (!supabase) return
    const { data, error } = await supabase
      .from("quotes")
      .select(`
        id,
        status,
        created_at,
        updated_at,
        customer_id,
        conversation_id,
        scheduled_at,
        customers (
          display_name,
          customer_identifiers (
            type,
            value
          )
        )
      `)
      .eq("id", quoteId)
      .single()
    if (error) {
      console.error(error)
      return
    }
    setSelectedQuote(data)
    const { data: items } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true })
    setSelectedQuoteItems(items || [])
  }

  async function addQuoteItem() {
    if (!supabase || !selectedQuoteId) return
    const qty = parseFloat(newItemQuantity) || 0
    const price = parseFloat(newItemUnitPrice) || 0
    if (!newItemDescription.trim()) {
      alert("Enter a description for the line item.")
      return
    }
    setAddItemLoading(true)
    const row: Record<string, unknown> = {
      quote_id: selectedQuoteId,
      description: newItemDescription.trim(),
      quantity: qty,
      unit_price: price
    }
    const { error } = await supabase.from("quote_items").insert(row)
    setAddItemLoading(false)
    if (error) {
      console.error(error)
      alert(error.message)
      return
    }
    setNewItemDescription("")
    setNewItemQuantity("1")
    setNewItemUnitPrice("")
    openQuote(selectedQuoteId)
  }

  function getItemDisplay(item: any) {
    const desc = item.description ?? item.item_description ?? item.name ?? "—"
    const qty = item.quantity ?? item.qty ?? "—"
    const up = item.unit_price ?? item.price ?? "—"
    const tot = item.total ?? (typeof item.quantity === "number" && typeof item.unit_price === "number" ? item.quantity * item.unit_price : null)
    return { desc, qty, up, tot }
  }

  const filteredQuotes = quotes.filter((q: any) => {
    const name = (q.customers?.display_name || "").toLowerCase()
    const phone = q.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value || ""
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    return (!searchLower || name.includes(searchLower)) && (!phoneFilter || phone.includes(phoneFilter))
  })

  const sortedQuotes = [...filteredQuotes].sort((a: any, b: any) => {
    let aVal = ""
    let bVal = ""
    if (sortField === "name") {
      aVal = (a.customers?.display_name || "").toLowerCase()
      bVal = (b.customers?.display_name || "").toLowerCase()
    }
    if (sortField === "created_at") {
      aVal = a.updated_at || a.created_at || ""
      bVal = b.updated_at || b.created_at || ""
    }
    if (sortField === "status") {
      aVal = (a.status || "").toLowerCase()
      bVal = (b.status || "").toLowerCase()
    }
    if (sortAsc) return aVal > bVal ? 1 : -1
    return aVal < bVal ? 1 : -1
  })

  function getLastMessage(q: QuoteRow): string | null {
    const msgs = (q.conversations as { messages?: MessageRow[] } | null)?.messages
    if (!msgs?.length) return null
    const sorted = [...msgs].sort((x, y) => (y.created_at || "").localeCompare(x.created_at || ""))
    return sorted[0]?.content ?? null
  }

  return (
    <div style={{ display: "flex", position: "relative" }}>
      <div>
        <h1>Quotes</h1>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => { setShowAddCustomer(true); loadCustomerList() }}
              style={{ background: theme.primary, color: "white", padding: "8px 14px", borderRadius: "6px", border: "none", cursor: "pointer" }}
            >
              Add Customer to quotes
            </button>
            <button
              onClick={() => setShowAutoResponseOptions(true)}
              style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
            >
              Auto Response Options
            </button>
            <button
              onClick={() => setShowSettings(true)}
              style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}
            >
              Settings
            </button>
            {customActionButtons.map((btn) => (
              <button key={btn.id} onClick={() => setOpenCustomButtonId(btn.id)} style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: theme.text }}>{btn.label}</button>
            ))}
          </div>
        </div>

        {showSettings && (
          <PortalSettingsModal
            title="Quotes Settings"
            items={quoteSettingsItems}
            formValues={settingsFormValues}
            setFormValue={(id, value) => setSettingsFormValues((prev) => ({ ...prev, [id]: value }))}
            isItemVisible={isQuoteSettingItemVisible}
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
                    if (item.type === "checkbox") return (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                        <input type="checkbox" checked={formValues[item.id] === "checked"} onChange={(e) => setFormValue(item.id, e.target.checked ? "checked" : "unchecked")} />
                        <span>{item.label}</span>
                      </label>
                    )
                    if (item.type === "dropdown" && item.options?.length) return (
                      <div key={item.id}>
                        <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                        <select value={formValues[item.id] ?? item.options[0]} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }}>{item.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select>
                      </div>
                    )
                    if (item.type === "custom_field") {
                      const value = formValues[item.id] ?? ""
                      return (
                        <div key={item.id}>
                          <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>{item.label}</label>
                          {item.customFieldSubtype === "textarea" ? <textarea value={value} onChange={(e) => setFormValue(item.id, e.target.value)} rows={3} style={{ ...theme.formInput, resize: "vertical" }} /> : <input value={value} onChange={(e) => setFormValue(item.id, e.target.value)} style={{ ...theme.formInput }} />}
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

        {quotesError && (
          <p style={{ color: "#b91c1c", marginBottom: "12px", fontSize: "14px" }}>
            {quotesError} Create the quotes table in Supabase (run supabase-quotes-table.sql).
          </p>
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
                <option value="status">Status</option>
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
              <th onClick={() => { setSortField("name"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>Name</th>
              <th style={{ padding: "8px" }}>Phone</th>
              <th style={{ padding: "8px" }}>Source</th>
              <th onClick={() => { setSortField("status"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>Status</th>
              <th onClick={() => { setSortField("created_at"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>Last Update</th>
              <th style={{ padding: "8px" }}>Last message</th>
            </tr>
          </thead>
          <tbody>
            {sortedQuotes.map((q) => {
              const phone = q.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value || ""
              const lastMsg = getLastMessage(q)
              const lastMsgText = lastMsg?.trim() ? (lastMsg.length > 50 ? lastMsg.slice(0, 50) + "…" : lastMsg) : "—"
              const source = q.conversation_id ? "Conversation" : "Manual"
              return (
                <tr
                  key={q.id}
                  onClick={() => openQuote(q.id)}
                  style={{
                    cursor: "pointer",
                    borderBottom: "1px solid #eee",
                    background: selectedQuoteId === q.id ? "#f3f4f6" : "transparent"
                  }}
                >
                  <td style={{ padding: "8px" }}>{q.customers?.display_name ?? "—"}</td>
                  <td style={{ padding: "8px" }}>{phone || "—"}</td>
                  <td style={{ padding: "8px" }}>{source}</td>
                  <td style={{ padding: "8px" }}>{q.status ?? "—"}</td>
                  <td style={{ padding: "8px" }}>
                    {(q.updated_at || q.created_at) ? new Date(q.updated_at || q.created_at!).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "8px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={lastMsg ?? undefined}>{lastMsgText}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {selectedQuote && (
          <div style={{ marginTop: "20px", padding: "20px", border: "1px solid #ddd", borderRadius: "6px" }}>
            <button
              onClick={() => { setSelectedQuote(null); setSelectedQuoteId(null) }}
              style={{ marginBottom: "16px" }}
            >
              ← Back to Quotes
            </button>
            <h3>Quote Details</h3>
            <p>
              <strong>Customer:</strong> {selectedQuote.customers?.display_name ?? "—"}
              {" "}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setNotesCustomerId(selectedQuote.customer_id ?? null)
                  setNotesCustomerName(selectedQuote.customers?.display_name ?? "")
                }}
                style={{ marginLeft: "8px", padding: "4px 10px", fontSize: "12px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
              >
                Notes
              </button>
            </p>
            <p><strong>Phone:</strong> {selectedQuote.customers?.customer_identifiers?.find((i: any) => i.type === "phone")?.value ?? "—"}</p>
            <p><strong>Status:</strong> {selectedQuote.status ?? "—"}</p>
            <p><strong>Source:</strong> {selectedQuote.conversation_id ? "From conversation" : "Added manually"}</p>

            <h3 style={{ marginTop: "24px" }}>Quote items</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px", border: "1px solid #ddd" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd", background: "#f9fafb" }}>
                  <th style={{ padding: "8px" }}>Description</th>
                  <th style={{ padding: "8px" }}>Quantity</th>
                  <th style={{ padding: "8px" }}>Unit price</th>
                  <th style={{ padding: "8px" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuoteItems.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "12px", color: "#6b7280" }}>No line items. Add one below.</td></tr>
                ) : (
                  selectedQuoteItems.map((item) => {
                    const { desc, qty, up, tot } = getItemDisplay(item)
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "8px" }}>{desc}</td>
                        <td style={{ padding: "8px" }}>{qty}</td>
                        <td style={{ padding: "8px" }}>{typeof up === "number" ? up.toFixed(2) : up}</td>
                        <td style={{ padding: "8px" }}>{tot != null ? (typeof tot === "number" ? tot.toFixed(2) : tot) : "—"}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end" }}>
              <input
                placeholder="Description"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                style={{ ...theme.formInput, padding: "6px 10px", width: "200px" }}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Qty"
                value={newItemQuantity}
                onChange={(e) => setNewItemQuantity(e.target.value)}
                style={{ ...theme.formInput, padding: "6px 10px", width: "80px" }}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit price"
                value={newItemUnitPrice}
                onChange={(e) => setNewItemUnitPrice(e.target.value)}
                style={{ ...theme.formInput, padding: "6px 10px", width: "100px" }}
              />
              <button
                type="button"
                onClick={addQuoteItem}
                disabled={addItemLoading}
                style={{ padding: "6px 12px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}
              >
                {addItemLoading ? "Adding..." : "Add line item"}
              </button>
            </div>

            {!selectedQuote.scheduled_at && (
              <div style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setCalTitle(`${selectedQuote.customers?.display_name ?? "Customer"} – Quote`)
                  setCalDate(new Date().toISOString().slice(0, 10))
                  setCalTime("09:00")
                  setCalDuration(60)
                  setCalJobTypeId("")
                  setCalNotes("")
                  setCalendarTargetUserId(userId)
                  setShowAddToCalendar(true)
                  }}
                  style={{ padding: "8px 14px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  Add to Calendar
                </button>
              </div>
            )}
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={async () => {
                  if (!supabase || !selectedQuote?.id) return
                  if (!confirm("Remove this quote? It can be recalled from Customers later.")) return
                  const { error } = await supabase.from("quotes").update({ removed_at: new Date().toISOString() }).eq("id", selectedQuote.id)
                  if (error) { alert(error.message); return }
                  setSelectedQuote(null)
                  setSelectedQuoteId(null)
                  loadQuotes()
                }}
                style={{ padding: "8px 14px", borderRadius: "6px", background: "#b91c1c", color: "white", border: "none", cursor: "pointer", fontSize: "14px" }}
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {showAddToCalendar && selectedQuote && supabase && (
          <>
            <div onClick={() => setShowAddToCalendar(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "420px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <h3 style={{ margin: "0 0 16px", color: theme.text }}>Add quote to calendar</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Select user</label>
                  <select
                    value={calendarTargetUserId}
                    onChange={(e) => setCalendarTargetUserId(e.target.value)}
                    style={{ ...theme.formInput }}
                  >
                    {selectableUsers.map((u) => (
                      <option key={u.userId} value={u.userId}>
                        {u.label}{u.email ? ` (${u.email})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <input placeholder="Title" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} style={{ ...theme.formInput }} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} style={{ ...theme.formInput, flex: 1 }} />
                  <input type="time" value={calTime} onChange={(e) => setCalTime(e.target.value)} style={{ ...theme.formInput }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Duration (minutes)</label>
                  <input type="number" min={15} step={15} value={calDuration} onChange={(e) => setCalDuration(parseInt(e.target.value, 10) || 60)} style={{ ...theme.formInput }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Job type</label>
                  <select
                    value={calJobTypeId}
                    onChange={(e) => {
                      const id = e.target.value
                      setCalJobTypeId(id)
                      const jt = jobTypes.find((j) => j.id === id)
                      if (jt) setCalDuration(Math.max(15, jt.duration_minutes))
                    }}
                    style={{ ...theme.formInput }}
                  >
                    <option value="">— None —</option>
                    {jobTypes.map((jt) => (
                      <option key={jt.id} value={jt.id}>{jt.name} ({jt.duration_minutes} min)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: theme.text }}>Notes</label>
                  <input placeholder="Optional notes" value={calNotes} onChange={(e) => setCalNotes(e.target.value)} style={{ ...theme.formInput }} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", color: theme.text, fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={assignToScopedUser}
                    onChange={(e) => setAssignToScopedUser(e.target.checked)}
                  />
                  Assign to selected user calendar automatically
                  <span style={{ opacity: 0.65 }}>(default from Customize user: {autoAssignEnabled ? "on" : "off"})</span>
                </label>
                {!assignToScopedUser && scopeCtx && calendarTargetUserId !== authUserId && (
                  <p style={{ margin: 0, fontSize: "12px", color: theme.text, opacity: 0.8 }}>
                    This event will be assigned to your office manager calendar instead of the selected user.
                  </p>
                )}
                <button
                  disabled={addToCalendarLoading}
                  onClick={async () => {
                    if (!supabase || !calTitle.trim()) return
                    setAddToCalendarLoading(true)
                    const quoteTotal = selectedQuoteItems.reduce((sum, item) => {
                      const { tot } = getItemDisplay(item)
                      return sum + (typeof tot === "number" && !Number.isNaN(tot) ? tot : 0)
                    }, 0)
                    const start = parseLocalDateTime(calDate, calTime)
                    if (Number.isNaN(start.getTime())) {
                      setAddToCalendarLoading(false)
                      alert("Invalid date or time.")
                      return
                    }
                    const end = new Date(start.getTime() + calDuration * 60 * 1000)
                    const selectedTarget = calendarTargetUserId || userId
                    const targetUserId = assignToScopedUser ? selectedTarget : (authUserId || selectedTarget)
                    const { error } = await supabase.from("calendar_events").insert({
                      user_id: targetUserId,
                      title: calTitle.trim(),
                      start_at: start.toISOString(),
                      end_at: end.toISOString(),
                      job_type_id: calJobTypeId || null,
                      quote_id: selectedQuote.id,
                      customer_id: selectedQuote.customer_id,
                      notes: calNotes.trim() || null,
                      quote_total: quoteTotal > 0 ? quoteTotal : null
                    })
                    if (error) { setAddToCalendarLoading(false); alert(error.message); return }
                    const { error: updateErr } = await supabase.from("quotes").update({ scheduled_at: new Date().toISOString() }).eq("id", selectedQuote.id)
                    setAddToCalendarLoading(false)
                    if (updateErr) { alert(updateErr.message); return }
                    setShowAddToCalendar(false)
                    setSelectedQuote(null)
                    setSelectedQuoteId(null)
                    loadQuotes()
                    if (setPage) setPage("calendar")
                  }}
                  style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                >
                  {addToCalendarLoading ? "Adding..." : "Add to calendar"}
                </button>
                <button onClick={() => setShowAddToCalendar(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
              </div>
            </div>
          </>
        )}

        {showAddCustomer && (
          <>
            <div onClick={() => setShowAddCustomer(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "480px", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text }}>Add Customer to quotes</h3>
                <button onClick={() => setShowAddCustomer(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: theme.text }}>
                  <input type="radio" checked={!addUseNew} onChange={() => { setAddUseNew(false); setAddExistingId(customerList[0]?.id ?? ""); loadCustomerList() }} />
                  Select existing customer
                </label>
                {!addUseNew && (
                  <select
                    value={addExistingId}
                    onFocus={loadCustomerList}
                    onChange={(e) => setAddExistingId(e.target.value)}
                    style={{ ...theme.formInput }}
                  >
                    <option value="">— Select customer —</option>
                    {customerList.map((c) => (
                      <option key={c.id} value={c.id}>{c.display_name || "Unnamed"}</option>
                    ))}
                  </select>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: theme.text }}>
                  <input type="radio" checked={addUseNew} onChange={() => setAddUseNew(true)} />
                  Create new customer
                </label>
                {addUseNew && (
                  <>
                    <input placeholder="Customer name" value={addNewName} onChange={(e) => setAddNewName(e.target.value)} style={{ ...theme.formInput }} />
                    <input placeholder="Phone" value={addNewPhone} onChange={(e) => setAddNewPhone(e.target.value)} style={{ ...theme.formInput }} />
                    <input placeholder="Email" value={addNewEmail} onChange={(e) => setAddNewEmail(e.target.value)} style={{ ...theme.formInput }} />
                  </>
                )}
                <button onClick={addCustomerToQuotesFlow} disabled={addLoading} style={{ padding: "10px 16px", background: theme.primary, color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                  {addLoading ? "Adding..." : "Add to Quotes"}
                </button>
                <button onClick={() => setShowAddCustomer(false)} style={{ padding: "8px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: "white", cursor: "pointer", color: theme.text }}>Cancel</button>
              </div>
            </div>
          </>
        )}

        {showAutoResponseOptions && (
          <>
            <div onClick={() => setShowAutoResponseOptions(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "90%", maxWidth: "560px", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: "8px", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", zIndex: 9999 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, color: theme.text, fontSize: "18px" }}>Auto Response Options</h3>
                <button onClick={() => setShowAutoResponseOptions(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.text }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "20px", color: theme.text }}>
                <div style={{ padding: "12px", background: "#f9fafb", borderRadius: "8px", border: `1px solid ${theme.border}` }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={arOnQuoteCreated}
                      onChange={(e) => {
                        const v = e.target.checked
                        setArOnQuoteCreated(v)
                        try { localStorage.setItem("quotes_arOnQuoteCreated", JSON.stringify(v)) } catch { /* ignore */ }
                      }}
                    />
                    <span><strong>When a quote is created</strong> — send an auto response to the customer.</span>
                  </label>
                  {arOnQuoteCreated && (
                    <textarea
                      value={arOnQuoteCreatedMessage}
                      onChange={(e) => {
                        setArOnQuoteCreatedMessage(e.target.value)
                        try { localStorage.setItem("quotes_arOnQuoteCreatedMessage", e.target.value) } catch { /* ignore */ }
                      }}
                      placeholder="Message to send when a new quote is added..."
                      rows={3}
                      style={{ ...theme.formInput, marginTop: "10px", resize: "vertical" }}
                    />
                  )}
                </div>
                <div style={{ padding: "12px", background: "#f9fafb", borderRadius: "8px", border: `1px solid ${theme.border}` }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={arOnQuoteSent}
                      onChange={(e) => {
                        const v = e.target.checked
                        setArOnQuoteSent(v)
                        try { localStorage.setItem("quotes_arOnQuoteSent", JSON.stringify(v)) } catch { /* ignore */ }
                      }}
                    />
                    <span><strong>When a quote is sent</strong> — send an auto response.</span>
                  </label>
                  {arOnQuoteSent && (
                    <textarea
                      value={arOnQuoteSentMessage}
                      onChange={(e) => {
                        setArOnQuoteSentMessage(e.target.value)
                        try { localStorage.setItem("quotes_arOnQuoteSentMessage", e.target.value) } catch { /* ignore */ }
                      }}
                      placeholder="Message to send when quote is sent to customer..."
                      rows={3}
                      style={{ ...theme.formInput, marginTop: "10px", resize: "vertical" }}
                    />
                  )}
                </div>
                <div style={{ padding: "12px", background: "#f9fafb", borderRadius: "8px", border: `1px solid ${theme.border}` }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={arOnQuoteViewed}
                      onChange={(e) => {
                        const v = e.target.checked
                        setArOnQuoteViewed(v)
                        try { localStorage.setItem("quotes_arOnQuoteViewed", JSON.stringify(v)) } catch { /* ignore */ }
                      }}
                    />
                    <span><strong>When a quote is viewed</strong> (by customer) — send an auto response.</span>
                  </label>
                  {arOnQuoteViewed && (
                    <textarea
                      value={arOnQuoteViewedMessage}
                      onChange={(e) => {
                        setArOnQuoteViewedMessage(e.target.value)
                        try { localStorage.setItem("quotes_arOnQuoteViewedMessage", e.target.value) } catch { /* ignore */ }
                      }}
                      placeholder="Message to send when customer views the quote..."
                      rows={3}
                      style={{ ...theme.formInput, marginTop: "10px", resize: "vertical" }}
                    />
                  )}
                </div>
                <div>
                  <label style={{ fontSize: "14px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Delay before sending (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    value={arDelayMinutes}
                    onChange={(e) => {
                      setArDelayMinutes(e.target.value)
                      try { localStorage.setItem("quotes_arDelayMinutes", e.target.value) } catch { /* ignore */ }
                    }}
                    style={{ ...theme.formInput }}
                  />
                </div>
              </div>
              <button onClick={() => setShowAutoResponseOptions(false)} style={{ marginTop: "20px", padding: "10px 16px", border: `1px solid ${theme.border}`, borderRadius: "6px", background: theme.background, color: theme.text, cursor: "pointer", fontWeight: 600 }}>Done</button>
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
