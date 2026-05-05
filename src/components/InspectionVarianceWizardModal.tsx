import { useState } from "react"
import { theme } from "../styles/theme"

type Props = {
  open: boolean
  onClose: () => void
  /** Current estimate id — sections will attach here first; later we may branch to a dedicated report entity. */
  quoteId: string | null
  customerLabel?: string
}

/**
 * Phase 1: structured inspection / variance reporting (multi-section deliverables).
 * Starts from Estimates when Advanced Options → specialty inspection workflow is enabled.
 */
export default function InspectionVarianceWizardModal({ open, onClose, quoteId, customerLabel }: Props) {
  const [step, setStep] = useState<1 | 2>(1)

  if (!open) return null

  const resetClose = () => {
    setStep(1)
    onClose()
  }

  return (
    <>
      <div
        role="presentation"
        onClick={resetClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 10052 }}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="inspection-variance-title"
        style={{
          position: "fixed",
          zIndex: 10053,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(520px, calc(100vw - 28px))",
          maxHeight: "min(88vh, 640px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 56px rgba(15,23,42,0.22)",
          padding: "22px 22px 18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Inspection / variance · step {step} of 2
            </div>
            <h2 id="inspection-variance-title" style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 800, color: theme.text, lineHeight: 1.25 }}>
              {step === 1 ? "Start a structured report" : "Section outline (preview)"}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
              {step === 1
                ? `Build inspection-style documentation alongside this estimate${
                    customerLabel ? ` for ${customerLabel}` : ""
                  }. Next releases add saved section templates, recipients, and export packs tied to this job.`
                : "These sections will become editable blocks with photos, findings, and variance notes — wired to the same quote attachments and customer messaging you already use."}
            </p>
          </div>
          <button
            type="button"
            onClick={resetClose}
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
              color: theme.text,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {step === 1 ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${theme.border}`,
                background: "#f8fafc",
                fontSize: 13,
                color: "#334155",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: theme.text }}>Linked estimate:</strong>{" "}
              {quoteId ? (
                <code style={{ fontSize: 12 }}>{quoteId.slice(0, 8)}…</code>
              ) : (
                <span style={{ color: "#94a3b8" }}>Open an estimate first</span>
              )}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
              <li>Cover page &amp; job summary (auto-filled from customer + job details)</li>
              <li>Observations &amp; photos (re-use Upload Photos or Files)</li>
              <li>Measurements / readings (manual entry → later presets)</li>
              <li>Variance / corrective recommendations</li>
              <li>Signatures &amp; distribution list</li>
            </ul>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <button
                type="button"
                onClick={resetClose}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  color: "#475569",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!quoteId}
                onClick={() => setStep(2)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: quoteId ? theme.primary : "#cbd5e1",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: quoteId ? "pointer" : "not-allowed",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {[
              { title: "Cover & summary", note: "Pulls display name, address, job type" },
              { title: "Site conditions", note: "Narrative + linked photos" },
              { title: "Detailed findings", note: "Subsections per trade / system" },
              { title: "Variance & recommendations", note: "Optional pricing tie-in to estimate lines" },
              { title: "Recipient packet", note: "Who receives PDF / portal link" },
            ].map((row, i) => (
              <div
                key={row.title}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: 12,
                  borderRadius: 10,
                  border: `1px dashed #cbd5e1`,
                  background: "#fff",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 13,
                    color: "#475569",
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>{row.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>{row.note}</div>
                </div>
              </div>
            ))}
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
              Development note: section content will save with this quote (or a child report record) so you can revisit drafts without losing estimate work.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  color: "#475569",
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={resetClose}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: theme.primary,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Done for now
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
