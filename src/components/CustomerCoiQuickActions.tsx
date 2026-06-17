import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { formatCoiExpiryLabel } from "../lib/coiExpiration"
import {
  listBusinessCoiRecords,
  listCustomerCoiRecords,
  provideExistingCoiToCustomer,
  type InsuranceCoiRecord,
} from "../lib/insuranceAssistant"
import InsuranceExternalCoiWizardModal from "./InsuranceExternalCoiWizardModal"

type CalendarEventPick = {
  id: string
  title: string
  quote_id?: string | null
}

type Props = {
  userId: string | null
  customerId: string
  customerName?: string
  customerMetadata?: unknown
  calendarEvents?: CalendarEventPick[]
  compact?: boolean
  onUpdated?: () => void
}

type EventCoiButtonProps = {
  userId: string | null
  customerId: string
  customerMetadata?: unknown
  eventId: string
  quoteId?: string | null
  compact?: boolean
  onUpdated?: () => void
}

function useCustomerCoiState(userId: string | null, customerMetadata?: unknown) {
  const [businessCoi, setBusinessCoi] = useState<InsuranceCoiRecord[]>([])
  const customerCoi = useMemo(() => listCustomerCoiRecords(customerMetadata), [customerMetadata])
  const latestBusiness = businessCoi[0] ?? null
  const latestCustomer = customerCoi[0] ?? null
  const coiToShare = latestBusiness ?? latestCustomer

  useEffect(() => {
    if (!supabase || !userId) return
    void (async () => {
      try {
        const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
        setBusinessCoi(listBusinessCoiRecords(data?.metadata))
      } catch {
        setBusinessCoi([])
      }
    })()
  }, [userId, customerMetadata])

  return { businessCoi, customerCoi, latestBusiness, latestCustomer, coiToShare }
}

export function CustomerEventCoiButton({
  userId,
  customerId,
  customerMetadata,
  eventId,
  quoteId,
  compact,
  onUpdated,
}: EventCoiButtonProps) {
  const { customerCoi, coiToShare } = useCustomerCoiState(userId, customerMetadata)
  const [busy, setBusy] = useState(false)
  const eventCoi = useMemo(
    () => customerCoi.find((rec) => rec.calendar_event_id === eventId) ?? null,
    [customerCoi, eventId],
  )

  const btnStyle = compact
    ? {
        padding: "5px 10px",
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer" as const,
        color: theme.text,
      }
    : {
        padding: "6px 12px",
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer" as const,
        color: theme.text,
      }

  if (eventCoi) {
    return (
      <a
        href={eventCoi.public_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...btnStyle, textDecoration: "none", display: "inline-block" }}
      >
        View COI
      </a>
    )
  }

  if (!coiToShare || !userId) return null

  return (
    <button
      type="button"
      style={btnStyle}
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void provideExistingCoiToCustomer({
          userId,
          customerId,
          coi: coiToShare,
          calendarEventId: eventId,
          quoteId,
        })
          .then(() => onUpdated?.())
          .catch((e: unknown) => alert(e instanceof Error ? e.message : String(e)))
          .finally(() => setBusy(false))
      }}
    >
      {busy ? "…" : "Provide COI"}
    </button>
  )
}

export default function CustomerCoiQuickActions({
  userId,
  customerId,
  customerMetadata,
  calendarEvents = [],
  compact,
  onUpdated,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardEventId, setWizardEventId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { latestBusiness, latestCustomer, coiToShare } = useCustomerCoiState(userId, customerMetadata)

  const provideCoi = useCallback(
    async (coi: InsuranceCoiRecord, eventId?: string | null, quoteId?: string | null) => {
      if (!supabase || !userId) return
      const key = eventId ? `ev-${eventId}` : "customer"
      setBusy(key)
      try {
        await provideExistingCoiToCustomer({
          userId,
          customerId,
          coi,
          calendarEventId: eventId,
          quoteId,
        })
        onUpdated?.()
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [userId, customerId, onUpdated],
  )

  const btnStyle = compact
    ? {
        padding: "6px 12px",
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer" as const,
        color: theme.text,
      }
    : {
        padding: "8px 14px",
        borderRadius: 6,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer" as const,
        color: theme.text,
      }

  return (
    <div
      style={{
        marginTop: compact ? 10 : 14,
        paddingTop: compact ? 10 : 14,
        borderTop: `1px solid ${theme.border}`,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: compact ? 12 : 13, color: "#0f172a" }}>Insurance COI</div>
      {latestCustomer ? (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          On file:{" "}
          <a href={latestCustomer.public_url} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, fontWeight: 600 }}>
            {latestCustomer.file_name}
          </a>
          {" · "}
          {formatCoiExpiryLabel(latestCustomer.expires_at)}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>No COI linked to this customer yet.</p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          style={{ ...btnStyle, background: theme.primary, color: "#fff", border: "none" }}
          onClick={() => {
            setWizardEventId(null)
            setWizardOpen(true)
          }}
        >
          Upload COI
        </button>
        {latestBusiness ? (
          <button
            type="button"
            style={btnStyle}
            disabled={busy === "customer"}
            onClick={() => void provideCoi(latestBusiness)}
          >
            {busy === "customer" ? "Providing…" : `Provide contractor COI${latestBusiness.file_name ? ` (${latestBusiness.file_name.slice(0, 24)}${latestBusiness.file_name.length > 24 ? "…" : ""})` : ""}`}
          </button>
        ) : coiToShare && !latestBusiness ? (
          <button type="button" style={btnStyle} disabled={busy === "customer"} onClick={() => void provideCoi(coiToShare)}>
            {busy === "customer" ? "Providing…" : "Provide COI on file"}
          </button>
        ) : null}
      </div>
      {calendarEvents.length > 0 && coiToShare ? (
        <div style={{ display: "grid", gap: 6 }}>
          {calendarEvents.slice(0, compact ? 4 : 8).map((ev) => (
            <div key={ev.id} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span style={{ color: "#64748b", flex: "1 1 140px" }}>{ev.title}</span>
              <CustomerEventCoiButton
                userId={userId}
                customerId={customerId}
                customerMetadata={customerMetadata}
                eventId={ev.id}
                quoteId={ev.quote_id ?? null}
                compact={compact}
                onUpdated={onUpdated}
              />
            </div>
          ))}
        </div>
      ) : null}
      <InsuranceExternalCoiWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        userId={userId}
        initialCustomerId={customerId}
        initialEventId={wizardEventId}
        onSaved={() => {
          setWizardOpen(false)
          onUpdated?.()
        }}
      />
    </div>
  )
}
