import { useCallback, useEffect, useMemo, useState } from "react"
import { theme } from "../styles/theme"
import { supabase } from "../lib/supabase"
import { useSpeechRecognitionInput } from "../lib/useSpeechRecognitionInput"
import { applySetupMiniWizard, type WizardAnswers } from "../lib/setupWizardApply"
import { getSetupMiniWizardFlow, type SetupWizardQuestion } from "../lib/setupMiniWizardSteps"
import type { SetupMiniWizardId } from "../lib/setupGuideWizards"
import { parseSpokenLineItem } from "../lib/parseSpokenLineItem"
import { speakNaturalPrompt, stopNaturalPrompt } from "../lib/speechSynthesisPrompt"

const BTN_SECONDARY = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #94a3b8",
  background: "#f1f5f9",
  color: "#0f172a",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
} as const

type Props = {
  wizardId: SetupMiniWizardId
  userId: string
  onClose: () => void
  onApplied?: (message: string) => void
}

export default function SetupMiniWizardModal({ wizardId, userId, onClose, onApplied }: Props) {
  const flow = useMemo(() => getSetupMiniWizardFlow(wizardId), [wizardId])
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<WizardAnswers>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)

  const q = flow.questions[step]
  const answerKey = q?.id ?? ""

  const setAnswer = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }, [])

  const { speechSupported, listening, toggleListening, stopListening } = useSpeechRecognitionInput((display) => {
    if (answerKey) setAnswer(answerKey, display)
  })

  useEffect(() => {
    setStep(0)
    setAnswers({})
    setError(null)
    setDoneMessage(null)
    const init: WizardAnswers = {}
    for (const question of flow.questions) {
      if (question.defaultValue) init[question.id] = question.defaultValue
    }
    setAnswers(init)
  }, [wizardId, flow.questions])

  useEffect(() => () => stopListening(), [stopListening])

  useEffect(() => {
    if (!q?.speakAloud) return
    const t = window.setTimeout(() => speakNaturalPrompt(q.prompt), 400)
    return () => {
      window.clearTimeout(t)
      stopNaturalPrompt()
    }
  }, [step, q?.prompt, q?.speakAloud])

  async function finishWizard() {
    if (!supabase) return
    setBusy(true)
    setError(null)
    try {
      const msg = await applySetupMiniWizard(supabase, userId, wizardId, answers)
      setDoneMessage(msg)
      onApplied?.(msg)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function renderInput(question: SetupWizardQuestion) {
    const val = answers[question.id] ?? ""
    if (question.type === "yesno") {
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["yes", "no"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setAnswer(question.id, opt)}
              style={{
                ...BTN_SECONDARY,
                background: val === opt ? theme.primary : "#f1f5f9",
                color: val === opt ? "#fff" : "#0f172a",
                borderColor: val === opt ? theme.primary : "#94a3b8",
              }}
            >
              {opt === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      )
    }
    if (question.type === "choice" && question.choices?.length) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {question.choices.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAnswer(question.id, c)}
              style={{
                ...BTN_SECONDARY,
                textAlign: "left",
                background: val === c ? "#e0f2fe" : "#f1f5f9",
                borderColor: val === c ? "#0ea5e9" : "#94a3b8",
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )
    }
    const isVoice = question.type === "voice_text"
    const rows = question.type === "textarea" ? 3 : 2
    const preview =
      wizardId === "estimates_line_items" && val.trim() ? parseSpokenLineItem(val) : null
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          rows={rows}
          value={val}
          onChange={(e) => setAnswer(question.id, e.target.value)}
          placeholder={question.placeholder}
          style={{ ...theme.formInput, resize: "vertical", width: "100%" }}
        />
        {isVoice && speechSupported ? (
          <button
            type="button"
            onClick={() => toggleListening(val)}
            style={{
              ...BTN_SECONDARY,
              alignSelf: "flex-start",
              borderColor: listening ? theme.primary : "#94a3b8",
              background: listening ? "#eef2ff" : "#f1f5f9",
            }}
          >
            {listening ? "Stop listening" : "Voice"}
          </button>
        ) : null}
        {preview ? (
          <p style={{ margin: 0, fontSize: 12, color: "#0369a1", lineHeight: 1.45 }}>
            Preview: {preview.title} — {preview.quantity} × ${preview.unit_price.toFixed(2)} ({preview.line_kind})
          </p>
        ) : null}
      </div>
    )
  }

  if (doneMessage) {
    return (
      <>
        <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10064 }} />
        <div
          role="dialog"
          aria-modal
          style={{
            position: "fixed",
            zIndex: 10065,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(520px, calc(100vw - 24px))",
            background: "#fff",
            borderRadius: 14,
            padding: 20,
            border: `1px solid ${theme.border}`,
            boxShadow: "0 24px 56px rgba(15,23,42,0.22)",
          }}
        >
          <h3 style={{ margin: "0 0 10px", color: "#0f172a" }}>{flow.title} — saved</h3>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#334155", lineHeight: 1.55 }}>{doneMessage}</p>
          <button type="button" onClick={onClose} style={{ ...BTN_SECONDARY, background: theme.primary, color: "#fff", border: "none" }}>
            Done
          </button>
        </div>
      </>
    )
  }

  if (!q) return null

  return (
    <>
      <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10064 }} />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          zIndex: 10065,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 24px))",
          maxHeight: "min(88vh, 720px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          padding: "18px 18px 14px",
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 56px rgba(15,23,42,0.22)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.05em" }}>SETUP WIZARD</div>
            <h3 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{flow.title}</h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
              Step {step + 1} of {flow.questions.length}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...BTN_SECONDARY, width: 38, height: 38, padding: 0 }}>
            ✕
          </button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{step === 0 ? flow.intro : null}</p>
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "#f8fafc", border: `1px solid ${theme.border}`, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a", lineHeight: 1.45 }}>{q.prompt}</p>
            {q.speakAloud ? (
              <button type="button" onClick={() => speakNaturalPrompt(q.prompt)} style={{ ...BTN_SECONDARY, fontSize: 11, padding: "6px 10px" }}>
                Listen
              </button>
            ) : null}
          </div>
          {q.help ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>{q.help}</p> : null}
          <div style={{ marginTop: 10 }}>{renderInput(q)}</div>
        </div>
        {error ? <p style={{ margin: "0 0 10px", fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            style={{ ...BTN_SECONDARY, opacity: step === 0 ? 0.45 : 1, cursor: step === 0 ? "not-allowed" : "pointer" }}
          >
            ← Back
          </button>
          {step < flow.questions.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                stopListening()
                setStep((s) => s + 1)
              }}
              style={{ ...BTN_SECONDARY, background: theme.primary, color: "#fff", border: "none" }}
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finishWizard()}
              style={{ ...BTN_SECONDARY, background: "#059669", color: "#fff", border: "none", cursor: busy ? "wait" : "pointer" }}
            >
              {busy ? "Saving…" : "Save settings"}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
