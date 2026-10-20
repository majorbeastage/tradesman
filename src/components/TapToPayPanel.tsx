import { useEffect, useState } from "react"
import CustomerSearchPicker from "./CustomerSearchPicker"
import { theme } from "../styles/theme"
import type { CustomerReceiptPickerRow } from "../lib/customReceipt"
import { prepareCustomerTapToPay, syncCustomerTapToPay } from "../lib/paymentRequests"
import { TradesmanNative } from "../plugins/tradesman-native"

type ReaderStatus = {
  deviceSupported: boolean
  readerLinked: boolean
  detail: string
}

type Props = {
  userId: string | null
  accessToken: string | null
  customers: CustomerReceiptPickerRow[]
  stripeConnected: boolean
  squareConnected: boolean
  stripeLocationId: string
  onStripeLocationId: (value: string) => void
  onSaveStripeLocation: () => Promise<void>
  savingLocation: boolean
}

const card: React.CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  padding: "18px 20px",
  display: "grid",
  gap: 12,
}

const stepStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 13,
  color: "#334155",
  lineHeight: 1.55,
  display: "grid",
  gap: 6,
}

export default function TapToPayPanel({
  userId,
  accessToken,
  customers,
  stripeConnected,
  squareConnected,
  stripeLocationId,
  onStripeLocationId,
  onSaveStripeLocation,
  savingLocation,
}: Props) {
  const [customerId, setCustomerId] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeTone, setNoticeTone] = useState<"ok" | "warn">("warn")
  const [reader, setReader] = useState<ReaderStatus | null>(null)

  const locationSaved = stripeLocationId.trim().length > 0
  const stripeReady = stripeConnected && locationSaved

  useEffect(() => {
    let cancelled = false
    void TradesmanNative.tapToPayAvailability()
      .then((row) => {
        if (cancelled) return
        setReader({
          deviceSupported: row.deviceSupported !== false,
          readerLinked: row.readerLinked === true,
          detail: row.detail?.trim() || "Checking this iPhone…",
        })
      })
      .catch(() => {
        if (cancelled) return
        setReader({
          deviceSupported: false,
          readerLinked: false,
          detail: "This screen can save your processor setup. The card reader is not available in this view.",
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function startTap() {
    if (!userId) return
    const amt = Number.parseFloat(amount)
    if (!customerId || !Number.isFinite(amt) || amt <= 0) {
      setNoticeTone("warn")
      setNotice("Choose the customer and enter the amount they owe for the job.")
      return
    }
    if (!reader?.readerLinked) {
      setNoticeTone("warn")
      setNotice(
        reader?.detail ||
          "Tap to Pay on iPhone cannot read a card in this App Store build yet. Your Stripe location is saved. Send a card link from the form below — it uses the same Stripe account.",
      )
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const prepared = await prepareCustomerTapToPay({
        userId,
        customerId,
        amount: amt,
        description: description.trim() || "Customer payment",
        accessToken,
      })
      const started = await TradesmanNative.startTapToPay({
        connectionToken: prepared.connectionToken,
        clientSecret: prepared.clientSecret,
        locationId: prepared.locationId,
        amountCents: Math.round(amt * 100),
      })
      if (!started.started) {
        setNoticeTone("warn")
        setNotice(started.message || "The reader did not start.")
        return
      }
      const synced = await syncCustomerTapToPay({
        userId,
        paymentRequestId: prepared.paymentRequest.id,
        accessToken,
      })
      setNoticeTone(synced.paid ? "ok" : "warn")
      setNotice(synced.paid ? "The customer's card payment was recorded on your Stripe account." : `Reader finished with status ${synced.status}.`)
    } catch (e) {
      setNoticeTone("warn")
      setNotice(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="tap-to-pay-on-iphone" style={card}>
      <div>
        <h2 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 800, color: theme.text }}>Tap to Pay on iPhone</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
          This takes a contactless card or wallet from <strong>your customer</strong> for a job, invoice, or deposit.
          The money settles to the Stripe or Square account your company already opened. It does not buy Tradesman.
        </p>
      </div>

      {reader ? (
        <p style={{ margin: 0, fontSize: 13, color: reader.deviceSupported ? "#0369a1" : "#b45309", lineHeight: 1.5 }}>
          {reader.detail}
        </p>
      ) : null}

      {!stripeReady ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 800 }}>Set up Stripe</h3>
            <ol style={stepStyle}>
              <li>In the Stripe Dashboard, open Terminal → Locations. Create a location and copy the ID that starts with tml_.</li>
              <li>Ask Stripe to enable Tap to Pay on iPhone for that location. Wait until Stripe shows it as enabled.</li>
              <li>In Developers → API keys, copy a secret key from that same Stripe account.</li>
              <li>Open Provider settings on this page, choose Stripe, paste the secret key, and save.</li>
              <li>Paste the location ID below and save it. Use an iPhone XS or newer on iOS 16.7 or later.</li>
            </ol>
          </div>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 800 }}>Set up Square</h3>
            <ol style={stepStyle}>
              <li>In the Square Dashboard, turn on Tap to Pay on iPhone for the location that should get paid, and wait for Square to approve it.</li>
              <li>Copy that location ID and a payments access token.</li>
              <li>Open Provider settings, choose Square, paste both, and save.</li>
              <li>
                {squareConnected
                  ? "Square is connected for customer payment links. Choose Square on the payment request form below to text or email a checkout link. The on-iPhone Square reader is not in this App Store build yet."
                  : "After Square is connected, customer payment links on this page can use it. The on-iPhone Square reader is not in this App Store build yet."}
              </li>
            </ol>
          </div>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: theme.text }}>
            Stripe Terminal location ID
            <input
              value={stripeLocationId}
              onChange={(e) => onStripeLocationId(e.target.value)}
              placeholder="tml_…"
              autoComplete="off"
              style={{ ...theme.formInput, fontSize: 14, maxWidth: 360 }}
            />
          </label>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            {stripeConnected
              ? "Stripe secret key is already saved. Saving here only stores the location ID."
              : "Save the location now if you have it. The charge form appears after the Stripe secret key is saved too."}
          </p>
          <button
            type="button"
            disabled={savingLocation || !stripeLocationId.trim() || !userId}
            onClick={() => void onSaveStripeLocation()}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              width: "fit-content",
              cursor: savingLocation ? "wait" : "pointer",
            }}
          >
            {savingLocation ? "Saving…" : "Save location ID"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#15803d", fontWeight: 700 }}>
            Stripe is connected{squareConnected ? " · Square is connected for payment links" : ""}. Location {stripeLocationId.trim()} is saved.
          </p>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            Customer
            <CustomerSearchPicker label="" customers={customers} value={customerId} onChange={setCustomerId} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            Amount (USD)
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              style={{ ...theme.formInput, fontSize: 14 }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            What this payment is for
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deposit for kitchen remodel"
              style={{ ...theme.formInput, fontSize: 14 }}
            />
          </label>
          <button
            type="button"
            disabled={busy || !customerId}
            onClick={() => void startTap()}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 800,
              width: "fit-content",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Starting…" : "Start Tap to Pay on iPhone"}
          </button>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            Have the customer hold a contactless card or phone near the top of this iPhone. You never type their card number.
            Until the reader is in this build, use Generate payment link below on the same Stripe account.
          </p>
        </div>
      )}

      {notice ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: noticeTone === "ok" ? "#15803d" : "#9a3412" }}>{notice}</p>
      ) : null}
    </section>
  )
}
