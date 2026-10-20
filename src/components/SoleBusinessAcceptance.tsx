import { useCallback, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { usePortalTheme } from "../lib/useSchemeStyles"
import { platformToolsFetchOrigins, platformToolsJsonBody, readPlatformToolsJsonBody } from "../lib/platformToolsJsonBody"
import { SOLE_LEGAL_DOCUMENTS, soleLegalPath, type SoleLegalDocument } from "../../sole/documents"

type StatusPayload = {
  ok?: boolean
  error?: string
  version?: string
  activationGaps?: string[]
  spendGaps?: string[]
  chargesEnabled?: boolean
  message?: string
  soleFeeCents?: number
}

const BUSINESS_DOCS = SOLE_LEGAL_DOCUMENTS.filter((d) => d.requiredForBusiness)

async function soleConsent(action: string, body: Record<string, unknown>): Promise<StatusPayload> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error("Sign in again.")
  let last = "Could not reach SOLE consent."
  for (const origin of platformToolsFetchOrigins()) {
    const res = await fetch(`${origin}/api/sole-consent?__action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: platformToolsJsonBody(body),
    })
    const parsed = await readPlatformToolsJsonBody<StatusPayload>(res)
    if (!res.ok) {
      last = parsed.data?.error || `Request failed (${res.status}).`
      if (res.status >= 500) continue
      throw new Error(last)
    }
    return parsed.data ?? { ok: true }
  }
  throw new Error(last)
}

function DocCheck({
  document,
  checked,
  onChange,
}: {
  document: SoleLegalDocument
  checked: boolean
  onChange: (slug: string, next: boolean) => void
}) {
  const portalTheme = usePortalTheme()
  return (
    <label style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "start", fontSize: 14, color: portalTheme.text }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(document.slug, e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span>
        I have read and accept the{" "}
        <a href={soleLegalPath(document.slug)} target="_blank" rel="noreferrer" style={{ color: portalTheme.primary, fontWeight: 700 }}>
          {document.title}
        </a>
        . {document.summary}
      </span>
    </label>
  )
}

export default function SoleBusinessAcceptance() {
  const portalTheme = usePortalTheme()
  const [gaps, setGaps] = useState<string[] | null>(null)
  const [spendGaps, setSpendGaps] = useState<string[] | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [authority, setAuthority] = useState(false)
  const [billingChecked, setBillingChecked] = useState(false)
  const [budgetDollars, setBudgetDollars] = useState("")
  const [platforms, setPlatforms] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const refresh = useCallback(async () => {
    const status = await soleConsent("status", {})
    setGaps(status.activationGaps ?? [])
    setSpendGaps(status.spendGaps ?? [])
  }, [])

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [refresh])

  function toggleDoc(slug: string, next: boolean) {
    setChecked((prev) => ({ ...prev, [slug]: next }))
  }

  function togglePlatform(id: string) {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  async function accept() {
    const slugs = BUSINESS_DOCS.filter((d) => checked[d.slug]).map((d) => d.slug)
    if (slugs.length !== BUSINESS_DOCS.length || !authority) {
      setError("Each document needs its own checked box, and you must confirm you can accept for the business.")
      return
    }
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await soleConsent("accept", { slugs, authorityAffirmed: true })
      setGaps(result.activationGaps ?? [])
      setChecked({})
      setAuthority(false)
      setNotice("SOLE acceptance was recorded for this draft version. Advertising has not been started.")
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function recordSpend() {
    const budgetCents = Math.round(Number.parseFloat(budgetDollars) * 100)
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await soleConsent("authorize-spend", {
        platforms,
        budgetCents,
        cadence: "monthly",
        renewalDay: 1,
        billingDisclosureAccepted: billingChecked,
        automationMode: "manual",
      })
      setNotice(result.message || "Authorization recorded. No payment was collected.")
      if (typeof result.soleFeeCents === "number") {
        setNotice(
          `${result.message || "Authorization recorded."} Proposed SOLE servicing fee on this budget if it were all spent: $${(result.soleFeeCents / 100).toFixed(2)}. No card was charged.`,
        )
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const activated = gaps !== null && gaps.length === 0
  const card = {
    border: `1px solid ${portalTheme.border}`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    background: portalTheme.isDark ? "rgba(30,41,59,0.85)" : "#fff",
    display: "grid" as const,
    gap: 12,
  }

  return (
    <section style={card}>
      <div>
        <h2 style={{ margin: "0 0 6px", fontSize: 18, color: portalTheme.text }}>SOLE terms for this business</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: portalTheme.text, opacity: 0.85 }}>
          SOLE is an optional marketing service inside Growth. Accepting Tradesman’s general terms does not accept SOLE.
          Advertising management stays off until these boxes are checked and a separate spend authorization is recorded.
          This screen does not charge a card and does not launch ads.
        </p>
      </div>

      {gaps === null ? <p style={{ margin: 0, fontSize: 13, color: portalTheme.text }}>Checking SOLE acceptance…</p> : null}

      {activated ? (
        <p style={{ margin: 0, fontSize: 14, color: "#15803d", fontWeight: 700 }}>
          Current SOLE drafts are accepted for this business.
          {spendGaps && spendGaps.length === 0 ? " A spend authorization is on file and is not a payment." : " Spend is not authorized yet."}
        </p>
      ) : (
        <>
          {BUSINESS_DOCS.map((document) => (
            <DocCheck key={document.slug} document={document} checked={checked[document.slug] === true} onChange={toggleDoc} />
          ))}
          <label style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, fontSize: 14, color: portalTheme.text }}>
            <input type="checkbox" checked={authority} onChange={(e) => setAuthority(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I am authorized to accept these SOLE drafts for this business.</span>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void accept()}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "none",
              background: portalTheme.primary,
              color: "#fff",
              fontWeight: 800,
              width: "fit-content",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Saving…" : "Record SOLE acceptance"}
          </button>
        </>
      )}

      {activated ? (
        <div style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: portalTheme.text }}>Spending authorization</h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: portalTheme.text, opacity: 0.8 }}>
            Records a monthly manual budget only. Automatic changes stay off. Read the{" "}
            <a href={soleLegalPath("billing-disclosure")} target="_blank" rel="noreferrer" style={{ color: portalTheme.primary, fontWeight: 700 }}>
              billing disclosure
            </a>{" "}
            first. Nothing is collected from a card.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              ["google_ads", "Google Ads"],
              ["meta_ads", "Meta"],
              ["tiktok_ads", "TikTok"],
            ].map(([id, label]) => (
              <label key={id} style={{ fontSize: 13, color: portalTheme.text }}>
                <input type="checkbox" checked={platforms.includes(id)} onChange={() => togglePlatform(id)} /> {label}
              </label>
            ))}
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 700, color: portalTheme.text, maxWidth: 220 }}>
            Monthly budget (USD)
            <input
              value={budgetDollars}
              onChange={(e) => setBudgetDollars(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              style={{ fontWeight: 500, padding: "8px 10px", borderRadius: 8, border: `1px solid ${portalTheme.border}` }}
            />
          </label>
          <label style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, fontSize: 14, color: portalTheme.text }}>
            <input type="checkbox" checked={billingChecked} onChange={(e) => setBillingChecked(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I accept the billing disclosure for this manual budget. I understand this click does not pay anyone.</span>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void recordSpend()}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${portalTheme.border}`,
              background: "transparent",
              color: portalTheme.text,
              fontWeight: 800,
              width: "fit-content",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            Record authorization
          </button>
        </div>
      ) : null}

      {notice ? <p style={{ margin: 0, fontSize: 13, color: "#15803d" }}>{notice}</p> : null}
      {error ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}
    </section>
  )
}
