import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import {
  GROWTH_CAMPAIGN_TEMPLATES,
  GROWTH_LIFECYCLE_STEPS,
  LEAD_ATTRIBUTION_SOURCES,
  buildGrowthRecommendations,
  loadGrowthModuleFromMetadata,
  mergeGrowthModuleMetadata,
  type GrowthModuleDoc,
} from "../../lib/growthModule"

type Props = {
  setPage: (page: string) => void
}

type SectionId =
  | "dashboard"
  | "acquisition"
  | "gbp"
  | "website"
  | "reviews"
  | "campaigns"
  | "attribution"
  | "advisor"

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "acquisition", label: "Lead acquisition" },
  { id: "gbp", label: "Google Business" },
  { id: "website", label: "Website health" },
  { id: "reviews", label: "Reviews" },
  { id: "campaigns", label: "Campaigns" },
  { id: "attribution", label: "Attribution" },
  { id: "advisor", label: "AI advisor" },
]

function ScoreCard({ label, value, suffix }: { label: string; value: number | undefined; suffix?: string }) {
  const v = value ?? 0
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: "#fff",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
        {suffix === "%" ? `${v}%` : suffix === "$" ? `$${v.toLocaleString()}` : v}
        {suffix === "/100" ? <span style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>/100</span> : null}
      </div>
    </div>
  )
}

