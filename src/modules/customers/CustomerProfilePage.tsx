import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import CommunicationUrgencyBadge from "../../components/CommunicationUrgencyBadge"
import { consumeQueuedCustomerProfile, queueCustomerFocus, queueCustomerProfile } from "../../lib/customerNavigation"
import {
  queueCustomReceiptCustomerPrefill,
  queueQuotesCustomerPrefill,
  queueSchedulingCustomerPrefill,
} from "../../lib/workflowNavigation"
import { loadCustomerProfileBundle, type CustomerProfileBundle } from "../../lib/customerProfileData"
import { formatAppError } from "../../lib/formatAppError"
import { formatDisplayText } from "../../lib/formatDisplayText"
import { formatCommEventEmailAddressSummary } from "../../lib/communicationEmailAddresses"
import { splitEmailToSeparateCustomer } from "../../lib/splitCustomerEmail"
import { geocodeAddressToLatLng } from "../../lib/jobSiteLocation"
import { useIsMobile } from "../../hooks/useIsMobile"

type Props = {
  setPage: (page: string) => void
}

const DEFAULT_BEST_CONTACT_OPTIONS = ["Phone call", "Text message", "Email", "Other"] as const

type ContactFormState = {
  customerName: string
  phone: string
  email: string
  serviceAddress: string
  serviceLat: string
  serviceLng: string
  bestContact: string
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

function parseProfileNotesPast(raw: unknown): { id: string; text: string; saved_at: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { id: string; text: string; saved_at: string }[] = []
  raw.forEach((x, i) => {
    const text = formatDisplayText(x && typeof x === "object" && !Array.isArray(x) ? (x as { text?: unknown }).text : x, "")
    if (!text) return
    const o = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
    const saved_at = typeof o.saved_at === "string" ? o.saved_at : ""
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `note-${i}`
    out.push({ id, text, saved_at })
  })
  return out.sort((a, b) => (b.saved_at || "").localeCompare(a.saved_at || ""))
}

function CollapsibleProfileSection({
  title,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  badge,
  headerActions,
  children,
}: {
  title: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  badge?: string | number
  headerActions?: ReactNode
  children: ReactNode
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  return (
    <section
      style={{
        marginBottom: 16,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderBottom: open ? `1px solid ${theme.border}` : "none",
        }}
      >
        <button
          type="button"
          onClick={() => {
            const next = !open
            onOpenChange?.(next)
            if (controlledOpen === undefined) setInternalOpen(next)
          }}
          aria-expanded={open}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            minWidth: 0,
          }}
        >
          <span style={{ color: "#64748b", fontSize: 13, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#475569" }}>{title}</span>
          {badge != null && badge !== "" && badge !== 0 ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                background: "#f1f5f9",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              {badge}
            </span>
          ) : null}
        </button>
        {headerActions ? <div style={{ flexShrink: 0 }}>{headerActions}</div> : null}
      </div>
      {open ? <div style={{ padding: 16 }}>{children}</div> : null}
    </section>
  )
}

export default function CustomerProfilePage({ setPage }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const isMobile = useIsMobile()
  const [customerId] = useState<string | null>(() => consumeQueuedCustomerProfile())
  const [bundle, setBundle] = useState<CustomerProfileBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [splitBusyEmail, setSplitBusyEmail] = useState<string | null>(null)
  const [contactEditMode, setContactEditMode] = useState(false)
  const [contactSectionOpen, setContactSectionOpen] = useState(false)
  const [contactSaving, setContactSaving] = useState(false)
  const [serviceGeocodeBusy, setServiceGeocodeBusy] = useState(false)
  const [contactForm, setContactForm] = useState<ContactFormState>({
    customerName: "",
    phone: "",
    email: "",
    serviceAddress: "",
    serviceLat: "",
    serviceLng: "",
    bestContact: DEFAULT_BEST_CONTACT_OPTIONS[0],
  })

  const reload = useCallback(async () => {
    if (!supabase || !userId || !customerId) return
    setLoading(true)
    setErr("")
    try {
      const data = await loadCustomerProfileBundle(supabase, userId, customerId)
      setBundle(data)
    } catch (e: unknown) {
      setErr(formatAppError(e))
      setBundle(null)
    } finally {
      setLoading(false)
    }
  }, [userId, customerId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!bundle) return
    const c = bundle.customer
    const bc = formatDisplayText(c.best_contact_method, "")
    const best = (DEFAULT_BEST_CONTACT_OPTIONS as readonly string[]).includes(bc) ? bc : DEFAULT_BEST_CONTACT_OPTIONS[0]
    setContactForm({
      customerName: formatDisplayText(c.display_name, ""),
      phone: bundle.phone,
      email: bundle.email,
      serviceAddress: formatDisplayText(c.service_address, ""),
      serviceLat: c.service_lat != null && Number.isFinite(Number(c.service_lat)) ? String(c.service_lat) : "",
      serviceLng: c.service_lng != null && Number.isFinite(Number(c.service_lng)) ? String(c.service_lng) : "",
      bestContact: best,
    })
  }, [bundle])

  function backToCustomers() {
    if (customerId) queueCustomerFocus(customerId)
    setPage("customers")
  }

  async function geocodeServiceAddress() {
    const q = contactForm.serviceAddress.trim()
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
      setContactForm((p) => ({ ...p, serviceLat: String(coords.lat), serviceLng: String(coords.lng) }))
    } catch (e) {
      alert(formatAppError(e))
    } finally {
      setServiceGeocodeBusy(false)
    }
  }

  async function saveContactJobSite() {
    if (!supabase || !userId || !customerId || !bundle) return
    setContactSaving(true)
    setErr("")
    try {
      const phoneT = contactForm.phone.trim()
      const emailT = contactForm.email.trim().toLowerCase()
      const nameT = contactForm.customerName.trim()
      const latRaw = contactForm.serviceLat.trim()
      const lngRaw = contactForm.serviceLng.trim()
      const latN = latRaw ? Number.parseFloat(latRaw) : Number.NaN
      const lngN = lngRaw ? Number.parseFloat(lngRaw) : Number.NaN
      const nowIso = new Date().toISOString()

      const custPatch: Record<string, unknown> = {
        display_name: nameT || null,
        service_address: contactForm.serviceAddress.trim() || null,
        service_lat: Number.isFinite(latN) ? latN : null,
        service_lng: Number.isFinite(lngN) ? lngN : null,
        best_contact_method: contactForm.bestContact.trim() || null,
        last_activity_at: nowIso,
      }

      let { error: custErr } = await supabase.from("customers").update(custPatch).eq("id", customerId).eq("user_id", userId)
      if (custErr && String(custErr.message || "").toLowerCase().match(/service_|best_contact|last_activity/)) {
        const { best_contact_method: _bc, last_activity_at: _la, ...rest } = custPatch
        const r = await supabase.from("customers").update(rest).eq("id", customerId).eq("user_id", userId)
        custErr = r.error
      }
      if (custErr) throw custErr

      const { error: delPhoneErr } = await supabase
        .from("customer_identifiers")
        .delete()
        .eq("customer_id", customerId)
        .eq("user_id", userId)
        .eq("type", "phone")
      if (delPhoneErr) throw delPhoneErr
      if (phoneT) {
        const { error: insPhoneErr } = await supabase.from("customer_identifiers").insert({
          user_id: userId,
          customer_id: customerId,
          type: "phone",
          value: phoneT,
          is_primary: true,
          verified: false,
        })
        if (insPhoneErr) throw insPhoneErr
      }

      const { data: emailIdents, error: loadEmailErr } = await supabase
        .from("customer_identifiers")
        .select("id, value, is_primary")
        .eq("customer_id", customerId)
        .eq("user_id", userId)
        .eq("type", "email")
      if (loadEmailErr) throw loadEmailErr

      const rows = (emailIdents ?? []) as { id: string; value: string; is_primary?: boolean }[]
      const primaryRow = rows.find((r) => r.is_primary) ?? rows[0]

      if (emailT) {
        if (primaryRow) {
          const { error: upEmailErr } = await supabase.from("customer_identifiers").update({ value: emailT }).eq("id", primaryRow.id)
          if (upEmailErr) throw upEmailErr
        } else {
          const { error: insEmailErr } = await supabase.from("customer_identifiers").insert({
            user_id: userId,
            customer_id: customerId,
            type: "email",
            value: emailT,
            is_primary: true,
            verified: false,
          })
          if (insEmailErr) throw insEmailErr
        }
      } else if (primaryRow) {
        const { error: delPrimaryErr } = await supabase.from("customer_identifiers").delete().eq("id", primaryRow.id)
        if (delPrimaryErr) throw delPrimaryErr
      }

      const { error: delNameErr } = await supabase
        .from("customer_identifiers")
        .delete()
        .eq("customer_id", customerId)
        .eq("user_id", userId)
        .eq("type", "name")
      if (delNameErr) throw delNameErr
      if (nameT) {
        const { error: insNameErr } = await supabase.from("customer_identifiers").insert({
          user_id: userId,
          customer_id: customerId,
          type: "name",
          value: nameT,
          is_primary: false,
          verified: false,
        })
        if (insNameErr) throw insNameErr
      }

      setContactEditMode(false)
      await reload()
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setContactSaving(false)
    }
  }

  async function splitEmailFromOrg(email: string) {
    if (!supabase || !userId || !customerId) return
    const ok = window.confirm(
      `Split ${email} into its own customer?\n\nFuture email from this address will go to the new profile. Past messages stay on this customer.`,
    )
    if (!ok) return
    setSplitBusyEmail(email)
    setErr("")
    try {
      const { newCustomerId } = await splitEmailToSeparateCustomer(supabase, userId, customerId, email)
      queueCustomerProfile(newCustomerId)
      setPage("customer-profile")
    } catch (e: unknown) {
      setErr(formatAppError(e))
    } finally {
      setSplitBusyEmail(null)
    }
  }

  if (!customerId) {
    return (
      <div style={{ maxWidth: 720, padding: isMobile ? 16 : 24 }}>
        <button type="button" onClick={() => setPage("customers")} style={backBtnStyle}>
          ← Back to Customers
        </button>
        <p style={{ color: "#64748b", marginTop: 16 }}>No customer selected. Open a profile from the Customers list.</p>
      </div>
    )
  }

  const c = bundle?.customer
  const notesPast = c ? parseProfileNotesPast(c.notes_past) : []

  const contactHeaderActions = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {contactEditMode ? (
        <>
          <button type="button" disabled={contactSaving} onClick={() => void saveContactJobSite()} style={primaryBtnStyle}>
            {contactSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={contactSaving}
            onClick={() => {
              setContactEditMode(false)
              if (bundle) {
                const row = bundle.customer
                const bc = formatDisplayText(row.best_contact_method, "")
                const best = (DEFAULT_BEST_CONTACT_OPTIONS as readonly string[]).includes(bc) ? bc : DEFAULT_BEST_CONTACT_OPTIONS[0]
                setContactForm({
                  customerName: formatDisplayText(row.display_name, ""),
                  phone: bundle.phone,
                  email: bundle.email,
                  serviceAddress: formatDisplayText(row.service_address, ""),
                  serviceLat: row.service_lat != null && Number.isFinite(Number(row.service_lat)) ? String(row.service_lat) : "",
                  serviceLng: row.service_lng != null && Number.isFinite(Number(row.service_lng)) ? String(row.service_lng) : "",
                  bestContact: best,
                })
              }
            }}
            style={backBtnStyle}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setContactSectionOpen(true)
            setContactEditMode(true)
          }}
          style={backBtnStyle}
        >
          Edit
        </button>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: isMobile ? "12px 12px 32px" : "8px 24px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button type="button" onClick={backToCustomers} style={backBtnStyle}>
          ← Customers
        </button>
        <button type="button" onClick={() => void reload()} disabled={loading} style={backBtnStyle}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {err ? <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p> : null}
      {loading && !bundle ? <p style={{ color: "#64748b" }}>Loading customer profile…</p> : null}

      {bundle && c ? (
        <>
          <header
            style={{
              marginBottom: 20,
              padding: isMobile ? 16 : 20,
              borderRadius: 14,
              border: `1px solid ${theme.border}`,
              background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 55%)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? "1.35rem" : "1.75rem", fontWeight: 800, color: theme.text }}>
                  {formatDisplayText(c.display_name, "Customer profile")}
                </h1>
                <p style={{ margin: "8px 0 0", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
                  {formatDisplayText(bundle.contactLine, "—")}
                </p>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <CommunicationUrgencyBadge
                    level={
                      typeof c.communication_urgency === "string"
                        ? c.communication_urgency
                        : formatDisplayText(c.communication_urgency, "") || null
                    }
                  />
                  {formatDisplayText(c.job_pipeline_status, "") ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                      {formatDisplayText(c.job_pipeline_status)}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    Last update: {formatWhen(typeof c.last_activity_at === "string" ? c.last_activity_at : null)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    queueSchedulingCustomerPrefill(c.id)
                    setPage("calendar")
                  }}
                  style={secondaryBtnStyle}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => {
                    queueQuotesCustomerPrefill(c.id)
                    setPage("quotes")
                  }}
                  style={secondaryBtnStyle}
                >
                  Open estimate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    queueCustomReceiptCustomerPrefill(c.id)
                    setPage("calendar")
                  }}
                  style={secondaryBtnStyle}
                >
                  Custom receipt
                </button>
              </div>
            </div>
          </header>

          <CollapsibleProfileSection
            title="Contact & job site"
            open={contactSectionOpen || contactEditMode}
            onOpenChange={setContactSectionOpen}
            headerActions={contactHeaderActions}
          >
            {bundle.orgGroupLabel ? (
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
                {bundle.orgGroupLabel} — addresses on the same business domain are grouped here by default. Split any extra address below to give it its own customer.
              </p>
            ) : null}
            {contactEditMode ? (
              <div style={{ display: "grid", gap: 12, fontSize: 14, maxWidth: 520 }}>
                <Field label="Name">
                  <input
                    value={contactForm.customerName}
                    onChange={(e) => setContactForm((p) => ({ ...p, customerName: e.target.value }))}
                    style={{ ...theme.formInput, width: "100%" }}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={contactForm.phone}
                    onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                    style={{ ...theme.formInput, width: "100%" }}
                  />
                </Field>
                <Field label={bundle.emails.length > 1 ? "Primary email" : "Email"}>
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                    style={{ ...theme.formInput, width: "100%" }}
                  />
                </Field>
                {bundle.emails.length > 1 ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                    Other addresses on this profile: {bundle.emails.filter((e) => e !== contactForm.email.trim().toLowerCase()).join(", ") || "—"}
                  </p>
                ) : null}
                <Field label="Best contact">
                  <select
                    value={contactForm.bestContact}
                    onChange={(e) => setContactForm((p) => ({ ...p, bestContact: e.target.value }))}
                    style={{ ...theme.formInput, width: "100%", maxWidth: 280 }}
                  >
                    {DEFAULT_BEST_CONTACT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Service address">
                  <textarea
                    value={contactForm.serviceAddress}
                    onChange={(e) => setContactForm((p) => ({ ...p, serviceAddress: e.target.value }))}
                    rows={3}
                    style={{ ...theme.formInput, width: "100%", resize: "vertical" }}
                  />
                </Field>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <button type="button" disabled={serviceGeocodeBusy} onClick={() => void geocodeServiceAddress()} style={backBtnStyle}>
                    {serviceGeocodeBusy ? "Looking up…" : "Look up coordinates"}
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Latitude">
                    <input
                      value={contactForm.serviceLat}
                      onChange={(e) => setContactForm((p) => ({ ...p, serviceLat: e.target.value }))}
                      style={{ ...theme.formInput, width: "100%" }}
                    />
                  </Field>
                  <Field label="Longitude">
                    <input
                      value={contactForm.serviceLng}
                      onChange={(e) => setContactForm((p) => ({ ...p, serviceLng: e.target.value }))}
                      style={{ ...theme.formInput, width: "100%" }}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                <ProfileRow label="Phone" value={formatDisplayText(bundle.phone, "—")} />
                {bundle.emails.length > 1 ? (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.04 }}>
                      Email addresses
                    </div>
                    <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
                      {bundle.emails.map((addr) => (
                        <div
                          key={addr}
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: `1px solid ${theme.border}`,
                            background: "#f8fafc",
                          }}
                        >
                          <span style={{ fontWeight: 600, color: theme.text, wordBreak: "break-all" }}>{addr}</span>
                          {bundle.orgGroupLabel ? (
                            <button
                              type="button"
                              disabled={splitBusyEmail === addr}
                              onClick={() => void splitEmailFromOrg(addr)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                border: `1px solid ${theme.border}`,
                                background: "#fff",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: splitBusyEmail === addr ? "wait" : "pointer",
                                color: "#0f172a",
                              }}
                            >
                              {splitBusyEmail === addr ? "Splitting…" : "Split to own customer"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ProfileRow label="Email" value={formatDisplayText(bundle.email, "—")} />
                )}
                <ProfileRow label="Best contact" value={formatDisplayText(c.best_contact_method, "—")} />
                <ProfileRow label="Service address" value={formatDisplayText(c.service_address, "—")} />
                {c.service_lat != null && c.service_lng != null ? (
                  <ProfileRow label="Coordinates" value={`${c.service_lat}, ${c.service_lng}`} />
                ) : null}
              </div>
            )}
          </CollapsibleProfileSection>

          {formatDisplayText(c.notes) || notesPast.length > 0 ? (
            <CollapsibleProfileSection title="Notes">
              {formatDisplayText(c.notes) ? (
                <p style={{ margin: notesPast.length > 0 ? "0 0 12px" : 0, fontSize: 14, color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {formatDisplayText(c.notes)}
                </p>
              ) : null}
              {notesPast.length > 0 ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {notesPast.map((n) => (
                    <div
                      key={n.id}
                      style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${theme.border}`, background: "#f8fafc" }}
                    >
                      {n.saved_at ? (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>{formatWhen(n.saved_at)}</div>
                      ) : null}
                      <div style={{ fontSize: 14, color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{n.text}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CollapsibleProfileSection>
          ) : null}

          <CollapsibleProfileSection title="Activity history" badge={bundle.commEvents.length || undefined}>
            {bundle.commEvents.length === 0 ? (
              <Empty text="No communication events logged yet." />
            ) : (
              <Timeline
                rows={bundle.commEvents.slice(0, 40).map((ev) => {
                  const emailAddr = ev.event_type === "email" ? formatCommEventEmailAddressSummary(ev) : null
                  const metaParts = [formatDisplayText(ev.direction, ""), emailAddr, formatWhen(ev.created_at)].filter(Boolean)
                  return {
                    key: ev.id,
                    title: formatDisplayText(ev.subject, "") || formatDisplayText(ev.event_type, "Event"),
                    meta: metaParts.join(" · "),
                    body: formatDisplayText(ev.body, ""),
                  }
                })}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Calendar events" badge={bundle.calendarEvents.length || undefined}>
            {bundle.calendarEvents.length === 0 ? (
              <Empty text="No scheduled jobs linked to this customer." />
            ) : (
              <Timeline
                rows={bundle.calendarEvents.map((ev) => ({
                  key: ev.id,
                  title: formatDisplayText(ev.title, "Untitled job"),
                  meta: `${formatWhen(ev.start_at)}${ev.completed_at ? " · Completed" : " · Scheduled"}`,
                  body: formatDisplayText(ev.notes, "") || (ev.quote_id ? "Linked to estimate" : ""),
                  actions: (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      <MiniBtn
                        label="Calendar"
                        onClick={() => {
                          queueSchedulingCustomerPrefill(c.id)
                          setPage("calendar")
                        }}
                      />
                      {ev.quote_id ? (
                        <MiniBtn
                          label="Estimate"
                          onClick={() => {
                            queueQuotesCustomerPrefill(c.id)
                            setPage("quotes")
                          }}
                        />
                      ) : null}
                    </div>
                  ),
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Estimates" badge={bundle.quotes.length || undefined}>
            {bundle.quotes.length === 0 ? (
              <Empty text="No estimates for this customer yet." />
            ) : (
              <Timeline
                rows={bundle.quotes.map((q) => ({
                  key: q.id,
                  title: formatDisplayText(q.title, "") || `Estimate ${q.id.slice(0, 8)}…`,
                  meta: `${formatDisplayText(q.status, "unknown")} · Updated ${formatWhen(q.updated_at ?? q.created_at)}`,
                  body: "",
                  actions: (
                    <MiniBtn
                      label="Open in Estimates"
                      onClick={() => {
                        queueQuotesCustomerPrefill(c.id)
                        setPage("quotes")
                      }}
                    />
                  ),
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Receipts" badge={bundle.receipts.length || undefined}>
            {bundle.receipts.length === 0 ? (
              <Empty text="No saved custom receipts on this profile." />
            ) : (
              <Timeline
                rows={bundle.receipts.map((r) => ({
                  key: r.id,
                  title: formatDisplayText(r.job_title, "Custom receipt"),
                  meta: `${formatWhen(r.updated_at ?? r.created_at)} · ${r.line_items.length} line(s)`,
                  body: formatDisplayText(r.notes, ""),
                  actions: (
                    <MiniBtn
                      label="Custom receipt"
                      onClick={() => {
                        queueCustomReceiptCustomerPrefill(c.id)
                        setPage("calendar")
                      }}
                    />
                  ),
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Reports" badge={bundle.reports.length || undefined}>
            {bundle.reports.length === 0 ? (
              <Empty text="No specialty reports saved for this customer." />
            ) : (
              <Timeline
                rows={bundle.reports.map((r) => ({
                  key: r.id,
                  title: formatDisplayText(r.title, "Report"),
                  meta: `Updated ${formatWhen(r.updated_at)}`,
                  body: "",
                  actions: (
                    <MiniBtn
                      label="Open in Estimates"
                      onClick={() => {
                        queueQuotesCustomerPrefill(c.id)
                        setPage("quotes")
                      }}
                    />
                  ),
                }))}
              />
            )}
          </CollapsibleProfileSection>

          <CollapsibleProfileSection title="Lead history" badge={bundle.leads.length || undefined}>
            {bundle.leads.length === 0 ? (
              <Empty text="No leads linked to this customer." />
            ) : (
              <Timeline
                rows={bundle.leads.map((l) => ({
                  key: l.id,
                  title: formatDisplayText(l.title, "") || "Lead",
                  meta: `${formatDisplayText(l.status, "—")} · ${formatWhen(l.created_at)}`,
                  body: "",
                }))}
              />
            )}
          </CollapsibleProfileSection>

          {formatDisplayText(c.fit_classification) || formatDisplayText(c.fit_reason) ? (
            <CollapsibleProfileSection title="Customer insight">
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                <p style={{ margin: "0 0 8px" }}>
                  <strong>Lead score:</strong> {formatDisplayText(c.fit_classification, "—")}
                  {c.fit_confidence != null && typeof c.fit_confidence === "number"
                    ? ` (${Math.round(c.fit_confidence * 100)}% confidence)`
                    : ""}
                </p>
                {formatDisplayText(c.fit_reason) ? (
                  <p style={{ margin: 0, color: "#64748b", whiteSpace: "pre-wrap" }}>{formatDisplayText(c.fit_reason)}</p>
                ) : null}
              </div>
            </CollapsibleProfileSection>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.04, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.04 }}>
        {label}
      </div>
      <div style={{ marginTop: 2, color: theme.text, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>{text}</p>
}

function Timeline({
  rows,
}: {
  rows: { key: string; title: string; meta: string; body: string; actions?: ReactNode }[]
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div key={row.key} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${theme.border}`, background: "#f8fafc" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: theme.text }}>{row.title}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{row.meta}</div>
          {row.body ? <div style={{ fontSize: 13, color: "#475569", marginTop: 6, whiteSpace: "pre-wrap" }}>{row.body}</div> : null}
          {row.actions}
        </div>
      ))}
    </div>
  )
}

function MiniBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={miniBtnStyle}>
      {label}
    </button>
  )
}

const backBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
  color: theme.text,
}

const primaryBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
  color: "#fff",
}

const secondaryBtnStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
}

const miniBtnStyle: CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  color: theme.text,
}
