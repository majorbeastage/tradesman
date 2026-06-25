import { useMemo, useState } from "react"
import { theme } from "../styles/theme"
import type { OrganizationPeer } from "../lib/organizationPeers"
import { shareCustomerContactWithOrgMember } from "../lib/shareCustomerContact"

type Props = {
  open: boolean
  onClose: () => void
  orgPeers: OrganizationPeer[]
  currentUserId: string | null
  customerId: string
  customerName: string
  eventId?: string
  eventTitle?: string
  onShared?: () => void
}

export default function ShareContactModal({
  open,
  onClose,
  orgPeers,
  currentUserId,
  customerId,
  customerName,
  eventId,
  eventTitle,
  onShared,
}: Props) {
  const [recipientId, setRecipientId] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ok, setOk] = useState("")

  const choices = useMemo(
    () => orgPeers.filter((p) => p.id !== currentUserId),
    [orgPeers, currentUserId],
  )

  if (!open) return null

  async function submit() {
    if (!recipientId) {
      setErr("Select a team member.")
      return
    }
    setBusy(true)
    setErr("")
    setOk("")
    try {
      await shareCustomerContactWithOrgMember({
        recipientUserId: recipientId,
        customerId,
        eventId,
      })
      setOk("Contact shared — they will see it in their inbox and activity log.")
      onShared?.()
      setTimeout(() => {
        onClose()
        setRecipientId("")
        setOk("")
      }, 1200)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Share failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="share-contact-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 13000,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 50px rgba(15,23,42,0.18)",
          padding: "18px 20px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="share-contact-title" style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: theme.text }}>
          Share contact
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
          Send <strong>{customerName}</strong>
          {eventTitle ? (
            <>
              {" "}
              and event <strong>{eventTitle}</strong>
            </>
          ) : null}{" "}
          to someone in your organization. They receive contact details
          {eventTitle ? ", job info, and event notes" : ", job status, and profile info"}.
        </p>

        {choices.length === 0 ? (
          <p style={{ fontSize: 13, color: "#64748b" }}>No other org members available yet. Admins and same-client team accounts appear here.</p>
        ) : (
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "#334155" }}>
            Send to
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14, color: theme.text }}
            >
              <option value="">Select team member…</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                  {p.email ? ` (${p.email})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {err ? <p style={{ margin: "10px 0 0", fontSize: 12, color: "#b91c1c" }}>{err}</p> : null}
        {ok ? <p style={{ margin: "10px 0 0", fontSize: 12, color: "#166534" }}>{ok}</p> : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            disabled={busy || choices.length === 0}
            onClick={() => void submit()}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Sending…" : "Share"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              color: theme.text,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
