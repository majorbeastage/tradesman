import { theme } from "../styles/theme"
import {
  formatCustomerSmsConsentDetail,
  canSubmitManualSmsOptIn,
  type CustomerSmsConsentRecord,
  type ManualSmsConsentSourceInput,
} from "../lib/customerSmsConsent"
import CustomerSmsOptInField from "./CustomerSmsOptInField"
import CustomerSmsConsentSourceFields from "./CustomerSmsConsentSourceFields"

type Props = {
  businessName: string
  consent: CustomerSmsConsentRecord | null
  phoneOnFile: string
  draftPhone?: string
  recordChecked: boolean
  onRecordCheckedChange: (checked: boolean) => void
  consentSource: ManualSmsConsentSourceInput
  onConsentSourceChange: (next: ManualSmsConsentSourceInput) => void
  onSave: () => void
  saving: boolean
  showSourceValidation?: boolean
  compact?: boolean
  /** When false, on-file consent omits the disclosure blockquote (e.g. list panel — see full profile). */
  showDisclosureSnapshot?: boolean
}

export function CustomerSmsConsentOnFileDisplay({
  consent,
  showDisclosureSnapshot = true,
}: {
  consent: CustomerSmsConsentRecord
  showDisclosureSnapshot?: boolean
}) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5, color: "#065f46" }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Express consent on file</div>
      <div>
        Recorded {new Date(consent.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} ·{" "}
        {formatCustomerSmsConsentDetail(consent)}
      </div>
      {consent.consent_url ? (
        <div style={{ marginTop: 6, fontSize: 12, color: "#047857", wordBreak: "break-all" }}>URL: {consent.consent_url}</div>
      ) : null}
      {consent.consent_note ? (
        <div style={{ marginTop: 6, fontSize: 12, color: "#047857" }}>{consent.consent_note}</div>
      ) : null}
      {showDisclosureSnapshot && consent.disclosure_snapshot ? (
        <blockquote
          style={{
            margin: "10px 0 0",
            padding: "10px 12px",
            borderLeft: "3px solid #34d399",
            background: "#fff",
            color: "#334155",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {consent.disclosure_snapshot}
        </blockquote>
      ) : null}
    </div>
  )
}

/** SMS opt-in status + record flow for customer detail (A2P / compliance). */
export default function CustomerSmsOptInSection({
  businessName,
  consent,
  phoneOnFile,
  draftPhone = "",
  recordChecked,
  onRecordCheckedChange,
  consentSource,
  onConsentSourceChange,
  onSave,
  saving,
  showSourceValidation = false,
  compact = false,
  showDisclosureSnapshot = true,
}: Props) {
  const hasPhone = Boolean(phoneOnFile.trim() || draftPhone.trim())
  const smsBlocked = hasPhone && !consent
  const canSave =
    recordChecked && canSubmitManualSmsOptIn(true, recordChecked, consentSource) && !saving

  return (
    <div
      style={{
        marginBottom: compact ? 0 : 12,
        borderRadius: 10,
        border: consent ? "1px solid #86efac" : smsBlocked ? "2px solid #f97316" : `1px solid ${theme.border}`,
        background: consent ? "#ecfdf5" : smsBlocked ? "#fff7ed" : "#fff",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: compact ? "10px 12px" : "12px 14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>SMS Opt-In Consent</div>
          {smsBlocked ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#9a3412",
                background: "#ffedd5",
                border: "1px solid #fdba74",
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              Required before texting
            </span>
          ) : consent ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#047857",
                background: "#d1fae5",
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              SMS enabled
            </span>
          ) : null}
        </div>

        {smsBlocked ? (
          <p
            style={{
              margin: "0 0 12px",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              fontSize: 13,
              fontWeight: 600,
              color: "#991b1b",
              lineHeight: 1.45,
            }}
          >
            SMS consent is required before text messages can be sent to this customer. Consent to receive SMS
            messages is optional and is not required as a condition of purchasing any goods or services.
          </p>
        ) : null}

        {consent ? (
          <CustomerSmsConsentOnFileDisplay consent={consent} showDisclosureSnapshot={showDisclosureSnapshot} />
        ) : hasPhone ? (
          <div style={{ display: "grid", gap: 12 }}>
            <CustomerSmsOptInField
              businessName={businessName}
              checked={recordChecked}
              onChange={onRecordCheckedChange}
              disabled={saving}
            />
            {recordChecked ? (
              <CustomerSmsConsentSourceFields
                value={consentSource}
                onChange={onConsentSourceChange}
                businessName={businessName}
                disabled={saving}
                showValidation={showSourceValidation}
              />
            ) : null}
            <button
              type="button"
              disabled={!canSave}
              onClick={onSave}
              style={{
                justifySelf: "start",
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: theme.primary,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: !canSave ? "not-allowed" : "pointer",
                opacity: !canSave ? 0.55 : 1,
              }}
            >
              {saving ? "Saving…" : "Save SMS opt-in"}
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
            Add a mobile number under Contact &amp; job details (or when adding the customer) to record SMS opt-in.
          </p>
        )}
      </div>
    </div>
  )
}
