import { useMemo, useState } from "react"
import { theme } from "../styles/theme"
import SavedLineCategoryPicker from "./SavedLineCategoryPicker"
import type { EstimateLinePresetRow } from "../lib/estimateLinePresets"
import type { LibraryCategory } from "../lib/libraryCategories"
import CustomerSearchPicker from "./CustomerSearchPicker"

import type { EstimateWizardStep } from "../lib/estimateWizardStepUtils"
import { estimateWizardMaxStep, estimateWizardPhase, estimateWizardPhaseTitle } from "../lib/estimateWizardStepUtils"

type CustomerOpt = {
  id: string
  display_name?: string | null
  phone?: string
  email?: string
  service_address?: string
}
type JobTypeOpt = { id: string; name: string }

type Props = {
  open: boolean
  step: EstimateWizardStep
  /** When true, step 6 is customer job description (quote items → 7, review → 8). */
  includeJobDescription?: boolean
  jobDescriptionLabel?: string
  onClose: () => void
  customers: CustomerOpt[]
  customerPick: string
  onCustomerPick: (id: string) => void
  onCustomerContinue: () => void
  onCustomerSkip: () => void
  customerBusy: boolean
  customersLoading?: boolean
  jobTypes: JobTypeOpt[]
  jobTypePick: string
  onJobTypePick: (id: string) => void
  onJobTypeContinue: () => void
  onJobTypeSkip: () => void
  jobTypeBusy: boolean
  onConversationsNeedInfo: () => void
  onConversationsReady: () => void
  onConversationsSkip: () => void
  onConversationsOpen: () => void
  onMediaContinue: () => void
  onMediaSkip: () => void
  mediaBusy: boolean
  onJobDetailsContinue: () => void
  onJobDetailsSkip: () => void
  onJobDetailsOpen: () => void
  jobDetailsBusy: boolean
  /** Job details / scope notes (same field as the estimate page; saved with the quote). */
  jobDetailsNotes?: string
  onJobDetailsNotesChange?: (value: string) => void
  jobDetailsVoiceSupported?: boolean
  jobDetailsVoiceListening?: boolean
  onJobDetailsVoiceStart?: () => void
  onJobDetailsVoiceStop?: () => void
  onJobDescriptionContinue: () => void
  onJobDescriptionSkip: () => void
  onJobDescriptionOpen: () => void
  jobDescriptionBusy: boolean
  /** Customer-facing job description (shown on exported estimate). */
  jobDescriptionNotes?: string
  onJobDescriptionNotesChange?: (value: string) => void
  onQuoteItemsContinue: () => void
  onQuoteItemsSkip: () => void
  estimateLinePresets?: EstimateLinePresetRow[]
  savedLineCategories?: LibraryCategory[]
  onAddExistingLineItem?: (preset: EstimateLinePresetRow) => void | Promise<void>
  /** AI-filled quote lines from merged job details / bullets (same API as scope assistant). */
  onQuoteItemsAiFromJobDetails?: () => Promise<string>
  quoteItemsAiBusy?: boolean
  /** False when job context for AI is empty — button stays disabled with tooltip via note */
  hasJobDetailsForAiLines?: boolean
  quoteItemsBusy: boolean
  /** Step 7: save to profile + close wizard (view estimate tool). */
  onDoneReviewEstimate: () => void
  /** Jump to first skipped optional step, if any. */
  onGoBackToSkippedSteps: () => void
  /** Return to step 1 without deleting estimate content. */
  onStartOver: () => void
  hasSkippedSteps: boolean
  previewBusy: boolean
  onWizardBack: () => void
  conversationScopeBullets: string
  conversationBulletsBusy: boolean
  onGenerateConversationBullets: () => void
  jobPackBullets: string
  jobPackBulletsBusy: boolean
  onGenerateJobPackBullets: () => void
  onMediaPickFiles: () => void
}