export default function GrowthPage({ setPage }: Props) {
  const { user } = useAuth()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [doc, setDoc] = useState<GrowthModuleDoc>(() => loadGrowthModuleFromMetadata(null))
  const [section, setSection] = useState<SectionId>("dashboard")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const saveTimer = useRef<number | null>(null)

  const ctaSlug = useMemo(() => {
    const email = user?.email ?? ""
    const local = email.split("@")[0]?.replace(/[^a-z0-9-]/gi, "-").slice(0, 24)
    return local && local.length >= 3 ? local : "my-business"
  }, [user?.email])

  const ctaUrl = typeof window !== "undefined" ? `${window.location.origin}/cta/${encodeURIComponent(ctaSlug)}` : `/cta/${ctaSlug}`

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setErr(error.message)
        else setDoc(loadGrowthModuleFromMetadata(data?.metadata))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const persist = useCallback(
    (next: GrowthModuleDoc) => {
      if (!supabase || !userId) return
      setSaving(true)
      void (async () => {
        try {
          const { data } = await supabase.from("profiles").select("metadata").eq("id", userId).maybeSingle()
          const prevMeta =
            data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
              ? { ...(data.metadata as Record<string, unknown>) }
              : {}
          const { error } = await supabase
            .from("profiles")
            .update({ metadata: mergeGrowthModuleMetadata(prevMeta, next) })
            .eq("id", userId)
          if (error) throw error
        } catch (e: unknown) {
          setErr(formatAppError(e))
        } finally {
          setSaving(false)
        }
      })()
    },
    [userId],
  )

  const updateDoc = useCallback(
    (patch: Partial<GrowthModuleDoc> | ((prev: GrowthModuleDoc) => GrowthModuleDoc)) => {
      setDoc((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch }
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => persist(next), 600)
        return next
      })
    },
    [persist],
  )

  const recommendations = useMemo(() => buildGrowthRecommendations(doc), [doc])

  const navBtn = (id: SectionId, _label: string): CSSProperties => ({
    padding: "8px 12px",
    borderRadius: 8,
    border: section === id ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
    background: section === id ? "rgba(249,115,22,0.08)" : "#fff",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    color: theme.text,
  })

  if (loading) {
    return <div style={{ padding: 24, color: theme.text }}>Loading Growth…</div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 4px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: theme.text }}>Growth</h1>
        <p style={{ margin: 0, maxWidth: 720, lineHeight: 1.6, color: "#475569", fontSize: 14 }}>
          Attract better customers, improve your online presence, and measure which marketing turns into completed work.
          Growth connects to Leads, Conversations, Estimates, and Operations — not a separate silo.
        </p>
        {saving ? <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>Saving…</div> : null}
        {err ? <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{err}</div> : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" style={navBtn(s.id, s.label)} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {section === "dashboard" ? (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <ScoreCard label="Overall growth" value={doc.scores?.overall} suffix="/100" />
            <ScoreCard label="Lead health" value={doc.scores?.leadHealth} suffix="/100" />
            <ScoreCard label="Google Business" value={doc.scores?.gbp} suffix="/100" />
            <ScoreCard label="Website" value={doc.scores?.website} suffix="/100" />
            <ScoreCard label="Reviews" value={doc.scores?.reviews} suffix="/100" />
            <ScoreCard label="Conversion rate" value={doc.scores?.conversionRate} suffix="%" />
            <ScoreCard label="Marketing ROI" value={doc.scores?.marketingRoi} suffix="%" />
            <ScoreCard label="Revenue attributed" value={doc.scores?.revenueAttributed} suffix="$" />
          </div>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
            Scores are placeholders until Google Business, website audit, and attribution rollups connect. Recommendations below
            are actionable today.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recommendations.slice(0, 4).map((r) => (
              <div
                key={r.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13, color: "#334155" }}>{r.text}</span>
                {r.actionPage ? (
                  <button
                    type="button"
                    onClick={() => setPage(r.actionPage!)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: theme.primary,
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Open
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {section === "acquisition" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Lead acquisition</h2>
          <p style={p}>
            Generate <strong>qualified</strong> leads — not purchased lists. Use your Tradesman capture link and connect
            channels you already use.
          </p>
          <label style={labelStyle}>
            Public lead capture URL
            <input readOnly value={ctaUrl} style={inputStyle} onFocus={(e) => e.target.select()} />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" style={primaryBtn} onClick={() => void navigator.clipboard?.writeText(ctaUrl)}>
              Copy link
            </button>
            <button type="button" style={secondaryBtn} onClick={() => setPage("leads")}>
              Open Leads
            </button>
          </div>
          <ul style={listStyle}>
            <li>Google Business Profile optimization (see Google Business tab)</li>
            <li>Website SEO &amp; landing pages</li>
            <li>Call tracking via your Tradesman business number</li>
            <li>Referral and review campaigns via Conversations</li>
          </ul>
        </div>
      ) : null}

      {section === "gbp" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Google Business Profile</h2>
          <p style={p}>
            Monitor verification, categories, hours, photos, reviews, posts, and service areas. Target: health score with
            AI recommendations (API integration planned).
          </p>
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={doc.gbpConnected === true}
              onChange={(e) => updateDoc({ gbpConnected: e.target.checked })}
            />
            I have connected or claimed my Google Business Profile (manual for now)
          </label>
          <label style={{ ...labelStyle, marginTop: 12 }}>
            Business name (as shown on Google)
            <input
              value={doc.gbpBusinessName ?? ""}
              onChange={(e) => updateDoc({ gbpBusinessName: e.target.value })}
              placeholder="Demo Plumbing Co."
              style={inputStyle}
            />
          </label>
          <label style={{ ...labelStyle, marginTop: 10 }}>
            Google Business Profile URL
            <input
              value={doc.gbpProfileUrl ?? ""}
              onChange={(e) => updateDoc({ gbpProfileUrl: e.target.value })}
              placeholder="https://maps.google.com/..."
              style={inputStyle}
            />
          </label>
          <label style={{ ...labelStyle, marginTop: 10 }}>
            Primary service location
            <input
              value={doc.gbpLocation ?? ""}
              onChange={(e) => updateDoc({ gbpLocation: e.target.value })}
              placeholder="City, ST or service area"
              style={inputStyle}
            />
          </label>
          <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Example recommendations (when synced)</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: "#166534" }}>
              <li>Add 10 new project photos</li>
              <li>Respond to three unanswered reviews</li>
              <li>Add a nearby service area</li>
              <li>Publish one Google Business post</li>
              <li>Ask five recent customers for reviews</li>
            </ul>
          </div>
        </div>
      ) : null}

      {section === "website" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Website health</h2>
          <p style={p}>SSL, mobile friendliness, speed, SEO, meta tags, broken links, schema, and contact consistency.</p>
          <label style={labelStyle}>
            Website URL
            <input
              value={doc.websiteUrl ?? ""}
              onChange={(e) => updateDoc({ websiteUrl: e.target.value })}
              placeholder="https://yourbusiness.com"
              style={inputStyle}
            />
          </label>
          <label style={{ ...labelStyle, marginTop: 10 }}>
            Notes from your last audit (manual)
            <textarea
              value={doc.websiteAuditNotes ?? ""}
              onChange={(e) => updateDoc({ websiteAuditNotes: e.target.value })}
              placeholder="SSL OK, mobile needs work, missing meta description on services page…"
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <button type="button" style={{ ...secondaryBtn, marginTop: 10 }} disabled title="Automated audit coming soon">
            Run health check (coming soon)
          </button>
        </div>
      ) : null}

      {section === "reviews" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Reviews</h2>
          <p style={p}>
            Central review management: Google, Facebook, and future providers. AI response drafts and review request
            campaigns through SMS/email.
          </p>
          <button type="button" style={primaryBtn} onClick={() => setPage("conversations")}>
            Request reviews via Conversations
          </button>
        </div>
      ) : null}

      {section === "campaigns" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Campaign builder</h2>
          <p style={p}>
            Start from a template, set budget, radius, landing slug, and duration. Saved campaigns appear below for editing.
          </p>
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {GROWTH_CAMPAIGN_TEMPLATES.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{t.targetService}</div>
                </div>
                <button
                  type="button"
                  style={secondaryBtn}
                  onClick={() =>
                    updateDoc((prev) => ({
                      ...prev,
                      campaigns: [
                        ...(prev.campaigns ?? []),
                        {
                          id: `${t.id}-${Date.now()}`,
                          name: t.name,
                          targetService: t.targetService,
                          budget: 500,
                          radiusMiles: 15,
                          durationDays: 30,
                          landingSlug: ctaSlug,
                          status: "draft",
                        },
                      ],
                    }))
                  }
                >
                  Add from template
                </button>
              </div>
            ))}
          </div>
          {(doc.campaigns ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: "#64748b" }}>No campaigns yet — add one from a template above.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(doc.campaigns ?? []).map((c) => (
                <div key={c.id} style={{ padding: 14, borderRadius: 10, border: `1px solid ${theme.border}`, background: "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <input
                      value={c.name}
                      onChange={(e) =>
                        updateDoc((prev) => ({
                          ...prev,
                          campaigns: (prev.campaigns ?? []).map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                        }))
                      }
                      style={{ ...inputStyle, fontWeight: 800, flex: "1 1 200px" }}
                    />
                    <select
                      value={c.status}
                      onChange={(e) =>
                        updateDoc((prev) => ({
                          ...prev,
                          campaigns: (prev.campaigns ?? []).map((x) =>
                            x.id === c.id ? { ...x, status: e.target.value as typeof c.status } : x,
                          ),
                        }))
                      }
                      style={{ ...inputStyle, width: 120 }}
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                    <label style={labelStyle}>
                      Budget ($)
                      <input
                        type="number"
                        min={0}
                        value={c.budget ?? ""}
                        onChange={(e) =>
                          updateDoc((prev) => ({
                            ...prev,
                            campaigns: (prev.campaigns ?? []).map((x) =>
                              x.id === c.id ? { ...x, budget: Number(e.target.value) || 0 } : x,
                            ),
                          }))
                        }
                        style={inputStyle}
                      />
                    </label>
                    <label style={labelStyle}>
                      Radius (mi)
                      <input
                        type="number"
                        min={1}
                        value={c.radiusMiles ?? ""}
                        onChange={(e) =>
                          updateDoc((prev) => ({
                            ...prev,
                            campaigns: (prev.campaigns ?? []).map((x) =>
                              x.id === c.id ? { ...x, radiusMiles: Number(e.target.value) || 0 } : x,
                            ),
                          }))
                        }
                        style={inputStyle}
                      />
                    </label>
                    <label style={labelStyle}>
                      Duration (days)
                      <input
                        type="number"
                        min={1}
                        value={c.durationDays ?? ""}
                        onChange={(e) =>
                          updateDoc((prev) => ({
                            ...prev,
                            campaigns: (prev.campaigns ?? []).map((x) =>
                              x.id === c.id ? { ...x, durationDays: Number(e.target.value) || 0 } : x,
                            ),
                          }))
                        }
                        style={inputStyle}
                      />
                    </label>
                    <label style={labelStyle}>
                      Landing slug
                      <input
                        value={c.landingSlug ?? ""}
                        onChange={(e) =>
                          updateDoc((prev) => ({
                            ...prev,
                            campaigns: (prev.campaigns ?? []).map((x) =>
                              x.id === c.id ? { ...x, landingSlug: e.target.value } : x,
                            ),
                          }))
                        }
                        placeholder={ctaSlug}
                        style={inputStyle}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    style={{ ...secondaryBtn, marginTop: 10, color: "#b91c1c", borderColor: "#fecaca" }}
                    onClick={() =>
                      updateDoc((prev) => ({
                        ...prev,
                        campaigns: (prev.campaigns ?? []).filter((x) => x.id !== c.id),
                      }))
                    }
                  >
                    Remove campaign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {section === "attribution" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Attribution</h2>
          <p style={p}>Track source through the full lifecycle:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {GROWTH_LIFECYCLE_STEPS.map((step, i) => (
              <span key={step} style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                {step}
                {i < GROWTH_LIFECYCLE_STEPS.length - 1 ? " →" : ""}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Lead sources (tag on Leads)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {LEAD_ATTRIBUTION_SOURCES.map((s) => (
              <span
                key={s.id}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "#f1f5f9",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                {s.label}
              </span>
            ))}
          </div>
          <button type="button" style={{ ...primaryBtn, marginTop: 16 }} onClick={() => setPage("leads")}>
            Tag sources in Leads
          </button>
        </div>
      ) : null}

      {section === "advisor" ? (
        <div style={panelStyle}>
          <h2 style={h2}>AI Growth Advisor</h2>
          <p style={p}>Actionable recommendations instead of vanity charts. Full AI scheduling coming soon.</p>
          <ul style={listStyle}>
            {(doc.advisorNotes ?? []).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

const panelStyle: CSSProperties = {
  padding: 18,
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
}

const h2: CSSProperties = { margin: "0 0 10px", fontSize: 18, fontWeight: 800, color: theme.text }
const p: CSSProperties = { margin: "0 0 14px", fontSize: 14, lineHeight: 1.55, color: "#475569" }
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "#334155" }
const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  fontSize: 14,
}
const primaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
}
const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  color: theme.text,
}
const listStyle: CSSProperties = { margin: "12px 0 0", paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: "#475569" }
