/**
 * Phone-portrait social creative (Stories / Reels / TikTok): 1080 × 1920 (9:16).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { theme } from "../../styles/theme"

/** Instagram Stories / Reels / TikTok / Facebook Stories native export size. */
export const SOCIAL_STORY_WIDTH = 1080
export const SOCIAL_STORY_HEIGHT = 1920

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

type Props = {
  /** Prefill when admin selects a campaign client. */
  seed?: Partial<BannerDraft> | null
}

export default function SocialBannerBuilder({ seed }: Props) {
  const [draft, setDraft] = useState<BannerDraft>(DEFAULTS)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!seed) return
    setDraft((prev) => ({
      ...prev,
      ...(seed.clientName != null ? { clientName: seed.clientName } : {}),
      ...(seed.headline != null ? { headline: seed.headline } : {}),
      ...(seed.subhead != null ? { subhead: seed.subhead } : {}),
      ...(seed.ctaLabel != null ? { ctaLabel: seed.ctaLabel } : {}),
      ...(seed.linkUrl != null ? { linkUrl: seed.linkUrl } : {}),
      ...(seed.phone != null ? { phone: seed.phone } : {}),
    }))
  }, [seed?.clientName, seed?.headline, seed?.subhead, seed?.ctaLabel, seed?.linkUrl, seed?.phone])

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
    const w = SOCIAL_STORY_WIDTH
    const h = SOCIAL_STORY_HEIGHT
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.fillStyle = draft.bg
    ctx.fillRect(0, 0, w, h)

    // Accent bar (top) + side rail for story framing
    ctx.fillStyle = draft.accent
    ctx.fillRect(0, 0, w, 24)
    ctx.fillRect(0, 0, 28, h)

    // Safe zones roughly match IG story UI (top ~250px, bottom ~250px)
    const contentTop = 280
    const contentBottom = h - 320

    ctx.fillStyle = "#ffffff"
    ctx.font = "700 42px Segoe UI, system-ui, sans-serif"
    ctx.fillText(draft.clientName.slice(0, 40), 72, contentTop)

    ctx.font = "800 92px Segoe UI, system-ui, sans-serif"
    wrapText(ctx, draft.headline, 72, contentTop + 140, w - 144, 100)

    ctx.font = "600 44px Segoe UI, system-ui, sans-serif"
    ctx.fillStyle = "#cbd5e1"
    wrapText(ctx, draft.subhead, 72, contentTop + 420, w - 144, 56)

    const btnW = 420
    const btnH = 96
    const btnX = 72
    const btnY = contentBottom - 40
    roundRect(ctx, btnX, btnY, btnW, btnH, 20, draft.accent)
    ctx.fillStyle = "#fff"
    ctx.font = "800 40px Segoe UI, system-ui, sans-serif"
    ctx.fillText(draft.ctaLabel.slice(0, 22), btnX + 40, btnY + 62)

    if (draft.phone.trim()) {
      ctx.fillStyle = "#e2e8f0"
      ctx.font = "700 36px Segoe UI, system-ui, sans-serif"
      ctx.fillText(draft.phone.trim(), btnX, btnY + btnH + 64)
    }

    if (draft.linkUrl.trim() && draft.linkUrl !== "https://") {
      ctx.fillStyle = "#94a3b8"
      ctx.font = "600 28px Segoe UI, system-ui, sans-serif"
      const linkY = draft.phone.trim() ? btnY + btnH + 120 : btnY + btnH + 64
      wrapText(ctx, draft.linkUrl.trim(), 72, linkY, w - 144, 36)
    }
  }

  function downloadPng() {
    paintBanner()
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement("a")
    a.href = canvas.toDataURL("image/png")
    a.download = `${(draft.clientName || "campaign").replace(/\s+/g, "-").toLowerCase()}-story-1080x1920.png`
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

  // Preview scale to fit admin UI (~270px wide phone chrome)
  const previewScale = 270 / SOCIAL_STORY_WIDTH

  return (
    <div style={{ display: "grid", gap: 14, padding: 16, border: `1px solid ${theme.border}`, borderRadius: 12, background: "#fff" }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: theme.text }}>Social story banner</h3>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          Cell-phone portrait for Instagram / Facebook Stories, Reels, and TikTok —{" "}
          <strong>
            {SOCIAL_STORY_WIDTH}×{SOCIAL_STORY_HEIGHT}
          </strong>{" "}
          (9:16).
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) minmax(200px, 1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 10 }}>
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
          <button type="button" onClick={downloadPng} style={primaryBtn}>
            Download story PNG ({SOCIAL_STORY_WIDTH}×{SOCIAL_STORY_HEIGHT})
          </button>
          <button type="button" onClick={() => void copyShare()} style={secondaryBtn}>
            {copied ? "Copied caption" : "Copy social caption"}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: SOCIAL_STORY_WIDTH * previewScale,
              height: SOCIAL_STORY_HEIGHT * previewScale,
              borderRadius: 28,
              overflow: "hidden",
              border: "10px solid #0f172a",
              boxShadow: "0 12px 40px rgba(15,23,42,0.25)",
              background: draft.bg,
              position: "relative",
            }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 6, background: draft.accent }} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 7, background: draft.accent }} />
            <div style={{ padding: "48px 22px 28px", color: "#fff", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>{draft.clientName || "Client"}</div>
              <div style={{ marginTop: 18, fontSize: 22, fontWeight: 900, lineHeight: 1.15 }}>{draft.headline || "Headline"}</div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#cbd5e1", fontWeight: 600, lineHeight: 1.35 }}>{draft.subhead}</div>
              <div style={{ marginTop: "auto", paddingBottom: 28 }}>
                <span
                  style={{
                    display: "inline-block",
                    background: draft.accent,
                    color: "#fff",
                    borderRadius: 12,
                    padding: "10px 16px",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {draft.ctaLabel || "CTA"}
                </span>
                {draft.phone ? <div style={{ marginTop: 10, fontWeight: 700, fontSize: 12 }}>{draft.phone}</div> : null}
                {draft.linkUrl && draft.linkUrl !== "https://" ? (
                  <div style={{ marginTop: 8, fontSize: 10, color: "#94a3b8", wordBreak: "break-all" }}>{draft.linkUrl}</div>
                ) : null}
              </div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Phone preview · export is full {SOCIAL_STORY_WIDTH}×{SOCIAL_STORY_HEIGHT}</p>
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
  let lines = 0
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      line = word
      yy += lineHeight
      lines += 1
      if (lines >= 5) break
    } else {
      line = test
    }
  }
  if (line && lines < 5) ctx.fillText(line, x, yy)
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

const primaryBtn: CSSProperties = {
  border: "none",
  background: theme.primary,
  color: "#fff",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 800,
  cursor: "pointer",
}
const secondaryBtn: CSSProperties = {
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
}
