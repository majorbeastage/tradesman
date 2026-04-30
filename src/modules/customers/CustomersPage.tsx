import { Fragment, useCallback, useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { usePortalConfigForPage, useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { useScopedAiAutomationsEnabled } from "../../hooks/useScopedAiAutomationsEnabled"
import { theme } from "../../styles/theme"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import CustomerCallButton from "../../components/CustomerCallButton"
import TabNotificationAlertsButton from "../../components/TabNotificationAlertsButton"
import ConversationAutoRepliesModal from "../../components/ConversationAutoRepliesModal"
import { useIsMobile } from "../../hooks/useIsMobile"
import { consumeQueuedCustomerFocus } from "../../lib/customerNavigation"
import { geocodeAddressToLatLng } from "../../lib/jobSiteLocation"

const JOB_PIPELINE_OPTIONS = [
  "New Lead",
  "First Contact Sent",
  "First Reply Received",
  "Job Description Received",
  "Quote Sent",
  "Quote Approved",
  "Scheduled",
] as const

const DEFAULT_BEST_CONTACT_OPTIONS = ["Phone call", "Text message", "Email", "Other"] as const

type CustomerRow = {
  id: string
  display_name: string | null
  customer_identifiers?: { type: string; value: string }[] | null
  service_address?: string | null
  service_lat?: number | null
  service_lng?: number | null
  best_contact_method?: string | null
  job_pipeline_status?: string | null
  last_activity_at?: string | null
  updated_at?: string | null
}

function inferDefaultBestContact(c: CustomerRow): string {
  if (c.best_contact_method?.trim()) return c.best_contact_method.trim()
  const hasPhone = !!c.customer_identifiers?.some((i) => i.type === "phone" && String(i.value ?? "").trim())
  const hasEmail = !!c.customer_identifiers?.some((i) => i.type === "email" && String(i.value ?? "").trim())
  if (hasPhone) return "Phone call"
  if (hasEmail) return "Email"
  return "Other"
}

function displayBestContact(c: CustomerRow): string {
  return c.best_contact_method?.trim() || inferDefaultBestContact(c)
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

function lastUpdateDisplay(c: CustomerRow): string {
  const raw = c.last_activity_at || c.updated_at
  return formatWhen(raw)
}

export default function CustomersPage() {
  const userId = useScopedUserId()
  const aiAutomationsEnabled = useScopedAiAutomationsEnabled(userId)
  const portalConfig = usePortalConfigForPage()
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
  const [showAutoReplies, setShowAutoReplies] = useState(false)
  const [detailEditMode, setDetailEditMode] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [serviceGeocodeBusy, setServiceGeocodeBusy] = useState(false)
  const [detailForm, setDetailForm] = useState<{
    customerName: string
    phone: string
    email: string
    serviceAddress: string
    serviceLat: string
    serviceLng: string
    bestContact: string
    jobStatus: string
  }>({
    customerName: "",
    phone: "",
    email: "",
    serviceAddress: "",
    serviceLat: "",
    serviceLng: "",
    bestContact: DEFAULT_BEST_CONTACT_OPTIONS[0],
    jobStatus: JOB_PIPELINE_OPTIONS[0],
  })

  const applyDetailFromCustomer = useCallback((c: CustomerRow) => {
    const phone = c.customer_identifiers?.find((i) => i.type === "phone")?.value?.trim() ?? ""
    const email = c.customer_identifiers?.find((i) => i.type === "email")?.value?.trim() ?? ""
    const bc = displayBestContact(c)
    const best = (DEFAULT_BEST_CONTACT_OPTIONS as readonly string[]).includes(bc) ? bc : DEFAULT_BEST_CONTACT_OPTIONS[0]
    const js = c.job_pipeline_status?.trim()
    const jobOk = js && (JOB_PIPELINE_OPTIONS as readonly string[]).includes(js) ? js : JOB_PIPELINE_OPTIONS[0]
    setDetailForm({
      customerName: c.display_name?.trim() ?? "",
      phone,
      email,
      serviceAddress: typeof c.service_address === "string" ? c.service_address : "",
      serviceLat: c.service_lat != null && Number.isFinite(Number(c.service_lat)) ? String(c.service_lat) : "",
      serviceLng: c.service_lng != null && Number.isFinite(Number(c.service_lng)) ? String(c.service_lng) : "",
      bestContact: best,
      jobStatus: jobOk,
    })
  }, [])

  const loadCustomers = useCallback(async () => {
    if (!userId || !supabase) {
      if (!supabase) setLoadError("Supabase not configured.")
      return
    }
    setLoadError("")

    const activeIds = new Set<string>()

    const addActive = (r: { data?: { customer_id?: string }[] | null; error?: { message?: string } | null }) => {
      if (!r.error && r.data) r.data.forEach((row) => row.customer_id && activeIds.add(row.customer_id))
    }

    let eventsRes = await supabase.from("calendar_events").select("customer_id").eq("user_id", userId).is("removed_at", null).is("completed_at", null)
    if (eventsRes.error) {
      eventsRes = await supabase.from("calendar_events").select("customer_id").eq("user_id", userId).is("removed_at", null)
    }
    addActive(eventsRes)

    const leadsRes = await supabase.from("leads").select("customer_id").eq("user_id", userId).is("removed_at", null).is("converted_at", null)
    const leadsResFallback = leadsRes.error
      ? await supabase.from("leads").select("customer_id").eq("user_id", userId).is("removed_at", null)
      : leadsRes
    addActive(leadsResFallback)

    const convosRes = await supabase.from("conversations").select("customer_id").eq("user_id", userId).is("removed_at", null)
    addActive(convosRes)

    const quotesRes = await supabase.from("quotes").select("customer_id").eq("user_id", userId).is("removed_at", null).is("scheduled_at", null)
    addActive(quotesRes)

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

    const fullSelect = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        last_activity_at,
        customer_identifiers (
          type,
          value
        )
      `
    let customers: CustomerRow[] | null = null
    let error: { message: string } | null = null
    {
      const r = await supabase.from("customers").select(fullSelect).in("id", idList)
      error = r.error
      customers = (r.data as CustomerRow[] | null) ?? null
    }
    if (error && (error.message.includes("best_contact") || error.message.includes("job_pipeline") || error.message.includes("last_activity"))) {
      const r2 = await supabase
        .from("customers")
        .select(
          `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        customer_identifiers (
          type,
          value
        )
      `,
        )
        .in("id", idList)
      if (!r2.error) {
        customers = (r2.data as CustomerRow[] | null) ?? null
        error = null
        setLoadError("Run supabase/customers-pipeline-columns.sql to enable Best contact, Job status, and Last update columns.")
      }
    }
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
  }, [userId])

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

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

  useEffect(() => {
    if (selectedCustomer) applyDetailFromCustomer(selectedCustomer)
  }, [selectedCustomer, applyDetailFromCustomer])

  const currentList = section === "active" ? activeCustomers : archivedCustomers
  const filtered = currentList.filter((c) => {
    const name = (c.display_name || "").toLowerCase()
    const phone = c.customer_identifiers?.find((i) => i.type === "phone")?.value || ""
    const searchLower = search.toLowerCase().trim()
    const phoneFilter = filterPhone.trim()
    return (!searchLower || name.includes(searchLower)) && (!phoneFilter || phone.includes(phoneFilter))
  })
  const sorted = [...filtered].sort((a, b) => {
    let aVal = ""
    let bVal = ""
    if (sortField === "name") {
      aVal = (a.display_name || "").toLowerCase()
      bVal = (b.display_name || "").toLowerCase()
    } else if (sortField === "best_contact") {
      aVal = displayBestContact(a).toLowerCase()
      bVal = displayBestContact(b).toLowerCase()
    } else if (sortField === "job_status") {
      aVal = (a.job_pipeline_status || inferDefaultBestContact(a)).toLowerCase()
      bVal = (b.job_pipeline_status || inferDefaultBestContact(b)).toLowerCase()
    } else if (sortField === "last_update") {
      aVal = String(Date.parse(a.last_activity_at || a.updated_at || "") || 0)
      bVal = String(Date.parse(b.last_activity_at || b.updated_at || "") || 0)
    } else {
      aVal = (a.customer_identifiers?.find((i) => i.type === "phone")?.value || "").toLowerCase()
      bVal = (b.customer_identifiers?.find((i) => i.type === "phone")?.value || "").toLowerCase()
    }
    const cmp = aVal.localeCompare(bVal, undefined, { numeric: sortField === "last_update" })
    return sortAsc ? cmp : -cmp
  })

  const selectedRowText = "#0f172a"

  function activateCustomerRow(c: CustomerRow) {
    if (selectedCustomer?.id === c.id) {
      setSelectedCustomer(null)
      setDetailEditMode(false)
    } else {
      setSelectedCustomer(c)
      setDetailEditMode(false)
    }
  }

  async function geocodeCustomerServiceAddress() {
    const q = detailForm.serviceAddress.trim()
    if (!q) {
      alert("Enter a street address first (include city and state when you can).")
      return
    }
    setServiceGeocodeBusy(true)
    try {
      const coords = await geocodeAddressToLatLng(q)
      if (!coords) {
        alert("Could not find coordinates for that address. Try a fuller street + city + state.")
        return
      }
      setDetailForm((p) => ({ ...p, serviceLat: String(coords.lat), serviceLng: String(coords.lng) }))
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setServiceGeocodeBusy(false)
    }
  }

  async function saveCustomerDetail() {
    if (!supabase || !userId || !selectedCustomer) return
    setDetailSaving(true)
    try {
      const cid = selectedCustomer.id
      const phoneT = detailForm.phone.trim()
      const emailT = detailForm.email.trim().toLowerCase()
      const nameT = detailForm.customerName.trim()
      const latRaw = detailForm.serviceLat.trim()
      const lngRaw = detailForm.serviceLng.trim()
      const latN = latRaw ? Number.parseFloat(latRaw) : Number.NaN
      const lngN = lngRaw ? Number.parseFloat(lngRaw) : Number.NaN
      const nowIso = new Date().toISOString()
      const custPatch: Record<string, unknown> = {
        display_name: nameT || null,
        service_address: detailForm.serviceAddress.trim() || null,
        service_lat: Number.isFinite(latN) ? latN : null,
        service_lng: Number.isFinite(lngN) ? lngN : null,
        best_contact_method: detailForm.bestContact.trim() || null,
        job_pipeline_status: detailForm.jobStatus.trim() || null,
        last_activity_at: nowIso,
      }
      let { error: custErr } = await supabase.from("customers").update(custPatch).eq("id", cid)
      if (custErr && String(custErr.message || "").toLowerCase().match(/service_|best_contact|job_pipeline|last_activity/)) {
        const { best_contact_method: _bc, job_pipeline_status: _js, last_activity_at: _la, ...rest } = custPatch
        const r = await supabase.from("customers").update(rest).eq("id", cid)
        custErr = r.error
        if (!custErr) {
          setLoadError((prev) => prev || "Saved core fields. Run supabase/customers-pipeline-columns.sql for pipeline columns.")
        }
      }
      if (custErr) throw custErr

      const { error: delErr } = await supabase.from("customer_identifiers").delete().eq("customer_id", cid).in("type", ["phone", "email", "name"])
      if (delErr) throw delErr

      const identRows: Array<{ user_id: string; customer_id: string; type: string; value: string; is_primary: boolean; verified: boolean }> = []
      if (phoneT) identRows.push({ user_id: userId, customer_id: cid, type: "phone", value: phoneT, is_primary: true, verified: false })
      if (emailT)
        identRows.push({
          user_id: userId,
          customer_id: cid,
          type: "email",
          value: emailT,
          is_primary: identRows.length === 0,
          verified: false,
        })
      if (nameT)
        identRows.push({
          user_id: userId,
          customer_id: cid,
          type: "name",
          value: nameT,
          is_primary: identRows.length === 0,
          verified: false,
        })
      if (identRows.length > 0) {
        const { error: insErr } = await supabase.from("customer_identifiers").insert(identRows)
        if (insErr) throw insErr
      }

      await loadCustomers()
      const fullSelectOne = `
        id,
        display_name,
        updated_at,
        service_address,
        service_lat,
        service_lng,
        best_contact_method,
        job_pipeline_status,
        last_activity_at,
        customer_identifiers ( type, value )
      `
      const tried = await supabase.from("customers").select(fullSelectOne).eq("id", cid).maybeSingle()
      let nextSel: CustomerRow | null = tried.error ? null : (tried.data as CustomerRow | null)
      if (tried.error) {
        const fb = await supabase
          .from("customers")
          .select(`id, display_name, updated_at, service_address, service_lat, service_lng, customer_identifiers ( type, value )`)
          .eq("id", cid)
          .maybeSingle()
        if (!fb.error && fb.data) nextSel = fb.data as CustomerRow
      }
      if (nextSel) setSelectedCustomer(nextSel)
      setDetailEditMode(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailSaving(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0, position: "relative" }}>
      <div>
        <h1 style={{ margin: 0 }}>Customers</h1>
        <p style={{ fontSize: "14px", color: "#cbd5e1", marginTop: "6px", marginBottom: 0 }}>
          All customers from Leads, Conversations, Quotes, and Calendar. Active = has open work; Archived = everything removed or completed.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setShowAutoReplies(true)}
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
            color: theme.text,
            fontWeight: 600,
          }}
        >
          {portalConfig?.controlLabels?.automatic_replies ?? "Automatic replies"}
        </button>
        {userId ? <TabNotificationAlertsButton tab="customers" profileUserId={userId} /> : null}
      </div>

      <ConversationAutoRepliesModal
        open={showAutoReplies}
        onClose={() => setShowAutoReplies(false)}
        userId={userId}
        portalConfig={portalConfig}
        aiAutomationsEnabled={aiAutomationsEnabled}
        hideCarryOverToQuotes
      />

      {!supabase && (
        <p style={{ color: "#b91c1c" }}>Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to tradesman/.env and restart the dev server.</p>
      )}

      {loadError && <p style={{ color: "#b91c1c", marginBottom: 0 }}>{loadError}</p>}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          alignItems: "flex-end",
          marginBottom: 0,
          padding: "12px",
          background: theme.charcoalSmoke,
          borderRadius: "8px",
          border: `1px solid ${theme.border}`,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>List</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setSection("active")
                setSelectedCustomer(null)
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: section === "active" ? `2px solid ${theme.primary}` : "1px solid #d1d5db",
                background: section === "active" ? "#eff6ff" : "white",
                cursor: "pointer",
                color: theme.text,
                fontWeight: section === "active" ? 600 : 400,
              }}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => {
                setSection("archived")
                setSelectedCustomer(null)
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: section === "archived" ? `2px solid ${theme.primary}` : "1px solid #d1d5db",
                background: section === "archived" ? "#eff6ff" : "white",
                cursor: "pointer",
                color: theme.text,
                fontWeight: section === "archived" ? 600 : 400,
              }}
            >
              Archived
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Filter</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="By name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
            />
            <input
              type="text"
              placeholder="By phone..."
              value={filterPhone}
              onChange={(e) => setFilterPhone(e.target.value)}
              style={{ padding: "6px 10px", width: isMobile ? "100%" : "160px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text }}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: isMobile ? "1 1 100%" : undefined }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Sort by</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", background: "white", color: theme.text, cursor: "pointer" }}
            >
              <option value="name">Name</option>
              <option value="best_contact">Best contact</option>
              <option value="job_status">Job status</option>
              <option value="last_update">Last update</option>
              <option value="phone">Phone</option>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginLeft: isMobile ? 0 : "auto" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#e5e7eb" }}>Reload list</label>
          <button
            type="button"
            onClick={() => void loadCustomers()}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "none",
              background: theme.primary,
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: isMobile ? "720px" : "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th onClick={() => { setSortField("name"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Name
              </th>
              <th onClick={() => { setSortField("best_contact"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Best contact
              </th>
              <th onClick={() => { setSortField("job_status"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Job status
              </th>
              <th onClick={() => { setSortField("last_update"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Last update
              </th>
              <th onClick={() => { setSortField("phone"); setSortAsc(!sortAsc) }} style={{ padding: "8px", cursor: "pointer" }}>
                Phone
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "16px", color: "#6b7280" }}>
                  {section === "active" ? "No active customers." : "No archived customers."}
                </td>
              </tr>
            ) : (
              sorted.map((c) => {
                const phone = c.customer_identifiers?.find((i) => i.type === "phone")?.value || "—"
                const isRowSelected = selectedCustomer?.id === c.id
                const cellBase = {
                  padding: "8px" as const,
                  color: isRowSelected ? selectedRowText : undefined,
                  fontWeight: isRowSelected ? (600 as const) : (400 as const),
                }
                return (
                  <Fragment key={c.id}>
                    <tr
                      onClick={() => activateCustomerRow(c)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid #eee",
                        background: isRowSelected ? "#bae6fd" : "transparent",
                      }}
                    >
                      <td style={cellBase}>{c.display_name || "—"}</td>
                      <td style={{ ...cellBase, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis" }} title={displayBestContact(c)}>
                        {displayBestContact(c)}
                      </td>
                      <td style={{ ...cellBase, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }} title={c.job_pipeline_status || JOB_PIPELINE_OPTIONS[0]}>
                        {c.job_pipeline_status?.trim() || JOB_PIPELINE_OPTIONS[0]}
                      </td>
                      <td style={{ ...cellBase, fontSize: 13, color: isRowSelected ? selectedRowText : "#64748b" }}>{lastUpdateDisplay(c)}</td>
                      <td style={{ ...cellBase, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis" }} title={phone !== "—" ? phone : undefined}>
                        {phone}
                      </td>
                    </tr>
                    {isRowSelected ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            padding: 0,
                            borderBottom: "1px solid #e5e7eb",
                            background: "#f8fafc",
                            verticalAlign: "top",
                          }}
                        >
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: "16px 18px 20px",
                              maxWidth: "min(960px, 100%)",
                              boxSizing: "border-box",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                              <div>
                                <h3 style={{ margin: 0, fontSize: 18, color: theme.text }}>{c.display_name || "Customer"}</h3>
                                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>
                                  Edit contact, pipeline, and site details. Use Notes and call actions like Conversations. Click the same row again to close.
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Close customer detail"
                                onClick={() => setSelectedCustomer(null)}
                                style={{
                                  flexShrink: 0,
                                  width: 36,
                                  height: 36,
                                  borderRadius: 8,
                                  border: `1px solid ${theme.border}`,
                                  background: "#fff",
                                  cursor: "pointer",
                                  fontSize: 18,
                                  lineHeight: 1,
                                  color: theme.text,
                                }}
                              >
                                ✕
                              </button>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                              <button
                                type="button"
                                onClick={() => setDetailEditMode((e) => !e)}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 6,
                                  border: `1px solid ${theme.border}`,
                                  background: "#fff",
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  fontSize: 13,
                                }}
                              >
                                {detailEditMode ? "Stop editing" : "Edit details"}
                              </button>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNotesCustomerId(c.id)
                                    setNotesCustomerName(c.display_name ?? "")
                                  }}
                                  style={{
                                    padding: "4px 10px",
                                    fontSize: "12px",
                                    background: theme.primary,
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                  }}
                                >
                                  Notes
                                </button>
                                {(() => {
                                  const ph = c.customer_identifiers?.find((i) => i.type === "phone")?.value ?? ""
                                  return ph.trim() ? <CustomerCallButton phone={ph} bridgeOwnerUserId={userId} compact /> : null
                                })()}
                              </div>
                            </div>

                            <div style={{ display: "grid", gap: 10, fontSize: 14, color: theme.text }}>
                              <div style={{ display: "grid", gap: 8 }}>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Last update</span>
                                  <div style={{ marginTop: 2 }}>{lastUpdateDisplay(c)}</div>
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Name</span>
                                  {detailEditMode ? (
                                    <input
                                      value={detailForm.customerName}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, customerName: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, width: "100%", maxWidth: 400 }}
                                    />
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{c.display_name || "—"}</div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Best contact</span>
                                  {detailEditMode ? (
                                    <select
                                      value={detailForm.bestContact}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, bestContact: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, maxWidth: 280 }}
                                    >
                                      {DEFAULT_BEST_CONTACT_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{displayBestContact(c)}</div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Job status</span>
                                  {detailEditMode ? (
                                    <select
                                      value={detailForm.jobStatus}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, jobStatus: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, maxWidth: 320 }}
                                    >
                                      {JOB_PIPELINE_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{c.job_pipeline_status?.trim() || JOB_PIPELINE_OPTIONS[0]}</div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Phone</span>
                                  {detailEditMode ? (
                                    <input
                                      value={detailForm.phone}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, phone: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, width: "100%", maxWidth: 400 }}
                                    />
                                  ) : (
                                    <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                      {(() => {
                                        const ph = c.customer_identifiers?.find((i) => i.type === "phone")?.value ?? ""
                                        return ph.trim() ? <CustomerCallButton phone={ph} bridgeOwnerUserId={userId} compact /> : "—"
                                      })()}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Email</span>
                                  {detailEditMode ? (
                                    <input
                                      value={detailForm.email}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, email: e.target.value }))}
                                      style={{ ...theme.formInput, marginTop: 4, width: "100%", maxWidth: 400 }}
                                    />
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{c.customer_identifiers?.find((i) => i.type === "email")?.value ?? "—"}</div>
                                  )}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Service address</span>
                                  {detailEditMode ? (
                                    <textarea
                                      value={detailForm.serviceAddress}
                                      onChange={(e) => setDetailForm((p) => ({ ...p, serviceAddress: e.target.value }))}
                                      rows={2}
                                      style={{ ...theme.formInput, marginTop: 4, width: "100%", maxWidth: 480, resize: "vertical" }}
                                    />
                                  ) : (
                                    <div style={{ marginTop: 2 }}>{typeof c.service_address === "string" && c.service_address.trim() ? c.service_address : "—"}</div>
                                  )}
                                </div>
                                {detailEditMode ? (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                    <label style={{ fontSize: 12, color: "#64748b" }}>
                                      Lat
                                      <input
                                        value={detailForm.serviceLat}
                                        onChange={(e) => setDetailForm((p) => ({ ...p, serviceLat: e.target.value }))}
                                        style={{ ...theme.formInput, marginLeft: 6, width: 120 }}
                                      />
                                    </label>
                                    <label style={{ fontSize: 12, color: "#64748b" }}>
                                      Lng
                                      <input
                                        value={detailForm.serviceLng}
                                        onChange={(e) => setDetailForm((p) => ({ ...p, serviceLng: e.target.value }))}
                                        style={{ ...theme.formInput, marginLeft: 6, width: 120 }}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      disabled={serviceGeocodeBusy || detailSaving}
                                      onClick={() => void geocodeCustomerServiceAddress()}
                                      style={{
                                        padding: "6px 12px",
                                        borderRadius: 6,
                                        border: `1px solid ${theme.border}`,
                                        background: "#fff",
                                        cursor: serviceGeocodeBusy ? "wait" : "pointer",
                                        fontWeight: 600,
                                        fontSize: 12,
                                      }}
                                    >
                                      {serviceGeocodeBusy ? "Looking up…" : "Look up coordinates"}
                                    </button>
                                  </div>
                                ) : null}
                                {detailEditMode ? (
                                  <div style={{ marginTop: 8 }}>
                                    <button
                                      type="button"
                                      disabled={detailSaving}
                                      onClick={() => void saveCustomerDetail()}
                                      style={{
                                        padding: "8px 16px",
                                        borderRadius: 6,
                                        border: "none",
                                        background: theme.primary,
                                        color: "#fff",
                                        fontWeight: 600,
                                        cursor: detailSaving ? "wait" : "pointer",
                                      }}
                                    >
                                      {detailSaving ? "Saving…" : "Save customer"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {notesCustomerId && (
        <CustomerNotesPanel
          customerId={notesCustomerId}
          customerName={notesCustomerName}
          onClose={() => {
            setNotesCustomerId(null)
            setNotesCustomerName("")
          }}
        />
      )}
    </div>
  )
}
