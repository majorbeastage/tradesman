import { useState, type CSSProperties } from "react"
import {
  type HostedWebsiteDoc,
  type HostedWebsiteHosting,
  normalizeSiteSlug,
  resolveTradesmanPublicSiteUrl,
  tradesmanSiteUrlForSlug,
  VERCEL_DNS_INSTRUCTIONS,
} from "../lib/hostedWebsite"
import { openHostedWebsiteEditor } from "../lib/accountNavigation"

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
  /** Opens MyT → Website builder (templates, colors, logos, photos, contact). */
  setPage?: (page: string) => void
}

export function HostedWebsiteGrowthPanel({ hostedWebsite, onPatch, onSave, saving, compact, setPage }: Props) {
  const [editorNote, setEditorNote] = useState("")
  const [dnsOpen, setDnsOpen] = useState(false)

  const publicUrl =
    hostedWebsite.hosting === "tradesman"
      ? resolveTradesmanPublicSiteUrl(hostedWebsite)
      : hostedWebsite.publicUrl.trim()

  function openEditor() {
    setEditorNote("")
    openHostedWebsiteEditor(setPage)
    setEditorNote("Opened Website builder — pick Classic template, set colors/logo/photos, then publish.")
  }

  function setHosting(hosting: HostedWebsiteHosting) {
    onPatch({ hosting })
  }

  return (
    <div style={{ ...panelStyle, marginBottom: compact ? 0 : 14 }}>
      <h2 style={h2}>Your business website</h2>
      <p style={p}>
        Build a Classic marketing site on Tradesman hosting: open Website Builder, pick a template, set
        brand colors, upload your logo and job photos, then publish. Contact Us uses this account’s phone and email.
      </p>

      <p style={{ ...labelStyle, marginBottom: 8 }}>Where is your website?</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <button type="button" style={choiceBtn(hostedWebsite.hosting === "tradesman")} onClick={() => setHosting("tradesman")}>
          Tradesman hosts my site
        </button>
        <button type="button" style={choiceBtn(hostedWebsite.hosting === "external")} onClick={() => setHosting("external")}>
          I use another host
        </button>
      </div>

      {hostedWebsite.hosting === "tradesman" ? (
        <>
          <label style={labelStyle}>
            Optional custom-domain notes (DNS)
            <input
              value={hostedWebsite.siteSlug}
              onChange={(e) => onPatch({ siteSlug: normalizeSiteSlug(e.target.value) })}
              placeholder="acme-plumbing (optional bookkeeping slug)"
              style={inputStyle}
            />
          </label>
          {hostedWebsite.siteSlug ? (
            <p style={{ ...p, marginTop: 6, marginBottom: 0, fontSize: 12 }}>
              Reference: <strong>{tradesmanSiteUrlForSlug(hostedWebsite.siteSlug)}</strong> — live publish URL comes from
              Website builder (business name slug on tradesman-us.com).
            </p>
          ) : null}

          <label style={{ ...labelStyle, marginTop: 12 }}>
            Custom domain (optional — later)
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
                    point DNS as above.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <button type="button" style={primaryBtn} onClick={openEditor}>
              Open website builder
            </button>
            <button type="button" style={secondaryBtn} disabled={saving} onClick={() => void onSave()}>
              {saving ? "Saving…" : "Save hosting settings"}
            </button>
            {publicUrl ? (
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ ...secondaryBtn, textDecoration: "none" }}>
                View live site
              </a>
            ) : null}
          </div>
          {editorNote ? <p style={{ ...p, marginTop: 10, marginBottom: 0, color: "#0f766e" }}>{editorNote}</p> : null}
        </>
      ) : null}

      {hostedWebsite.hosting === "external" ? (
        <>
          <label style={labelStyle}>
            Your website URL
            <input
              value={hostedWebsite.publicUrl}
              onChange={(e) => onPatch({ publicUrl: e.target.value })}
              placeholder="https://www.yourbusiness.com"
              style={inputStyle}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <button type="button" style={primaryBtn} disabled={saving} onClick={() => void onSave()}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      ) : null}

      {hostedWebsite.hosting === "none" ? (
        <p style={p}>Choose Tradesman hosting to open the website builder, or link an external site.</p>
      ) : null}
    </div>
  )
}
