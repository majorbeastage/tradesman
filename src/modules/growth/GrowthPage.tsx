import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { useScopedUserId } from "../../contexts/OfficeManagerScopeContext"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { usePortalTheme } from "../../lib/useSchemeStyles"
import { formatAppError } from "../../lib/formatAppError"
import {
  applyCampaignStatusTransition,
  buildGrowthRecommendations,
  computeScoresFromGrades,
  createCampaignSnapshot,
  detectProfileChanges,
  loadGrowthDocFromProfileMetadata,
  mergeGrowthModuleMetadata,
  mergeProfileChanges,
  type BusinessProfileAccessUpdate,
  type GrowthCampaignDraft,
  type GrowthCampaignMetrics,
  type GrowthCampaignSnapshot,
  type GrowthModuleDoc,
  type GrowthPresencePages,
  type GrowthProfileGrade,
  type GrowthProfilePlatformId,
} from "../../lib/growthModule"
import PlatformBadge, { isPlatformBadgeId } from "../../components/PlatformBadge"
import { mergeSocialPresenceIntoMetadata, readSocialPresenceFromMetadata } from "../../lib/socialPresenceSync"
import { GROWTH_PROFILE_PLATFORM_DEFS, gradeGrowthProfiles, gradesToRecord } from "../../lib/growthProfileGrading"
import {
  BUSINESS_PROFILE_ACCESS_GUIDE,
  BUSINESS_PROFILE_ACCESS_INTRO,
  TRADESMAN_ACCESS_INVITE_EMAIL,
} from "../../lib/businessProfileAccessGuide"
import {
  AD_CAMPAIGN_FEE_DISCLOSURE,
  AD_CAMPAIGN_SPEND_DISCLAIMER,
  adCampaignProcessingFeeCents,
  formatUsdFromCents,
  usdToCents,
  type AdCampaignRow,
} from "../../lib/adCampaigns"
import { parseBusinessPublicProfileSettings } from "../../lib/businessPublicProfile"
import { openHostedWebsiteEditor } from "../../lib/accountNavigation"

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
  const [adminCampaignRequests, setAdminCampaignRequests] = useState<AdCampaignRow[]>([])
  const [approvalBusyId, setApprovalBusyId] = useState("")
  const [hostedWebsiteSlug, setHostedWebsiteSlug] = useState("")
  const [hostedWebsitePublished, setHostedWebsitePublished] = useState(false)
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

  const hostedWebsiteUrl = useMemo(() => {
    const slug = hostedWebsiteSlug.trim().toLowerCase()
    if (!slug || !hostedWebsitePublished) return ""
    return typeof window !== "undefined" ? `${window.location.origin}/${encodeURIComponent(slug)}` : `/${slug}`
  }, [hostedWebsiteSlug, hostedWebsitePublished])

  useEffect(() => {
    if (!supabase || !userId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void supabase
      .from("profiles")
      .select("metadata, embed_lead_slug, website_url, business_web_profile_slug")
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
          const social = readSocialPresenceFromMetadata(data?.metadata)
          loaded.presencePages = {
            ...(loaded.presencePages ?? {}),
            facebook: loaded.presencePages?.facebook || social.facebook || undefined,
            instagram: loaded.presencePages?.instagram || social.instagram || undefined,
          }
          setDoc(loaded)
          if (typeof data?.embed_lead_slug === "string" && data.embed_lead_slug.trim()) {
            setLeadCaptureSlug(data.embed_lead_slug.trim())
          }
          const webSettings = parseBusinessPublicProfileSettings(data?.metadata)
          const slugFromCol =
            typeof data?.business_web_profile_slug === "string" ? data.business_web_profile_slug.trim().toLowerCase() : ""
          const slug = slugFromCol || webSettings.publishedSlug.trim().toLowerCase()
          setHostedWebsiteSlug(slug)
          setHostedWebsitePublished(Boolean(webSettings.enabled && slug))
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const loadAdminCampaignRequests = useCallback(async () => {
    if (!supabase || !userId) {
      setAdminCampaignRequests([])
      return
    }
    const { data } = await supabase
      .from("ad_campaigns")
      .select("*")
      .eq("profile_id", userId)
      .in("status", ["awaiting_client_approval", "approved", "client_rejected"])
      .order("updated_at", { ascending: false })
    setAdminCampaignRequests((data ?? []) as AdCampaignRow[])
  }, [userId])

  useEffect(() => {
    void loadAdminCampaignRequests()
  }, [loadAdminCampaignRequests])

  const respondToAdminCampaign = useCallback(
    async (campaignId: string, decision: "approved" | "rejected") => {
      if (!supabase) return
      setApprovalBusyId(campaignId)
      setErr("")
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (!token) throw new Error("Sign in again to respond to this campaign.")
        const response = await fetch("/api/campaign-approval", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "respond", campaignId, decision }),
        })
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        if (!response.ok) throw new Error(payload.error || `Campaign response failed (${response.status}).`)
        await loadAdminCampaignRequests()
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not update campaign approval.")
      } finally {
        setApprovalBusyId("")
      }
    },
    [loadAdminCampaignRequests],
  )

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
          const mergedGrowth = mergeGrowthModuleMetadata(prevMeta, next)
          const merged = mergeSocialPresenceIntoMetadata(mergedGrowth, {
            facebook: next.presencePages?.facebook ?? "",
            instagram: next.presencePages?.instagram ?? "",
          })
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
    <div className="scheme-page growth-page" style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 4px 32px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: portalTheme.text }}>Growth</h1>
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
          hostedWebsiteUrl={hostedWebsiteUrl}
          hostedWebsitePublished={hostedWebsitePublished}
          onGrade={runGrading}
          grading={grading}
          onOpenProfiles={() => setSection("profiles")}
          onOpenCampaigns={() => setSection("campaigns")}
          setPage={setPage}
        />
      ) : null}

      {section === "profiles" ? (
        <ProfilesSection
          doc={doc}
          updateDoc={updateDoc}
          onSave={saveNow}
          onGrade={runGrading}
          grading={grading}
          hostedWebsiteUrl={hostedWebsiteUrl}
          hostedWebsitePublished={hostedWebsitePublished}
          setPage={setPage}
        />
      ) : null}

      {section === "grades" ? (
        <GradesSection platforms={gradedPlatforms} lastGradedAt={doc.lastGradedAt} onRegrade={runGrading} grading={grading} />
      ) : null}

      {section === "budget" ? (
        <BudgetSection
          budget={doc.marketingBudget}
          campaigns={doc.campaigns ?? []}
          onPatch={(marketingBudget) => updateDoc({ marketingBudget: { ...doc.marketingBudget, ...marketingBudget } })}
          onPatchCampaign={(campaignId, patch) =>
            updateDoc((prev) => ({
              ...prev,
              campaigns: (prev.campaigns ?? []).map((campaign) =>
                campaign.id === campaignId ? { ...campaign, ...patch } : campaign,
              ),
            }))
          }
          onSave={saveNow}
        />
      ) : null}

      {section === "campaigns" ? (
        <CampaignsSection
          doc={doc}
          adminCampaignRequests={adminCampaignRequests}
          approvalBusyId={approvalBusyId}
          onRespondToAdminCampaign={respondToAdminCampaign}
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

function HostedWebsitePanel({
  hostedWebsiteUrl,
  hostedWebsitePublished,
  setPage,
  compact,
}: {
  hostedWebsiteUrl: string
  hostedWebsitePublished: boolean
  setPage: (p: string) => void
  compact?: boolean
}) {
  return (
    <div style={{ ...panelStyle, marginBottom: compact ? 0 : 14 }}>
      <h2 style={h2}>Tradesman-hosted website</h2>
      <p style={p}>
        Edit your public business page with the same Tradesman login you use here — no separate admin username or password.
      </p>
      {hostedWebsitePublished && hostedWebsiteUrl ? (
        <>
          <label style={labelStyle}>
            Live site
            <input readOnly value={hostedWebsiteUrl} style={inputStyle} onFocus={(e) => e.target.select()} />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <button type="button" style={primaryBtn} onClick={() => openHostedWebsiteEditor(setPage)}>
              Edit website
            </button>
            <button type="button" style={secondaryBtn} onClick={() => window.open(hostedWebsiteUrl, "_blank", "noopener,noreferrer")}>
              View live site
            </button>
            <button
              type="button"
              style={secondaryBtn}
              onClick={() => void navigator.clipboard?.writeText(hostedWebsiteUrl)}
            >
              Copy link
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <p style={{ ...p, margin: 0, flex: "1 1 220px" }}>
            Publish a business page on Tradesman (templates, photos, contact form). Setup takes a few minutes in MyT.
          </p>
          <button type="button" style={primaryBtn} onClick={() => openHostedWebsiteEditor(setPage)}>
            Set up hosted website
          </button>
        </div>
      )}
    </div>
  )
}

function OverviewSection({
  doc,
  scores,
  recommendations,
  ctaUrl,
  hostedWebsiteUrl,
  hostedWebsitePublished,
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
  hostedWebsiteUrl: string
  hostedWebsitePublished: boolean
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

      <HostedWebsitePanel
        hostedWebsiteUrl={hostedWebsiteUrl}
        hostedWebsitePublished={hostedWebsitePublished}
        setPage={setPage}
      />

      <div style={{ ...panelStyle, marginBottom: 14 }}>
        <h2 style={h2}>Lead capture link</h2>
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
  hostedWebsiteUrl,
  hostedWebsitePublished,
  setPage,
}: {
  doc: GrowthModuleDoc
  updateDoc: (patch: Partial<GrowthModuleDoc> | ((prev: GrowthModuleDoc) => GrowthModuleDoc)) => void
  onSave: () => void
  onGrade: () => void
  grading: boolean
  hostedWebsiteUrl: string
  hostedWebsitePublished: boolean
  setPage: (p: string) => void
}) {
  const [accessGuideOpen, setAccessGuideOpen] = useState(true)
  const [openPlatformId, setOpenPlatformId] = useState<string | null>("google")
  const [accessAction, setAccessAction] = useState<"request_help" | "granted_access" | null>(null)
  const [accessPlatforms, setAccessPlatforms] = useState<GrowthProfilePlatformId[]>([])
  const [accessNote, setAccessNote] = useState("")
  const [accessBusy, setAccessBusy] = useState(false)
  const [accessMessage, setAccessMessage] = useState("")
  const onPatch = (patch: Partial<GrowthModuleDoc>) => updateDoc(patch)

  const sendAccessUpdate = async () => {
    if (!supabase || !accessAction) return
    if (accessAction === "granted_access" && accessPlatforms.length === 0) {
      setAccessMessage("Select at least one outlet where you granted access.")
      return
    }
    setAccessBusy(true)
    setAccessMessage("")
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error("Sign in again to notify Admin.")
      const response = await fetch("/api/business-profile-access", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: accessAction, platforms: accessPlatforms, note: accessNote }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        profileAccessUpdates?: BusinessProfileAccessUpdate[]
      }
      if (!response.ok) throw new Error(payload.error || `Admin notification failed (${response.status}).`)
      if (payload.profileAccessUpdates) onPatch({ profileAccessUpdates: payload.profileAccessUpdates })
      setAccessMessage(
        accessAction === "request_help"
          ? "Your help request was sent to Tradesman Admin."
          : "Admin was notified and will confirm the selected access.",
      )
      setAccessAction(null)
      setAccessPlatforms([])
      setAccessNote("")
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Could not notify Admin.")
    } finally {
      setAccessBusy(false)
    }
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
    <HostedWebsitePanel
      hostedWebsiteUrl={hostedWebsiteUrl}
      hostedWebsitePublished={hostedWebsitePublished}
      setPage={setPage}
      compact
    />
    <div style={panelStyle}>
      <h2 style={h2}>Business profiles</h2>
      <p style={p}>
        Shared with <strong>MyT → Business profile / web address</strong>. Update Facebook or Instagram here or there — they stay in sync.
        After you save each URL, use the access guide below to invite Tradesman as a Manager on the platforms you want us to run.
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {isPlatformBadgeId(field.id) ? <PlatformBadge id={field.id} size={20} /> : null}
            {field.label}
          </span>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <button type="button" style={primaryBtn} onClick={onSave}>
          Save profiles
        </button>
        <button type="button" style={secondaryBtn} disabled={grading} onClick={onGrade}>
          {grading ? "Grading…" : "Grade visibility"}
        </button>
      </div>
    </div>

    <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setAccessGuideOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          border: "none",
          background: "#eff6ff",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, color: theme.text, fontSize: 16 }}>{BUSINESS_PROFILE_ACCESS_INTRO.title}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            Step-by-step invites for Google, Meta, LinkedIn, Yelp, TikTok, X, and YouTube — keep Ownership, grant Manager access.
          </div>
        </div>
        <span style={{ color: "#94a3b8", flexShrink: 0 }}>{accessGuideOpen ? "▲" : "▼"}</span>
      </button>

      {accessGuideOpen ? (
        <div style={{ padding: 16, display: "grid", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.55 }}>{BUSINESS_PROFILE_ACCESS_INTRO.summary}</p>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #bfdbfe",
              background: "#f8fafc",
              fontSize: 13,
              color: theme.text,
              lineHeight: 1.5,
            }}
          >
            <strong>Invite email:</strong>{" "}
            <code style={{ fontSize: 12 }}>{TRADESMAN_ACCESS_INVITE_EMAIL}</code>
            <span style={{ color: "#64748b" }}> (or the email your Tradesman contact provides)</span>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 6 }}>Quick checklist</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
              {BUSINESS_PROFILE_ACCESS_INTRO.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {BUSINESS_PROFILE_ACCESS_GUIDE.map((platform) => {
              const open = openPlatformId === platform.id
              return (
                <div key={platform.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                  <button
                    type="button"
                    onClick={() => setOpenPlatformId(open ? null : platform.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 13px",
                      border: "none",
                      background: open ? "#fff7ed" : "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      fontWeight: 800,
                      color: theme.text,
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                      {isPlatformBadgeId(platform.id) ? <PlatformBadge id={platform.id} size={22} /> : null}
                      {platform.label}
                    </span>
                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>{open ? "Hide ▲" : "How to invite ▼"}</span>
                  </button>
                  {open ? (
                    <div style={{ padding: "0 13px 13px", display: "grid", gap: 8, borderTop: `1px solid ${theme.border}` }}>
                      <p style={{ margin: "10px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                        <strong>Why:</strong> {platform.why}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                        <strong>Where:</strong> {platform.inviteTarget}
                      </p>
                      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
                        {platform.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      {platform.notes ? (
                        <p
                          style={{
                            margin: 0,
                            padding: 10,
                            borderRadius: 8,
                            background: "#fff7ed",
                            border: "1px solid #fed7aa",
                            color: "#9a3412",
                            fontSize: 12,
                            lineHeight: 1.45,
                          }}
                        >
                          {platform.notes}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div
            style={{
              marginTop: 4,
              padding: 14,
              borderRadius: 10,
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
            }}
          >
            <div style={{ fontWeight: 900, color: theme.text, fontSize: 14 }}>Send an update to Tradesman Admin</div>
            <p style={{ margin: "5px 0 10px", color: "#475569", fontSize: 12, lineHeight: 1.5 }}>
              Ask for help with an access step, or tell us which outlets you granted so Admin can verify them.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                onClick={() => setAccessAction("request_help")}
                style={accessAction === "request_help" ? primaryBtn : secondaryBtn}
              >
                Requesting help
              </button>
              <button
                type="button"
                onClick={() => setAccessAction("granted_access")}
                style={accessAction === "granted_access" ? primaryBtn : secondaryBtn}
              >
                Granted Access — Send to Admin to Confirm
              </button>
            </div>

            {accessAction === "granted_access" ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: theme.text, marginBottom: 7 }}>
                  Select every outlet where access was sent
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 7 }}>
                  {GROWTH_PROFILE_PLATFORM_DEFS.map((platform) => (
                    <label key={platform.id} style={{ display: "flex", alignItems: "center", gap: 7, color: theme.text, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={accessPlatforms.includes(platform.id)}
                        onChange={() =>
                          setAccessPlatforms((current) =>
                            current.includes(platform.id)
                              ? current.filter((id) => id !== platform.id)
                              : [...current, platform.id],
                          )
                        }
                      />
                      <PlatformBadge id={platform.id} size={18} />
                      {platform.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {accessAction ? (
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                <textarea
                  value={accessNote}
                  onChange={(event) => setAccessNote(event.target.value)}
                  rows={2}
                  placeholder={accessAction === "request_help" ? "Tell Admin where you are stuck…" : "Optional note for Admin…"}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <button type="button" disabled={accessBusy} onClick={() => void sendAccessUpdate()} style={{ ...primaryBtn, justifySelf: "start" }}>
                  {accessBusy ? "Sending…" : accessAction === "request_help" ? "Send help request" : "Send access update"}
                </button>
              </div>
            ) : null}
            {accessMessage ? (
              <p
                role="status"
                style={{
                  margin: "10px 0 0",
                  color: accessMessage.toLowerCase().includes("sent") || accessMessage.toLowerCase().includes("notified") ? "#15803d" : "#b91c1c",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {accessMessage}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
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
                <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800, fontSize: 16 }}>
                  {isPlatformBadgeId(row.id) ? <PlatformBadge id={row.id} size={22} /> : null}
                  {row.label}
                </div>
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
  campaigns,
  onPatch,
  onPatchCampaign,
  onSave,
}: {
  budget: GrowthModuleDoc["marketingBudget"]
  campaigns: GrowthCampaignDraft[]
  onPatch: (b: NonNullable<GrowthModuleDoc["marketingBudget"]>) => void
  onPatchCampaign: (campaignId: string, patch: Partial<GrowthCampaignDraft>) => void
  onSave: () => void
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState("")
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId)

  return (
    <div style={panelStyle}>
      <h2 style={h2}>Marketing budget</h2>
      <p style={p}>
        Set an account-wide cap, or select a saved campaign to add or change that campaign&apos;s budget.
      </p>
      <CampaignSpendDisclosure />
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
        Status: {budget?.paymentWiringStatus === "connected" ? "Connected to Payments" : "Not connected — Admin Ads & campaigns syncs spend to Payments"}
      </div>
      <label style={labelStyle}>
        Campaign
        <select
          value={selectedCampaignId}
          onChange={(event) => setSelectedCampaignId(event.target.value)}
          style={inputStyle}
        >
          <option value="">Account-wide monthly budget</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name || "Untitled campaign"} · {campaign.status}
            </option>
          ))}
        </select>
      </label>
      {campaigns.length === 0 ? (
        <p style={{ margin: "6px 0 12px", fontSize: 12, color: "#64748b" }}>
          Create a campaign first, then return here to assign its budget.
        </p>
      ) : null}
      <label style={labelStyle}>
        {selectedCampaign ? "Campaign budget (USD)" : "Monthly cap (USD)"}
        <input
          type="number"
          min={0}
          step={50}
          value={selectedCampaign ? selectedCampaign.budget ?? "" : budget?.monthlyCap ?? ""}
          onChange={(e) => {
            const value = Number(e.target.value) || 0
            if (selectedCampaign) onPatchCampaign(selectedCampaign.id, { budget: value })
            else onPatch({ monthlyCap: value || undefined, currency: "USD", paymentWiringStatus: "not_connected" })
          }}
          placeholder="e.g. 1500"
          style={inputStyle}
        />
      </label>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        {selectedCampaign ? "Campaign notes" : "Notes for your marketing firm"}
        <textarea
          value={selectedCampaign ? selectedCampaign.notes ?? "" : budget?.notes ?? ""}
          onChange={(e) => {
            if (selectedCampaign) return onPatchCampaign(selectedCampaign.id, { notes: e.target.value })
            onPatch({ notes: e.target.value })
          }}
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
  adminCampaignRequests,
  approvalBusyId,
  onRespondToAdminCampaign,
  ctaSlug,
  updateDoc,
  saveNow,
}: {
  doc: GrowthModuleDoc
  adminCampaignRequests: AdCampaignRow[]
  approvalBusyId: string
  onRespondToAdminCampaign: (campaignId: string, decision: "approved" | "rejected") => Promise<void>
  ctaSlug: string
  updateDoc: UpdateDocFn
  saveNow: () => void
}) {
  const monthlyCap = doc.marketingBudget?.monthlyCap
  const completedCampaigns = (doc.campaigns ?? []).filter((campaign) => campaign.status === "completed")

  const createCampaign = (template?: GrowthCampaignDraft) => {
    const now = Date.now()
    updateDoc((prev) => ({
      ...prev,
      campaigns: [
        ...(prev.campaigns ?? []),
        {
          id: `campaign-${now}`,
          name: template?.name ? `${template.name} (new)` : "New campaign",
          targetService: template?.targetService ?? "",
          budget: template?.budget ?? (monthlyCap ? Math.min(500, monthlyCap) : 500),
          radiusMiles: template?.radiusMiles ?? 15,
          targetAreas: template?.targetAreas
            ? {
                areaCodes: [...(template.targetAreas.areaCodes ?? [])],
                zipCodes: [...(template.targetAreas.zipCodes ?? [])],
                cities: [...(template.targetAreas.cities ?? [])],
                states: [...(template.targetAreas.states ?? [])],
              }
            : {},
          durationDays: template?.durationDays ?? 30,
          landingSlug: template?.landingSlug ?? ctaSlug,
          description: template?.description ?? "",
          notes: template?.notes ?? "",
          dataCollectionBrief: template?.dataCollectionBrief ?? "",
          requiresApprovalBeforeLive: template?.requiresApprovalBeforeLive ?? true,
          status: "draft",
          snapshots: [],
        },
      ],
    }))
  }

  return (
    <div style={panelStyle}>
      <h2 style={h2}>Campaigns</h2>
      <p style={p}>
        Request work from your marketing partner. When a campaign goes <strong>Live</strong>, Tradesman captures a{" "}
        <em>before</em> snapshot; when marked <strong>Completed</strong>, an <em>after</em> snapshot — enter traffic and lead
        numbers your firm reports (automated analytics when partner API connects).
      </p>
      <CampaignSpendDisclosure />
      {adminCampaignRequests.length > 0 ? (
        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: theme.text }}>Campaigns from Tradesman</h3>
          {adminCampaignRequests.map((campaign) => {
            const awaiting = campaign.status === "awaiting_client_approval"
            return (
              <div
                key={campaign.id}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: `1px solid ${awaiting ? "#fb923c" : theme.border}`,
                  background: awaiting ? "#fff7ed" : "#f8fafc",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 900, color: theme.text }}>{campaign.name}</div>
                    <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>
                      Proposed budget {formatUsdFromCents(campaign.requested_budget_cents)} · {campaign.channels.join(", ") || "Channels pending"}
                    </div>
                  </div>
                  <strong style={{ fontSize: 12, color: awaiting ? "#c2410c" : campaign.status === "approved" ? "#15803d" : "#64748b" }}>
                    {awaiting ? "Your approval is required" : campaign.status === "approved" ? "Approved" : "Declined"}
                  </strong>
                </div>
                {campaign.request_details ? (
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: theme.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {campaign.request_details}
                  </p>
                ) : null}
                {awaiting ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      disabled={approvalBusyId === campaign.id}
                      onClick={() => void onRespondToAdminCampaign(campaign.id, "approved")}
                      style={primaryBtn}
                    >
                      Approve campaign
                    </button>
                    <button
                      type="button"
                      disabled={approvalBusyId === campaign.id}
                      onClick={() => void onRespondToAdminCampaign(campaign.id, "rejected")}
                      style={{ ...secondaryBtn, color: "#b91c1c", borderColor: "#fecaca" }}
                    >
                      Decline
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      {monthlyCap ? (
        <p style={{ fontSize: 13, color: "#64748b", marginTop: -8 }}>Account monthly cap: ${monthlyCap.toLocaleString()}</p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10, marginBottom: 16 }}>
        <button type="button" style={primaryBtn} onClick={() => createCampaign()}>
          New campaign
        </button>
        {completedCampaigns.length > 0 ? (
          <label style={{ ...labelStyle, minWidth: 260 }}>
            Start from a completed campaign
            <select
              defaultValue=""
              style={inputStyle}
              onChange={(event) => {
                const template = completedCampaigns.find((campaign) => campaign.id === event.target.value)
                if (template) createCampaign(template)
                event.target.value = ""
              }}
            >
              <option value="">Choose completed campaign…</option>
              {completedCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {(doc.campaigns ?? []).length === 0 ? (
        <p style={{ fontSize: 13, color: "#64748b" }}>
          No campaigns yet. Select <strong>New campaign</strong> to build one. Completed campaigns become reusable starting points here.
        </p>
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
  defaultExpanded = false,
}: {
  campaign: GrowthCampaignDraft
  ctaSlug: string
  updateDoc: UpdateDocFn
  saveNow: () => void
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

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
    <div style={{ borderRadius: 12, border: `1px solid ${theme.border}`, background: "#f8fafc", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, color: theme.text, fontSize: 15 }}>{c.name || "Untitled campaign"}</div>
          <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>
            {c.status} · {formatUsdFromCents(usdToCents(c.budget ?? 0))}
            {c.targetService ? ` · ${c.targetService}` : ""}
          </div>
        </div>
        <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded ? (
        <div style={{ padding: "0 14px 14px", display: "grid", gap: 8, borderTop: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
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

      <div
        style={{
          marginTop: 8,
          padding: 12,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 900, color: theme.text }}>Target areas (optional)</div>
        <p style={{ margin: "4px 0 10px", fontSize: 12, lineHeight: 1.45, color: "#64748b" }}>
          Add as many area codes, ZIP codes, cities, and states as requested. Press Enter or comma after each area.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
          <CampaignAreaInput
            label="Area codes"
            placeholder="e.g. 615"
            values={c.targetAreas?.areaCodes ?? []}
            normalize={(value) => value.replace(/\D/g, "").slice(0, 3)}
            onChange={(areaCodes) => patchCampaign({ targetAreas: { ...c.targetAreas, areaCodes } })}
          />
          <CampaignAreaInput
            label="ZIP codes"
            placeholder="e.g. 37201"
            values={c.targetAreas?.zipCodes ?? []}
            normalize={(value) => value.replace(/[^\d-]/g, "").slice(0, 10)}
            onChange={(zipCodes) => patchCampaign({ targetAreas: { ...c.targetAreas, zipCodes } })}
          />
          <CampaignAreaInput
            label="Cities"
            placeholder="e.g. Nashville"
            values={c.targetAreas?.cities ?? []}
            onChange={(cities) => patchCampaign({ targetAreas: { ...c.targetAreas, cities } })}
          />
          <CampaignAreaInput
            label="States"
            placeholder="e.g. TN"
            values={c.targetAreas?.states ?? []}
            normalize={(value) => value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 2)}
            onChange={(states) => patchCampaign({ targetAreas: { ...c.targetAreas, states } })}
          />
        </div>
      </div>

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
      {(c.budget ?? 0) > 0 ? (
        <div
          style={{
            marginTop: 10,
            padding: "9px 11px",
            borderRadius: 9,
            border: "1px solid #fed7aa",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          Proposed campaign spend: <strong>{formatUsdFromCents(usdToCents(c.budget ?? 0))}</strong> · Processing fee:{" "}
          <strong>{formatUsdFromCents(adCampaignProcessingFeeCents(usdToCents(c.budget ?? 0)))}</strong>
        </div>
      ) : null}

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
        <button type="button" style={secondaryBtn} onClick={() => setExpanded(false)}>
          Minimize
        </button>
        <button
          type="button"
          style={{ ...secondaryBtn, color: "#b91c1c", borderColor: "#fecaca" }}
          onClick={() => updateDoc((prev) => ({ ...prev, campaigns: (prev.campaigns ?? []).filter((x) => x.id !== c.id) }))}
        >
          Remove
        </button>
      </div>
        </div>
      ) : null}
    </div>
  )
}

function CampaignAreaInput({
  label,
  placeholder,
  values,
  normalize = (value) => value.trim(),
  onChange,
}: {
  label: string
  placeholder: string
  values: string[]
  normalize?: (value: string) => string
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState("")

  const addDraft = () => {
    const additions = draft
      .split(/[,\n]+/)
      .map((value) => normalize(value.trim()))
      .filter(Boolean)
    if (!additions.length) return
    onChange([...new Set([...values, ...additions])])
    setDraft("")
  }

  return (
    <label style={labelStyle}>
      {label}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={draft}
          placeholder={placeholder}
          style={{ ...inputStyle, minWidth: 0 }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={addDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              addDraft()
            }
          }}
        />
        <button type="button" onClick={addDraft} style={{ ...secondaryBtn, padding: "8px 10px" }}>
          Add
        </button>
      </div>
      {values.length ? (
        <span style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {values.map((value) => (
            <span
              key={value}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 7px",
                borderRadius: 999,
                background: "#e2e8f0",
                color: "#0f172a",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((item) => item !== value))}
                style={{ border: 0, padding: 0, background: "transparent", color: "#64748b", cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </span>
      ) : null}
    </label>
  )
}

function CampaignSpendDisclosure() {
  return (
    <div
      style={{
        margin: "0 0 14px",
        padding: 12,
        borderRadius: 10,
        border: "1px solid #fed7aa",
        background: "#fff7ed",
        color: "#9a3412",
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      <strong style={{ display: "block", marginBottom: 4 }}>Campaign cost and results disclosure</strong>
      <span>{AD_CAMPAIGN_SPEND_DISCLAIMER}</span>
      <span style={{ display: "block", marginTop: 5 }}>{AD_CAMPAIGN_FEE_DISCLOSURE}</span>
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
const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  fontSize: 14,
  background: "#ffffff",
  color: "#0f172a",
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
