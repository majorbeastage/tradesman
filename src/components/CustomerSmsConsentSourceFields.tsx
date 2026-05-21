import { theme } from "../styles/theme"
import {
  EMPTY_MANUAL_SMS_CONSENT_SOURCE,
  MANUAL_SMS_CONSENT_METHOD_OPTIONS,
  validateManualSmsConsentSourceInput,
  type ManualSmsConsentSourceInput,
} from "../lib/customerSmsConsent"
import { downloadPrintableSmsConsentForm } from "../lib/smsOptInConsentFormPdf"

type Props = {
  value: ManualSmsConsentSourceInput
  onChange: (next: ManualSmsConsentSourceInput) => void
  businessName: string
  disabled?: boolean
  showValidation?: boolean
}

export { EMPTY_MANUAL_SMS_CONSENT_SOURCE }

export default function CustomerSmsConsentSourceFields({
  value,
  onChange,
  businessName,
  disabled = false,
  showValidation = false,
}: Props) {
  const validationError = showValidation ? validateManualSmsConsentSourceInput(value) : null
  const needsUrl = value.method === "external_website"
  const optionalUrl = value.method === "business_website"
  const needsNote = value.method === "other"

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "#334155" }}>
        How did the customer give SMS consent? <span style={{ color: "#b91c1c" }}>*</span>
        <select
          value={value.method}
          onChange={(e) =>
            onChange({
              ...value,
              method: e.target.value as ManualSmsConsentSourceInput["method"],
              consentUrl: e.target.value === "external_website" ? value.consentUrl : "",
              consentNote: e.target.value === "other" ? value.consentNote : "",
            })
          }
          disabled={disabled}
          required
          style={{ ...theme.formInput, maxWidth: "100%", fontWeight: 500 }}
        >
          <option value="">Select consent source…</option>
          {MANUAL_SMS_CONSENT_METHOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {value.method === "signed_paper_form" ? (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void downloadPrintableSmsConsentForm(businessName)}
            style={{
              padding: 0,
              border: "none",
              background: "none",
              color: theme.primary,
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              textDecoration: "underline",
              fontSize: "inherit",
            }}
          >
            Download printable consent PDF
          </button>{" "}
          for the customer to sign, then select this option after it is signed.
        </p>
      ) : null}

      {needsUrl ? (
        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "#334155" }}>
          External opt-in page URL <span style={{ color: "#b91c1c" }}>*</span>
          <input
            type="url"
            value={value.consentUrl}
            onChange={(e) => onChange({ ...value, consentUrl: e.target.value })}
            placeholder="https://example.com/contact"
            disabled={disabled}
            required
            style={{ ...theme.formInput, maxWidth: "100%" }}
          />
        </label>
      ) : null}

      {optionalUrl ? (
        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 600, color: "#64748b" }}>
          Your contact form page (optional)
          <input
            type="url"
            value={value.consentUrl}
            onChange={(e) => onChange({ ...value, consentUrl: e.target.value })}
            placeholder="https://yourbusiness.com/contact"
            disabled={disabled}
            style={{ ...theme.formInput, maxWidth: "100%" }}
          />
        </label>
      ) : null}

      {needsNote ? (
        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700, color: "#334155" }}>
          Describe how consent was obtained <span style={{ color: "#b91c1c" }}>*</span>
          <textarea
            value={value.consentNote}
            onChange={(e) => onChange({ ...value, consentNote: e.target.value })}
            placeholder="e.g. Customer signed estimate cover sheet with SMS disclosure on 5/18/2026"
            disabled={disabled}
            required
            rows={3}
            style={{ ...theme.formInput, resize: "vertical", maxWidth: "100%", fontWeight: 400 }}
          />
        </label>
      ) : null}

      {validationError ? (
        <p style={{ margin: 0, fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{validationError}</p>
      ) : null}
    </div>
  )
}
