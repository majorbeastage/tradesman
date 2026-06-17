import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import type { CustomerReceiptPickerRow } from "../lib/customReceipt"
import {
  formatInsuranceWhen,
  loadInsuranceCustomers,
  loadInsuranceJobEvents,
  saveInsuranceCoi,
  type InsuranceCoiRecord,
  type InsuranceJobEventRow,
} from "../lib/insuranceAssistant"
import { formatCoiExpiryLabel, inferCoiMetadataFromFile } from "../lib/coiExpiration"
import type { InsuranceTypeId } from "../lib/thimbleInsuranceResources"

export type ExternalCoiScope = "job" | "customer" | "business"

type Step = "scope" | "target" | "upload" | "done"

type Props = {
  open: boolean
  onClose: () => void
  userId: string | null
  initialCustomerId?: string | null
  initialEventId?: string | null
  onSaved?: (record: InsuranceCoiRecord) => void
}

const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
}

const secondaryBtn: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
}

const inputStyle: CSSProperties = { ...theme.formInput, fontSize: 14 }

export default function InsuranceExternalCoiWizardModal({
  open,
  onClose,
  userId,
  initialCustomerId,
  initialEventId,
  onSaved,
}: Props) {
  const [step, setStep] = useState<Step>("scope")
  const [scope, setScope] = useState<ExternalCoiScope | null>(null)
  const [customers, setCustomers] = useState<CustomerReceiptPickerRow[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId ?? null)
  const [events, setEvents] = useState<InsuranceJobEventRow[]>([])
  const [eventId, setEventId] = useState<string | null>(initialEventId ?? null)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [coiBusy, setCoiBusy] = useState(false)
  const [coiErr, setCoiErr] = useState("")
  const [coiSaved, setCoiSaved] = useState<InsuranceCoiRecord | null>(null)
  const [expiresPreview, setExpiresPreview] = useState<string | null>(null)
  const [policyPreview, setPolicyPreview] = useState<string | null>(null)

  const selectedEvent = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.display_name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    )
  }, [customers, customerSearch])

  useEffect(() => {
    if (!open) return
    setStep(initialCustomerId ? (initialEventId ? "upload" : "target") : "scope")
    setScope(initialEventId ? "job" : initialCustomerId ? "customer" : null)
    setCustomerId(initialCustomerId ?? null)
    setEventId(initialEventId ?? null)
    setCoiSaved(null)
    setCoiErr("")
    setExpiresPreview(null)
    setPolicyPreview(null)
  }, [open, initialCustomerId, initialEventId])

  useEffect(() => {
    if (!open || !supabase || !userId) return
    setLoadingCustomers(true)
    void loadInsuranceCustomers(supabase, userId)
      .then(setCustomers)
      .catch(() => setCustomers([]))
      .finally(() => setLoadingCustomers(false))
  }, [open, userId])

  useEffect(() => {
    if (!open || !supabase || !userId || !customerId || scope !== "job") {
      setEvents([])
      return
    }
    setLoadingEvents(true)
    void loadInsuranceJobEvents(supabase, userId, customerId)
      .then((rows) => {
        setEvents(rows)
        setEventId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null))
      })
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false))
  }, [open, userId, customerId, scope])

  const handleUpload = useCallback(
    async (file: File) => {
      if (!supabase || !userId || !scope) return
      setCoiBusy(true)
      setCoiErr("")
      try {
        const inferred = await inferCoiMetadataFromFile(file)
        setExpiresPreview(inferred.expiresAt)
        setPolicyPreview(inferred.policyNumber)
        const insuranceType: InsuranceTypeId = scope === "business" ? "business" : "job_specific"
        const record = await saveInsuranceCoi({
          userId,
          file,
          insuranceType,
          reason: "customer_requirement",
          customerId: scope === "business" ? undefined : customerId ?? undefined,
          calendarEventId: scope === "job" ? eventId ?? undefined : undefined,
          quoteId: scope === "job" ? selectedEvent?.quote_id ?? undefined : undefined,
          expiresAt: inferred.expiresAt,
          policyNumber: inferred.policyNumber,
          source: "external",
        })
        setCoiSaved(record)
        setStep("done")
        onSaved?.(record)
      } catch (e: unknown) {
        setCoiErr(e instanceof Error ? e.message : String(e))
      } finally {
        setCoiBusy(false)
      }
    },
    [userId, scope, customerId, eventId, selectedEvent?.quote_id, onSaved],
  )

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }} />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          zIndex: 9999,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 24px))",
          maxHeight: "min(82vh, 720px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 48px rgba(15,23,42,0.18)",
          padding: "20px 20px 18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>Add external COI</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
              Upload a certificate you received outside Tradesman — attach it to a job, customer, or your contractor file.
            </p>
          </div>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Close
          </button>
        </div>

        {step === "scope" ? (
          <div style={{ display: "grid", gap: 10 }}>
            {(
              [
                ["job", "Specific job", "Link COI to a customer and calendar event."],
                ["customer", "Specific customer", "Keep on the customer profile for any future jobs."],
                ["business", "Contractor (whole business)", "Company-wide COI on your profile — reuse for any customer."],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setScope(id)
                  setStep(id === "business" ? "upload" : "target")
                }}
                style={{
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `2px solid ${scope === id ? theme.primary : theme.border}`,
                  background: scope === id ? "#fff7ed" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 15, color: theme.text }}>{label}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{hint}</div>
              </button>
            ))}
          </div>
        ) : null}

        {step === "target" && scope && scope !== "business" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              Customer
              {customers.length > 10 ? (
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search…" style={inputStyle} />
              ) : null}
              <select
                value={customerId ?? ""}
                onChange={(e) => setCustomerId(e.target.value || null)}
                style={inputStyle}
                disabled={loadingCustomers}
              >
                <option value="">{loadingCustomers ? "Loading…" : "Select customer"}</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </label>
            {scope === "job" && customerId ? (
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                Calendar job
                <select value={eventId ?? ""} onChange={(e) => setEventId(e.target.value || null)} style={inputStyle} disabled={loadingEvents}>
                  <option value="">{loadingEvents ? "Loading…" : events.length ? "Select job" : "No jobs for this customer"}</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {formatInsuranceWhen(ev.start_at)} — {ev.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => setStep("scope")} style={secondaryBtn}>
                Back
              </button>
              <button
                type="button"
                disabled={!customerId || (scope === "job" && !eventId)}
                onClick={() => setStep("upload")}
                style={primaryBtn}
              >
                Continue to upload
              </button>
            </div>
          </div>
        ) : null}

        {step === "upload" ? (
          <>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: "24px 16px",
                borderRadius: 12,
                border: `2px dashed ${theme.border}`,
                background: "#f8fafc",
                cursor: coiBusy ? "wait" : "pointer",
                marginBottom: 12,
              }}
            >
              <input
                type="file"
                accept=".pdf,image/*"
                disabled={coiBusy}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleUpload(f)
                  e.target.value = ""
                }}
              />
              <span style={{ fontWeight: 700, color: theme.text }}>{coiBusy ? "Uploading…" : "Choose COI file (PDF or image)"}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>We scan for expiration dates when possible</span>
            </label>
            {expiresPreview ? (
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#15803d" }}>
                Detected expiration: {formatCoiExpiryLabel(expiresPreview)}
                {policyPreview ? ` · Policy ${policyPreview}` : ""}
              </p>
            ) : null}
            {coiErr ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{coiErr}</p> : null}
            <button type="button" onClick={() => setStep(scope === "business" ? "scope" : "target")} style={secondaryBtn}>
              Back
            </button>
          </>
        ) : null}

        {step === "done" && coiSaved ? (
          <div style={{ borderRadius: 12, border: "1px solid #86efac", background: "#f0fdf4", padding: 16 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#15803d" }}>Certificate saved</p>
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#166534", lineHeight: 1.5 }}>
              {coiSaved.file_name} is on file{formatCoiExpiryLabel(coiSaved.expires_at) ? ` · ${formatCoiExpiryLabel(coiSaved.expires_at)}` : ""}.
            </p>
            <a href={coiSaved.public_url} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 700, fontSize: 14 }}>
              View certificate →
            </a>
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={onClose} style={primaryBtn}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
