import { useCallback, useEffect, useState } from "react"
import SetupWizardLaunchButton from "./SetupWizardLaunchButton"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import {
  formatDurationFieldFromMinutes,
  parseDurationFieldToMinutes,
  parseJobTypeDurationMinutes,
} from "../lib/numericFormInput"
import {
  deleteJobTypeForUser,
  loadEstimateLinePresetsForUser,
  loadJobTypesForUser,
  mergePresetLinksForJobType,
  saveJobTypeForUser,
  sortJobTypesByName,
  stripJobTypeFromPresets,
  type JobTypeRow,
} from "../lib/jobTypesApi"
import { formatEstimatePresetCostSummary, type EstimateLinePresetRow } from "../lib/estimateLinePresets"

export type JobTypesManagerModalProps = {
  open: boolean
  onClose: () => void
  userId: string | null
  title?: string
  estimateLineItemsLabel?: string
  showSetupWizard?: boolean
  /** Inline embed (Estimates Library) vs centered modal popup. */
  variant?: "modal" | "inline"
  /** Prefill create form fields on open. (Create section stays collapsed by default for consistency.) */
  expandCreateOnOpen?: boolean
  initialName?: string
  initialPresetChecks?: Record<string, boolean>
  onChanged?: () => void
  onCreated?: (jobTypeId: string) => void
  /** When set, “Create new job type” opens the guided wizard instead of the manual form. */
  onRequestCreateWizard?: () => void
  onUseForEstimate?: (jobType: JobTypeRow) => void
  onUseForCalendar?: (jobType: JobTypeRow) => void
}

