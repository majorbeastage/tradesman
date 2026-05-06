import { useEffect, useMemo, useState } from "react"
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
  mediaBusy: boolean
  onJobDetailsContinue: () => void
  onJobDetailsSkip: () => void
  onJobDetailsOpen: () => void
  jobDetailsBusy: boolean
  onQuoteItemsContinue: () => void
  onQuoteItemsSkip: () => void
  onQuoteItemsOpen: () => void
  onQuoteItemsLiteAdd: (raw: string) => Promise<string>
  quoteItemsBusy: boolean
  onPreviewOnly: () => void
  onPreviewOpenSection: () => void
  onPreviewSaveProfile: () => void
  onPreviewSaveAndSend: () => void
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
  mediaBusy,
  onJobDetailsContinue,
  onJobDetailsSkip,
  onJobDetailsOpen,
  jobDetailsBusy,
  onQuoteItemsContinue,
  onQuoteItemsSkip,
  onQuoteItemsOpen,
  onQuoteItemsLiteAdd,
  quoteItemsBusy,
  onPreviewOnly,
  onPreviewOpenSection,
  onPreviewSaveProfile,
  onPreviewSaveAndSend,
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
  const [customerQuery, setCustomerQuery] = useState("")
  const [liteLinesText, setLiteLinesText] = useState("")
  const [liteBusy, setLiteBusy] = useState(false)
  const [liteNote, setLiteNote] = useState<string | null>(null)

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

  useEffect(() => {
    if (!open || step !== 1) return
    const c = customers.find((x) => x.id === customerPick)
    if (customerPick && c) {
      setCustomerQuery(c.display_name?.trim() || c.id)
    } else if (!customerPick) {
      setCustomerQuery("")
    }
  }, [open, step, customerPick, customers])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers.slice(0, 80)
    return customers
      .filter((c) => {
        const name = (c.display_name ?? "").trim().toLowerCase()
        const id = c.id.toLowerCase()
        return name.includes(q) || id.includes(q)
      })
      .slice(0, 40)
  }, [customers, customerQuery])

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
              Customer (search)
              <input
                type="search"
                autoComplete="off"
                placeholder="Type to filter customers…"
                value={customerQuery}
                onChange={(e) => {
                  const v = e.target.value
                  setCustomerQuery(v)
                  if (!customerPick) return
                  const sel = customers.find((c) => c.id === customerPick)
                  const label = sel?.display_name?.trim() || sel?.id || ""
                  if (label && v.trim().toLowerCase() !== label.trim().toLowerCase()) {
                    onCustomerPick("")
                  }
                }}
                style={{ ...theme.formInput, padding: "10px 12px", fontSize: 14 }}
              />
            </label>
            <div
              role="listbox"
              aria-label="Matching customers"
              style={{
                maxHeight: 200,
                overflowY: "auto",
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                background: "#fafafa",
              }}
            >
              {filteredCustomers.length === 0 ? (
                <div style={{ padding: "12px 14px", fontSize: 13, color: "#64748b" }}>No matches.</div>
              ) : (
                filteredCustomers.map((c) => {
                  const label = c.display_name?.trim() || c.id
                  const selected = customerPick === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onCustomerPick(c.id)
                        setCustomerQuery(label)
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 14,
                        border: "none",
                        borderBottom: `1px solid ${theme.border}`,
                        background: selected ? "#eff6ff" : "transparent",
                        cursor: "pointer",
                        color: theme.text,
                        fontWeight: selected ? 700 : 500,
                      }}
                    >
                      {label}
                    </button>
                  )
                })
              )}
            </div>
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
                {conversationBulletsBusy ? "Generating…" : "Generate AI summary"}
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
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
                Generate a bullet summary from the conversation thread, or continue when you’re ready.
              </p>
            )}
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
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
              The upload area below is opened for you. Add files from this device, or skip and attach later.
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
        ) : step === 5 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                disabled={jobPackBulletsBusy}
                onClick={onGenerateJobPackBullets}
                style={{
                  ...secondaryBtnStyle,
                  cursor: jobPackBulletsBusy ? "wait" : "pointer",
                  opacity: jobPackBulletsBusy ? 0.75 : 1,
                }}
              >
                {jobPackBulletsBusy ? "Generating…" : "Generate AI scope bullets"}
              </button>
              <button type="button" onClick={onJobDetailsOpen} style={{ ...secondaryBtnStyle, fontWeight: 600 }}>
                Open job details section
              </button>
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
                  AI SCOPE (LABOR · MATERIALS · CREW · SPECIALS)
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#0f172a", lineHeight: 1.45 }}>
                  {jobPackBulletLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
                Generate bullets from your template, conversation summary, uploads, and notes — or continue and edit job details on the page.
              </p>
            )}
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
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                Lite quick-add (one line per item: Description | Qty | Unit price)
              </label>
              <textarea
                rows={5}
                value={liteLinesText}
                onChange={(e) => setLiteLinesText(e.target.value)}
                placeholder={"Install exhaust fan | 1 | 225\nReplace fascia board | 2 | 145"}
                style={{ ...theme.formInput, resize: "vertical", width: "100%" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  disabled={liteBusy || !liteLinesText.trim()}
                  onClick={() => {
                    void (async () => {
                      setLiteBusy(true)
                      setLiteNote(null)
                      const msg = await onQuoteItemsLiteAdd(liteLinesText)
                      setLiteBusy(false)
                      setLiteNote(msg)
                    })()
                  }}
                  style={secondaryBtnStyle}
                >
                  {liteBusy ? "Adding…" : "Add lite line items"}
                </button>
                <button
                  type="button"
                  disabled={liteBusy || !liteLinesText.trim()}
                  onClick={() => {
                    setLiteLinesText("")
                    setLiteNote(null)
                  }}
                  style={secondaryBtnStyle}
                >
                  Clear
                </button>
              </div>
              {liteNote ? (
                <p style={{ margin: 0, fontSize: 12, color: "#475569", lineHeight: 1.45 }}>{liteNote}</p>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
                  Tip: If qty or price is omitted, we default to qty <strong>1</strong> and price <strong>0</strong>.
                </p>
              )}
            </div>
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
