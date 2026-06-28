import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { usePortalTheme } from "../../lib/useSchemeStyles"
import { formatAppError } from "../../lib/formatAppError"
import {
  GROWTH_CAMPAIGN_TEMPLATES,
  applyCampaignStatusTransition,
  buildGrowthRecommendations,
  computeScoresFromGrades,
  createCampaignSnapshot,
  detectProfileChanges,
  loadGrowthDocFromProfileMetadata,
  mergeGrowthModuleMetadata,
  mergeProfileChanges,
  type GrowthCampaignDraft,
  type GrowthCampaignMetrics,
  type GrowthCampaignSnapshot,
  type GrowthModuleDoc,
  type GrowthPresencePages,
  type GrowthProfileGrade,
  type GrowthProfilePlatformId,
} from "../../lib/growthModule"
import { GROWTH_PROFILE_PLATFORM_DEFS, gradeGrowthProfiles, gradesToRecord } from "../../lib/growthProfileGrading"

type Props = {
  setPage: (page: string) => void
}

type SectionId = "overview" | "profiles" | "grades" | "budget" | "campaigns" | "changes"

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "profiles", label: "Business profiles" },
  { id: "grades", label: "AI visibility" },
  { id: "budget", label: "Marketing budget" },
  { id: "campaigns", label: "Campaigns" },
  { id: "changes", label: "Change log" },
]

