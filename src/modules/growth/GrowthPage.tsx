import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { formatAppError } from "../../lib/formatAppError"
import {
  GROWTH_CAMPAIGN_TEMPLATES,
  buildGrowthRecommendations,
  loadGrowthModuleFromMetadata,
  mergeGrowthModuleMetadata,
  runBasicWebsiteHealthCheck,
  type GrowthModuleDoc,
  type GrowthPresencePages,
} from "../../lib/growthModule"

type Props = {
  setPage: (page: string) => void
}

type SectionId =
  | "dashboard"
  | "acquisition"
  | "pages"
  | "website"
  | "presence"
  | "campaigns"
  | "advisor"

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "acquisition", label: "Lead acquisition" },
  { id: "pages", label: "Pages" },
  { id: "website", label: "Website health" },
  { id: "presence", label: "Reviews & presence" },
  { id: "campaigns", label: "Campaign requests" },
  { id: "advisor", label: "AI advisor" },
]

const PRESENCE_PAGE_FIELDS: { key: keyof GrowthPresencePages; label: string; placeholder: string }[] = [
  { key: "google", label: "Google Business Profile", placeholder: "https://maps.google.com/..." },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/your-page" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/your-handle" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@your-handle" },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/your-handle" },
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
  const [leadCaptureSlug, setLeadCaptureSlug] = useState("")
  const [section, setSection] = useState<SectionId>("dashboard")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [healthCheckBusy, setHealthCheckBusy] = useState(false)
  const [err, setErr] = useState("")
  const saveTimer = useRef<number | null>(null)

  const ctaSlug = useMemo(() => {
    const configured = leadCaptureSlug.trim()
    if (configured.length >= 3) return configured
    const email = user?.email ?? ""
    const local = email.split("@")[0]?.replace(/[^a-z0-9-]/gi, "-").slice(0, 24)
    return local && local.length >= 3 ? local : "my-business"
  }, [user?.email, leadCaptureSlug])

  const ctaUrl = typeof window !== "undefined" ? `${window.location.origin}/cta/${encodeURIComponent(ctaSlug)}` : `/cta/${ctaSlug}`

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata, embed_lead_slug, website_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setErr(error.message)
        else {
          setDoc(loadGrowthModuleFromMetadata(data?.metadata))
          if (typeof data?.embed_lead_slug === "string" && data.embed_lead_slug.trim()) {
            setLeadCaptureSlug(data.embed_lead_slug.trim())
          }
          if (typeof data?.website_url === "string" && data.website_url.trim() && !loadGrowthModuleFromMetadata(data?.metadata).websiteUrl) {
            setDoc((prev) => ({ ...prev, websiteUrl: data.website_url!.trim() }))
          }
        }
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

  const saveNow = useCallback(() => {
    persist(doc)
  }, [doc, persist])

  const runWebsiteHealthCheck = useCallback(() => {
    const url = doc.websiteUrl?.trim()
    if (!url) {
      setErr("Enter and save your website URL first.")
      return
    }
    setHealthCheckBusy(true)
    setErr("")
    const result = runBasicWebsiteHealthCheck(url)
    updateDoc((prev) => ({
      ...prev,
      websiteHealthCheck: result,
      scores: { ...prev.scores, website: result.score },
    }))
    setHealthCheckBusy(false)
  }, [doc.websiteUrl, updateDoc])

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
            Your <strong>Tradesman lead capture link</strong> is a public form at <code>/cta/your-slug</code>. Post it on
            your website, Google listing, truck wraps, and social profiles — inbound submissions land in{" "}
            <strong>Leads</strong> as qualified requests (not purchased lists).
          </p>
          <label style={labelStyle}>
            Public lead capture URL
            <input readOnly value={ctaUrl} style={inputStyle} onFocus={(e) => e.target.select()} />
          </label>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
            Slug comes from Leads → Settings (<code>embed_lead_slug</code>
            {leadCaptureSlug ? `: ${leadCaptureSlug}` : " — configure a custom slug there"}).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" style={primaryBtn} onClick={() => void navigator.clipboard?.writeText(ctaUrl)}>
              Copy link
            </button>
            <button type="button" style={secondaryBtn} onClick={() => setPage("leads")}>
              Configure in Leads
            </button>
          </div>
        </div>
      ) : null}

      {section === "pages" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Pages &amp; listings</h2>
          <p style={p}>
            Save URLs for the online presence pages your marketing partner (or AI advisor) should review. These are shared
            with your Growth workspace — not a live API sync yet.
          </p>
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={doc.gbpConnected === true}
              onChange={(e) => updateDoc({ gbpConnected: e.target.checked })}
            />
            I have claimed / manage my primary Google Business listing
          </label>
          <label style={{ ...labelStyle, marginTop: 12 }}>
            Business name (public listing)
            <input
              value={doc.gbpBusinessName ?? ""}
              onChange={(e) => updateDoc({ gbpBusinessName: e.target.value })}
              placeholder="Demo Plumbing Co."
              style={inputStyle}
            />
          </label>
          {PRESENCE_PAGE_FIELDS.map((field) => (
            <label key={field.key} style={{ ...labelStyle, marginTop: 10 }}>
              {field.label}
              <input
                value={doc.presencePages?.[field.key] ?? (field.key === "google" ? doc.gbpProfileUrl ?? "" : "")}
                onChange={(e) =>
                  updateDoc((prev) => ({
                    ...prev,
                    presencePages: { ...prev.presencePages, [field.key]: e.target.value },
                    ...(field.key === "google" ? { gbpProfileUrl: e.target.value } : {}),
                  }))
                }
                placeholder={field.placeholder}
                style={inputStyle}
              />
            </label>
          ))}
          <label style={{ ...labelStyle, marginTop: 10 }}>
            Primary service area
            <input
              value={doc.gbpLocation ?? ""}
              onChange={(e) => updateDoc({ gbpLocation: e.target.value })}
              placeholder="City, ST or service radius"
              style={inputStyle}
            />
          </label>
          <button type="button" style={{ ...primaryBtn, marginTop: 14 }} onClick={saveNow}>
            Save pages
          </button>
        </div>
      ) : null}

      {section === "website" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Website health</h2>
          <p style={p}>Save your site URL once, then run a quick health check before sending work to a marketing partner.</p>
          <label style={labelStyle}>
            Website URL
            <input
              value={doc.websiteUrl ?? ""}
              onChange={(e) => updateDoc({ websiteUrl: e.target.value })}
              placeholder="https://yourbusiness.com"
              style={inputStyle}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <button type="button" style={secondaryBtn} onClick={saveNow}>
              Save URL
            </button>
            <button type="button" style={primaryBtn} disabled={healthCheckBusy} onClick={runWebsiteHealthCheck}>
              {healthCheckBusy ? "Checking…" : "Run health check"}
            </button>
          </div>
          {doc.websiteHealthCheck ? (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "#f8fafc", border: `1px solid ${theme.border}` }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>
                Score: {doc.websiteHealthCheck.score}/100 ·{" "}
                {new Date(doc.websiteHealthCheck.checkedAt).toLocaleString()}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
                {doc.websiteHealthCheck.checks.map((c) => (
                  <li key={c.id} style={{ color: c.ok ? "#166534" : "#991b1b" }}>
                    {c.ok ? "✓" : "✗"} {c.label}
                    {c.detail ? ` — ${c.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <label style={{ ...labelStyle, marginTop: 14 }}>
            Notes from your last audit (manual)
            <textarea
              value={doc.websiteAuditNotes ?? ""}
              onChange={(e) => updateDoc({ websiteAuditNotes: e.target.value })}
              placeholder="SSL OK, mobile needs work, missing meta description on services page…"
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
        </div>
      ) : null}

      {section === "presence" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Reviews &amp; presence</h2>
          <p style={p}>
            Gather review and reputation pages from the <strong>Pages</strong> tab. Request reviews from recent customers via{" "}
            <strong>Conversations</strong> (SMS or email). A third-party marketing firm can use saved page URLs for monitoring.
          </p>
          <button type="button" style={primaryBtn} onClick={() => setSection("pages")}>
            Open Pages
          </button>
          <button type="button" style={{ ...secondaryBtn, marginLeft: 8 }} onClick={() => setPage("conversations")}>
            Request reviews via Conversations
          </button>
        </div>
      ) : null}

      {section === "campaigns" ? (
        <div style={panelStyle}>
          <h2 style={h2}>Campaign requests</h2>
          <p style={p}>
            Submit campaign briefs to your marketing partner. Pick a template, describe what you want, and submit for approval
            before anything goes live. <strong>Landing slug</strong> is the public lead form path segment (same as your{" "}
            <code>/cta/slug</code> link).
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
                      style={{ ...inputStyle, width: 140 }}
                    >
                      <option value="draft">Draft</option>
                      <option value="submitted">Submitted to partner</option>
                      <option value="active">Live</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <label style={labelStyle}>
                    Campaign description
                    <textarea
                      value={c.description ?? ""}
                      onChange={(e) =>
                        updateDoc((prev) => ({
                          ...prev,
                          campaigns: (prev.campaigns ?? []).map((x) => (x.id === c.id ? { ...x, description: e.target.value } : x)),
                        }))
                      }
                      rows={2}
                      placeholder="What offer or message should this campaign promote?"
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </label>
                  <label style={{ ...labelStyle, marginTop: 8 }}>
                    Notes for marketing partner
                    <textarea
                      value={c.notes ?? ""}
                      onChange={(e) =>
                        updateDoc((prev) => ({
                          ...prev,
                          campaigns: (prev.campaigns ?? []).map((x) => (x.id === c.id ? { ...x, notes: e.target.value } : x)),
                        }))
                      }
                      rows={2}
                      placeholder="Budget constraints, neighborhoods to avoid, brand voice…"
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </label>
                  <label style={{ ...labelStyle, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={c.requiresApprovalBeforeLive !== false}
                      onChange={(e) =>
                        updateDoc((prev) => ({
                          ...prev,
                          campaigns: (prev.campaigns ?? []).map((x) =>
                            x.id === c.id ? { ...x, requiresApprovalBeforeLive: e.target.checked } : x,
                          ),
                        }))
                      }
                    />
                    Require my approval before campaign goes live
                  </label>
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
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b" }}>
                        Leads land at /cta/{c.landingSlug?.trim() || ctaSlug}
                      </span>
                    </label>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    <button type="button" style={primaryBtn} onClick={saveNow}>
                      Save campaign
                    </button>
                    {c.status === "draft" ? (
                      <button
                        type="button"
                        style={secondaryBtn}
                        onClick={() =>
                          updateDoc((prev) => ({
                            ...prev,
                            campaigns: (prev.campaigns ?? []).map((x) =>
                              x.id === c.id
                                ? { ...x, status: "submitted", submittedAt: new Date().toISOString() }
                                : x,
                            ),
                          }))
                        }
                      >
                        Submit to marketing partner
                      </button>
                    ) : null}
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
