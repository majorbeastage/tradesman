/**
 * Client ad / campaign creatives for Growth (managed lead ops).
 * Simple banner builder — export PNG preview or copy share text for social.
 */
import { useMemo, useRef, useState } from "react"
import { theme } from "../../styles/theme"

type BannerDraft = {
  clientName: string
  headline: string
  subhead: string
  ctaLabel: string
  linkUrl: string
  phone: string
  bg: string
  accent: string
}

const DEFAULTS: BannerDraft = {
  clientName: "Your Business",
  headline: "Need a pro this week?",
  subhead: "Licensed · Local · Fast response",
  ctaLabel: "Book now",
  linkUrl: "https://",
  phone: "",
  bg: "#0f172a",
  accent: "#f97316",
}

export default function AdminCampaignsSection() {
  const [draft, setDraft] = useState<BannerDraft>(DEFAULTS)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const shareText = useMemo(() => {
    const lines = [
      draft.headline.trim(),
      draft.subhead.trim(),
      draft.phone.trim() ? `Call ${draft.phone.trim()}` : "",
      draft.linkUrl.trim() && draft.linkUrl !== "https://" ? draft.linkUrl.trim() : "",
    ].filter(Boolean)
    return lines.join("\n")
  }, [draft])

  function paintBanner() {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = 1200
    const h = 628
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = draft.bg
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = draft.accent
    ctx.fillRect(0, 0, 18, h)
    ctx.fillStyle = "#ffffff"
    ctx.font = "700 28px Segoe UI, system-ui, sans-serif"
    ctx.fillText(draft.clientName.slice(0, 48), 56, 72)
    ctx.font = "800 64px Segoe UI, system-ui, sans-serif"
    wrapText(ctx, draft.headline, 56, 180, w - 112, 72)
    ctx.font = "600 32px Segoe UI, system-ui, sans-serif"
    ctx.fillStyle = "#cbd5e1"
    wrapText(ctx, draft.subhead, 56, 340, w - 112, 40)
    const btnW = 280
    const btnH = 64
    const btnX = 56
    const btnY = h - 120
    roundRect(ctx, btnX, btnY, btnW, btnH, 14, draft.accent)
    ctx.fillStyle = "#fff"
    ctx.font = "800 28px Segoe UI, system-ui, sans-serif"
    ctx.fillText(draft.ctaLabel.slice(0, 24), btnX + 28, btnY + 42)
    if (draft.phone.trim()) {
      ctx.fillStyle = "#e2e8f0"
      ctx.font = "600 24px Segoe UI, system-ui, sans-serif"
      ctx.fillText(draft.phone.trim(), btnX + btnW + 28, btnY + 40)
    }
  }

  function downloadPng() {
    paintBanner()
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement("a")
    a.href = canvas.toDataURL("image/png")
    a.download = `${(draft.clientName || "campaign").replace(/\s+/g, "-").toLowerCase()}-banner.png`
    a.click()
  }

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt("Copy this text:", shareText)
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 960 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: theme.text }}>Ads &amp; campaigns</h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          Build a simple social banner for a client, then download the image or copy caption text. Link to their website or Google Business Profile. Full ad-account automation comes later — this is the creative starter for managed Growth work.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 10, padding: 14, border: `1px solid ${theme.border}`, borderRadius: 12, background: "#fff" }}>
          {(
            [
              ["clientName", "Client / brand name"],
              ["headline", "Headline"],
              ["subhead", "Supporting line"],
              ["ctaLabel", "Button label"],
              ["linkUrl", "Link (website or GBP)"],
              ["phone", "Phone (optional)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{label}</span>
              <input
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                style={{ ...theme.formInput, padding: "8px 10px" }}
              />
            </label>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Background</span>
              <input type="color" value={draft.bg} onChange={(e) => setDraft((d) => ({ ...d, bg: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Accent</span>
              <input type="color" value={draft.accent} onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value }))} />
            </label>
          </div>
          <button type="button" onClick={downloadPng} style={{ border: "none", background: theme.primary, color: "#fff", borderRadius: 8, padding: "10px 12px", fontWeight: 800, cursor: "pointer" }}>
            Download banner PNG
          </button>
          <button type="button" onClick={() => void copyShare()} style={{ border: `1px solid ${theme.border}`, background: "#fff", color: theme.text, borderRadius: 8, padding: "10px 12px", fontWeight: 700, cursor: "pointer" }}>
            {copied ? "Copied caption" : "Copy social caption"}
          </button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: `1px solid ${theme.border}`,
              background: draft.bg,
              color: "#fff",
              padding: "28px 28px 24px",
              minHeight: 220,
              position: "relative",
            }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: draft.accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>{draft.clientName || "Client"}</div>
            <div style={{ marginTop: 14, fontSize: 28, fontWeight: 900, lineHeight: 1.2 }}>{draft.headline || "Headline"}</div>
            <div style={{ marginTop: 10, fontSize: 15, color: "#cbd5e1", fontWeight: 600 }}>{draft.subhead}</div>
            <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ background: draft.accent, color: "#fff", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: 14 }}>{draft.ctaLabel || "CTA"}</span>
              {draft.phone ? <span style={{ fontWeight: 700, fontSize: 14 }}>{draft.phone}</span> : null}
            </div>
            {draft.linkUrl && draft.linkUrl !== "https://" ? (
              <div style={{ marginTop: 14, fontSize: 12, color: "#94a3b8", wordBreak: "break-all" }}>{draft.linkUrl}</div>
            ) : null}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Live preview (1200×628 PNG on download — Meta/LinkedIn friendly).</p>
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      </div>
    </div>
  )
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/).filter(Boolean)
  let line = ""
  let yy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      line = word
      yy += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, yy)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}