export default function GrowthPage({ setPage }: Props) {
  const { user } = useAuth()
  const portalTheme = usePortalTheme()
  const userId = useScopedUserId() ?? user?.id ?? null
  const [doc, setDoc] = useState<GrowthModuleDoc>(() => loadGrowthDocFromProfileMetadata(null))
  const [leadCaptureSlug, setLeadCaptureSlug] = useState("")
  const [section, setSection] = useState<SectionId>("overview")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [grading, setGrading] = useState(false)
  const [err, setErr] = useState("")
  const saveTimer = useRef<number | null>(null)
  const docBeforeEdit = useRef<GrowthModuleDoc | null>(null)

  const ctaSlug = useMemo(() => {
    const configured = leadCaptureSlug.trim()
    if (configured.length >= 3) return configured
    const email = user?.email ?? ""
    const local = email.split("@")[0]?.replace(/[^a-z0-9-]/gi, "-").slice(0, 24)
    return local && local.length >= 3 ? local : "my-business"
  }, [user?.email, leadCaptureSlug])

  const ctaUrl =
    typeof window !== "undefined" ? `${window.location.origin}/cta/${encodeURIComponent(ctaSlug)}` : `/cta/${ctaSlug}`

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
          const loaded = loadGrowthDocFromProfileMetadata(data?.metadata)
          if (typeof data?.website_url === "string" && data.website_url.trim() && !loaded.websiteUrl) {
            loaded.websiteUrl = data.website_url.trim()
          }
          setDoc(loaded)
          if (typeof data?.embed_lead_slug === "string" && data.embed_lead_slug.trim()) {
            setLeadCaptureSlug(data.embed_lead_slug.trim())
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
          const merged = mergeGrowthModuleMetadata(prevMeta, next)
          const { error } = await supabase.from("profiles").update({ metadata: merged }).eq("id", userId)
          if (error) throw error
          if (next.websiteUrl?.trim()) {
            await supabase.from("profiles").update({ website_url: next.websiteUrl.trim() }).eq("id", userId)
          }
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
    (patch: Partial<GrowthModuleDoc> | ((prev: GrowthModuleDoc) => GrowthModuleDoc), trackChanges = true) => {
      setDoc((prev) => {
        if (trackChanges && !docBeforeEdit.current) docBeforeEdit.current = prev
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch }
        if (trackChanges && docBeforeEdit.current) {
          const changes = detectProfileChanges(docBeforeEdit.current, next)
          if (changes.length) {
            next.changeLog = mergeProfileChanges(prev.changeLog, changes)
          }
          docBeforeEdit.current = null
        }
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => persist(next), 600)
        return next
      })
    },
    [persist],
  )

  const saveNow = useCallback(() => persist(doc), [doc, persist])

  const runGrading = useCallback(() => {
    setGrading(true)
    setErr("")
    const result = gradeGrowthProfiles(doc)
    const profileGrades = gradesToRecord(result.platforms)
    updateDoc(
      (prev) => ({
        ...prev,
        profileGrades,
        lastGradedAt: result.gradedAt,
        scores: computeScoresFromGrades({ ...prev, profileGrades }),
        changeLog: mergeProfileChanges(prev.changeLog, [
          {
            id: `grade-${Date.now()}`,
            at: result.gradedAt,
            field: "profileGrades",
            label: "AI visibility grade run",
            newValue: `${result.overall}/100 overall`,
            source: "manual",
          },
        ]),
      }),
      false,
    )
    setGrading(false)
    setSection("grades")
  }, [doc, updateDoc])

  const scores = useMemo(() => computeScoresFromGrades(doc), [doc])
  const recommendations = useMemo(() => buildGrowthRecommendations(doc), [doc])
  const gradedPlatforms = useMemo(() => {
    if (!doc.lastGradedAt) return gradeGrowthProfiles(doc).platforms
    return GROWTH_PROFILE_PLATFORM_DEFS.map((def) => {
      const grade = doc.profileGrades?.[def.id]
      const url =
        def.id === "website"
          ? doc.websiteUrl
          : def.id === "google"
            ? doc.presencePages?.google ?? doc.gbpProfileUrl
            : doc.presencePages?.[def.id as keyof GrowthPresencePages]
      return { id: def.id, label: def.label, url, grade: grade ?? emptyGrade() }
    })
  }, [doc])

  const navBtn = (id: SectionId): CSSProperties => ({
    padding: "8px 12px",
    borderRadius: 8,
    border: section === id ? `2px solid ${portalTheme.primary}` : `1px solid ${portalTheme.border}`,
    background: section === id ? "rgba(249,115,22,0.08)" : portalTheme.isDark ? "rgba(30,41,59,0.85)" : "#fff",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    color: portalTheme.text,
  })

  if (loading) {
    return <div style={{ padding: 24, color: portalTheme.text }}>Loading Growth…</div>
  }

  return (
    <div className="scheme-page" style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 4px 32px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: portalTheme.text }}>Growth</h1>
        <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.6, color: portalTheme.textMuted, fontSize: 14 }}>
          Add your website and social profiles, grade what AI can see, set a marketing budget, and track campaigns before and
          after your partner runs ads. Lead capture still lives in <strong>Leads</strong> — Growth focuses on presence and
          campaign measurement.
        </p>
        {saving ? <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>Saving…</div> : null}
        {err ? <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{err}</div> : null}
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" style={navBtn(s.id)} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {section === "overview" ? (
        <OverviewSection
          doc={doc}
          scores={scores}
          recommendations={recommendations}
          ctaUrl={ctaUrl}
          onGrade={runGrading}
          grading={grading}
          onOpenProfiles={() => setSection("profiles")}
          onOpenCampaigns={() => setSection("campaigns")}
          setPage={setPage}
        />
      ) : null}

      {section === "profiles" ? (
        <ProfilesSection doc={doc} updateDoc={updateDoc} onSave={saveNow} onGrade={runGrading} grading={grading} />
      ) : null}

      {section === "grades" ? (
        <GradesSection platforms={gradedPlatforms} lastGradedAt={doc.lastGradedAt} onRegrade={runGrading} grading={grading} />
      ) : null}

      {section === "budget" ? (
        <BudgetSection
          budget={doc.marketingBudget}
          onPatch={(marketingBudget) => updateDoc({ marketingBudget: { ...doc.marketingBudget, ...marketingBudget } })}
          onSave={saveNow}
        />
      ) : null}

      {section === "campaigns" ? (
        <CampaignsSection
          doc={doc}
          ctaSlug={ctaSlug}
          updateDoc={updateDoc}
          saveNow={saveNow}
        />
      ) : null}

      {section === "changes" ? (
        <ChangesSection changeLog={doc.changeLog ?? []} campaigns={doc.campaigns ?? []} />
      ) : null}
    </div>
  )
}

