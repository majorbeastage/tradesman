import { useState, type CSSProperties } from "react"
import {
  type HostedWebsiteDoc,
  type HostedWebsiteHosting,
  normalizeSiteSlug,
  resolveTradesmanPublicSiteUrl,
  tradesmanSiteUrlForSlug,
  VERCEL_DNS_INSTRUCTIONS,
} from "../lib/hostedWebsite"
import { openWebsiteAdminPortal } from "../lib/websiteAdminHandoff"

const panelStyle: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
}

const h2: CSSProperties = { margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#0f172a" }
const p: CSSProperties = { margin: "0 0 12px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "#334155" }
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 14,
  boxSizing: "border-box",
}
const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#0f766e",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
}
const secondaryBtn: CSSProperties = {
  ...primaryBtn,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
}
const choiceBtn = (active: boolean): CSSProperties => ({
  ...secondaryBtn,
  background: active ? "rgba(15,118,110,0.1)" : "#f8fafc",
  border: `2px solid ${active ? "#0f766e" : "#e2e8f0"}`,
  textAlign: "left",
  flex: "1 1 160px",
})

type Props = {
  hostedWebsite: HostedWebsiteDoc
  onPatch: (patch: Partial<HostedWebsiteDoc>) => void
  onSave: () => void | Promise<void>
  saving?: boolean
  compact?: boolean
}

export function HostedWebsiteGrowthPanel({ hostedWebsite, onPatch, onSave, saving, compact }: Props) {
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorNote, setEditorNote] = useState("")
  const [dnsOpen, setDnsOpen] = useState(false)

  const publicUrl =
    hostedWebsite.hosting === "tradesman"
      ? resolveTradesmanPublicSiteUrl(hostedWebsite)
      : hostedWebsite.publicUrl.trim()

  async function openEditor() {
    setEditorBusy(true)
    setEditorNote("")
    const result = await openWebsiteAdminPortal()
    setEditorBusy(false)
    if (!result.ok) setEditorNote(result.error ?? "Could not open editor.")
    else setEditorNote("Website editor opened in a new tab — use your Tradesman login (no extra password).")
  }

  function setHosting(hosting: HostedWebsiteHosting) {
    onPatch({ hosting })
  }

  return (
    <div style={{ ...panelStyle, marginBottom: compact ? 0 : 14 }}>
      <h2 style={h2}>Your business website</h2>
      <p style={p}>
        This is your full marketing site (design.com-style templates coming soon) — separate from the quick public
        business card in MyT. Tradesman hosts on Vercel; you edit here with the same login you use now.
      </p>

      <p style={{ ...labelStyle, marginBottom: 8 }}>Where is your website?</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <button type="button" style={choiceBtn(hostedWebsite.hosting === "tradesman")} onClick={() => setHosting("tradesman")}>
          Tradesman hosts my site
        </button>
        <button type="button" style={choiceBtn(hostedWebsite.hosting === "external")} onClick={() => setHosting("external")}>
          I use another host
        </button>
        <button type="button" style={choiceBtn(hostedWebsite.hosting === "none")} onClick={() => setHosting("none")}>
          No website yet
        </button>
      </div>

      {hostedWebsite.hosting === "tradesman" ? (
        <>
          <label style={labelStyle}>
            Site address on Tradesman hosting
            <input
              value={hostedWebsite.siteSlug}
              onChange={(e) => onPatch({ siteSlug: normalizeSiteSlug(e.target.value) })}
              placeholder="acme-plumbing"
              style={inputStyle}
            />
          </label>
          {hostedWebsite.siteSlug ? (
            <p style={{ ...p, marginTop: 6, marginBottom: 0, fontSize: 12 }}>
              Default URL: <strong>{tradesmanSiteUrlForSlug(hostedWebsite.siteSlug)}</strong>
            </p>
          ) : null}

          <label style={{ ...labelStyle, marginTop: 12 }}>
            Custom domain (optional)
            <input
              value={hostedWebsite.customDomain}
              onChange={(e) => onPatch({ customDomain: e.target.value })}
              placeholder="www.yourbusiness.com"
              style={inputStyle}
            />
          </label>

          {hostedWebsite.customDomain ? (
            <div style={{ marginTop: 12 }}>
              <button type="button" style={secondaryBtn} onClick={() => setDnsOpen((v) => !v)}>
                {dnsOpen ? "Hide" : "Show"} DNS instructions for Vercel
              </button>
              {dnsOpen ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 8,
                    background: "#f8fafc",
                    fontSize: 12,
                    color: "#334155",
                    lineHeight: 1.6,
                  }}
                >
                  <p style={{ margin: "0 0 8px" }}>{VERCEL_DNS_INSTRUCTIONS.note}</p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <li>
                      Root / apex (<code>@</code>): <strong>A</strong> record → <code>{VERCEL_DNS_INSTRUCTIONS.apexA}</code>
                    </li>
                    <li>
                      <code>www</code>: <strong>CNAME</strong> → <code>{VERCEL_DNS_INSTRUCTIONS.wwwCname}</code>
                    </li>
                  </ul>
                  <p style={{ margin: "8px 0 0" }}>
                    Add <strong>{hostedWebsite.customDomain}</strong> in your Vercel project → Settings → Domains, then
                    apply these records at your registrar.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {publicUrl ? (
            <label style={{ ...labelStyle, marginTop: 12 }}>
              Public website URL
              <input readOnly value={publicUrl} style={inputStyle} onFocus={(e) => e.target.select()} />
            </label>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" style={primaryBtn} disabled={editorBusy} onClick={() => void openEditor()}>
              {editorBusy ? "Opening…" : "Open website editor"}
            </button>
            {publicUrl ? (
              <button
                type="button"
                style={secondaryBtn}
                onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
              >
                View live site
              </button>
            ) : null}
            <button type="button" style={secondaryBtn} disabled={saving} onClick={() => void onSave()}>
              {saving ? "Saving…" : "Save website settings"}
            </button>
          </div>
        </>
      ) : null}

      {hostedWebsite.hosting === "external" ? (
        <>
          <label style={labelStyle}>
            Your current website URL
            <input
              value={hostedWebsite.publicUrl}
              onChange={(e) => onPatch({ publicUrl: e.target.value.trim() })}
              placeholder="https://www.yourbusiness.com"
              style={inputStyle}
            />
          </label>
          <p style={{ ...p, marginTop: 8 }}>
            We use this for Growth grading and campaigns. To move to Tradesman hosting, choose &quot;Tradesman hosts my
            site&quot; above.
          </p>
          <button type="button" style={primaryBtn} disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save website URL"}
          </button>
        </>
      ) : null}

      {hostedWebsite.hosting === "none" ? (
        <>
          <p style={p}>
            Choose <strong>Tradesman hosts my site</strong> to get a professional site on our Vercel deployment with
            trade templates (plumbing, HVAC, etc.) as the editor evolves.
          </p>
          <button type="button" style={primaryBtn} onClick={() => setHosting("tradesman")}>
            Start Tradesman hosting
          </button>
        </>
      ) : null}

      {editorNote ? (
        <p
          style={{
            ...p,
            marginTop: 12,
            marginBottom: 0,
            color: editorNote.includes("Could") ? "#b91c1c" : "#047857",
          }}
        >
          {editorNote}
        </p>
      ) : null}
    </div>
  )
}
