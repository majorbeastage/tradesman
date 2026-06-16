import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { useIsMobile } from "../../hooks/useIsMobile"
import type { CustomerReceiptPickerRow } from "../../lib/customReceipt"
import {
  formatInsuranceMoney,
  formatInsuranceWhen,
  loadInsuranceCustomers,
  loadInsuranceJobEvents,
  saveInsuranceCoi,
  type InsuranceCoiRecord,
  type InsuranceJobEventRow,
} from "../../lib/insuranceAssistant"
import {
  buildThimbleQuoteUrl,
  INSURANCE_COVERAGE_CARDS,
  INSURANCE_REASONS,
  INSURANCE_TYPES,
  recommendedCoverageCards,
  thimbleCoverageMatrix,
  thimbleFaq,
  thimbleFieldChecklist,
  thimbleOfficialLinks,
  thimbleQuoteWorkflow,
  tradesmanThimblePartnershipBullets,
  type InsuranceReasonId,
  type InsuranceTypeId,
} from "../../lib/thimbleInsuranceResources"

type Step = "type" | "job" | "reason" | "coverage" | "coi"

function renderBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part)
    if (m) return <strong key={i}>{m[1]}</strong>
    return <span key={i}>{part}</span>
  })
}

const card: CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  padding: "18px 20px",
}

const stepOrder: Step[] = ["type", "job", "reason", "coverage", "coi"]