export default function EstimateStartGuideModal({
  open,
  step,
  includeJobDescription = false,
  jobDescriptionLabel = "Job description",
  onClose,
  customers,
  customerPick,
  onCustomerPick,
  onCustomerContinue,
  onCustomerSkip,
  customerBusy,
  customersLoading = false,
  jobTypes,
  jobTypePick,
  onJobTypePick,
  onJobTypeContinue,
  onJobTypeSkip,
  jobTypeBusy,
  onConversationsNeedInfo,
  onConversationsReady,
  onConversationsSkip,
  onConversationsOpen,
  onMediaContinue,
  onMediaSkip,
  mediaBusy,
  onJobDetailsContinue,
  onJobDetailsSkip,
  onJobDetailsOpen,
  jobDetailsBusy,
  jobDetailsNotes = "",
  onJobDetailsNotesChange,
  jobDetailsVoiceSupported = false,
  jobDetailsVoiceListening = false,
  onJobDetailsVoiceStart,
  onJobDetailsVoiceStop,
  onJobDescriptionContinue,
  onJobDescriptionSkip,
  onJobDescriptionOpen,
  jobDescriptionBusy,
  jobDescriptionNotes = "",
  onJobDescriptionNotesChange,
  onQuoteItemsContinue,
  onQuoteItemsSkip,
  estimateLinePresets = [],
  savedLineCategories = [],
  onAddExistingLineItem,
  onQuoteItemsAiFromJobDetails,
  quoteItemsAiBusy = false,
  hasJobDetailsForAiLines = false,
  quoteItemsBusy,
  onDoneReviewEstimate,
  onGoBackToSkippedSteps,
  onStartOver,
  hasSkippedSteps,
  previewBusy,
  onWizardBack,
  conversationScopeBullets,
  conversationBulletsBusy,
  onGenerateConversationBullets,
  jobPackBullets,
  jobPackBulletsBusy,
  onGenerateJobPackBullets,
  onMediaPickFiles,
}: Props) {
  const [aiLinesNote, setAiLinesNote] = useState<string | null>(null)
  const wizardPhase = estimateWizardPhase(step, includeJobDescription)
  const wizardTotalSteps = estimateWizardMaxStep(includeJobDescription)
  const wizardTitle = estimateWizardPhaseTitle(wizardPhase)

  const pickerCustomers = useMemo(
    () =>
      customers.map((c) => ({
        id: c.id,
        display_name: c.display_name?.trim() || c.id,
        phone: c.phone,
        email: c.email,
        service_address: c.service_address,
      })),
    [customers],
  )

  const conversationBulletLines = useMemo(
    () =>
      conversationScopeBullets
        .split(/\r?\n/)
        .map((s) => s.replace(/^\s*[•\-*]\s*/, "").trim())
        .filter(Boolean),
    [conversationScopeBullets],
  )

  const jobPackBulletLines = useMemo(
    () =>
      jobPackBullets
        .split(/\r?\n/)
        .map((s) => s.replace(/^\s*[•\-*]\s*/, "").trim())
        .filter(Boolean),
    [jobPackBullets],
  )

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 10050 }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          zIndex: 10051,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(440px, calc(100vw - 28px))",
          maxHeight: "min(82vh, 560px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 24px 56px rgba(15,23,42,0.2)",
          padding: "20px 20px 18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Start quote · step {step} of {wizardTotalSteps}
            </div>
            <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 800, color: theme.text, lineHeight: 1.25 }}>
              {wizardTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
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

        {wizardPhase === "customer" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <CustomerSearchPicker
              label="Customer"
              customers={pickerCustomers}
              value={customerPick}
              onChange={(id) => onCustomerPick(id)}
              disabled={customerBusy}
              loading={customersLoading}
              allowEmpty
              emptyLabel="— No customer —"
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                type="button"
                disabled={customerBusy}
                onClick={onCustomerSkip}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: customerBusy ? "wait" : "pointer",
                  color: "#475569",
                }}
              >
                Skip for now
              </button>
              <button
                type="button"
                disabled={customerBusy || !customerPick.trim()}
                onClick={onCustomerContinue}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: customerPick.trim() ? theme.primary : "#cbd5e1",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: customerBusy || !customerPick.trim() ? "not-allowed" : "pointer",
                }}
              >
                {customerBusy ? "Saving…" : "Continue"}
              </button>
            </div>
          </div>
        ) : wizardPhase === "jobType" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
              Job type
              <select
                value={jobTypePick}
                onChange={(e) => onJobTypePick(e.target.value)}
                style={{ ...theme.formInput, padding: "10px 12px", fontSize: 14 }}
              >
                <option value="">Select a job type…</option>
                {jobTypes.map((jt) => (
                  <option key={jt.id} value={jt.id}>
                    {jt.name}
                  </option>
                ))}
              </select>
            </label>
            {jobTypes.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
                No job types yet. You can skip and set one later on the estimate page.
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                type="button"
                disabled={jobTypeBusy}
                onClick={onJobTypeSkip}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: jobTypeBusy ? "wait" : "pointer",
                  color: "#475569",
                }}
              >
                Skip
              </button>
              <button
                type="button"
                disabled={jobTypeBusy || !jobTypePick.trim() || jobTypes.length === 0}
                onClick={onJobTypeContinue}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: jobTypePick.trim() && jobTypes.length > 0 ? theme.primary : "#cbd5e1",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: jobTypeBusy || !jobTypePick.trim() || jobTypes.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {jobTypeBusy ? "Applying…" : "Apply & continue"}
              </button>
            </div>
          </div>
        ) : wizardPhase === "conversations" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                disabled={conversationBulletsBusy}
                onClick={onGenerateConversationBullets}
                style={{
                  ...secondaryBtnStyle,
                  cursor: conversationBulletsBusy ? "wait" : "pointer",
                  opacity: conversationBulletsBusy ? 0.75 : 1,
                }}
              >
                {conversationBulletsBusy ? "Generating…" : "Summarize conversation"}
              </button>
              <button type="button" onClick={onConversationsOpen} style={{ ...secondaryBtnStyle, fontWeight: 600 }}>
                Open conversations section
              </button>
            </div>
            {conversationBulletLines.length > 0 ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em", marginBottom: 8 }}>
                  AI SUMMARY
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#0f172a", lineHeight: 1.45 }}>
                  {conversationBulletLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={onConversationsSkip} style={secondaryBtnStyle}>
                Skip for now
              </button>
              <button type="button" onClick={onConversationsNeedInfo} style={{ ...secondaryBtnStyle, color: "#b91c1c", borderColor: "#fca5a5" }}>
                Request more info
              </button>
              <button type="button" onClick={onConversationsReady} style={primaryBtnStyle}>
                Ready to estimate
              </button>
            </div>
          </div>
        ) : wizardPhase === "media" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
              Add photos, PDFs, or Word documents (up to 50 MB each). Turn on &ldquo;Attach to customer&apos;s copy&rdquo; on each file when you want it on the estimate you send.
            </p>
            <button type="button" onClick={onMediaPickFiles} disabled={mediaBusy} style={secondaryBtnStyle}>
              {mediaBusy ? "Working…" : "Add photos or files"}
            </button>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" disabled={mediaBusy} onClick={onMediaSkip} style={secondaryBtnStyle}>
                Skip for now
              </button>
              <button type="button" disabled={mediaBusy} onClick={onMediaContinue} style={primaryBtnStyle}>
                {mediaBusy ? "Working…" : "Continue"}
              </button>
            </div>
          </div>
        ) : wizardPhase === "jobDetails" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                disabled={jobPackBulletsBusy}
                onClick={onGenerateJobPackBullets}
                style={{
                  ...primaryBtnStyle,
                  cursor: jobPackBulletsBusy ? "wait" : "pointer",
                  opacity: jobPackBulletsBusy ? 0.8 : 1,
                }}
              >
                {jobPackBulletsBusy ? "Generating…" : "Suggest scope bullets"}
              </button>
              <button type="button" onClick={onJobDetailsOpen} style={{ ...secondaryBtnStyle, fontWeight: 600 }}>
                Open job details section
              </button>
            </div>
            <div
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                background: "#f8fafc",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em" }}>Scope notes</div>
              <textarea
                rows={4}
                value={jobDetailsNotes}
                onChange={(e) => onJobDetailsNotesChange?.(e.target.value)}
                placeholder="e.g. Replace 50-gal water heater in garage. Haul away old unit. Patch ceiling drywall at HVAC chase."
                style={{ ...theme.formInput, resize: "vertical", width: "100%", background: "#fff" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {!jobDetailsVoiceListening ? (
                  <button
                    type="button"
                    disabled={!jobDetailsVoiceSupported}
                    onClick={() => onJobDetailsVoiceStart?.()}
                    style={{
                      ...secondaryBtnStyle,
                      cursor: !jobDetailsVoiceSupported ? "not-allowed" : "pointer",
                      opacity: jobDetailsVoiceSupported ? 1 : 0.6,
                    }}
                  >
                    {jobDetailsVoiceSupported ? "Voice to text" : "Voice not available in this browser"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onJobDetailsVoiceStop?.()}
                    style={{
                      ...secondaryBtnStyle,
                      fontWeight: 700,
                      border: "1px solid #b45309",
                      background: "#fff7ed",
                      color: "#9a3412",
                    }}
                  >
                    Stop listening
                  </button>
                )}
              </div>
            </div>
            {jobPackBulletLines.length > 0 ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#f8fafc",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em", marginBottom: 8 }}>
                  SCOPE BULLETS (LABOR · MATERIALS · TRAVEL · MISC)
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#0f172a", lineHeight: 1.45 }}>
                  {jobPackBulletLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" disabled={jobDetailsBusy} onClick={onJobDetailsSkip} style={secondaryBtnStyle}>
                Skip for now
              </button>
              <button type="button" disabled={jobDetailsBusy} onClick={onJobDetailsContinue} style={primaryBtnStyle}>
                {jobDetailsBusy ? "Working…" : "Continue"}
              </button>
            </div>
          </div>
        ) : wizardPhase === "jobDescription" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
              Write a customer-facing summary of the work. This appears on the exported estimate PDF/Word document.
            </p>
            {jobDetailsNotes.trim() && !jobDescriptionNotes.trim() ? (
              <button
                type="button"
                onClick={() => onJobDescriptionNotesChange?.(jobDetailsNotes.trim())}
                style={{ ...secondaryBtnStyle, fontWeight: 700, border: `2px solid ${theme.primary}`, justifySelf: "start" }}
              >
                Copy from job details
              </button>
            ) : null}
            <div
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                background: "#f8fafc",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em" }}>
                {jobDescriptionLabel.toUpperCase()}
              </div>
              <textarea
                rows={5}
                value={jobDescriptionNotes}
                onChange={(e) => onJobDescriptionNotesChange?.(e.target.value)}
                placeholder="Describe the work in plain language your customer will understand…"
                style={{ ...theme.formInput, resize: "vertical", width: "100%", background: "#fff" }}
              />
            </div>
            <button type="button" onClick={onJobDescriptionOpen} style={{ ...secondaryBtnStyle, fontWeight: 600, justifySelf: "start" }}>
              Open job description section
            </button>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" disabled={jobDescriptionBusy} onClick={onJobDescriptionSkip} style={secondaryBtnStyle}>
                Skip for now
              </button>
              <button type="button" disabled={jobDescriptionBusy} onClick={onJobDescriptionContinue} style={primaryBtnStyle}>
                {jobDescriptionBusy ? "Working…" : "Continue"}
              </button>
            </div>
          </div>
        ) : wizardPhase === "quoteItems" ? (
          <div style={{ display: "grid", gap: 12 }}>
            {estimateLinePresets.length > 0 && savedLineCategories.length > 0 && onAddExistingLineItem ? (
              <SavedLineCategoryPicker
                presets={estimateLinePresets}
                categories={savedLineCategories}
                variant="dropdown"
                title="Add existing line items"
                addButtonLabel="Add selected line"
                onSelectPreset={(preset) => void onAddExistingLineItem(preset)}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
                No saved line items yet. You can add lines from the Estimates tool after finishing the wizard.
              </p>
            )}
            {typeof onQuoteItemsAiFromJobDetails === "function" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <button
                  type="button"
                  disabled={
                    quoteItemsBusy ||
                    quoteItemsAiBusy ||
                    !hasJobDetailsForAiLines
                  }
                  onClick={() => {
                    void (async () => {
                      setAiLinesNote(null)
                      const msg = await onQuoteItemsAiFromJobDetails()
                      setAiLinesNote(msg)
                    })()
                  }}
                  style={{ ...secondaryBtnStyle, fontWeight: 700, border: `2px solid ${theme.primary}` }}
                >
                  {quoteItemsAiBusy ? "Suggesting lines…" : "Suggest lines (labor · materials · travel · misc)"}
                </button>
                {aiLinesNote ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#334155", lineHeight: 1.45 }}>{aiLinesNote}</p>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" disabled={quoteItemsBusy} onClick={onQuoteItemsSkip} style={secondaryBtnStyle}>
                Skip for now
              </button>
              <button type="button" disabled={quoteItemsBusy} onClick={onQuoteItemsContinue} style={primaryBtnStyle}>
                {quoteItemsBusy ? "Working…" : "Continue"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <button type="button" disabled={previewBusy} onClick={onDoneReviewEstimate} style={primaryBtnStyle}>
              Done — Review Estimate
            </button>
            {hasSkippedSteps ? (
              <button type="button" disabled={previewBusy} onClick={onGoBackToSkippedSteps} style={secondaryBtnStyle}>
                Go back to skipped steps
              </button>
            ) : null}
            <button type="button" disabled={previewBusy} onClick={onStartOver} style={secondaryBtnStyle}>
              Start over
            </button>
          </div>
        )}

        {step > 1 ? (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
            <button
              type="button"
              onClick={onWizardBack}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                color: "#475569",
              }}
            >
              ← Go back
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}

const secondaryBtnStyle = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  color: "#475569",
} as const

const primaryBtnStyle = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
} as const

/** Inline status next to estimate section titles — not alerts; neutral “skipped” vs success. */
export function EstimateGuideStatusMarker(props: {
  variant: "none" | "skipped" | "done" | "warning"
  label: string
  /** When false, hide entirely (e.g. wizard not opened yet for this quote). */
  show?: boolean
}) {
  const { variant, label, show = true } = props
  if (!show) return null
  if (variant === "none") return null
  if (variant === "warning") {
    return (
      <span
        title={`${label}: needs attention`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          color: "#b91c1c",
          fontSize: 12,
          fontWeight: 800,
          flexShrink: 0,
        }}
        aria-hidden
      >
        !
      </span>
    )
  }
  if (variant === "skipped") {
    return (
      <span
        title={`${label}: optional — not set`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px dashed #cbd5e1",
          color: "#94a3b8",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
        aria-hidden
      >
        ○
      </span>
    )
  }
  return (
    <span
      title={`${label}: set`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "#ecfdf5",
        border: "1px solid #6ee7b7",
        color: "#15803d",
        fontSize: 13,
        fontWeight: 800,
        flexShrink: 0,
      }}
      aria-hidden
    >
      ✓
    </span>
  )
}