export default function JobTypesManagerModal({
  open,
  onClose,
  userId,
  title = "Job types",
  estimateLineItemsLabel = "Saved line templates",
  showSetupWizard = true,
  variant = "modal",
  expandCreateOnOpen = false,
  initialName = "",
  initialPresetChecks,
  onChanged,
  onCreated,
  onRequestCreateWizard,
  onUseForEstimate,
  onUseForCalendar,
}: JobTypesManagerModalProps) {
  const [jobTypes, setJobTypes] = useState<JobTypeRow[]>([])
  const [loadError, setLoadError] = useState("")

  const [estimateLinePresets, setEstimateLinePresets] = useState<EstimateLinePresetRow[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [durationStr, setDurationStr] = useState("60")
  const [durationUnit, setDurationUnit] = useState<15 | 60>(60)
  const [color, setColor] = useState("#F97316")
  const [materials, setMaterials] = useState("")
  const [trackMileage, setTrackMileage] = useState(false)
  const [presetChecks, setPresetChecks] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [useMenuId, setUseMenuId] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setName("")
    setDescription("")
    setDurationStr("60")
    setDurationUnit(60)
    setColor("#F97316")
    setMaterials("")
    setTrackMileage(false)
    setPresetChecks({})
    setEditingId(null)
    setEditorOpen(false)
  }, [])

  const reload = useCallback(async () => {
    if (!open || !supabase || !userId) return
    const [{ rows, error }, presets] = await Promise.all([
      loadJobTypesForUser(supabase, userId),
      loadEstimateLinePresetsForUser(supabase, userId),
    ])
    setJobTypes(sortJobTypesByName(rows))
    setLoadError(error ?? "")
    setEstimateLinePresets(presets)
  }, [open, userId])

  useEffect(() => {
    if (!open) {
      resetForm()
      return
    }
    // Always keep the create/editor section collapsed by default;
    // this avoids extra “close twice” confusion.
    setEditorOpen(false)
    setEditingId(null)
    if (initialName.trim()) setName(initialName.trim())
    else setName("")

    if (expandCreateOnOpen && initialPresetChecks && Object.keys(initialPresetChecks).length > 0) {
      setPresetChecks(initialPresetChecks)
    } else {
      setPresetChecks({})
    }

    setDescription("")
    setDurationStr("60")
    setDurationUnit(60)
    setColor("#F97316")
    setMaterials("")
    setTrackMileage(false)

    setLoadError("")
    void reload()
  }, [open, resetForm, initialName, initialPresetChecks, expandCreateOnOpen, reload])

  useEffect(() => {
    if (!editingId) return
    const next: Record<string, boolean> = {}
    for (const p of estimateLinePresets) {
      next[p.id] = (p.linked_job_type_ids ?? []).includes(editingId)
    }
    setPresetChecks(next)
  }, [editingId, estimateLinePresets])

  function startEdit(jt: JobTypeRow) {
    setName(jt.name)
    setDescription(jt.description ?? "")

    const safeMinutes = Math.max(15, jt.duration_minutes)
    const useHours = safeMinutes % 60 === 0
    setDurationUnit(useHours ? 60 : 15)
    setDurationStr(useHours ? String(safeMinutes / 60) : String(safeMinutes))

    setColor(jt.color_hex ?? "#F97316")
    setMaterials(typeof jt.materials_list === "string" ? jt.materials_list : "")
    setTrackMileage(jt.track_mileage === true)

    setEditingId(jt.id)
    setEditorOpen(true)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditorOpen(false)
    setPresetChecks({})
    setName("")
    setDescription("")
    setDurationStr("60")
    setDurationUnit(60)
    setColor("#F97316")
    setMaterials("")
    setTrackMileage(false)
  }

  async function handleSave() {
    if (!name.trim()) {
      alert("Please enter a name for the job type.")
      return
    }
    const parsed =
      durationUnit === 60 ? parseDurationFieldToMinutes(durationStr, 60) : parseJobTypeDurationMinutes(durationStr)
    if (parsed == null) {
      alert(`Enter duration in ${durationUnit === 60 ? "hours" : "minutes"} (at least 15 minutes total).`)
      return
    }
    if (!supabase || !userId) {
      alert("You must be signed in to add or update job types.")
      return
    }

    setSaving(true)
    const { id, error } = await saveJobTypeForUser(
      supabase,
      userId,
      {
        name: name.trim(),
        description: description.trim() || null,
        duration_minutes: parsed,
        color_hex: color,
        materials_list: materials.trim() || null,
        track_mileage: trackMileage,
      },
      editingId,
    )
    if (error) {
      setSaving(false)
      const hint =
        error.includes("policy") ||
        error.includes("RLS") ||
        error.includes("row-level") ||
        error.includes("permission") ||
        error.includes("does not exist")
          ? "\n\nFix: In Supabase Dashboard → SQL Editor, run the full script in tradesman/supabase-job-types-setup.sql, then try again."
          : ""
      alert("Could not save job type: " + error + hint)
      return
    }

    if (id) {
      const linkResult = await mergePresetLinksForJobType(supabase, userId, estimateLinePresets, id, presetChecks)
      if (linkResult.error) {
        setSaving(false)
        alert(linkResult.error)
        return
      }
      setEstimateLinePresets(linkResult.rows)
    }

    setSaving(false)
    const createdId = !editingId && id ? id : null
    cancelEdit()
    await reload()
    onChanged?.()
    if (createdId && onCreated) onCreated(createdId)
  }

  async function handleRemove(jt: JobTypeRow) {
    if (!supabase || !userId) return
    if (
      !confirm(`Remove job type "${jt.name}"? Events using this type will keep their color but the type will no longer appear in the list.`)
    ) {
      return
    }

    const { error } = await deleteJobTypeForUser(supabase, userId, jt.id)
    if (error) {
      alert(error)
      return
    }

    const stripped = await stripJobTypeFromPresets(supabase, userId, estimateLinePresets, jt.id)
    if (stripped.error) alert(stripped.error)
    else setEstimateLinePresets(stripped.rows)

    if (editingId === jt.id) cancelEdit()
    await reload()
    onChanged?.()
  }

  if (!open) return null

  const sorted = sortJobTypesByName(jobTypes)
  const CloseButton = () =>
    variant === "inline" ? null : (
    <button
      type="button"
      aria-label="Close"
      onClick={() => {
        cancelEdit()
        onClose()
      }}
      style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: theme.text }}
    >
      ✕
    </button>
    )

  const panelBody = (
    <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: variant === "inline" ? 12 : 16 }}>
          <h3 id="job-types-modal-title" style={{ margin: 0, color: theme.text, fontSize: variant === "inline" ? 16 : 18 }}>
            {title}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showSetupWizard && variant === "modal" ? <SetupWizardLaunchButton wizardId="estimates_job_types" compact /> : null}
            <CloseButton />
          </div>
        </div>

        {loadError ? (
          <p
            style={{
              margin: "0 0 12px",
              padding: 10,
              background: "#fef2f2",
              color: "#b91c1c",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            Could not load job types: {loadError}
          </p>
        ) : null}

        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: "#f8fafc",
          }}
        >
          {!onRequestCreateWizard && !editingId ? (
            <button
              type="button"
              onClick={() => setEditorOpen((prev) => !prev)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: theme.text,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {editorOpen ? "Hide create new job type" : "Create new job type"}
            </button>
          ) : null}

          {onRequestCreateWizard && !editingId ? (
            <button
              type="button"
              onClick={() => onRequestCreateWizard()}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                color: theme.text,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Create new job type
            </button>
          ) : null}

          {editingId || (!onRequestCreateWizard && editorOpen) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: theme.text }}>
                {editingId ? "Edit job type" : "New job type"}
              </p>

              <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={theme.formInput} />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, color: theme.text }}>
                  Duration
                  <select
                    value={durationUnit}
                    onChange={(e) => {
                      const nextUnit = e.target.value === "60" ? 60 : 15
                      const parsed =
                        durationUnit === 60 ? parseDurationFieldToMinutes(durationStr, 60) : parseJobTypeDurationMinutes(durationStr)
                      setDurationUnit(nextUnit)
                      if (parsed != null) setDurationStr(formatDurationFieldFromMinutes(parsed, nextUnit))
                    }}
                    style={{ ...theme.formInput, display: "block", marginTop: 4, marginBottom: 4, width: 110 }}
                  >
                    <option value={60}>Hours</option>
                    <option value={15}>Minutes</option>
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={durationStr}
                    onChange={(e) => setDurationStr(e.target.value)}
                    onBlur={() => {
                      const parsed =
                        durationUnit === 60 ? parseDurationFieldToMinutes(durationStr, 60) : parseJobTypeDurationMinutes(durationStr)
                      if (parsed != null) setDurationStr(formatDurationFieldFromMinutes(parsed, durationUnit))
                    }}
                    style={{ ...theme.formInput, display: "block", marginTop: 4, width: 100 }}
                  />
                </label>

                <label style={{ fontSize: 12, color: theme.text }}>
                  Color
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ display: "block", marginTop: 4, width: 48, height: 32, padding: 0, border: "none" }}
                  />
                </label>
              </div>

              <input
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={theme.formInput}
              />

              <label style={{ display: "grid", gap: 6, fontSize: 12, color: theme.text }}>
                Materials checklist (optional, one line per item — shown on scheduled calendar events)
                <textarea
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  rows={4}
                  placeholder={"e.g. Shingles — 10 bundles\nUnderlayment roll\nDrip edge 40 ft"}
                  style={{ ...theme.formInput, resize: "vertical", fontFamily: "inherit" }}
                />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input type="checkbox" checked={trackMileage} onChange={(e) => setTrackMileage(e.target.checked)} />
                Track mileage on calendar events (mileage field when this job type is selected)
              </label>

              <details
                style={{
                  marginTop: 4,
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  padding: "8px 10px",
                }}
              >
                <summary
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#111827",
                    cursor: "pointer",
                    listStyle: "none",
                  }}
                >
                  Saved line templates
                  {estimateLinePresets.length > 0 ? (
                    <span style={{ fontWeight: 600, color: "#374151", marginLeft: 6 }}>({estimateLinePresets.length})</span>
                  ) : null}
                </summary>
                <p style={{ margin: "10px 0 10px", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                  Check lines to link them to this job type. Manage the full list under <strong style={{ color: "#111827" }}>{estimateLineItemsLabel}</strong>.
                </p>
                {estimateLinePresets.length === 0 ? (
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "#4b5563" }}>No saved line templates yet.</p>
                ) : (
                  <div
                    style={{
                      maxHeight: 220,
                      overflow: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: 8,
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#f9fafb",
                    }}
                  >
                    {estimateLinePresets.map((p) => {
                      const costLine = formatEstimatePresetCostSummary(p)
                      return (
                        <label
                          key={p.id}
                          style={{ fontSize: 13, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            style={{ marginTop: 4, flexShrink: 0 }}
                            checked={presetChecks[p.id] === true}
                            onChange={(e) => setPresetChecks((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                          />
                          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                            <span style={{ color: "#111827", fontWeight: 600, lineHeight: 1.35 }}>{p.description.trim() || "Line"}</span>
                            {costLine ? (
                              <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 500 }}>{costLine}</span>
                            ) : null}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </details>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  style={{
                    alignSelf: "flex-start",
                    padding: "8px 14px",
                    borderRadius: 6,
                    border: "none",
                    background: theme.primary,
                    color: "#fff",
                    fontWeight: 600,
                    cursor: saving ? "wait" : "pointer",
                  }}
                >
                  {saving ? "Saving…" : editingId ? "Update job type" : "Add job type"}
                </button>

                {editingId ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => cancelEdit()}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                      background: "#fff",
                      color: theme.text,
                      cursor: "pointer",
                    }}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {sorted.length === 0 && !loadError ? (
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No job types yet. Add one above.</p>
        ) : sorted.length > 0 ? (
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: theme.text }}>Your job types</h4>
            {sorted.map((jt) => (
              <div
                key={jt.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                  padding: 10,
                  background: "#f9fafb",
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: jt.color_hex ?? theme.primary,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: theme.text, fontSize: 14 }}>{jt.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {jt.duration_minutes} min
                    {typeof jt.description === "string" && jt.description.trim() ? ` · ${jt.description.trim()}` : ""}
                  </div>
                </div>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setUseMenuId((id) => (id === jt.id ? null : jt.id))}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 6,
                      background: "#0f172a",
                      cursor: "pointer",
                      color: "#fff",
                      fontWeight: 800,
                    }}
                  >
                    Use this Job Type ▾
                  </button>
                  {useMenuId === jt.id ? (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "100%",
                        marginTop: 4,
                        zIndex: 20,
                        minWidth: 190,
                        background: "#fff",
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setUseMenuId(null)
                          onUseForEstimate?.(jt)
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          border: "none",
                          background: "#fff",
                          color: "#0f172a",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Create an Estimate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUseMenuId(null)
                          onUseForCalendar?.(jt)
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          border: "none",
                          borderTop: `1px solid ${theme.border}`,
                          background: "#fff",
                          color: "#0f172a",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Create a Calendar Event
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(jt)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    background: "white",
                    cursor: "pointer",
                    color: theme.text,
                    fontWeight: 700,
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemove(jt)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    border: "1px solid #fca5a5",
                    borderRadius: 6,
                    background: "white",
                    cursor: "pointer",
                    color: "#b91c1c",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
    </>
  )

  if (variant === "inline") {
    return <div style={{ display: "grid", gap: 12 }}>{panelBody}</div>
  }

  return (
    <>
      <div
        onClick={() => {
          cancelEdit()
          onClose()
        }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10000 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-types-modal-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "92%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflow: "auto",
          background: "white",
          borderRadius: 8,
          padding: 24,
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          zIndex: 10001,
        }}
      >
        {panelBody}
      </div>
    </>
  )
}

