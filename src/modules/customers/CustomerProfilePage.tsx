import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import CommunicationUrgencyBadge from "../../components/CommunicationUrgencyBadge"
import CustomerNotesPanel from "../../components/CustomerNotesPanel"
import { consumeQueuedCustomerProfile, queueCustomerFocus } from "../../lib/customerNavigation"
import {
  queueCustomReceiptCustomerPrefill,
  queueQuotesCustomerPrefill,
  queueSchedulingCustomerPrefill,
} from "../../lib/workflowNavigation"
import { loadCustomerProfileBundle, type CustomerProfileBundle } from "../../lib/customerProfileData"
import { useIsMobile } from "../../hooks/useIsMobile"

type Props = {
  setPage: (page: string) => void
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        marginBottom: 20,
        padding: 16,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: "#475569" }}>{title}</h2>
      {children}
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
  const [notesOpen, setNotesOpen] = useState(false)

  const reload = useCallback(async () => {
    if (!supabase || !userId || !customerId) return
    setLoading(true)
    setErr("")
    try {
      const data = await loadCustomerProfileBundle(supabase, userId, customerId)
      setBundle(data)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
      setBundle(null)
    } finally {
      setLoading(false)
    }
  }, [userId, customerId])

  useEffect(() => {
    void reload()
  }, [reload])

  function backToCustomers() {
    if (customerId) queueCustomerFocus(customerId)
    setPage("customers")
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
                  {c.display_name?.trim() || "Customer profile"}
                </h1>
                <p style={{ margin: "8px 0 0", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
                  {bundle.contactLine}
                </p>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <CommunicationUrgencyBadge level={c.communication_urgency} />
                  {c.job_pipeline_status?.trim() ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{c.job_pipeline_status}</span>
                  ) : null}
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Last update: {formatWhen(c.last_activity_at)}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" onClick={() => setNotesOpen(true)} style={primaryBtnStyle}>
                  Notes
                </button>
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
              </div>
            </div>
          </header>

          <ProfileSection title="Contact & job site">
            <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
              <ProfileRow label="Phone" value={bundle.phone || "—"} />
              <ProfileRow label="Email" value={bundle.email || "—"} />
              <ProfileRow label="Best contact" value={c.best_contact_method?.trim() || "—"} />
              <ProfileRow label="Service address" value={c.service_address?.trim() || "—"} />
              {c.service_lat != null && c.service_lng != null ? (
                <ProfileRow label="Coordinates" value={`${c.service_lat}, ${c.service_lng}`} />
              ) : null}
            </div>
          </ProfileSection>

          <ProfileSection title="Notes">
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              Full note history with add, edit, and remove. Quick communications stay on the Customers list.
            </p>
            <button type="button" onClick={() => setNotesOpen(true)} style={primaryBtnStyle}>
              Open notes
            </button>
          </ProfileSection>

          <ProfileSection title="Activity history">
            {bundle.commEvents.length === 0 ? (
              <Empty text="No communication events logged yet." />
            ) : (
              <Timeline
                rows={bundle.commEvents.slice(0, 40).map((ev) => ({
                  key: ev.id,
                  title: ev.subject?.trim() || ev.event_type || "Event",
                  meta: `${ev.direction ?? ""} · ${formatWhen(ev.created_at)}`.trim(),
                  body: ev.body?.trim() || "",
                }))}
              />
            )}
          </ProfileSection>

          <ProfileSection title="Calendar events">
            {bundle.calendarEvents.length === 0 ? (
              <Empty text="No scheduled jobs linked to this customer." />
            ) : (
              <Timeline
                rows={bundle.calendarEvents.map((ev) => ({
                  key: ev.id,
                  title: ev.title?.trim() || "Untitled job",
                  meta: `${formatWhen(ev.start_at)}${ev.completed_at ? " · Completed" : " · Scheduled"}`,
                  body: ev.notes?.trim() || (ev.quote_id ? "Linked to estimate" : ""),
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
          </ProfileSection>

          <ProfileSection title="Estimates">
            {bundle.quotes.length === 0 ? (
              <Empty text="No estimates for this customer yet." />
            ) : (
              <Timeline
                rows={bundle.quotes.map((q) => ({
                  key: q.id,
                  title: q.title?.trim() || `Estimate ${q.id.slice(0, 8)}…`,
                  meta: `${q.status ?? "unknown"} · Updated ${formatWhen(q.updated_at ?? q.created_at)}`,
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
          </ProfileSection>

          <ProfileSection title="Receipts">
            {bundle.receipts.length === 0 ? (
              <Empty text="No saved custom receipts on this profile." />
            ) : (
              <Timeline
                rows={bundle.receipts.map((r) => ({
                  key: r.id,
                  title: r.job_title?.trim() || "Custom receipt",
                  meta: `${formatWhen(r.updated_at ?? r.created_at)} · ${r.line_items.length} line(s)`,
                  body: r.notes?.trim() || "",
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
          </ProfileSection>

          <ProfileSection title="Reports">
            {bundle.reports.length === 0 ? (
              <Empty text="No specialty reports saved for this customer." />
            ) : (
              <Timeline
                rows={bundle.reports.map((r) => ({
                  key: r.id,
                  title: r.title,
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
          </ProfileSection>

          <ProfileSection title="Lead history">
            {bundle.leads.length === 0 ? (
              <Empty text="No leads linked to this customer." />
            ) : (
              <Timeline
                rows={bundle.leads.map((l) => ({
                  key: l.id,
                  title: l.source?.trim() || "Lead",
                  meta: `${l.status ?? "—"} · ${formatWhen(l.created_at)}`,
                  body: "",
                }))}
              />
            )}
          </ProfileSection>

          {c.fit_classification || c.fit_reason ? (
            <ProfileSection title="Customer insight">
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                <p style={{ margin: "0 0 8px" }}>
                  <strong>Lead score:</strong> {c.fit_classification ?? "—"}
                  {c.fit_confidence != null ? ` (${Math.round(c.fit_confidence * 100)}% confidence)` : ""}
                </p>
                {c.fit_reason ? <p style={{ margin: 0, color: "#64748b" }}>{c.fit_reason}</p> : null}
              </div>
            </ProfileSection>
          ) : null}
        </>
      ) : null}

      {notesOpen && c ? (
        <CustomerNotesPanel
          customerId={c.id}
          customerName={c.display_name ?? undefined}
          onClose={() => {
            setNotesOpen(false)
            void reload()
          }}
        />
      ) : null}
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
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
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
