import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react"
import { theme } from "../../styles/theme"

type Props = { slug: string }

type PublicCtaConfig = {
  ok?: boolean
  businessName?: string
  headline?: string
  subtitle?: string
  slug?: string
  error?: string
}

const DEFAULT_HEADLINE = "Request a quote or service call"
const DEFAULT_SUBTITLE =
  "Share your contact details and we will follow up about estimates, scheduling, and job updates."

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)",
  padding: "32px 16px 48px",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: "#0f172a",
  boxSizing: "border-box",
  display: "flex",
  justifyContent: "center",
}

const cardStyle: CSSProperties = {
  background: "#fff",
  border: `1px solid ${theme.border}`,
  padding: 24,
  boxShadow: "0 12px 40px rgba(15, 23, 42, 0.08)",
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  fontWeight: 800,
  lineHeight: 1.2,
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
}

const inputStyle: CSSProperties = {
  ...theme.formInput,
  fontWeight: 400,
  width: "100%",
  boxSizing: "border-box",
}

const linkStyle: CSSProperties = {
  color: theme.primary,
  fontWeight: 600,
}

const submitStyle: CSSProperties = {
  padding: "14px 18px",
  borderRadius: 10,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
}

export default function ClientPublicCtaPage({ slug }: Props) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [smsConsent, setSmsConsent] = useState(false)
  const [hp, setHp] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<"idle" | "ok" | "err">("idle")
  const [errText, setErrText] = useState("")
  const [config, setConfig] = useState<PublicCtaConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)

  const safeSlug = useMemo(() => slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64), [slug])

  const origin = typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : ""

  useEffect(() => {
    if (!safeSlug || safeSlug.length < 3) {
      setConfigLoading(false)
      setConfig({ ok: false, error: "Invalid link." })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(
          `${origin}/api/platform-tools?__route=public-lead-config&slug=${encodeURIComponent(safeSlug)}`,
        )
        const raw = await r.text()
        let j: PublicCtaConfig = {}
        if (raw.trim()) {
          try {
            j = JSON.parse(raw) as PublicCtaConfig
          } catch {
            j = { ok: false, error: "Could not read page configuration." }
          }
        }
        if (!cancelled) setConfig(j.ok ? j : { ok: false, error: j.error || "This contact page is not available." })
      } catch {
        if (!cancelled) setConfig({ ok: false, error: "Could not load this contact page. Check your connection and try again." })
      } finally {
        if (!cancelled) setConfigLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [safeSlug, origin])

  const businessName = (config?.businessName ?? "").trim() || "Your contractor"
  const headline = (config?.headline ?? "").trim() || DEFAULT_HEADLINE
  const subtitle = (config?.subtitle ?? "").trim() || DEFAULT_SUBTITLE
  const phoneEntered = phone.trim().length > 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!safeSlug || safeSlug.length < 3) {
      setDone("err")
      setErrText("Invalid form link.")
      return
    }
    if (phoneEntered && !smsConsent) {
      setDone("err")
      setErrText("Please check the box to agree to receive text messages before submitting your phone number.")
      return
    }
    setBusy(true)
    setDone("idle")
    setErrText("")
    try {
      const res = await fetch("/api/platform-tools?__route=public-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: safeSlug,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          message: message.trim(),
          smsConsent: phoneEntered ? smsConsent : false,
          website: hp,
        }),
      })
      const raw = await res.text()
      if (!res.ok) {
        let msg = raw.slice(0, 280)
        try {
          const j = JSON.parse(raw) as { error?: string; message?: string }
          if (j.error) msg = j.error
          else if (j.message) msg = j.message
        } catch {
          /* ignore */
        }
        throw new Error(msg || `Request failed (${res.status})`)
      }
      setDone("ok")
      setName("")
      setPhone("")
      setEmail("")
      setMessage("")
      setSmsConsent(false)
    } catch (err) {
      setDone("err")
      setErrText(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!safeSlug || safeSlug.length < 3) {
    return (
      <div style={shellStyle}>
        <div style={{ ...cardStyle, borderRadius: 16, maxWidth: 520, width: "100%" }}>
          <p style={{ color: "#b91c1c", margin: 0 }}>This contact link is missing a valid address.</p>
        </div>
      </div>
    )
  }

  if (configLoading) {
    return (
      <div style={shellStyle}>
        <div style={{ ...cardStyle, borderRadius: 16, maxWidth: 520, width: "100%" }}>
          <p style={{ margin: 0, color: "#64748b" }}>Loading…</p>
        </div>
      </div>
    )
  }

  if (!config?.ok) {
    return (
      <div style={shellStyle}>
        <div style={{ ...cardStyle, borderRadius: 16, maxWidth: 520, width: "100%" }}>
          <h1 style={titleStyle}>Contact page unavailable</h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55 }}>{config?.error ?? "This page is not active."}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={shellStyle}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <header
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
            color: "#fff",
            borderRadius: "16px 16px 0 0",
            padding: "28px 24px 22px",
            border: `1px solid ${theme.border}`,
            borderBottom: "none",
          }}
        >
          <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.85 }}>
            {businessName}
          </p>
          <h1 style={{ ...titleStyle, color: "#fff", margin: "0 0 10px" }}>{headline}</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, opacity: 0.92 }}>{subtitle}</p>
        </header>

        <div
          style={{
            ...cardStyle,
            borderRadius: "0 0 16px 16px",
            borderTop: "none",
          }}
        >
          {done === "ok" && (
            <p
              role="status"
              style={{
                padding: 14,
                borderRadius: 10,
                background: "#d1fae5",
                color: "#065f46",
                margin: "0 0 18px",
                lineHeight: 1.5,
              }}
            >
              Thank you — we received your request and will be in touch soon.
            </p>
          )}
          {done === "err" && errText && (
            <p
              role="alert"
              style={{
                padding: 14,
                borderRadius: 10,
                background: "#fee2e2",
                color: "#991b1b",
                margin: "0 0 18px",
                lineHeight: 1.5,
              }}
            >
              {errText}
            </p>
          )}

          <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 16 }}>
            <input
              type="text"
              name="website"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              style={{ display: "none" }}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
            />
            <label style={labelStyle}>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Mobile phone
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              How can we help?
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
            </label>

            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Phone or email is required.</p>

            {phoneEntered ? (
              <label
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "#334155",
                  cursor: "pointer",
                  padding: 14,
                  borderRadius: 10,
                  border: `1px solid ${smsConsent ? theme.primary : theme.border}`,
                  background: smsConsent ? "#fff7ed" : "#f8fafc",
                }}
              >
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  required={phoneEntered}
                  style={{ marginTop: 4, flexShrink: 0, width: 18, height: 18 }}
                />
                <span>
                  I agree to receive text messages from <strong>{businessName}</strong> about quotes, appointments, job
                  updates, and customer service. Message frequency varies. Message and data rates may apply. Reply STOP
                  to opt out or HELP for help. See our{" "}
                  <a href={`${origin}/privacy`} target="_blank" rel="noreferrer" style={linkStyle}>
                    Privacy Policy
                  </a>
                  ,{" "}
                  <a href={`${origin}/terms`} target="_blank" rel="noreferrer" style={linkStyle}>
                    Terms
                  </a>
                  , and{" "}
                  <a href={`${origin}/sms`} target="_blank" rel="noreferrer" style={linkStyle}>
                    SMS terms
                  </a>
                  .
                </span>
              </label>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
                If you add a mobile number, you will be asked to consent to text messages before we can text you (carrier
                requirements).
              </p>
            )}

            <button type="submit" disabled={busy} style={{ ...submitStyle, cursor: busy ? "wait" : "pointer" }}>
              {busy ? "Sending…" : "Submit request"}
            </button>
          </form>

          <p style={{ margin: "20px 0 0", fontSize: 11, color: "#94a3b8", lineHeight: 1.5, textAlign: "center" }}>
            Powered by Tradesman · Secure contact form for {businessName}
          </p>
        </div>
      </div>
    </div>
  )
}
