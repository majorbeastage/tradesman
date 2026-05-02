import { theme } from "../styles/theme"

type CustomerOpt = { id: string; display_name?: string | null }
type TemplateOpt = { id: string; title: string }

type Step = 1 | 2

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
              Start quote · step {step} of 2
            </div>
            <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 800, color: theme.text, lineHeight: 1.25 }}>
              {step === 1 ? "Who is this estimate for?" : "Use a saved template?"}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              {step === 1
                ? "Link a customer now, or skip and add one whenever you’re ready."
                : "Apply a quick-access template to preload lines and options, or skip and build from scratch."}
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
        ) : (
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
        )}
      </div>
    </>
  )
}

/** Inline status next to estimate section titles — not alerts; neutral “skipped” vs success. */
export function EstimateGuideStatusMarker(props: {
  variant: "none" | "skipped" | "done"
  label: string
}) {
  const { variant, label } = props
  if (variant === "none") return null
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
