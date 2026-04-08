import { useMemo, useState, type FormEvent } from "react"
import { theme } from "../../styles/theme"

type Props = { slug: string }

export default function EmbedLeadPage({ slug }: Props) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [hp, setHp] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<"idle" | "ok" | "err">("idle")
  const [errText, setErrText] = useState("")

  const safeSlug = useMemo(() => slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64), [slug])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!safeSlug || safeSlug.length < 3) {
      setDone("err")
      setErrText("Invalid form link.")
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
          website: hp,
        }),
      })
      const raw = await res.text()
      if (!res.ok) {
        let msg = raw.slice(0, 200)
        try {
          const j = JSON.parse(raw) as { error?: string }
          if (j.error) msg = j.error
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
    } catch (err) {
      setDone("err")
      setErrText(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!safeSlug || safeSlug.length < 3) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <p style={{ color: "#b91c1c" }}>This embed URL is missing a valid slug.</p>
      </div>
    )
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        maxWidth: 440,
        margin: "0 auto",
        color: "#111827",
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Request a quote</h1>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280", lineHeight: 1.5 }}>
        Leave your contact details and we&apos;ll get back to you shortly.
      </p>
      {done === "ok" && (
        <p style={{ padding: 12, borderRadius: 8, background: "#d1fae5", color: "#065f46", marginBottom: 16 }}>
          Thanks — your message was sent.
        </p>
      )}
      {done === "err" && errText && (
        <p style={{ padding: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b", marginBottom: 16 }}>{errText}</p>
      )}
      <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 14 }}>
        <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)} style={{ display: "none" }} tabIndex={-1} autoComplete="off" aria-hidden />
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...theme.formInput, fontWeight: 400 }} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          Phone
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...theme.formInput, fontWeight: 400 }} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...theme.formInput, fontWeight: 400 }} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          How can we help?
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ ...theme.formInput, resize: "vertical", fontWeight: 400 }} />
        </label>
        <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Phone or email is required.</p>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
            fontSize: 15,
          }}
        >
          {busy ? "Sending…" : "Submit"}
        </button>
      </form>
    </div>
  )
}
