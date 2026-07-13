import { useCallback, useEffect, useMemo, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { useSpeechRecognitionInput } from "../lib/useSpeechRecognitionInput"
import {
  extractJobTypeNamesFromServicesText,
  parsePricingPhrasesToLineItems,
  type ParsedSpokenLineItem,
} from "../lib/parseSpokenLineItem"
import {
  applySingleJobTypeSetup,
  emptyJobSetupDetail,
  type JobSetupDraftDetail,
  type JobSetupLineDraft,
} from "../lib/estimatesJobSetupApply"
import { loadEstimateLinePresetsForUser, loadJobTypesForUser } from "../lib/jobTypesApi"
import { JOB_TYPE_CALENDAR_COLORS, JOB_TYPE_ICON_OPTIONS, type JobTypeIconId } from "../lib/jobTypeIcons"
import type { EstimateLinePresetRow } from "../lib/estimateLinePresets"
import { eliUnitSuffix } from "../lib/estimateLinePresets"

type Phase =
  | "intro"
  | "services"
  | "offer_next"
  | "pricing"
  | "reuse"
  | "review"
  | "complete"

type TeamOpt = { id: string; label: string }

type Props = {
  open: boolean
  userId: string
  onClose: () => void
  onApplied?: () => void
}

const primaryBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
} as const

const secondaryBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: "#334155",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
} as const

function parsedToDraft(p: ParsedSpokenLineItem): JobSetupLineDraft {
  return {
    id: crypto.randomUUID(),
    description: p.description || p.title,
    quantity: p.quantity,
    unit_price: p.unit_price,
    unit_basis: p.unit_basis,
    line_kind: p.line_kind === "materials" ? "material" : p.line_kind,
    minimum_line_total: p.minimum_line_total,
  }
}

function summarizeLines(lines: JobSetupLineDraft[], jobName: string): string {
  if (!lines.length) return `We’ll create a job type for ${jobName}. Add or edit line items below before saving.`
  const bits = lines.map((l) => {
    const min = l.minimum_line_total != null && l.minimum_line_total > 0 ? ` (min $${l.minimum_line_total.toFixed(2)})` : ""
    return `${l.description} at $${l.unit_price.toFixed(2)}/${eliUnitSuffix(l.unit_basis)} × ${l.quantity}${min}`
  })
  return `It looks like ${jobName} includes: ${bits.join("; ")}. Review and edit anything before you save.`
}