export default function InsuranceOptionsPage() {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const isMobile = useIsMobile()

  const [step, setStep] = useState<Step>("type")
  const [insuranceType, setInsuranceType] = useState<InsuranceTypeId | null>(null)
  const [reason, setReason] = useState<InsuranceReasonId | null>(null)
  const [customers, setCustomers] = useState<CustomerReceiptPickerRow[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [events, setEvents] = useState<InsuranceJobEventRow[]>([])
  const [eventId, setEventId] = useState<string | null>(null)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [coiBusy, setCoiBusy] = useState(false)
  const [coiErr, setCoiErr] = useState("")
  const [coiSaved, setCoiSaved] = useState<InsuranceCoiRecord | null>(null)
  const [purchased, setPurchased] = useState(false)

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  )
  const selectedEvent = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId])

  const visibleSteps = useMemo(() => {
    if (insuranceType === "business") return stepOrder.filter((s) => s !== "job")
    return stepOrder
  }, [insuranceType])

  const stepIndex = visibleSteps.indexOf(step)

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.display_name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.service_address.toLowerCase().includes(q),
    )
  }, [customers, customerSearch])

  const coverageCards = useMemo(() => {
    if (!reason || !insuranceType) return INSURANCE_COVERAGE_CARDS.slice(0, 3)
    return recommendedCoverageCards(reason, insuranceType)
  }, [reason, insuranceType])

  const thimbleUrl = useMemo(() => {
    if (!insuranceType) return buildThimbleQuoteUrl({ insuranceType: "business" })
    return buildThimbleQuoteUrl({
      insuranceType,
      reason: reason ?? undefined,
      customerName: selectedCustomer?.display_name,
      jobTitle: selectedEvent?.title,
    })
  }, [insuranceType, reason, selectedCustomer, selectedEvent])

  useEffect(() => {
    if (!supabase || !userId) return
    setLoadingCustomers(true)
    void loadInsuranceCustomers(supabase, userId)
      .then(setCustomers)
      .catch(() => setCustomers([]))
      .finally(() => setLoadingCustomers(false))
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId || !customerId || insuranceType !== "job_specific") {
      setEvents([])
      setEventId(null)
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
  }, [userId, customerId, insuranceType])

  function resetAssistant() {
    setStep("type")
    setInsuranceType(null)
    setReason(null)
    setCustomerId(null)
    setCustomerSearch("")
    setEventId(null)
    setCoiSaved(null)
    setCoiErr("")
    setPurchased(false)
  }

  function goBack() {
    const idx = visibleSteps.indexOf(step)
    if (idx > 0) setStep(visibleSteps[idx - 1])
  }

  const handleCoiUpload = useCallback(
    async (file: File) => {
      if (!supabase || !userId || !insuranceType || !reason) return
      setCoiBusy(true)
      setCoiErr("")
      try {
        const record = await saveInsuranceCoi({
          userId,
          file,
          insuranceType,
          reason,
          customerId: customerId ?? undefined,
          calendarEventId: eventId ?? undefined,
          quoteId: selectedEvent?.quote_id ?? undefined,
        })
        setCoiSaved(record)
      } catch (e: unknown) {
        setCoiErr(e instanceof Error ? e.message : String(e))
      } finally {
        setCoiBusy(false)
      }
    },
    [userId, insuranceType, reason, customerId, eventId, selectedEvent?.quote_id],
  )

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: isMobile ? "12px 12px 40px" : "8px 8px 48px" }}>
      <header style={{ marginBottom: 20 }}>
        <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 800, letterSpacing: 0.06, textTransform: "uppercase", color: theme.primary }}>
          Insurance Assistant
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: isMobile ? "1.5rem" : "1.85rem", fontWeight: 800, color: theme.text }}>
          Insure this job in minutes
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: "#64748b", lineHeight: 1.55, maxWidth: 640 }}>
          Walk through coverage for a specific job or your whole business, get a Thimble quote, then file the certificate where your crew already works.
        </p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {visibleSteps.map((s, i) => {
          const labels: Record<Step, string> = {
            type: "Type",
            job: "Job",
            reason: "Why",
            coverage: "Coverage",
            coi: "COI",
          }
          const active = s === step
          const done = i < stepIndex
          return (
            <div
              key={s}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                border: `1px solid ${active ? theme.primary : done ? "#86efac" : theme.border}`,
                background: active ? "#fff7ed" : done ? "#f0fdf4" : "#f8fafc",
                color: active ? theme.primary : done ? "#15803d" : "#64748b",
              }}
            >
              {i + 1}. {labels[s]}
            </div>
          )
        })}
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        {step === "type" ? (
          <>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: theme.text }}>What are you insuring?</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {INSURANCE_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setInsuranceType(t.id)
                    setStep(t.id === "job_specific" ? "job" : "reason")
                  }}
                  style={{
                    textAlign: "left",
                    padding: "16px 18px",
                    borderRadius: 12,
                    border: `2px solid ${insuranceType === t.id ? theme.primary : theme.border}`,
                    background: insuranceType === t.id ? "#fff7ed" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 16, color: theme.text, marginBottom: 6 }}>{t.label}</div>
                  <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>{t.description}</div>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === "job" && insuranceType === "job_specific" ? (
          <>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: theme.text }}>Which job needs coverage?</h2>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
                Customer
                {customers.length > 10 ? (
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers…"
                    style={inputStyle}
                  />
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
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {customerId ? (
                <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
                  Calendar event / job
                  <select
                    value={eventId ?? ""}
                    onChange={(e) => setEventId(e.target.value || null)}
                    style={inputStyle}
                    disabled={loadingEvents}
                  >
                    <option value="">{loadingEvents ? "Loading jobs…" : events.length ? "Select job" : "No scheduled jobs for this customer"}</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {formatInsuranceWhen(ev.start_at)} — {ev.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {selectedEvent ? (
                <div
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    background: "#f8fafc",
                    padding: "14px 16px",
                    display: "grid",
                    gap: 8,
                    fontSize: 14,
                  }}
                >
                  <Row label="Customer" value={selectedEvent.customer_name} />
                  <Row label="Job" value={selectedEvent.title} />
                  <Row label="Service address" value={selectedEvent.service_address || "—"} />
                  <Row label="Scheduled" value={formatInsuranceWhen(selectedEvent.start_at)} />
                  <Row label="Estimate amount" value={formatInsuranceMoney(selectedEvent.quote_total)} />
                </div>
              ) : null}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button type="button" onClick={goBack} style={secondaryBtn}>
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep("reason")}
                  disabled={!customerId}
                  style={primaryBtn}
                >
                  Continue
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === "reason" ? (
          <>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: theme.text }}>Why do you need insurance?</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {INSURANCE_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setReason(r.id)
                    setStep("coverage")
                  }}
                  style={{
                    textAlign: "left",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: `2px solid ${reason === r.id ? theme.primary : theme.border}`,
                    background: reason === r.id ? "#fff7ed" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, color: theme.text }}>{r.label}</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>{r.hint}</div>
                </button>
              ))}
            </div>
            <button type="button" onClick={goBack} style={{ ...secondaryBtn, marginTop: 14 }}>
              Back
            </button>
          </>
        ) : null}

        {step === "coverage" ? (
          <>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: theme.text }}>Recommended coverage</h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
              Based on your answers{selectedEvent ? ` for ${selectedEvent.title}` : ""}. Compare limits on Thimble before you bind.
            </p>
            <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
              {coverageCards.map((c) => (
                <CoverageCard key={c.id} card={c} />
              ))}
            </div>
            <a href={thimbleUrl} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, display: "inline-flex", textDecoration: "none", marginBottom: 12 }}>
              Get Quote with Thimble
            </a>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
              Opens Thimble in a new tab. This link is built for affiliate attribution today and can be swapped for a native API quote later.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: theme.text, marginBottom: 16 }}>
              <input type="checkbox" checked={purchased} onChange={(e) => setPurchased(e.target.checked)} />
              I purchased coverage — ready to upload my COI
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" onClick={goBack} style={secondaryBtn}>
                Back
              </button>
              <button type="button" onClick={() => setStep("coi")} disabled={!purchased} style={primaryBtn}>
                Upload certificate
              </button>
            </div>
          </>
        ) : null}

        {step === "coi" ? (
          <>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: theme.text }}>Upload Certificate of Insurance</h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b", lineHeight: 1.55 }}>
              We will attach this COI to your customer profile, calendar job, estimate, and document library when those links exist.
            </p>

            {coiSaved ? (
              <div style={{ borderRadius: 12, border: "1px solid #86efac", background: "#f0fdf4", padding: 16, marginBottom: 16 }}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#15803d" }}>Certificate saved</p>
                <p style={{ margin: 0, fontSize: 14, color: "#166534", lineHeight: 1.5 }}>
                  {coiSaved.file_name} is on file
                  {coiSaved.customer_id ? " for the customer" : ""}
                  {coiSaved.calendar_event_id ? ", linked to the calendar job" : ""}
                  {coiSaved.quote_id ? ", estimate / invoice packet" : ""}.
                </p>
                <a href={coiSaved.public_url} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 700, fontSize: 14 }}>
                  View certificate →
                </a>
              </div>
            ) : (
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "28px 20px",
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
                    if (f) void handleCoiUpload(f)
                    e.target.value = ""
                  }}
                />
                <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{coiBusy ? "Uploading…" : "Choose COI file (PDF or image)"}</span>
                <span style={{ fontSize: 13, color: "#64748b" }}>Tap to browse</span>
              </label>
            )}

            {coiErr ? <p style={{ color: "#b91c1c", fontSize: 14, margin: "0 0 12px" }}>{coiErr}</p> : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" onClick={goBack} style={secondaryBtn}>
                Back
              </button>
              {coiSaved ? (
                <button type="button" onClick={resetAssistant} style={primaryBtn}>
                  Start another request
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <HelpLearningSection />
    </div>
  )
}

function CoverageCard({ card }: { card: (typeof INSURANCE_COVERAGE_CARDS)[number] }) {
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${theme.border}`, padding: "14px 16px", background: "#fafafa" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong style={{ fontSize: 16, color: theme.text }}>{card.name}</strong>
        <a href={card.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: theme.primary }}>
          On Thimble →
        </a>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "#475569", lineHeight: 1.5 }}>{card.shortDescription}</p>
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, color: theme.primary }}>Learn more</summary>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{card.learnMore}</p>
      </details>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <span style={{ fontWeight: 700, color: "#475569", minWidth: 120 }}>{label}</span>
      <span style={{ color: theme.text, flex: 1 }}>{value}</span>
    </div>
  )
}

function HelpLearningSection() {
  return (
    <section style={{ marginTop: 8 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: "#64748b" }}>Help & learning</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <HelpPanel title="How to run a Thimble quote">
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 14, fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
            {thimbleQuoteWorkflow.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>
                <p style={{ margin: "6px 0 0" }}>{renderBold(s.body)}</p>
                {s.bullets?.length ? (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {s.bullets.map((b) => (
                      <li key={b}>{renderBold(b)}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </HelpPanel>

        <HelpPanel title="Coverage lanes reference">
          <div style={{ display: "grid", gap: 10 }}>
            {thimbleCoverageMatrix.map((row) => (
              <div key={row.name} style={{ fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
                <strong style={{ color: theme.text }}>{row.name}</strong> — {renderBold(row.blurb)}{" "}
                <a href={row.href} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 600 }}>
                  Read on Thimble
                </a>
              </div>
            ))}
          </div>
        </HelpPanel>

        <HelpPanel title="GC packet & COI checklist">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#475569", lineHeight: 1.6 }}>
            {thimbleFieldChecklist.map((item) => (
              <li key={item} style={{ marginBottom: 8 }}>
                {renderBold(item)}
              </li>
            ))}
          </ul>
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#94a3b8" }}>
            <a href={thimbleOfficialLinks.helpCenter} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary }}>
              Thimble Help Center
            </a>
          </p>
        </HelpPanel>

        <HelpPanel title="FAQ">
          <div style={{ display: "grid", gap: 8 }}>
            {thimbleFaq.map((item) => (
              <details key={item.q} style={{ borderRadius: 8, border: `1px solid ${theme.border}`, padding: "10px 12px", background: "#f8fafc" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14, color: theme.text }}>{item.q}</summary>
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{renderBold(item.a)}</p>
              </details>
            ))}
          </div>
        </HelpPanel>

        <HelpPanel title="Tradesman + Thimble roadmap">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#475569", lineHeight: 1.6 }}>
            {tradesmanThimblePartnershipBullets.map((b) => (
              <li key={b} style={{ marginBottom: 8 }}>
                {renderBold(b)}
              </li>
            ))}
          </ul>
        </HelpPanel>

        <HelpPanel title="Disclaimer">
          <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
            Tradesman does not sell insurance and cannot bind coverage. Quotes, limits, and claim outcomes are solely between you and Thimble / its
            insurers. Confirm endorsements with your compliance manager or legal advisor.
          </p>
        </HelpPanel>
      </div>
    </section>
  )
}

function HelpPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details style={{ ...card, padding: 0, overflow: "hidden" }}>
      <summary
        style={{
          cursor: "pointer",
          padding: "14px 18px",
          fontWeight: 800,
          fontSize: 15,
          color: theme.text,
          listStyle: "none",
        }}
      >
        {title}
      </summary>
      <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${theme.border}` }}>{children}</div>
    </details>
  )
}

const inputStyle: CSSProperties = {
  ...theme.formInput,
  fontSize: 14,
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
