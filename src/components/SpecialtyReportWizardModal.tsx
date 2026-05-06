import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { DRONE_PROVIDER_CATALOG } from "../lib/specialtyReports/droneIntegrationCatalog"
import {
  CONDITION_RATING_LABELS,
  HOME_INSPECTION_MAJOR_SECTIONS,
  type ConditionRating,
  type HomeInspectionReportV1,
  emptyHomeInspectionReport,
  parseHomeInspectionReport,
} from "../lib/specialtyReports/homeInspectionTemplate"
import { SPECIALTY_REPORT_TYPE_LABELS, type SpecialtyReportTypeKey } from "../lib/specialtyReports/reportTypeIds"

type WizardPhase =
  | "pick_type"
  | "home_header"
  | "home_findings"
  | "home_media"
  | "home_review"
  | "generic_notes"

type Props = {
  open: boolean
  onClose: () => void
  quoteId: string | null
  userId: string | null
  enabledReportTypes: SpecialtyReportTypeKey[]
  propertyAddressHint?: string
  customerLabel?: string
}

const META_KEY_HOME = "specialty_report_home_inspection"
const META_KEY_GENERIC_PREFIX = "specialty_report_notes_"

export default function SpecialtyReportWizardModal({
  open,
  onClose,
  quoteId,
  userId,
  enabledReportTypes,
  propertyAddressHint = "",
  customerLabel,
}: Props) {
  const [phase, setPhase] = useState<WizardPhase>("pick_type")
  const [picked, setPicked] = useState<SpecialtyReportTypeKey | null>(null)
  const [home, setHome] = useState<HomeInspectionReportV1>(() => emptyHomeInspectionReport(propertyAddressHint))
  const [genericNotes, setGenericNotes] = useState("")
  const [loadBusy, setLoadBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadDraftForType = useCallback(
    async (reportType: SpecialtyReportTypeKey | null) => {
      if (!quoteId || !supabase || !userId) return
      setLoadBusy(true)
      setSaveError(null)
      try {
        const { data, error } = await supabase.from("quotes").select("metadata").eq("id", quoteId).eq("user_id", userId).maybeSingle()
        if (error) throw error
        const meta =
          data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {}
        if (reportType === "home_inspection") {
          const parsed = parseHomeInspectionReport(meta[META_KEY_HOME])
          const base = emptyHomeInspectionReport(propertyAddressHint)
          if (parsed) {
            setHome({
              ...base,
              ...parsed,
              header: { ...base.header, ...parsed.header },
              subsections: { ...base.subsections, ...parsed.subsections },
            })
          } else {
            setHome(base)
          }
        }
        if (reportType && reportType !== "home_inspection") {
          const gKey = `${META_KEY_GENERIC_PREFIX}${reportType}`
          const gRaw = meta[gKey]
          setGenericNotes(typeof gRaw === "string" ? gRaw : "")
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoadBusy(false)
      }
    },
    [quoteId, userId, propertyAddressHint],
  )

  const reset = useCallback(() => {
    setPhase("pick_type")
    setPicked(null)
    setHome(emptyHomeInspectionReport(propertyAddressHint))
    setGenericNotes("")
    setSaveError(null)
  }, [propertyAddressHint])

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    if (enabledReportTypes.length === 1) {
      const only = enabledReportTypes[0]
      setPicked(only)
      setPhase(only === "home_inspection" ? "home_header" : "generic_notes")
      void loadDraftForType(only)
    } else {
      setPhase("pick_type")
      setPicked(null)
    }
  }, [open, enabledReportTypes, reset, loadDraftForType])

  const persistMetadata = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!quoteId || !userId || !supabase) return
      const { data, error } = await supabase.from("quotes").select("metadata").eq("id", quoteId).eq("user_id", userId).maybeSingle()
      if (error) throw error
      const prev =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? { ...(data.metadata as Record<string, unknown>) }
          : {}
      const nextMeta = { ...prev, ...patch }
      const { error: upErr } = await supabase
        .from("quotes")
        .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
        .eq("id", quoteId)
        .eq("user_id", userId)
      if (upErr) throw upErr
    },
    [quoteId, userId],
  )

  useEffect(() => {
    if (!open || !quoteId || phase === "pick_type" || picked !== "home_inspection") return
    const t = window.setTimeout(() => {
      const snap = { ...home, updatedAt: new Date().toISOString() }
      void persistMetadata({ [META_KEY_HOME]: snap }).catch((e) => setSaveError(e instanceof Error ? e.message : String(e)))
    }, 700)
    return () => window.clearTimeout(t)
  }, [home, open, quoteId, phase, picked, persistMetadata])

  useEffect(() => {
    if (!open || !quoteId || picked == null || picked === "home_inspection") return
    if (phase !== "generic_notes") return
    const t = window.setTimeout(() => {
      void persistMetadata({ [`${META_KEY_GENERIC_PREFIX}${picked}`]: genericNotes }).catch((e) =>
        setSaveError(e instanceof Error ? e.message : String(e)),
      )
    }, 700)
    return () => window.clearTimeout(t)
  }, [genericNotes, open, quoteId, picked, phase, persistMetadata])

  const headerLine = useMemo(() => {
    if (picked && picked !== "home_inspection") return SPECIALTY_REPORT_TYPE_LABELS[picked]
    return "Structure & property inspection"
  }, [picked])

  const deficientCount = useMemo(() => {
    return Object.values(home.subsections).filter((s) => s.condition === "deficient").length
  }, [home.subsections])

  if (!open) return null

  const close = () => {
    reset()
    onClose()
  }

  const selectType = (k: SpecialtyReportTypeKey) => {
    setPicked(k)
    if (k === "home_inspection") setPhase("home_header")
    else setPhase("generic_notes")
    void loadDraftForType(k)
  }

  return (
    <>
      <div role="presentation" onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 10052 }} />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          zIndex: 10053,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(720px, calc(100vw - 24px))",
          maxHeight: "min(92vh, 880px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 56px rgba(15,23,42,0.2)",
          padding: "20px 20px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em" }}>Specialty report (internal)</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 800, color: theme.text, lineHeight: 1.25 }}>
              {phase === "pick_type" ? "Choose report template" : headerLine}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              {customerLabel ? (
                <>
                  Linked estimate context: <strong style={{ color: "#334155" }}>{customerLabel}</strong>
                  {quoteId ? (
                    <>
                      {" "}
                      · <code style={{ fontSize: 11 }}>{quoteId.slice(0, 8)}…</code>
                    </>
                  ) : null}
                </>
              ) : quoteId ? (
                <>
                  Quote <code style={{ fontSize: 11 }}>{quoteId.slice(0, 8)}…</code>
                </>
              ) : (
                "Open an estimate row first."
              )}
            </p>
            {loadBusy ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>Loading saved draft…</p> : null}
            {saveError ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#b91c1c" }}>{saveError}</p> : null}
          </div>
          <button
            type="button"
            onClick={close}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: "#f8fafc",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!quoteId ? (
          <p style={{ fontSize: 13, color: "#b45309" }}>Select an estimate in the list to attach this report draft.</p>
        ) : phase === "pick_type" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
              Templates shown here match what you enabled under Advanced Options. More disciplines will plug into the same flow.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {enabledReportTypes.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => selectType(k)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `2px solid ${theme.primary}`,
                    background: "#fff7ed",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: "pointer",
                    color: "#0f172a",
                    textAlign: "left",
                    maxWidth: 320,
                  }}
                >
                  {SPECIALTY_REPORT_TYPE_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
        ) : picked === "home_inspection" ? (
          <>
            {phase === "home_header" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", maxWidth: "100%" }}>
                  <label style={lbl}>
                    Inspector name
                    <input
                      value={home.header.inspectorName}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, inspectorName: e.target.value } }))}
                      style={theme.formInput}
                    />
                  </label>
                  <label style={lbl}>
                    License / cert ID
                    <input
                      value={home.header.licenseId}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, licenseId: e.target.value } }))}
                      style={theme.formInput}
                    />
                  </label>
                  <label style={lbl}>
                    Inspection date
                    <input
                      type="date"
                      value={home.header.inspectionDate}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, inspectionDate: e.target.value } }))}
                      style={theme.formInput}
                    />
                  </label>
                  <label style={lbl}>
                    Weather / site conditions
                    <input
                      value={home.header.weather}
                      onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, weather: e.target.value } }))}
                      style={theme.formInput}
                    />
                  </label>
                </div>
                <label style={lbl}>
                  Property address
                  <input
                    value={home.header.propertyAddress}
                    onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, propertyAddress: e.target.value } }))}
                    style={theme.formInput}
                  />
                </label>
                <label style={lbl}>
                  Parties present
                  <input
                    value={home.header.partiesPresent}
                    onChange={(e) => setHome((h) => ({ ...h, header: { ...h.header, partiesPresent: e.target.value } }))}
                    style={theme.formInput}
                  />
                </label>
                <label style={lbl}>
                  Scope &amp; limitations (editable boilerplate)
                  <textarea
                    rows={5}
                    value={home.scopeLimitations}
                    onChange={(e) => setHome((h) => ({ ...h, scopeLimitations: e.target.value }))}
                    style={{ ...theme.formInput, resize: "vertical" }}
                  />
                </label>
              </div>
            ) : null}

            {phase === "home_findings" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
                  Rate each subsection and capture narrative. This mirrors a full structure &amp; property style report — export/PDF wiring comes next.
                </p>
                {HOME_INSPECTION_MAJOR_SECTIONS.map((sec) => (
                  <details
                    key={sec.id}
                    style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 12px", background: "#fafafa" }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 14, color: theme.text }}>{sec.title}</summary>
                    <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                      {sec.subsections.map((sub) => {
                        const row = home.subsections[sub.id] ?? { condition: "not_inspected" as ConditionRating, notes: "" }
                        return (
                          <div key={sub.id} style={{ paddingBottom: 12, borderBottom: `1px dashed #e2e8f0` }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{sub.label}</div>
                            {sub.hint ? <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{sub.hint}</div> : null}
                            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                              <select
                                value={row.condition}
                                onChange={(e) => {
                                  const condition = e.target.value as ConditionRating
                                  setHome((h) => ({
                                    ...h,
                                    subsections: {
                                      ...h.subsections,
                                      [sub.id]: { ...row, condition },
                                    },
                                  }))
                                }}
                                style={{ ...theme.formInput, minWidth: 200 }}
                              >
                                {(Object.keys(CONDITION_RATING_LABELS) as ConditionRating[]).map((c) => (
                                  <option key={c} value={c}>
                                    {CONDITION_RATING_LABELS[c]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <textarea
                              placeholder="Observations, locations, photos referenced…"
                              rows={2}
                              value={row.notes}
                              onChange={(e) => {
                                const notes = e.target.value
                                setHome((h) => ({
                                  ...h,
                                  subsections: {
                                    ...h.subsections,
                                    [sub.id]: { ...row, notes },
                                  },
                                }))
                              }}
                              style={{ ...theme.formInput, marginTop: 8, width: "100%", resize: "vertical" }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </details>
                ))}
              </div>
            ) : null}

            {phase === "home_media" ? (
              <div style={{ display: "grid", gap: 14 }}>
                <label style={lbl}>
                  Media workflow notes (link to quote uploads, shared drives, etc.)
                  <textarea
                    rows={3}
                    value={home.mediaWorkflowNotes}
                    onChange={(e) => setHome((h) => ({ ...h, mediaWorkflowNotes: e.target.value }))}
                    style={{ ...theme.formInput, resize: "vertical" }}
                  />
                </label>
                <label style={lbl}>
                  Drone / flight partner notes (flight IDs, pilot of record, partner URLs — API routing later)
                  <textarea
                    rows={3}
                    value={home.droneIntegrationNotes}
                    onChange={(e) => setHome((h) => ({ ...h, droneIntegrationNotes: e.target.value }))}
                    style={{ ...theme.formInput, resize: "vertical" }}
                  />
                </label>
                <div style={{ padding: 12, borderRadius: 10, background: "#f1f5f9", border: `1px solid #cbd5e1` }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: theme.text }}>Drone platform radar (framework)</div>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
                    No live connections yet — we will map whichever APIs your ops standardize on (OAuth, webhooks, or manual ingest). Checking a vendor here is
                    only a visual reminder for the integration backlog.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                    {DRONE_PROVIDER_CATALOG.map((p) => (
                      <label
                        key={p.id}
                        style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#334155", cursor: "not-allowed", opacity: 0.85 }}
                      >
                        <input type="checkbox" disabled style={{ marginTop: 2 }} />
                        <span>
                          <strong>{p.name}</strong> — {p.notes}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {phase === "home_review" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ padding: 12, borderRadius: 10, background: "#ecfdf5", border: "1px solid #6ee7b7", fontSize: 13, color: "#065f46" }}>
                  Draft autosaves to this quote&apos;s metadata (
                  <code style={{ fontSize: 11 }}>{META_KEY_HOME}</code>). Deficient items flagged: <strong>{deficientCount}</strong>
                </div>
                <label style={lbl}>
                  Executive summary / closing commentary
                  <textarea
                    rows={5}
                    value={home.summaryFindings}
                    onChange={(e) => setHome((h) => ({ ...h, summaryFindings: e.target.value }))}
                    style={{ ...theme.formInput, resize: "vertical" }}
                  />
                </label>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                  Next iterations: PDF packet, photo grids pulled from entity attachments, and guided deficiency tables for customer-safe exports.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
              Full structured templates for <strong>{picked ? SPECIALTY_REPORT_TYPE_LABELS[picked] : ""}</strong> are queued. Capture narrative notes now —
              they autosave on this quote.
            </p>
            <textarea
              rows={12}
              value={genericNotes}
              onChange={(e) => setGenericNotes(e.target.value)}
              placeholder="Findings, scope, recommendations, next steps…"
              style={{ ...theme.formInput, resize: "vertical" }}
            />
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {phase !== "pick_type" && enabledReportTypes.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setPhase("pick_type")
                  setPicked(null)
                }}
                style={secondaryBtn}
              >
                Change template
              </button>
            ) : null}
            {picked === "home_inspection" && phase !== "home_header" ? (
              <button type="button" onClick={() => setPhase("home_header")} style={secondaryBtn}>
                ← Header &amp; scope
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_findings" ? null : picked === "home_inspection" && phase === "home_media" ? (
              <button type="button" onClick={() => setPhase("home_findings")} style={secondaryBtn}>
                ← Findings
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_review" ? (
              <button type="button" onClick={() => setPhase("home_media")} style={secondaryBtn}>
                ← Media &amp; drone notes
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {picked === "home_inspection" && phase === "home_header" ? (
              <button type="button" onClick={() => setPhase("home_findings")} style={primaryBtn}>
                Continue to findings →
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_findings" ? (
              <button type="button" onClick={() => setPhase("home_media")} style={primaryBtn}>
                Media / integrations →
              </button>
            ) : null}
            {picked === "home_inspection" && phase === "home_media" ? (
              <button type="button" onClick={() => setPhase("home_review")} style={primaryBtn}>
                Review &amp; summary →
              </button>
            ) : null}
            {(picked && picked !== "home_inspection" && phase === "generic_notes") || (picked === "home_inspection" && phase === "home_review") ? (
              <button type="button" onClick={close} style={primaryBtn}>
                Done
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

const lbl: CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#0f172a" }

const secondaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  color: "#475569",
}

const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
}
