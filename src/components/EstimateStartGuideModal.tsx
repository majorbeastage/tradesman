import { theme } from "../styles/theme"

type CustomerOpt = { id: string; display_name?: string | null }
type TemplateOpt = { id: string; title: string }

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7

type Props = {
  open: boolean
  step: Step
  onClose: () => void
  customers: CustomerOpt[]
  customerPick: string
  onCustomerPick: (id: string) => void
  onCustomerContinue: () => void
  onCustomerSkip: () => void
  customerBusy: boolean
  templates: TemplateOpt[]
  templatePick: string
  onTemplatePick: (id: string) => void
  onTemplateContinue: () => void
  onTemplateSkip: () => void
  templateBusy: boolean
  onConversationsNeedInfo: () => void
  onConversationsReady: () => void
  onConversationsSkip: () => void
  onConversationsOpen: () => void
  onMediaContinue: () => void
  onMediaSkip: () => void
  onMediaOpen: () => void
  mediaBusy: boolean
  onJobDetailsContinue: () => void
  onJobDetailsSkip: () => void
  onJobDetailsOpen: () => void
  jobDetailsBusy: boolean
  onQuoteItemsContinue: () => void
  onQuoteItemsSkip: () => void
  onQuoteItemsOpen: () => void
  quoteItemsBusy: boolean
  onPreviewOnly: () => void
  onPreviewOpenSection: () => void
  onPreviewSaveProfile: () => void
  onPreviewSaveAndSend: () => void
  previewBusy: boolean
}

export default function EstimateStartGuideModal({
  open,
  step,
  onClose,
  customers,
  customerPick,
  onCustomerPick,
  onCustomerContinue,
  onCustomerSkip,
  customerBusy,
  templates,
  templatePick,
  onTemplatePick,
  onTemplateContinue,
  onTemplateSkip,
  templateBusy,
  onConversationsNeedInfo,
  onConversationsReady,
  onConversationsSkip,
  onConversationsOpen,
  onMediaContinue,
  onMediaSkip,
  onMediaOpen,
  mediaBusy,
  onJobDetailsContinue,
  onJobDetailsSkip,
  onJobDetailsOpen,
  jobDetailsBusy,
  onQuoteItemsContinue,
  onQuoteItemsSkip,
  onQuoteItemsOpen,
  quoteItemsBusy,
  onPreviewOnly,
  onPreviewOpenSection,
  onPreviewSaveProfile,
  onPreviewSaveAndSend,
  previewBusy,
}: Props) {
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
              Start quote · step {step} of 7
            </div>
            <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 800, color: theme.text, lineHeight: 1.25 }}>
              {step === 1
                ? "Who is this estimate for?"
                : step === 2
                  ? "Use a saved template?"
                  : step === 3
                    ? "Conversations"
                    : step === 4
                      ? "Upload photos or files"
                      : step === 5
                        ? "Job details"
                        : step === 6
                          ? "Quick add quote items"
                          : "Review & send"}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              {step === 1
                ? "Link a customer now, or skip and add one whenever you’re ready."
                : step === 2
                  ? "Apply a quick-access template to preload lines and options, or skip and build from scratch."
                  : step === 3
                    ? "Review thread activity, or note if you still need information from the customer."
                    : step === 4
                      ? "Add photos/files now, or skip and come back later."
                      : step === 5
                        ? "Capture concise scope details to improve AI suggestions and estimate quality."
                        : step === 6
                          ? "Add line items — at least one is required before you email this estimate."
                          : "Preview, save to the customer profile, or send by email."}
            </p>
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

        {step === 1 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
              Customer
              <select
                value={customerPick}
                onChange={(e) => onCustomerPick(e.target.value)}
                style={{ ...theme.formInput, padding: "10px 12px", fontSize: 14 }}
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name?.trim() || c.id}
                  </option>
                ))}
              </select>
            </label>
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
        ) : step === 2 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: theme.text }}>
              Quick access template
              <select
                value={templatePick}
                onChange={(e) => onTemplatePick(e.target.value)}
                style={{ ...theme.formInput, padding: "10px 12px", fontSize: 14 }}
              >
                <option value="">Select a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {templates.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
                No templates saved yet. You can skip and save one later from the estimate tools.
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                type="button"
                disabled={templateBusy}
                onClick={onTemplateSkip}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: templateBusy ? "wait" : "pointer",
                  color: "#475569",
                }}
              >
                Skip
              </button>
              <button
                type="button"
                disabled={templateBusy || !templatePick.trim() || templates.length === 0}
                onClick={onTemplateContinue}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: templatePick.trim() && templates.length > 0 ? theme.primary : "#cbd5e1",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: templateBusy || !templatePick.trim() || templates.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {templateBusy ? "Applying…" : "Apply & finish"}
              </button>
            </div>
          </div>
        ) : step === 3 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" onClick={onConversationsOpen} style={secondaryBtnStyle}>
                Open conversations section
              </button>
            </div>
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
        ) : step === 4 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <button type="button" onClick={onMediaOpen} style={secondaryBtnStyle}>
              Open upload section
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
        ) : step === 5 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <button type="button" onClick={onJobDetailsOpen} style={secondaryBtnStyle}>
              Open job details section
            </button>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" disabled={jobDetailsBusy} onClick={onJobDetailsSkip} style={secondaryBtnStyle}>
                Skip for now
              </button>
              <button type="button" disabled={jobDetailsBusy} onClick={onJobDetailsContinue} style={primaryBtnStyle}>
                {jobDetailsBusy ? "Working…" : "Continue"}
              </button>
            </div>
          </div>
        ) : step === 6 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <button type="button" onClick={onQuoteItemsOpen} style={secondaryBtnStyle}>
              Open quote items section
            </button>
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
            <button type="button" disabled={previewBusy} onClick={onPreviewOnly} style={secondaryBtnStyle}>
              Preview estimate
            </button>
            <button type="button" disabled={previewBusy} onClick={onPreviewOpenSection} style={secondaryBtnStyle}>
              Make further changes
            </button>
            <button type="button" disabled={previewBusy} onClick={onPreviewSaveProfile} style={secondaryBtnStyle}>
              Save estimate to customer profile
            </button>
            <button type="button" disabled={previewBusy} onClick={onPreviewSaveAndSend} style={primaryBtnStyle}>
              Save and send to customer
            </button>
          </div>
        )}
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
}) {
  const { variant, label } = props
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
