import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  loadCustomerMergeCandidates,
  mergeCustomerIntoTarget,
  separateCustomerContacts,
  type CustomerMergeCandidate,
} from "../lib/customerContactOperations"

type Mode = "separate" | "merge"

type Props = {
  open: boolean
  mode: Mode
  onClose: () => void
  userId: string | null
  customerId: string
  customerName?: string
  phones: string[]
  emails: string[]
  onComplete: (result: { newCustomerId?: string }) => void
}

const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}

const primaryBtn: CSSProperties = {
  ...secondaryBtn,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
}

const inputStyle: CSSProperties = { ...theme.formInput, fontSize: 14, width: "100%" }

export default function CustomerContactSplitMergeModal({
  open,
  mode,
  onClose,
  userId,
  customerId,
  customerName,
  phones,
  emails,
  onComplete,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [newContactName, setNewContactName] = useState("")
  const [selectedPhones, setSelectedPhones] = useState<string[]>([])
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [mergeCandidates, setMergeCandidates] = useState<CustomerMergeCandidate[]>([])
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  useEffect(() => {
    if (!open) return
    setErr("")
    setNewContactName("")
    setSelectedPhones([])
    setSelectedEmails([])
    setMergeTargetId("")
  }, [open, mode, customerId])

  useEffect(() => {
    if (!open || mode !== "merge" || !supabase || !userId) return
    setLoadingCandidates(true)
    void loadCustomerMergeCandidates(supabase, userId, customerId)
      .then((rows) => {
        setMergeCandidates(rows)
        setMergeTargetId(rows[0]?.id ?? "")
      })
      .catch(() => setMergeCandidates([]))
      .finally(() => setLoadingCandidates(false))
  }, [open, mode, userId, customerId])

  const canSubmitSeparate = useMemo(
    () => selectedPhones.length > 0 || selectedEmails.length > 0,
    [selectedPhones, selectedEmails],
  )

  const togglePhone = useCallback((phone: string) => {
    setSelectedPhones((prev) => (prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]))
  }, [])

  const toggleEmail = useCallback((email: string) => {
    setSelectedEmails((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!supabase || !userId) return
    setBusy(true)
    setErr("")
    try {
      if (mode === "separate") {
        const { newCustomerId } = await separateCustomerContacts(supabase, userId, customerId, {
          displayName: newContactName.trim() || undefined,
          phones: selectedPhones,
          emails: selectedEmails,
        })
        onComplete({ newCustomerId })
        onClose()
      } else {
        if (!mergeTargetId) throw new Error("Select a customer to merge in.")
        const label = mergeCandidates.find((c) => c.id === mergeTargetId)?.display_name ?? "this customer"
        const ok = window.confirm(
          `Merge "${label}" into ${customerName?.trim() || "this customer"}?\n\nAll messages, jobs, estimates, and contact methods will move here. The other profile will be removed.`,
        )
        if (!ok) return
        await mergeCustomerIntoTarget(supabase, userId, customerId, mergeTargetId)
        onComplete({})
        onClose()
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [
    userId,
    mode,
    customerId,
    newContactName,
    selectedPhones,
    selectedEmails,
    mergeTargetId,
    mergeCandidates,
    customerName,
    onComplete,
    onClose,
  ])

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
          width: "min(520px, calc(100vw - 24px))",
          maxHeight: "min(82vh, 680px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 48px rgba(15,23,42,0.18)",
          padding: "18px 18px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: theme.text }}>
              {mode === "separate" ? "Separate contacts" : "Merge contacts"}
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
              {mode === "separate"
                ? "Create a new customer and move selected phones or emails. Split contacts stay separate — they will not be grouped back together."
                : "Move another customer’s history and contact methods into this profile."}
            </p>
          </div>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Close
          </button>
        </div>

        {mode === "separate" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              New contact name (optional)
              <input
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder={customerName?.trim() || "New contact"}
                style={inputStyle}
              />
            </label>
            {phones.length > 0 ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Phones to move</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {phones.map((phone) => (
                    <label key={phone} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" checked={selectedPhones.includes(phone)} onChange={() => togglePhone(phone)} />
                      {phone}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {emails.length > 0 ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Emails to move</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {emails.map((email) => (
                    <label key={email} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, wordBreak: "break-all" }}>
                      <input type="checkbox" checked={selectedEmails.includes(email)} onChange={() => toggleEmail(email)} />
                      {email}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
            Customer to merge into {customerName?.trim() || "this profile"}
            <select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} style={inputStyle} disabled={loadingCandidates}>
              <option value="">{loadingCandidates ? "Loading customers…" : mergeCandidates.length ? "Select customer" : "No other customers"}</option>
              {mergeCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                  {c.contactLine && c.contactLine !== "—" ? ` · ${c.contactLine}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {err ? <p style={{ color: "#b91c1c", fontSize: 13, margin: "12px 0 0" }}>{err}</p> : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            disabled={busy || (mode === "separate" ? !canSubmitSeparate : !mergeTargetId)}
            onClick={() => void handleSubmit()}
            style={primaryBtn}
          >
            {busy ? "Working…" : mode === "separate" ? "Create separate contact" : "Merge into this profile"}
          </button>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