export default function JobTypesSetupWizardModal({ open, userId, onClose, onApplied }: Props) {
  const [phase, setPhase] = useState<Phase>("intro")
  const [hasExisting, setHasExisting] = useState(false)
  const [servicesText, setServicesText] = useState("")
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [details, setDetails] = useState<Record<string, JobSetupDraftDetail>>({})
  const [pricingText, setPricingText] = useState("")
  const [reuseIds, setReuseIds] = useState<string[]>([])
  const [existingPresets, setExistingPresets] = useState<EstimateLinePresetRow[]>([])
  const [team, setTeam] = useState<TeamOpt[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [statusNote, setStatusNote] = useState("")
  const [assignEnabled, setAssignEnabled] = useState(false)

  const currentName = queue[index] ?? ""
  const current = details[currentName] ?? emptyJobSetupDetail(JOB_TYPE_CALENDAR_COLORS[0]!.hex)

  const setCurrent = useCallback(
    (patch: Partial<JobSetupDraftDetail>) => {
      if (!currentName) return
      setDetails((prev) => ({
        ...prev,
        [currentName]: { ...(prev[currentName] ?? emptyJobSetupDetail(JOB_TYPE_CALENDAR_COLORS[0]!.hex)), ...patch },
      }))
    },
    [currentName],
  )

  const { speechSupported, listening, toggleListening, stopListening } = useSpeechRecognitionInput((display) => {
    if (phase === "services") setServicesText(display)
    else if (phase === "pricing") setPricingText(display)
  })

  useEffect(() => {
    if (!open || !supabase || !userId) return
    let cancelled = false
    void (async () => {
      const [jt, presets] = await Promise.all([
        loadJobTypesForUser(supabase, userId),
        loadEstimateLinePresetsForUser(supabase, userId),
      ])
      if (cancelled) return
      setHasExisting(jt.rows.length > 0 || presets.length > 0)
      setExistingPresets(presets)

      const { data: peers } = await supabase
        .from("profiles")
        .select("id, display_name, email, role")
        .limit(40)
      if (cancelled) return
      const opts: TeamOpt[] = (peers ?? []).map((p: { id: string; display_name?: string | null; email?: string | null }) => ({
        id: p.id,
        label: (p.display_name || p.email || p.id).trim(),
      }))
      setTeam(opts.filter((o) => o.id !== userId).slice(0, 30))
    })()
    return () => {
      cancelled = true
    }
  }, [open, userId])

  useEffect(() => {
    if (!open) {
      setPhase("intro")
      setServicesText("")
      setQueue([])
      setIndex(0)
      setDetails({})
      setPricingText("")
      setReuseIds([])
      setError("")
      setStatusNote("")
      setAssignEnabled(false)
      stopListening()
    }
  }, [open, stopListening])

  const reusableSuggestions = useMemo(() => {
    if (!existingPresets.length || !currentName) return []
    const nameLower = currentName.toLowerCase()
    return existingPresets
      .filter((p) => {
        const d = p.description.toLowerCase()
        return (
          p.line_kind === "labor" ||
          p.line_kind === "travel" ||
          d.includes("labor") ||
          d.includes("mile") ||
          d.includes("travel") ||
          d.includes(nameLower.split(/\s+/)[0] ?? "")
        )
      })
      .slice(0, 8)
  }, [existingPresets, currentName])

  function beginFromServices() {
    const names = extractJobTypeNamesFromServicesText(servicesText)
    if (!names.length) {
      setError("Describe the products and services you offer so we can find job types.")
      return
    }
    setError("")
    const nextDetails: Record<string, JobSetupDraftDetail> = {}
    names.forEach((n, i) => {
      nextDetails[n] = emptyJobSetupDetail(JOB_TYPE_CALENDAR_COLORS[i % JOB_TYPE_CALENDAR_COLORS.length]!.hex)
    })
    setQueue(names)
    setDetails(nextDetails)
    setIndex(0)
    setPhase("offer_next")
  }

  function startPricingForCurrent() {
    setPricingText("")
    setReuseIds([])
    setAssignEnabled(false)
    setPhase(reusableSuggestions.length > 0 ? "reuse" : "pricing")
  }

  function applyReuseAndContinue() {
    if (reuseIds.length) {
      const picked = existingPresets.filter((p) => reuseIds.includes(p.id))
      const lines: JobSetupLineDraft[] = picked.map((p) => ({
        id: crypto.randomUUID(),
        description: p.description,
        quantity: p.quantity,
        unit_price: p.unit_price,
        unit_basis: (p.unit_basis as JobSetupLineDraft["unit_basis"]) || "hours",
        line_kind: p.line_kind || "labor",
        minimum_line_total: p.minimum_line_total,
      }))
      setCurrent({ lines: [...(current.lines ?? []), ...lines] })
    }
    setPhase("pricing")
  }

  function buildLinesFromPricing() {
    const parsed = parsePricingPhrasesToLineItems(pricingText)
    const lines = parsed.map(parsedToDraft)
    const merged = [...(current.lines ?? [])]
    for (const line of lines) {
      if (!merged.some((m) => m.description.toLowerCase() === line.description.toLowerCase())) {
        merged.push(line)
      }
    }
    const hours = merged.find((l) => l.unit_basis === "hours")?.quantity
    setCurrent({
      lines: merged,
      lineItemsText: pricingText,
      durationHours: hours != null ? String(hours) : current.durationHours,
    })
    setPhase("review")
  }

  async function saveCurrentJobType() {
    if (!supabase || !currentName) return
    setBusy(true)
    setError("")
    try {
      const { message } = await applySingleJobTypeSetup(supabase, userId, currentName, {
        ...current,
        assignUserId: assignEnabled ? current.assignUserId : null,
      })
      setStatusNote(message)
      onApplied?.()
      // refresh presets for reuse on next job
      const presets = await loadEstimateLinePresetsForUser(supabase, userId)
      setExistingPresets(presets)
      setHasExisting(true)
      if (index + 1 < queue.length) {
        setIndex(index + 1)
        setPhase("offer_next")
      } else {
        setPhase("complete")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function updateLine(id: string, patch: Partial<JobSetupLineDraft>) {
    setCurrent({
      lines: current.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })
  }

  function addBlankLine() {
    setCurrent({
      lines: [
        ...current.lines,
        {
          id: crypto.randomUUID(),
          description: "New line item",
          quantity: 1,
          unit_price: 0,
          unit_basis: "each",
          line_kind: "misc",
        },
      ],
    })
  }

  if (!open) return null

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 10050, background: "rgba(15,23,42,0.45)" }}
      />
      <div
        role="dialog"
        aria-modal
        aria-label="Job types and line items setup"
        style={{
          position: "fixed",
          zIndex: 10051,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 24px))",
          maxHeight: "min(88vh, 760px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 16,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 80px rgba(15,23,42,0.28)",
          padding: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Job types & line items
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, color: theme.text }}>
              {phase === "intro"
                ? hasExisting
                  ? "Add more job types"
                  : "Build your job types"
                : phase === "services"
                  ? "Products & services"
                  : phase === "offer_next"
                    ? `Next: ${currentName}`
                    : phase === "reuse"
                      ? "Reuse line items?"
                      : phase === "pricing"
                        ? `Pricing — ${currentName}`
                        : phase === "review"
                          ? "Review & save"
                          : "All set"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...secondaryBtn, padding: "6px 10px" }}>
            ✕
          </button>
        </div>

        {error ? <p style={{ margin: "0 0 10px", color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
        {statusNote ? <p style={{ margin: "0 0 10px", color: "#166534", fontSize: 13 }}>{statusNote}</p> : null}

        {phase === "intro" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.55 }}>
              {hasExisting
                ? "We already see job types or saved line items on your account. We’ll reuse what we can and walk you through adding more — one job type at a time."
                : "We’ll turn the products and services you offer into job types and priced line items, the same way the estimate wizard builds quote lines. You can edit prices anytime."}
            </p>
            <button type="button" style={primaryBtn} onClick={() => setPhase("services")}>
              {hasExisting ? "Let’s add more job types" : "Let’s get started"}
            </button>
          </div>
        ) : null}

        {phase === "services" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
              Please describe the products and services you offer. We’ll look for job types (for example: lawn care, tree
              service, irrigation, mulching).
            </p>
            <textarea
              value={servicesText}
              onChange={(e) => setServicesText(e.target.value)}
              rows={5}
              placeholder="I do landscaping — cut lawns, tree service, irrigation, bush pruning, gutter cleaning, and mulching…"
              style={{ ...theme.formInput, resize: "vertical", color: "#0f172a", fontWeight: 600 }}
            />
            {speechSupported ? (
              <button type="button" style={secondaryBtn} onClick={() => toggleListening()}>
                {listening ? "Stop voice" : "Voice to text"}
              </button>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" style={secondaryBtn} onClick={() => setPhase("intro")}>
                Back
              </button>
              <button type="button" style={primaryBtn} onClick={beginFromServices}>
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {phase === "offer_next" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 15, color: "#0f172a", lineHeight: 1.5, fontWeight: 600 }}>
              {index === 0
                ? `Let’s start with “${currentName}”. Create a job type for this?`
                : `Let’s move on to create a job type for “${currentName}”.`}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              {index + 1} of {queue.length} from your services list
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={primaryBtn} onClick={startPricingForCurrent}>
                Yes
              </button>
              <button
                type="button"
                style={secondaryBtn}
                onClick={() => {
                  if (index + 1 < queue.length) {
                    setIndex(index + 1)
                  } else setPhase("complete")
                }}
              >
                Skip for now
              </button>
              <button type="button" style={secondaryBtn} onClick={() => setPhase("complete")}>
                No thank you
              </button>
            </div>
          </div>
        ) : null}

        {phase === "reuse" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
              We already have labor and mileage costs from previous job types. Would you like to apply any of these line
              items to “{currentName}”?
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {reusableSuggestions.map((p) => (
                <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#0f172a" }}>
                  <input
                    type="checkbox"
                    checked={reuseIds.includes(p.id)}
                    onChange={(e) =>
                      setReuseIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))
                    }
                  />
                  <span>
                    <strong>{p.description}</strong> — {p.quantity} {eliUnitSuffix(p.unit_basis)} @ $
                    {Number(p.unit_price).toFixed(2)}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" style={secondaryBtn} onClick={() => setPhase("pricing")}>
                Skip reuse
              </button>
              <button type="button" style={primaryBtn} onClick={applyReuseAndContinue}>
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {phase === "pricing" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
              {current.lines.length
                ? `Can you explain any other additional charges for “${currentName}”?`
                : `Let’s start with “${currentName}” — how do you price labor, travel, gas, equipment, additional charges, or minimums?`}
            </p>
            <textarea
              value={pricingText}
              onChange={(e) => setPricingText(e.target.value)}
              rows={5}
              placeholder="Example: half acre lawn is a $60 minimum — 10 miles at 50 cents/mile, 1 hour labor at $40, equipment and fuel $15"
              style={{ ...theme.formInput, resize: "vertical", color: "#0f172a", fontWeight: 600 }}
            />
            {speechSupported ? (
              <button type="button" style={secondaryBtn} onClick={() => toggleListening()}>
                {listening ? "Stop voice" : "Voice to text"}
              </button>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" style={secondaryBtn} onClick={() => setPhase("offer_next")}>
                Back
              </button>
              <button type="button" style={primaryBtn} onClick={buildLinesFromPricing}>
                Review line items
              </button>
            </div>
          </div>
        ) : null}

        {phase === "review" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{summarizeLines(current.lines, currentName)}</p>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
              Job type title
              <input
                value={current.titleOverride ?? currentName}
                onChange={(e) => setCurrent({ titleOverride: e.target.value })}
                style={{ ...theme.formInput, color: "#0f172a", fontWeight: 700 }}
              />
            </label>

            <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>Line items</div>
            <div style={{ display: "grid", gap: 8 }}>
              {current.lines.map((line) => (
                <div
                  key={line.id}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: "#f8fafc",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    style={{ ...theme.formInput, color: "#0f172a", fontWeight: 700 }}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                    <input
                      value={String(line.quantity)}
                      onChange={(e) => updateLine(line.id, { quantity: Number.parseFloat(e.target.value) || 0 })}
                      style={{ ...theme.formInput, color: "#0f172a", fontWeight: 700 }}
                      placeholder="Qty"
                    />
                    <input
                      value={String(line.unit_price)}
                      onChange={(e) => updateLine(line.id, { unit_price: Number.parseFloat(e.target.value) || 0 })}
                      style={{ ...theme.formInput, color: "#0f172a", fontWeight: 700 }}
                      placeholder="$/unit"
                    />
                    <select
                      value={line.unit_basis}
                      onChange={(e) => updateLine(line.id, { unit_basis: e.target.value as JobSetupLineDraft["unit_basis"] })}
                      style={{ ...theme.formInput, color: "#0f172a", fontWeight: 700 }}
                    >
                      <option value="hours">Hours</option>
                      <option value="miles">Miles</option>
                      <option value="each">Each</option>
                    </select>
                    <input
                      value={line.minimum_line_total && line.minimum_line_total > 0 ? String(line.minimum_line_total) : ""}
                      onChange={(e) => {
                        const p = Number.parseFloat(e.target.value.replace(/[^0-9.]/g, ""))
                        updateLine(line.id, { minimum_line_total: Number.isFinite(p) && p > 0 ? p : undefined })
                      }}
                      style={{ ...theme.formInput, color: "#0f172a", fontWeight: 700 }}
                      placeholder="Min $"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrent({ lines: current.lines.filter((l) => l.id !== line.id) })}
                    style={{ justifySelf: "start", fontSize: 12, color: "#b91c1c", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Remove line
                  </button>
                </div>
              ))}
            </div>
            <button type="button" style={secondaryBtn} onClick={addBlankLine}>
              + Add line item
            </button>

            <fieldset style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, margin: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 800, padding: "0 6px" }}>Calendar appearance</legend>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {JOB_TYPE_CALENDAR_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={c.label}
                      onClick={() => setCurrent({ colorHex: c.hex })}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: current.colorHex === c.hex ? "2px solid #0f172a" : "1px solid #cbd5e1",
                        background: c.hex,
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
                <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
                  Icon
                  <select
                    value={current.iconId}
                    onChange={(e) => setCurrent({ iconId: e.target.value as JobTypeIconId })}
                    style={{ ...theme.formInput, color: "#0f172a", fontWeight: 700 }}
                  >
                    {JOB_TYPE_ICON_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.glyph ? `${opt.glyph} ` : ""}
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={assignEnabled} onChange={(e) => setAssignEnabled(e.target.checked)} />
                  Assign this job type to a specific user
                </label>
                {assignEnabled ? (
                  <select
                    value={current.assignUserId ?? ""}
                    onChange={(e) => setCurrent({ assignUserId: e.target.value || null })}
                    style={{ ...theme.formInput, color: "#0f172a", fontWeight: 700 }}
                  >
                    <option value="">Select user…</option>
                    {team.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </fieldset>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" style={secondaryBtn} onClick={() => setPhase("pricing")}>
                Back
              </button>
              <button type="button" style={primaryBtn} disabled={busy} onClick={() => void saveCurrentJobType()}>
                {busy ? "Saving…" : "Save Job Type"}
              </button>
            </div>
          </div>
        ) : null}

        {phase === "complete" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
              Job types and line items are saved and available in Estimates Library and on new estimates. You can run this
              wizard again anytime to add more.
            </p>
            <button type="button" style={primaryBtn} onClick={onClose}>
              Done
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}
