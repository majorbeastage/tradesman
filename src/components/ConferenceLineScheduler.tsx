import { useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { theme } from "../styles/theme"
import {
  cancelScheduledConferenceClient,
  conferenceShareText,
  createScheduledConferenceClient,
  defaultConferenceWindow,
  formatConferenceWhen,
  listScheduledConferences,
  resendScheduledConferenceInvites,
  type GuestDraft,
  type ScheduledConferenceView,
} from "../lib/scheduledConferenceClient"

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 20,
}

const input: CSSProperties = {
  ...theme.formInput,
  fontSize: 14,
}

const label: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
  display: "block",
  marginBottom: 6,
}

const btn: CSSProperties = {
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
}

type Props = {
  accessToken: string
  hostName?: string
  hostEmail?: string
}

function emptyGuest(): GuestDraft {
  return { name: "", email: "", phone: "" }
}

export default function ConferenceLineScheduler({ accessToken, hostName, hostEmail }: Props) {
  const windowDefaults = useMemo(() => defaultConferenceWindow(), [])
  const [title, setTitle] = useState("Conference call")
  const [startsAt, setStartsAt] = useState(windowDefaults.start)
  const [endsAt, setEndsAt] = useState(windowDefaults.end)
  const [customPin, setCustomPin] = useState("")
  const [hostPhone, setHostPhone] = useState("")
  const [guests, setGuests] = useState<GuestDraft[]>([emptyGuest(), emptyGuest()])
  const [sendEmail, setSendEmail] = useState(true)
  const [sendSms, setSendSms] = useState(true)
  const [copyHost, setCopyHost] = useState(true)
  const [working, setWorking] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [created, setCreated] = useState<ScheduledConferenceView | null>(null)
  const [list, setList] = useState<ScheduledConferenceView[]>([])
  const [dialIn, setDialIn] = useState({ e164: "+18633418778", display: "(863) 341-8778" })
  const [loadingList, setLoadingList] = useState(true)

  const load = useCallback(async () => {
    setLoadingList(true)
    try {
      const data = await listScheduledConferences(accessToken)
      setDialIn(data.dialIn)
      setList(data.conferences)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conferences.")
    } finally {
      setLoadingList(false)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  function updateGuest(index: number, patch: Partial<GuestDraft>) {
    setGuests((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setNotice("")
    setWorking("Creating…")
    try {
      const startIso = new Date(startsAt).toISOString()
      const endIso = new Date(endsAt).toISOString()
      const result = await createScheduledConferenceClient(accessToken, {
        title,
        startsAt: startIso,
        endsAt: endIso,
        customPin: customPin.trim() || undefined,
        hostName,
        hostEmail: copyHost ? hostEmail : undefined,
        hostPhone: copyHost ? hostPhone : undefined,
        guests,
        sendEmail,
        sendSms,
      })
      setCreated(result.conference)
      const bits = [`PIN ${result.conference.pin}`]
      if (result.emailSent) bits.push(`${result.emailSent} email${result.emailSent === 1 ? "" : "s"}`)
      if (result.smsSent) bits.push(`${result.smsSent} text${result.smsSent === 1 ? "" : "s"}`)
      setNotice(`Conference ready. ${bits.join(" · ")}`)
      if (result.errors.length) setError(result.errors.join("\n"))
      setGuests([emptyGuest(), emptyGuest()])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create conference.")
    } finally {
      setWorking("")
    }
  }

  async function onResend(id: string) {
    setWorking("Sending…")
    setError("")
    try {
      const result = await resendScheduledConferenceInvites(accessToken, id, sendEmail, sendSms)
      setNotice(`Sent ${result.emailSent} email(s) and ${result.smsSent} text(s).`)
      if (result.errors.length) setError(result.errors.join("\n"))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invites.")
    } finally {
      setWorking("")
    }
  }

  async function onCancel(id: string) {
    if (!window.confirm("Cancel this conference? The PIN will stop working.")) return
    setWorking("Canceling…")
    setError("")
    try {
      await cancelScheduledConferenceClient(accessToken, id)
      if (created?.id === id) setCreated(null)
      setNotice("Conference canceled.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.")
    } finally {
      setWorking("")
    }
  }

  async function copyShare(c: ScheduledConferenceView) {
    try {
      await navigator.clipboard.writeText(conferenceShareText(c))
      setNotice("Dial-in details copied.")
    } catch {
      setNotice(conferenceShareText(c))
    }
  }

  const upcoming = list.filter((c) => !c.canceledAt && Date.parse(c.endsAt) > Date.now())
  const past = list.filter((c) => c.canceledAt || Date.parse(c.endsAt) <= Date.now())

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={card}>
        <h2 style={{ margin: "0 0 6px", fontSize: 20, color: theme.text }}>Schedule a one-time conference</h2>
        <p style={{ margin: "0 0 16px", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
          People dial <strong>{dialIn.display}</strong> and enter the PIN. You can email and text the details to anyone on this call.
        </p>
        <form onSubmit={(e) => void onCreate(e)} style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={label}>Call title</label>
            <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday owner call" required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div>
              <label style={label}>Starts</label>
              <input style={input} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </div>
            <div>
              <label style={label}>Ends</label>
              <input style={input} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div>
              <label style={label}>Your cell (optional, for a copy of the invite)</label>
              <input style={input} value={hostPhone} onChange={(e) => setHostPhone(e.target.value)} placeholder="8635550100" />
            </div>
            <div>
              <label style={label}>Custom PIN (optional, 4–8 digits)</label>
              <input style={input} value={customPin} onChange={(e) => setCustomPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Auto-generated" inputMode="numeric" />
            </div>
          </div>
          <div>
            <div style={{ ...label, marginBottom: 8 }}>Invite people</div>
            <div style={{ display: "grid", gap: 8 }}>
              {guests.map((g, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start" }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <input style={input} value={g.name} onChange={(e) => updateGuest(i, { name: e.target.value })} placeholder="Name" />
                    <input style={input} value={g.email} onChange={(e) => updateGuest(i, { email: e.target.value })} placeholder="Email" type="email" />
                    <input style={input} value={g.phone} onChange={(e) => updateGuest(i, { phone: e.target.value })} placeholder="Mobile" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setGuests((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{ ...btn, background: "#f3f4f6", color: "#374151" }}
                    aria-label="Remove guest"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setGuests((prev) => [...prev, emptyGuest()])} style={{ ...btn, marginTop: 8, background: "#fff", color: theme.primary, border: `1px solid ${theme.primary}` }}>
              Add another person
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 14, color: "#374151" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email invites
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              Text invites
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={copyHost} onChange={(e) => setCopyHost(e.target.checked)} />
              Send me a copy
            </label>
          </div>
          <button type="submit" disabled={Boolean(working)} style={{ ...btn, background: theme.primary, color: "#fff", width: "fit-content" }}>
            {working || "Create conference and send invites"}
          </button>
        </form>
      </section>

      {error ? (
        <div style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b", whiteSpace: "pre-wrap" }}>{error}</div>
      ) : null}
      {notice ? (
        <div style={{ ...card, borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" }}>{notice}</div>
      ) : null}

      {created ? <ConferencePinCard conference={created} onCopy={() => void copyShare(created)} /> : null}

      <section style={card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Upcoming</h3>
        {loadingList ? <p style={{ color: "#6b7280", margin: 0 }}>Loading…</p> : null}
        {!loadingList && upcoming.length === 0 ? <p style={{ color: "#6b7280", margin: 0 }}>No upcoming conferences.</p> : null}
        <div style={{ display: "grid", gap: 12 }}>
          {upcoming.map((c) => (
            <div key={c.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 8 }}>
                {formatConferenceWhen(c.startsAt)} → {formatConferenceWhen(c.endsAt)}
              </div>
              <div style={{ fontSize: 14, marginBottom: 10 }}>
                Dial <strong>{c.dialInDisplay}</strong> · PIN <strong>{c.pin}</strong>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" style={{ ...btn, background: theme.primary, color: "#fff" }} onClick={() => void copyShare(c)}>
                  Copy details
                </button>
                <button type="button" style={{ ...btn, background: "#111827", color: "#fff" }} onClick={() => void onResend(c.id)} disabled={Boolean(working)}>
                  Resend invites
                </button>
                <button type="button" style={{ ...btn, background: "#fef2f2", color: "#991b1b" }} onClick={() => void onCancel(c.id)} disabled={Boolean(working)}>
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {past.length > 0 ? (
        <section style={{ ...card, opacity: 0.85 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Past / canceled</h3>
          <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#4b5563" }}>
            {past.slice(0, 12).map((c) => (
              <div key={c.id}>
                {c.canceledAt ? "Canceled · " : "Ended · "}
                {c.title} · {formatConferenceWhen(c.startsAt)}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ConferencePinCard({ conference, onCopy }: { conference: ScheduledConferenceView; onCopy: () => void }) {
  return (
    <section style={{ ...card, background: "#111827", color: "#fff", borderColor: "#111827" }}>
      <div style={{ fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: "#fdba74", fontWeight: 800, marginBottom: 8 }}>
        Dial-in ready
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{conference.title}</div>
      <div style={{ color: "#d1d5db", marginBottom: 16 }}>{formatConferenceWhen(conference.startsAt)}</div>
      <div style={{ display: "grid", gap: 8, fontSize: 18 }}>
        <div>
          Number <strong>{conference.dialInDisplay}</strong>
        </div>
        <div>
          PIN <strong style={{ letterSpacing: 2 }}>{conference.pin}</strong>
        </div>
      </div>
      <button type="button" onClick={onCopy} style={{ ...btn, marginTop: 16, background: theme.primary, color: "#fff" }}>
        Copy number and PIN
      </button>
    </section>
  )
}
