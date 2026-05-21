import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import { createCustomerRecord, findCustomerIdByPhoneOrEmail } from "../lib/createCustomerRecord"
import { canSubmitManualSmsOptIn } from "../lib/customerSmsConsent"
import { requiresManualSmsOptInRecord } from "../lib/smsFirstOutboundCompliance"
import CustomerSmsOptInField from "./CustomerSmsOptInField"
import CustomerSmsConsentSourceFields, { EMPTY_MANUAL_SMS_CONSENT_SOURCE } from "./CustomerSmsConsentSourceFields"

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
  const [smsConsent, setSmsConsent] = useState(false)
  const [consentSource, setConsentSource] = useState(EMPTY_MANUAL_SMS_CONSENT_SOURCE)
  const [showSourceValidation, setShowSourceValidation] = useState(false)
  const [businessName, setBusinessName] = useState("Your business")
  const [manualSmsOptInRequired, setManualSmsOptInRequired] = useState(true)
  const [phoneLookupBusy, setPhoneLookupBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phoneEntered = phone.trim().length > 0
  const showManualSmsOptIn = phoneEntered && manualSmsOptInRequired
  const canSubmit =
    !phoneEntered || !manualSmsOptInRequired || canSubmitManualSmsOptIn(phoneEntered, smsConsent, consentSource)

  useEffect(() => {
    if (!open) return
    setName("")
    setPhone("")
    setEmail("")
    setServiceAddress("")
    setSmsConsent(false)
    setConsentSource(EMPTY_MANUAL_SMS_CONSENT_SOURCE)
    setShowSourceValidation(false)
    setManualSmsOptInRequired(true)
    setError(null)
    setBusy(false)
  }, [open])

  useEffect(() => {
    if (!open || !supabase || !userId) return
    let cancelled = false
    void supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const dn = (data as { display_name?: string | null } | null)?.display_name?.trim()
        if (dn) setBusinessName(dn)
      })
    return () => {
      cancelled = true
    }
  }, [open, userId])

  useEffect(() => {
    if (!phoneEntered) {
      setSmsConsent(false)
      setConsentSource(EMPTY_MANUAL_SMS_CONSENT_SOURCE)
      setManualSmsOptInRequired(true)
      return
    }
    if (!supabase || !userId) return
    let cancelled = false
    setPhoneLookupBusy(true)
    void (async () => {
      try {
        const existingId = await findCustomerIdByPhoneOrEmail(supabase, userId, phone.trim(), "")
        if (!existingId) {
          if (!cancelled) setManualSmsOptInRequired(true)
          return
        }
        const { data } = await supabase
          .from("communication_events")
          .select("event_type, direction, created_at")
          .eq("user_id", userId)
          .eq("customer_id", existingId)
          .order("created_at", { ascending: true })
          .limit(300)
        if (!cancelled) {
          const required = requiresManualSmsOptInRecord((data as { event_type?: string; direction?: string; created_at?: string }[]) ?? [])
          setManualSmsOptInRequired(required)
          if (!required) {
            setSmsConsent(false)
            setConsentSource(EMPTY_MANUAL_SMS_CONSENT_SOURCE)
          }
        }
      } finally {
        if (!cancelled) setPhoneLookupBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [phone, phoneEntered, userId])

  if (!open) return null

  async function handleCreate() {
    if (!supabase || !userId) {
      setError("Sign in required.")
      return
    }
    if (showManualSmsOptIn && !smsConsent) {
      setError("Confirm SMS opt-in before saving a customer with a mobile number.")
      return
    }
    if (showManualSmsOptIn && !canSubmitManualSmsOptIn(phoneEntered, smsConsent, consentSource)) {
      setShowSourceValidation(true)
      setError("Complete the consent source fields before adding this customer.")
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
        smsConsent: showManualSmsOptIn ? smsConsent : undefined,
        businessName,
        smsConsentSource: showManualSmsOptIn && smsConsent ? consentSource : undefined,
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
          width: "min(520px, calc(100vw - 24px))",
          maxHeight: "min(90vh, 720px)",
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
              creating a duplicate. A mobile number requires SMS opt-in and a documented consent source before you can text
              them.
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

        {showManualSmsOptIn && !smsConsent ? (
          <p
            style={{
              margin: "0 0 12px",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              fontSize: 13,
              fontWeight: 600,
              color: "#991b1b",
              lineHeight: 1.45,
            }}
          >
            SMS/text messaging will stay disabled for this customer until opt-in and consent source are completed below.
          </p>
        ) : null}
        {phoneEntered && !manualSmsOptInRequired && !phoneLookupBusy ? (
          <p
            style={{
              margin: "0 0 12px",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#ecfdf5",
              border: "1px solid #86efac",
              fontSize: 13,
              color: "#065f46",
              lineHeight: 1.45,
            }}
          >
            This number already contacted you by phone first — manual SMS opt-in is not required.
          </p>
        ) : null}

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

          {showManualSmsOptIn ? (
            <>
              <CustomerSmsOptInField
                businessName={businessName}
                checked={smsConsent}
                onChange={setSmsConsent}
                required
                disabled={busy || phoneLookupBusy}
                footnote="Stored on the customer record for A2P compliance. Texting is blocked until this section is complete."
              />
              {smsConsent ? (
                <CustomerSmsConsentSourceFields
                  value={consentSource}
                  onChange={setConsentSource}
                  businessName={businessName}
                  disabled={busy || phoneLookupBusy}
                  showValidation={showSourceValidation}
                />
              ) : null}
            </>
          ) : phoneEntered ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
              {phoneLookupBusy
                ? "Checking whether this number contacted you by phone first…"
                : "No manual SMS opt-in is needed for this number."}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
              Enter a mobile number above. Manual SMS opt-in is required only for numbers you add yourself (not
              customers who called your business line first).
            </p>
          )}
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
            disabled={busy || !canSubmit}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              cursor: busy || !canSubmit ? "not-allowed" : "pointer",
              opacity: !canSubmit ? 0.55 : 1,
            }}
          >
            {busy ? "Saving…" : "Add customer"}
          </button>
        </div>
      </div>
    </>
  )
}
