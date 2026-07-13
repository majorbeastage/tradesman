import { useCallback, useMemo, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { useSpeechRecognitionInput } from "../lib/useSpeechRecognitionInput"
import { parseSpokenLineItem } from "../lib/parseSpokenLineItem"
import {
  applyEstimatesJobSetupWizard,
  splitJobSetupListField,
  type JobSetupDraftDetail,
} from "../lib/estimatesJobSetupApply"

type Phase = "intro" | "job_list" | "job_detail" | "review" | "done"

type Props = {
  userId: string
  onApplied?: () => void
}

const BTN = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#f1f5f9",
  color: "#0f172a",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
} as const

function emptyDetail(): JobSetupDraftDetail {
  return { durationHours: "2", lineItemsText: "", materialsNotes: "" }
}

export default function EstimatesJobSetupWizardPanel({ userId, onApplied }: Props) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("intro")
  const [jobListText, setJobListText] = useState("")
  const [jobNames, setJobNames] = useState<string[]>([])
  const [detailIndex, setDetailIndex] = useState(0)
  const [detailsByName, setDetailsByName] = useState<Record<string, JobSetupDraftDetail>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [doneMessage, setDoneMessage] = useState("")

  const currentJobName = jobNames[detailIndex] ?? ""
  const currentDetail = detailsByName[currentJobName] ?? emptyDetail()

  const setCurrentDetail = useCallback(
    (patch: Partial<JobSetupDraftDetail>) => {
      if (!currentJobName) return
      setDetailsByName((prev) => ({
        ...prev,
        [currentJobName]: { ...(prev[currentJobName] ?? emptyDetail()), ...patch },
      }))
    },
    [currentJobName],
  )

  const { speechSupported, listening, toggleListening, stopListening } = useSpeechRecognitionInput((display) => {
    if (phase === "job_list") setJobListText(display)
    else if (phase === "job_detail") setCurrentDetail({ lineItemsText: display })
  })

  const linePreview = useMemo(() => {
    if (phase !== "job_detail" && phase !== "review") return []
    const text = phase === "review" ? "" : currentDetail.lineItemsText
    const phrases = phase === "review" ? [] : text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
    return phrases
      .map((p) => parseSpokenLineItem(p))
      .filter((x): x is NonNullable<typeof x> => x != null)
      .slice(0, 12)
  }, [phase, currentDetail.lineItemsText])

  function resetWizard() {
    setPhase("intro")
    setJobListText("")
    setJobNames([])
    setDetailIndex(0)
    setDetailsByName({})
    setError("")
    setDoneMessage("")
    stopListening()
  }

  function startWizard() {
    resetWizard()
    setOpen(true)
  }

  function beginJobDetails() {
    const names = splitJobSetupListField(jobListText)
    if (names.length === 0) {
      setError("List at least one job type (one per line or comma-separated).")
      return
    }
    setError("")
    const nextDetails: Record<string, JobSetupDraftDetail> = {}
    for (const n of names) nextDetails[n] = detailsByName[n] ?? emptyDetail()
    setJobNames(names)
    setDetailsByName(nextDetails)
    setDetailIndex(0)
    setPhase("job_detail")
  }

  function goNextJobDetail() {
    if (detailIndex < jobNames.length - 1) {
      setDetailIndex((i) => i + 1)
      return
    }
    setPhase("review")
  }

  async function saveAll() {
    if (!supabase) return
    setBusy(true)
    setError("")
    try {
      const msg = await applyEstimatesJobSetupWizard(supabase, userId, jobNames, detailsByName)
      setDoneMessage(msg)
      setPhase("done")
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={startWizard}
        style={{
          ...BTN,
          border: "1px solid #6366f1",
          background: "#eef2ff",
          color: "#4338ca",
        }}
      >
        Setup wizard — job types &amp; line items
      </button>
    )
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 16,
        borderRadius: 12,
        border: "1px solid #c7d2fe",
        background: "linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#312e81" }}>Job types &amp; line items setup</div>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.5, maxWidth: 640 }}>
            Describe the jobs you do and the line items each job needs. Type or use voice — we save job types and reusable lines for estimates and scheduling.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            resetWizard()
          }}
          style={{ ...BTN, fontSize: 12 }}
        >
          Close wizard
        </button>
      </div>

      {phase === "intro" ? (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
            This walks you through <strong>job types</strong> (for calendar &amp; estimates) and <strong>saved line items</strong> linked to each type.
            You can run it again anytime to add more.
          </p>
          <button type="button" onClick={() => setPhase("job_list")} style={{ ...BTN, alignSelf: "start", background: theme.primary, color: "#fff", border: "none" }}>
            Start setup
          </button>
        </div>
      ) : null}

      {phase === "job_list" ? (
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
            What kinds of jobs does your business do?
            <textarea
              rows={4}
              value={jobListText}
              onChange={(e) => setJobListText(e.target.value)}
              placeholder={"e.g.\nWater heater replacement\nDrain cleaning\nSeasonal lawn maintenance"}
              style={{ ...theme.formInput, resize: "vertical" }}
            />
          </label>
          {speechSupported ? (
            <button
              type="button"
              onClick={() => toggleListening(jobListText)}
              style={{ ...BTN, alignSelf: "start", borderColor: listening ? theme.primary : theme.border, background: listening ? "#eef2ff" : "#f1f5f9" }}
            >
              {listening ? "Stop voice input" : "Voice to type"}
            </button>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={beginJobDetails} style={{ ...BTN, background: theme.primary, color: "#fff", border: "none" }}>
              Next — line items per job
            </button>
            <button type="button" onClick={() => setPhase("intro")} style={BTN}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      {phase === "job_detail" && currentJobName ? (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#6366f1" }}>
            Job {detailIndex + 1} of {jobNames.length}: <span style={{ color: "#0f172a" }}>{currentJobName}</span>
          </p>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            Typical duration (hours)
            <input
              value={currentDetail.durationHours}
              onChange={(e) => setCurrentDetail({ durationHours: e.target.value })}
              style={{ ...theme.formInput, maxWidth: 120 }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            Line items for this job (one per line or comma-separated)
            <textarea
              rows={4}
              value={currentDetail.lineItemsText}
              onChange={(e) => setCurrentDetail({ lineItemsText: e.target.value })}
              placeholder={'e.g.\nLabor 4 hours at 95\nPermit fee 150 each\nMaterials flat 200'}
              style={{ ...theme.formInput, resize: "vertical" }}
            />
          </label>
          {speechSupported ? (
            <button
              type="button"
              onClick={() => toggleListening(currentDetail.lineItemsText)}
              style={{ ...BTN, alignSelf: "start", borderColor: listening ? theme.primary : theme.border }}
            >
              {listening ? "Stop voice input" : "Voice to type line items"}
            </button>
          ) : null}
          {linePreview.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#0369a1", lineHeight: 1.5 }}>
              {linePreview.map((p, i) => (
                <li key={i}>
                  {p.title} — {p.quantity} × ${p.unit_price.toFixed(2)} ({p.line_kind})
                </li>
              ))}
            </ul>
          ) : null}
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
            Default materials checklist (optional)
            <textarea
              rows={2}
              value={currentDetail.materialsNotes}
              onChange={(e) => setCurrentDetail({ materialsNotes: e.target.value })}
              placeholder="Parts usually needed for this job type…"
              style={{ ...theme.formInput, resize: "vertical" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={goNextJobDetail} style={{ ...BTN, background: theme.primary, color: "#fff", border: "none" }}>
              {detailIndex < jobNames.length - 1 ? "Next job type" : "Review all"}
            </button>
            {detailIndex > 0 ? (
              <button type="button" onClick={() => setDetailIndex((i) => i - 1)} style={BTN}>
                Previous
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === "review" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Review before saving</p>
          {jobNames.map((name) => {
            const d = detailsByName[name] ?? emptyDetail()
            const phrases = d.lineItemsText.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
            const parsed = phrases.map((p) => parseSpokenLineItem(p)).filter(Boolean)
            return (
              <div key={name} style={{ padding: 12, borderRadius: 10, border: `1px solid ${theme.border}`, background: "#fff" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 6 }}>{name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Duration: {d.durationHours || "2"} hours</div>
                {parsed.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#334155" }}>
                    {parsed.map((p, i) => (
                      <li key={i}>
                        {p!.title} — {p!.quantity} × ${p!.unit_price.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>No line items — you can add them later.</p>
                )}
              </div>
            )
          })}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={busy} onClick={() => void saveAll()} style={{ ...BTN, background: theme.primary, color: "#fff", border: "none" }}>
              {busy ? "Saving…" : "Save job types & line items"}
            </button>
            <button type="button" onClick={() => setPhase("job_detail")} style={BTN}>
              Edit details
            </button>
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#166534", fontWeight: 600, lineHeight: 1.5 }}>{doneMessage}</p>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              resetWizard()
            }}
            style={{ ...BTN, alignSelf: "start", background: theme.primary, color: "#fff", border: "none" }}
          >
            Done
          </button>
        </div>
      ) : null}

      {error ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}
    </div>
  )
}
