import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { createCustomerRecord } from "../lib/createCustomerRecord"

type Props = {
  open: boolean
  onClose: () => void
  userId: string | null
  onCreated: (customerId: string, reusedExisting: boolean) => void | Promise<void>
}

export default function AddCustomerModal({ open, onClose, userId, onCreated }: Props) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [serviceAddress, setServiceAddress] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("")
    setPhone("")
    setEmail("")
    setServiceAddress("")
    setError(null)
    setBusy(false)
  }, [open])

  if (!open) return null

  async function handleCreate() {
    if (!supabase || !userId) {
      setError("Sign in required.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await createCustomerRecord(supabase, userId, {
        name,
        phone,
        email,
        serviceAddress,
      })
      await onCreated(result.customerId, result.reusedExisting)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        role="presentation"
        onClick={() => !busy && onClose()}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10058 }}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="add-customer-title"
        style={{
          position: "fixed",
          zIndex: 10059,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(480px, calc(100vw - 24px))",
          maxHeight: "min(90vh, 640px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 20px 48px rgba(15,23,42,0.2)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div>
            <h2 id="add-customer-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.text }}>
              Add customer
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              Enter at least a name, phone, or email. If the phone or email already exists, we open that customer instead of
              creating a duplicate.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              cursor: busy ? "wait" : "pointer",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
            Customer name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Smith"
              style={{ ...theme.formInput, maxWidth: "100%" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              style={{ ...theme.formInput, maxWidth: "100%" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              style={{ ...theme.formInput, maxWidth: "100%" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
            Service address (optional)
            <input
              value={serviceAddress}
              onChange={(e) => setServiceAddress(e.target.value)}
              placeholder="Street, city, state"
              style={{ ...theme.formInput, maxWidth: "100%" }}
            />
          </label>
        </div>

        {error ? <p style={{ margin: "12px 0 0", fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#fff",
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              color: theme.text,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Saving…" : "Add customer"}
          </button>
        </div>
      </div>
    </>
  )
}