function OverviewSection({
  doc,
  scores,
  recommendations,
  ctaUrl,
  onGrade,
  grading,
  onOpenProfiles,
  onOpenCampaigns,
  setPage,
}: {
  doc: GrowthModuleDoc
  scores: ReturnType<typeof computeScoresFromGrades>
  recommendations: ReturnType<typeof buildGrowthRecommendations>
  ctaUrl: string
  onGrade: () => void
  grading: boolean
  onOpenProfiles: () => void
  onOpenCampaigns: () => void
  setPage: (p: string) => void
}) {
  const liveCampaigns = (doc.campaigns ?? []).filter((c) => c.status === "active" || c.status === "submitted").length
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        <ScoreCard label="AI visibility" value={scores.overall} suffix="/100" hint={doc.lastGradedAt ? "From profile grades" : "Run grade"} />
        <ScoreCard label="Website" value={scores.website} suffix="/100" />
        <ScoreCard label="Google profile" value={scores.gbp} suffix="/100" />
        <ScoreCard label="Monthly budget" value={doc.marketingBudget?.monthlyCap} suffix="$" hint="Placeholder until payments" />
        <ScoreCard label="Active campaigns" value={liveCampaigns} />
      </div>

      <div style={{ ...panelStyle, marginBottom: 14 }}>
        <h2 style={h2}>Lead capture link</h2>
        <p style={p}>Campaign landing pages use your public Tradesman form. Configure the slug in Leads.</p>
        <input readOnly value={ctaUrl} style={inputStyle} onFocus={(e) => e.target.select()} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button type="button" style={primaryBtn} onClick={() => void navigator.clipboard?.writeText(ctaUrl)}>
            Copy /cta link
          </button>
          <button type="button" style={secondaryBtn} onClick={() => setPage("leads")}>
            Leads settings
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <button type="button" style={primaryBtn} disabled={grading} onClick={onGrade}>
          {grading ? "Grading…" : "Grade my profiles"}
        </button>
        <button type="button" style={secondaryBtn} onClick={onOpenProfiles}>
          Edit profiles
        </button>
        <button type="button" style={secondaryBtn} onClick={onOpenCampaigns}>
          Campaigns
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {recommendations.slice(0, 5).map((r) => (
          <div key={r.id} style={recRowStyle}>
            <span style={{ fontSize: 12, fontWeight: 800, color: r.priority === "high" ? "#b91c1c" : "#64748b", textTransform: "uppercase" }}>
              {r.priority}
            </span>
            <span style={{ fontSize: 13, color: "#334155", flex: 1 }}>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProfilesSection({
  doc,
  updateDoc,
  onSave,
  onGrade,
  grading,
}: {
  doc: GrowthModuleDoc
  updateDoc: (patch: Partial<GrowthModuleDoc> | ((prev: GrowthModuleDoc) => GrowthModuleDoc)) => void
  onSave: () => void
  onGrade: () => void
  grading: boolean
}) {
  const onPatch = (patch: Partial<GrowthModuleDoc>) => updateDoc(patch)
  return (
    <div style={panelStyle}>
      <h2 style={h2}>Business profiles</h2>
      <p style={p}>
        URLs your marketing partner (or our future crawl service) uses to monitor website and social presence. Changes are
        logged automatically.
      </p>
      <label style={labelStyle}>
        Business name (public)
        <input value={doc.gbpBusinessName ?? ""} onChange={(e) => onPatch({ gbpBusinessName: e.target.value })} style={inputStyle} />
      </label>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Primary service area
        <input value={doc.gbpLocation ?? ""} onChange={(e) => onPatch({ gbpLocation: e.target.value })} placeholder="City, ST" style={inputStyle} />
      </label>
      {GROWTH_PROFILE_PLATFORM_DEFS.map((field) => (
        <label key={field.id} style={{ ...labelStyle, marginTop: 10 }}>
          {field.label}
          <input
            value={
              field.id === "website"
                ? doc.websiteUrl ?? ""
                : field.id === "google"
                  ? doc.presencePages?.google ?? doc.gbpProfileUrl ?? ""
                  : doc.presencePages?.[field.id as keyof GrowthPresencePages] ?? ""
            }
            onChange={(e) => {
              const v = e.target.value
              if (field.id === "website") onPatch({ websiteUrl: v })
              else if (field.id === "google") {
                onPatch({ presencePages: { ...doc.presencePages, google: v }, gbpProfileUrl: v })
              } else {
                onPatch({ presencePages: { ...doc.presencePages, [field.id]: v } as GrowthPresencePages })
              }
            }}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        </label>
      ))}
      <label style={{ ...labelStyle, marginTop: 12, display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={doc.gbpConnected === true} onChange={(e) => onPatch({ gbpConnected: e.target.checked })} />
        I manage this Google Business listing
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <button type="button" style={primaryBtn} onClick={onSave}>
          Save profiles
        </button>
        <button type="button" style={secondaryBtn} disabled={grading} onClick={onGrade}>
          {grading ? "Grading…" : "Grade visibility"}
        </button>
      </div>
    </div>
  )
}

function GradesSection({
  platforms,
  lastGradedAt,
  onRegrade,
  grading,
}: {
  platforms: { id: GrowthProfilePlatformId; label: string; url?: string; grade: GrowthProfileGrade }[]
  lastGradedAt?: string
  onRegrade: () => void
  grading: boolean
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <p style={{ ...p, margin: 0 }}>
          {lastGradedAt
            ? `Last graded ${new Date(lastGradedAt).toLocaleString()} — based on saved URLs (full crawl when partner API connects).`
            : "Run a grade to see what AI can infer from your saved profile links today."}
        </p>
        <button type="button" style={primaryBtn} disabled={grading} onClick={onRegrade}>
          {grading ? "Grading…" : "Re-grade"}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {platforms.map((row) => (
          <div key={row.id} style={{ ...panelStyle, borderLeft: `4px solid ${gradeColor(row.grade.status)}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{row.label}</div>
                {row.url ? <div style={{ fontSize: 12, color: "#64748b", wordBreak: "break-all" }}>{row.url}</div> : null}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{row.grade.score}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: gradeColor(row.grade.status), textTransform: "uppercase" }}>
                  {row.grade.status.replace("_", " ")}
                </div>
              </div>
            </div>
            {row.grade.whatAiCanSee.length ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 4 }}>What AI can see</div>
                <ul style={listStyle}>
                  {row.grade.whatAiCanSee.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {row.grade.gaps.length ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginTop: 8, marginBottom: 4 }}>Gaps</div>
                <ul style={{ ...listStyle, color: "#991b1b" }}>
                  {row.grade.gaps.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function BudgetSection({
  budget,
  onPatch,
  onSave,
}: {
  budget: GrowthModuleDoc["marketingBudget"]
  onPatch: (b: NonNullable<GrowthModuleDoc["marketingBudget"]>) => void
  onSave: () => void
}) {
  return (
    <div style={panelStyle}>
      <h2 style={h2}>Marketing budget</h2>
      <p style={p}>
        Set the monthly cap you are willing to spend on ads and partner services. <strong>Payment collection is not wired yet</strong>{" "}
        — this will connect to Tradesman Payments (Helcim) so campaigns can draw from an approved budget later.
      </p>
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          fontSize: 13,
          color: "#9a3412",
          marginBottom: 14,
        }}
      >
        Status: {budget?.paymentWiringStatus === "connected" ? "Connected" : "Not connected — budget is planning only"}
      </div>
      <label style={labelStyle}>
        Monthly cap (USD)
        <input
          type="number"
          min={0}
          step={50}
          value={budget?.monthlyCap ?? ""}
          onChange={(e) => onPatch({ monthlyCap: Number(e.target.value) || undefined, currency: "USD", paymentWiringStatus: "not_connected" })}
          placeholder="e.g. 1500"
          style={inputStyle}
        />
      </label>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Notes for your marketing firm
        <textarea
          value={budget?.notes ?? ""}
          onChange={(e) => onPatch({ notes: e.target.value })}
          rows={3}
          placeholder="Seasonal peaks, max per campaign, approval rules…"
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>
      <button type="button" style={{ ...primaryBtn, marginTop: 12 }} onClick={onSave}>
        Save budget
      </button>
    </div>
  )
}

type UpdateDocFn = (patch: Partial<GrowthModuleDoc> | ((prev: GrowthModuleDoc) => GrowthModuleDoc), trackChanges?: boolean) => void

function CampaignsSection({
  doc,
  ctaSlug,
  updateDoc,
  saveNow,
}: {
  doc: GrowthModuleDoc
  ctaSlug: string
  updateDoc: UpdateDocFn
  saveNow: () => void
}) {
  const monthlyCap = doc.marketingBudget?.monthlyCap

  return (
    <div style={panelStyle}>
      <h2 style={h2}>Campaigns</h2>
      <p style={p}>
        Request work from your marketing partner. When a campaign goes <strong>Live</strong>, Tradesman captures a{" "}
        <em>before</em> snapshot; when marked <strong>Completed</strong>, an <em>after</em> snapshot — enter traffic and lead
        numbers your firm reports (automated analytics when partner API connects).
      </p>
      {monthlyCap ? (
        <p style={{ fontSize: 13, color: "#64748b", marginTop: -8 }}>Account monthly cap: ${monthlyCap.toLocaleString()}</p>
      ) : null}

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {GROWTH_CAMPAIGN_TEMPLATES.map((t) => (
          <div key={t.id} style={{ padding: 12, borderRadius: 10, border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
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
                      budget: monthlyCap ? Math.min(500, monthlyCap) : 500,
                      radiusMiles: 15,
                      durationDays: 30,
                      landingSlug: ctaSlug,
                      status: "draft",
                      dataCollectionBrief: "",
                    },
                  ],
                }))
              }
            >
              Add template
            </button>
          </div>
        ))}
      </div>

      {(doc.campaigns ?? []).length === 0 ? (
        <p style={{ fontSize: 13, color: "#64748b" }}>No campaigns — add a template to start a brief for your marketing firm.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(doc.campaigns ?? []).map((c) => (
            <CampaignCard key={c.id} campaign={c} ctaSlug={ctaSlug} updateDoc={updateDoc} saveNow={saveNow} />
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignCard({
  campaign: c,
  ctaSlug,
  updateDoc,
  saveNow,
}: {
  campaign: GrowthCampaignDraft
  ctaSlug: string
  updateDoc: UpdateDocFn
  saveNow: () => void
}) {
  const patchCampaign = (patch: Partial<GrowthCampaignDraft>) =>
    updateDoc((prev) => ({
      ...prev,
      campaigns: (prev.campaigns ?? []).map((x) => (x.id === c.id ? { ...x, ...patch } : x)),
    }))

  const setStatus = (status: GrowthCampaignDraft["status"]) =>
    updateDoc((prev) => ({
      ...prev,
      campaigns: (prev.campaigns ?? []).map((x) => (x.id === c.id ? applyCampaignStatusTransition(x, status) : x)),
    }))

  const updateSnapshotMetrics = (phase: "before" | "after", metrics: GrowthCampaignMetrics) =>
    updateDoc((prev) => ({
      ...prev,
      campaigns: (prev.campaigns ?? []).map((x) => {
        if (x.id !== c.id) return x
        const snapshots = [...(x.snapshots ?? [])]
        const idx = snapshots.findIndex((s) => s.phase === phase)
        if (idx >= 0) snapshots[idx] = { ...snapshots[idx], metrics: { ...snapshots[idx].metrics, ...metrics } }
        else snapshots.push(createCampaignSnapshot(phase, metrics))
        return { ...x, snapshots }
      }),
    }))

  return (
    <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${theme.border}`, background: "#f8fafc" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={c.name} onChange={(e) => patchCampaign({ name: e.target.value })} style={{ ...inputStyle, fontWeight: 800, flex: "1 1 200px" }} />
        <select value={c.status} onChange={(e) => setStatus(e.target.value as GrowthCampaignDraft["status"])} style={{ ...inputStyle, width: 160 }}>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted to partner</option>
          <option value="active">Live</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <label style={labelStyle}>
        What should the firm collect and run?
        <textarea
          value={c.dataCollectionBrief ?? ""}
          onChange={(e) => patchCampaign({ dataCollectionBrief: e.target.value })}
          rows={2}
          placeholder="Audience, creative, keywords, GBP posts, landing page changes…"
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>
      <label style={{ ...labelStyle, marginTop: 8 }}>
        Campaign description
        <textarea value={c.description ?? ""} onChange={(e) => patchCampaign({ description: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginTop: 8 }}>
        <label style={labelStyle}>
          Budget ($)
          <input type="number" min={0} value={c.budget ?? ""} onChange={(e) => patchCampaign({ budget: Number(e.target.value) || 0 })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Radius (mi)
          <input type="number" min={1} value={c.radiusMiles ?? ""} onChange={(e) => patchCampaign({ radiusMiles: Number(e.target.value) || 0 })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Days
          <input type="number" min={1} value={c.durationDays ?? ""} onChange={(e) => patchCampaign({ durationDays: Number(e.target.value) || 0 })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Landing slug
          <input value={c.landingSlug ?? ""} onChange={(e) => patchCampaign({ landingSlug: e.target.value })} placeholder={ctaSlug} style={inputStyle} />
        </label>
      </div>

      <SnapshotPair campaign={c} onUpdateMetrics={updateSnapshotMetrics} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <button type="button" style={primaryBtn} onClick={saveNow}>
          Save
        </button>
        {c.status === "draft" ? (
          <button type="button" style={secondaryBtn} onClick={() => setStatus("submitted")}>
            Submit to partner
          </button>
        ) : null}
        <button
          type="button"
          style={{ ...secondaryBtn, color: "#b91c1c", borderColor: "#fecaca" }}
          onClick={() => updateDoc((prev) => ({ ...prev, campaigns: (prev.campaigns ?? []).filter((x) => x.id !== c.id) }))}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function SnapshotPair({
  campaign,
  onUpdateMetrics,
}: {
  campaign: GrowthCampaignDraft
  onUpdateMetrics: (phase: "before" | "after", metrics: GrowthCampaignMetrics) => void
}) {
  const before = campaign.snapshots?.find((s) => s.phase === "before")
  const after = campaign.snapshots?.find((s) => s.phase === "after")

  return (
    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
      <SnapshotEditor title="Before push" snapshot={before} onSave={(m) => onUpdateMetrics("before", m)} />
      <SnapshotEditor title="After push" snapshot={after} onSave={(m) => onUpdateMetrics("after", m)} />
      {before && after ? <SnapshotCompare before={before} after={after} /> : null}
    </div>
  )
}

function SnapshotEditor({
  title,
  snapshot,
  onSave,
}: {
  title: string
  snapshot?: GrowthCampaignSnapshot
  onSave: (m: GrowthCampaignMetrics) => void
}) {
  const [visits, setVisits] = useState(String(snapshot?.metrics.websiteVisits ?? ""))
  const [leads, setLeads] = useState(String(snapshot?.metrics.leadSubmissions ?? ""))
  const [social, setSocial] = useState(String(snapshot?.metrics.socialEngagement ?? ""))
  const [notes, setNotes] = useState(snapshot?.metrics.notes ?? "")

  useEffect(() => {
    setVisits(String(snapshot?.metrics.websiteVisits ?? ""))
    setLeads(String(snapshot?.metrics.leadSubmissions ?? ""))
    setSocial(String(snapshot?.metrics.socialEngagement ?? ""))
    setNotes(snapshot?.metrics.notes ?? "")
  }, [snapshot])

  return (
    <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: `1px solid ${theme.border}` }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>
      {snapshot ? (
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Captured {new Date(snapshot.capturedAt).toLocaleString()}</div>
      ) : (
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Auto-captures when campaign goes live / completed — or save metrics manually.</div>
      )}
      <label style={labelStyle}>
        Website visits
        <input type="number" min={0} value={visits} onChange={(e) => setVisits(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ ...labelStyle, marginTop: 6 }}>
        Lead form submissions
        <input type="number" min={0} value={leads} onChange={(e) => setLeads(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ ...labelStyle, marginTop: 6 }}>
        Social engagement (index)
        <input type="number" min={0} value={social} onChange={(e) => setSocial(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ ...labelStyle, marginTop: 6 }}>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} placeholder="Profile or site changes during this phase" />
      </label>
      <button
        type="button"
        style={{ ...secondaryBtn, marginTop: 8 }}
        onClick={() =>
          onSave({
            websiteVisits: Number(visits) || undefined,
            leadSubmissions: Number(leads) || undefined,
            socialEngagement: Number(social) || undefined,
            notes: notes.trim() || undefined,
          })
        }
      >
        Save metrics
      </button>
    </div>
  )
}

function SnapshotCompare({ before, after }: { before: GrowthCampaignSnapshot; after: GrowthCampaignSnapshot }) {
  const delta = (a?: number, b?: number) => {
    if (a == null || b == null) return "—"
    const d = b - a
    return d >= 0 ? `+${d}` : String(d)
  }
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "#ecfdf5", border: "1px solid #a7f3d0", gridColumn: "1 / -1" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Before → after</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 14 }}>
        <span>Visits: {delta(before.metrics.websiteVisits, after.metrics.websiteVisits)}</span>
        <span>Leads: {delta(before.metrics.leadSubmissions, after.metrics.leadSubmissions)}</span>
        <span>Social: {delta(before.metrics.socialEngagement, after.metrics.socialEngagement)}</span>
      </div>
    </div>
  )
}

function ChangesSection({
  changeLog,
  campaigns,
}: {
  changeLog: NonNullable<GrowthModuleDoc["changeLog"]>
  campaigns: GrowthCampaignDraft[]
}) {
  const campaignEvents = campaigns.flatMap((c) =>
    (c.snapshots ?? []).map((s) => ({
      at: s.capturedAt,
      label: `Campaign “${c.name}” — ${s.phase} snapshot`,
      detail: s.metrics.notes ?? formatMetrics(s.metrics),
    })),
  )
  const merged = [
    ...changeLog.map((e) => ({
      at: e.at,
      label: e.label,
      detail: e.oldValue && e.newValue ? `${e.oldValue} → ${e.newValue}` : e.newValue ?? e.oldValue ?? "",
    })),
    ...campaignEvents.map((e) => ({ at: e.at, label: e.label, detail: e.detail ?? "" })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  if (merged.length === 0) {
    return (
      <div style={panelStyle}>
        <p style={p}>Profile URL edits and campaign snapshots will appear here.</p>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      <h2 style={h2}>Change log</h2>
      <p style={p}>Website and social URL changes, grade runs, and campaign before/after captures.</p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {merged.slice(0, 40).map((e, i) => (
          <li
            key={`${e.at}-${i}`}
            style={{
              padding: "12px 0",
              borderBottom: i < merged.length - 1 ? `1px solid ${theme.border}` : undefined,
            }}
          >
            <div style={{ fontSize: 11, color: "#64748b" }}>{new Date(e.at).toLocaleString()}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#334155" }}>{e.label}</div>
            {e.detail ? <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{e.detail}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ScoreCard({
  label,
  value,
  suffix,
  hint,
}: {
  label: string
  value: number | undefined
  suffix?: string
  hint?: string
}) {
  const v = value ?? 0
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${theme.border}`, background: "#fff", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
        {suffix === "%" ? `${v}%` : suffix === "$" ? (v ? `$${v.toLocaleString()}` : "—") : v || "—"}
        {suffix === "/100" ? <span style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>/100</span> : null}
      </div>
      {hint ? <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>{hint}</div> : null}
    </div>
  )
}

function emptyGrade(): GrowthProfileGrade {
  return { score: 0, gradedAt: "", status: "missing", whatAiCanSee: [], gaps: [] }
}

function gradeColor(status: GrowthProfileGrade["status"]): string {
  if (status === "strong") return "#059669"
  if (status === "fair") return "#d97706"
  if (status === "needs_work") return "#dc2626"
  return "#94a3b8"
}

function formatMetrics(m: GrowthCampaignMetrics): string {
  const parts: string[] = []
  if (m.websiteVisits != null) parts.push(`visits ${m.websiteVisits}`)
  if (m.leadSubmissions != null) parts.push(`leads ${m.leadSubmissions}`)
  if (m.socialEngagement != null) parts.push(`social ${m.socialEngagement}`)
  return parts.join(", ")
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
const inputStyle: CSSProperties = { padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14 }
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
const listStyle: CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: "#475569" }
const recRowStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
}
