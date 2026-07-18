import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

type LoadOk = {
  alreadySigned: false
  quoteId: string
  businessName: string
  customerName: string
  pdfUrl: string | null
  expiresAt: string | null
}

type LoadDone = { alreadySigned: true; signerName: string | null }

export default function EstimateEsignPage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<LoadOk | null>(null)
  const [done, setDone] = useState<LoadDone | null>(null)
  const [signerName, setSignerName] = useState("")
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/estimate-esign?__action=get&token=${encodeURIComponent(token)}`)
        const data = (await res.json()) as LoadOk | LoadDone | { error?: string }
        if (cancelled) return
        if (!res.ok) {
          setError((data as { error?: string }).error || "Could not load this signing link.")
          return
        }
        if ((data as LoadDone).alreadySigned) {
          setDone(data as LoadDone)
          return
        }
        setInfo(data as LoadOk)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this signing link.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = 140
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = "#cbd5e1"
    ctx.beginPath()
    ctx.moveTo(12, h - 28)
    ctx.lineTo(w - 12, h - 28)
    ctx.stroke()
  }, [info])

  function pos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    drawing.current = true
    canvas.setPointerCapture(e.pointerId)
    const p = pos(e)
    ctx.strokeStyle = "#0f172a"
    ctx.lineWidth = 2.2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function onPointerUp() {
    drawing.current = false
  }

  function clearSig() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const w = canvas.clientWidth
    const h = 140
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = "#cbd5e1"
    ctx.beginPath()
    ctx.moveTo(12, h - 28)
    ctx.lineTo(w - 12, h - 28)
    ctx.stroke()
  }

  async function submit() {
    const name = signerName.trim()
    if (name.length < 2) {
      setError("Enter your full name to sign.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const signaturePngBase64 = canvasRef.current?.toDataURL("image/png") ?? null
      const res = await fetch("/api/estimate-esign?__action=sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", token, signerName: name, signaturePngBase64 }),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) throw new Error(data.error || "Could not submit signature.")
      setDone({ alreadySigned: true, signerName: name })
      setInfo(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit signature.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={page}>
      <div style={card}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", color: "#ea580c", textTransform: "uppercase" }}>
          Tradesman e-sign
        </p>
        {loading ? <p style={{ margin: "16px 0 0", color: "#64748b" }}>Loading estimate…</p> : null}
        {error ? <p style={{ margin: "16px 0 0", color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}
        {done ? (
          <div style={{ marginTop: 16 }}>
            <h1 style={h1}>Signed — thank you</h1>
            <p style={sub}>
              {done.signerName ? `${done.signerName}, your signature was received.` : "Your signature was received."} The
              business has been notified.
            </p>
          </div>
        ) : null}
        {info ? (
          <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
            <div>
              <h1 style={h1}>Review &amp; sign</h1>
              <p style={sub}>
                {info.businessName} sent this estimate for {info.customerName}. Review the document, then type your name
                and sign below.
              </p>
            </div>
            {info.pdfUrl ? (
              <a href={info.pdfUrl} target="_blank" rel="noopener noreferrer" style={linkBtn}>
                View estimate PDF
              </a>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Estimate document is ready for your signature.</p>
            )}
            <label style={label}>
              Full legal name
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Your name"
                style={input}
                autoComplete="name"
              />
            </label>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Draw signature</span>
                <button type="button" onClick={clearSig} style={clearBtn}>
                  Clear
                </button>
              </div>
              <canvas
                ref={canvasRef}
                style={canvasStyle}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
            </div>
            <button type="button" onClick={() => void submit()} disabled={busy} style={primaryBtn}>
              {busy ? "Submitting…" : "Agree & sign estimate"}
            </button>
            <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", lineHeight: 1.45 }}>
              By signing, you agree this electronic signature is legally binding for this estimate.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const page: CSSProperties = {
  minHeight: "100vh",
  margin: 0,
  padding: "28px 16px 48px",
  boxSizing: "border-box",
  background: "linear-gradient(165deg, #fff7ed 0%, #f8fafc 45%, #e2e8f0 100%)",
  fontFamily: '"Segoe UI", system-ui, sans-serif',
}

const card: CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  background: "#fff",
  borderRadius: 16,
  padding: "22px 20px",
  boxShadow: "0 18px 40px rgba(15,23,42,0.10)",
  border: "1px solid #e2e8f0",
}

const h1: CSSProperties = { margin: "6px 0 0", fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }
const sub: CSSProperties = { margin: "8px 0 0", fontSize: 14, color: "#64748b", lineHeight: 1.5 }
const label: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "#0f172a" }
const input: CSSProperties = {
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  fontSize: 16,
  color: "#0f172a",
  background: "#fff",
}
const canvasStyle: CSSProperties = {
  width: "100%",
  height: 140,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  touchAction: "none",
  background: "#fff",
  display: "block",
}
const clearBtn: CSSProperties = {
  marginLeft: "auto",
  border: "none",
  background: "transparent",
  color: "#64748b",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}
const linkBtn: CSSProperties = {
  display: "inline-block",
  textAlign: "center",
  padding: "12px 14px",
  borderRadius: 10,
  background: "#0f172a",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  textDecoration: "none",
}
const primaryBtn: CSSProperties = {
  border: "none",
  background: "#ea580c",
  color: "#fff",
  borderRadius: 10,
  padding: "14px 16px",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
}
